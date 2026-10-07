export type DiffRowKind = "hunk" | "added" | "removed" | "context";

export type DiffRow = {
  kind: DiffRowKind;
  content: string;
  oldLine: number | null;
  newLine: number | null;
};

export type DiffFileRows = {
  path: string;
  rows: DiffRow[];
  /** New-side line number → position in `rows`, for lines the new file has (added or context). */
  rowByNewLine: Map<number, number>;
};

export type DiffIndex = {
  /** Paths in diff order, deleted files excluded: a comment cannot be anchored to them. */
  files: string[];
  byPath: Map<string, DiffFileRows>;
};

export type DiffSnippet = {
  rows: DiffRow[];
  targetIndex: number;
};

export const SNIPPET_RADIUS = 3;

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const NO_NEWLINE_MARKER = "\\ No newline at end of file";
const DELETED_FILE_PATH = "/dev/null";

const parsePath = (header: string): string => header.slice(4).replace(/^b\//, "").trim();

/**
 * Index a unified diff by file and new-side line.
 *
 * The shared `parseDiff` keeps numbering lines that sit outside hunks (git headers, trailing
 * text), which is fine for display but would let a comment look anchored to a line the diff
 * never showed. Only lines inside a hunk count here.
 */
export const buildDiffIndex = (raw: string): DiffIndex => {
  const byPath = new Map<string, DiffFileRows>();
  const lines = raw.split("\n");
  let current: DiffFileRows | null = null;
  let isInHunk = false;
  let oldLine = 0;
  let newLine = 0;

  lines.forEach((line, i) => {
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) {
      isInHunk = false;
      return;
    }
    if (line.startsWith("+++ ") && !isInHunk) {
      const path = parsePath(line);
      current = null;
      if (path !== DELETED_FILE_PATH) {
        current = byPath.get(path) ?? { path, rows: [], rowByNewLine: new Map() };
        byPath.set(path, current);
      }
      return;
    }
    const hunk = HUNK_HEADER_RE.exec(line);
    if (hunk) {
      isInHunk = current !== null;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current?.rows.push({ kind: "hunk", content: line, oldLine: null, newLine: null });
      return;
    }
    if (!isInHunk || current === null) return;

    const file: DiffFileRows = current;
    if (line.startsWith("+")) {
      file.rowByNewLine.set(newLine, file.rows.length);
      file.rows.push({ kind: "added", content: line.slice(1), oldLine: null, newLine });
      newLine += 1;
    } else if (line.startsWith("-")) {
      file.rows.push({ kind: "removed", content: line.slice(1), oldLine, newLine: null });
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      const content = line.slice(1);
      if (content === NO_NEWLINE_MARKER) return;
      file.rowByNewLine.set(newLine, file.rows.length);
      file.rows.push({ kind: "context", content, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else if (!line.startsWith("\\")) {
      isInHunk = false;
    }
  });

  return { files: [...byPath.keys()], byPath };
};

export const isLineInDiff = (index: DiffIndex, file: string, line: number): boolean =>
  index.byPath.get(file)?.rowByNewLine.has(line) ?? false;

/**
 * Why an anchored comment cannot be posted inline, or null when it can (or when it is a
 * general comment anyway, or the diff is not known yet).
 */
export const describeAnchorProblem = (
  index: DiffIndex | null,
  file: string | null,
  line: number | null
): string | null => {
  if (index === null || file === null) return null;
  if (!index.byPath.has(file)) {
    return `${file} is not part of the diff — it will be posted as a general note.`;
  }
  if (line === null) return "No line set — it will be posted as a general note.";
  if (!isLineInDiff(index, file, line)) {
    return `Line ${String(line)} is not part of the diff — it will be posted as a general note.`;
  }
  return null;
};

/** Rows around `line` within its hunk, or null when the diff does not show that line. */
export const getDiffSnippet = (
  index: DiffIndex,
  file: string,
  line: number,
  radius: number = SNIPPET_RADIUS
): DiffSnippet | null => {
  const fileRows = index.byPath.get(file);
  const target = fileRows?.rowByNewLine.get(line);
  if (fileRows === undefined || target === undefined) return null;

  let start = target;
  while (start > 0 && target - start < radius && fileRows.rows[start - 1]?.kind !== "hunk") {
    start -= 1;
  }
  let end = target;
  while (
    end < fileRows.rows.length - 1 &&
    end - target < radius &&
    fileRows.rows[end + 1]?.kind !== "hunk"
  ) {
    end += 1;
  }
  return { rows: fileRows.rows.slice(start, end + 1), targetIndex: target - start };
};
