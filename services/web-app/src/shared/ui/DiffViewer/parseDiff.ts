import type { DiffLine, DiffLineWithFile } from "./types";

// Inside a hunk a line is classified by its first character only, and the counts in the `@@`
// header say where the hunk ends: a removed SQL comment (`--- note`) or an added `++i` stays a
// content line, and only lines outside a hunk can be file headers. `\ No newline at end of file`
// annotates the line above it and is never a line of the file. The backend parser
// (infra/vcs/_diff_parser.py) follows the same rules and is tested against the same cases.

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const BINARY_RE = /^Binary files (.+) and (.+) differ$/;
const OCTAL_ESCAPE_RE = /^[0-7]{3}$/;
const GIT_DIFF_PREFIX = "diff --git ";
const DEV_NULL = "/dev/null";
const OCTAL_RADIX = 8;
const C_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

const toCount = (value: string | undefined): number =>
  value === undefined ? 1 : parseInt(value, 10);

const splitLines = (raw: string): string[] => {
  const rows = raw.split("\n");
  // The newline that ends the text is not a blank line of the diff.
  if (rows[rows.length - 1] === "") rows.pop();
  return rows;
};

export const parseDiff = (raw: string): DiffLine[] => {
  if (raw.length === 0) {
    return [];
  }

  const lines: DiffLine[] = [];
  let newLine = 0;
  let oldLine = 0;
  let newLeft = 0;
  let oldLeft = 0;

  for (const rawLine of splitLines(raw)) {
    if (oldLeft > 0 || newLeft > 0) {
      const tag = rawLine.charAt(0);
      if (tag === "\\") continue;
      if (tag === "+" && newLeft > 0) {
        lines.push({ type: "added", content: rawLine.slice(1), newLine: newLine++, oldLine: null });
        newLeft -= 1;
        continue;
      }
      if (tag === "-" && oldLeft > 0) {
        lines.push({
          type: "removed",
          content: rawLine.slice(1),
          newLine: null,
          oldLine: oldLine++,
        });
        oldLeft -= 1;
        continue;
      }
      if ((tag === " " || tag === "") && oldLeft > 0 && newLeft > 0) {
        lines.push({
          type: "context",
          content: rawLine.slice(1),
          newLine: newLine++,
          oldLine: oldLine++,
        });
        oldLeft -= 1;
        newLeft -= 1;
        continue;
      }
      // The header promised more lines than the hunk has: it is over.
      oldLeft = 0;
      newLeft = 0;
    }

    if (rawLine.startsWith("@@")) {
      const match = HUNK_HEADER_RE.exec(rawLine);
      if (match) {
        oldLine = parseInt(match[1] ?? "0", 10);
        newLine = parseInt(match[3] ?? "0", 10);
        oldLeft = toCount(match[2]);
        newLeft = toCount(match[4]);
      }
      lines.push({ type: "header", content: rawLine, newLine: null, oldLine: null });
      continue;
    }

    // Outside a hunk: git's file headers and metadata (index, mode, rename, binary). They carry
    // no line numbers, so nothing outside a hunk can be mistaken for a line of the file.
    if (rawLine.length > 0 && !rawLine.startsWith("\\")) {
      lines.push({ type: "file", content: rawLine, newLine: null, oldLine: null });
    }
  }

  return lines;
};

/** Undo git's C-style quoting of unusual paths: `"a/\320\264.md"` -> `a/д.md`. */
const unquote = (path: string): string => {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path;
  const chars = Array.from(path.slice(1, -1));
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let i = 0;
  while (i < chars.length) {
    const char = chars[i] ?? "";
    if (char !== "\\" || i + 1 === chars.length) {
      bytes.push(...encoder.encode(char));
      i += 1;
      continue;
    }
    const octal = chars.slice(i + 1, i + 4).join("");
    if (OCTAL_ESCAPE_RE.test(octal)) {
      bytes.push(parseInt(octal, OCTAL_RADIX));
      i += 4;
      continue;
    }
    const escaped = chars[i + 1] ?? "";
    bytes.push(C_ESCAPES[escaped] ?? escaped.charCodeAt(0));
    i += 2;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

/** Path of a `---`/`+++`/binary header operand; null for `/dev/null`. */
const headerPath = (value: string): string | null => {
  const path = unquote((value.split("\t")[0] ?? "").replace(/\r$/, ""));
  if (path === DEV_NULL) return null;
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
};

/** Old and new path of `diff --git <rest>`; `a/x b/x` with spaces in `x` is split in the middle. */
const gitHeaderPaths = (rest: string): { oldPath: string; newPath: string } | null => {
  let oldPart: string;
  let newPart: string;
  if (rest.startsWith('"')) {
    let end = rest.indexOf('" ', 1);
    while (end !== -1 && rest.charAt(end - 1) === "\\") end = rest.indexOf('" ', end + 1);
    if (end === -1) return null;
    oldPart = rest.slice(0, end + 1);
    newPart = rest.slice(end + 2);
  } else {
    const half = Math.floor((rest.length - 1) / 2);
    const splitAt = rest.lastIndexOf(" b/");
    if (rest.slice(half, half + 3) === " b/" && rest.slice(2, half) === rest.slice(half + 3)) {
      oldPart = rest.slice(0, half);
      newPart = rest.slice(half + 1);
    } else if (splitAt !== -1) {
      oldPart = rest.slice(0, splitAt);
      newPart = rest.slice(splitAt + 1);
    } else {
      return null;
    }
  }
  const oldPath = headerPath(oldPart);
  const newPath = headerPath(newPart);
  return oldPath === null || newPath === null ? null : { oldPath, newPath };
};

/**
 * Tags every line with the path of the file it belongs to: the new path, or the old one for a
 * deleted file. Header lines before a file's `+++` still carry the previous file.
 */
export const attachFileInfo = (lines: readonly DiffLine[]): DiffLineWithFile[] => {
  let currentFile = "";
  let oldPath: string | null = null;
  return lines.map((line) => {
    if (line.type === "file") {
      const content = line.content.replace(/\r$/, "");
      const binary = BINARY_RE.exec(content);
      if (content.startsWith(GIT_DIFF_PREFIX)) {
        const paths = gitHeaderPaths(content.slice(GIT_DIFF_PREFIX.length));
        oldPath = paths?.oldPath ?? null;
        if (paths !== null) currentFile = paths.newPath;
      } else if (content.startsWith("--- ")) {
        oldPath = headerPath(content.slice(4));
      } else if (content.startsWith("+++ ")) {
        currentFile = headerPath(content.slice(4)) ?? oldPath ?? currentFile;
      } else if (content.startsWith("rename to ")) {
        currentFile = unquote(content.slice("rename to ".length));
      } else if (binary) {
        currentFile = headerPath(binary[2] ?? "") ?? headerPath(binary[1] ?? "") ?? currentFile;
      }
    }
    return { ...line, file: currentFile };
  });
};
