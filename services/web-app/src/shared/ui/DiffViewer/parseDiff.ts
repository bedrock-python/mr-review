import type { DiffLine, DiffLineWithFile } from "./types";

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const FILE_HEADER_PREFIX_RE = /^\+\+\+ (?:b\/)?/;

export const parseDiff = (raw: string): DiffLine[] => {
  if (raw.length === 0) {
    return [];
  }

  const lines: DiffLine[] = [];
  let newLine = 0;
  let oldLine = 0;

  for (const rawLine of raw.split("\n")) {
    if (rawLine.startsWith("--- ") || rawLine.startsWith("+++ ")) {
      lines.push({ type: "file", content: rawLine, newLine: null, oldLine: null });
      continue;
    }

    if (rawLine.startsWith("@@ ")) {
      const match = HUNK_HEADER_RE.exec(rawLine);
      if (match) {
        oldLine = parseInt(match[1] ?? "0", 10);
        newLine = parseInt(match[2] ?? "0", 10);
      }
      lines.push({ type: "header", content: rawLine, newLine: null, oldLine: null });
      continue;
    }

    if (rawLine.startsWith("+")) {
      lines.push({ type: "added", content: rawLine.slice(1), newLine: newLine++, oldLine: null });
      continue;
    }

    if (rawLine.startsWith("-")) {
      lines.push({ type: "removed", content: rawLine.slice(1), newLine: null, oldLine: oldLine++ });
      continue;
    }

    const content = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
    lines.push({ type: "context", content, newLine: newLine++, oldLine: oldLine++ });
  }

  return lines;
};

export const attachFileInfo = (lines: readonly DiffLine[]): DiffLineWithFile[] => {
  let currentFile = "";
  return lines.map((line) => {
    if (line.type === "file" && line.content.startsWith("+++ ")) {
      currentFile = line.content.replace(FILE_HEADER_PREFIX_RE, "").trim();
    }
    return { ...line, file: currentFile };
  });
};
