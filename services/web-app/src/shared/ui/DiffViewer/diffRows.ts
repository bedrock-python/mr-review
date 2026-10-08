import type { DiffLineWithFile } from "./types";

const hasFileField = (value: unknown): value is { file: string | null } =>
  typeof value === "object" && value !== null && "file" in value;

const isContentLine = (line: DiffLineWithFile): boolean =>
  line.type === "added" || line.type === "removed" || line.type === "context";

export const diffRowKey = (file: string, line: number): string => `${file}:${String(line)}`;

// Shared by every row without comments, so a memoised row sees an unchanged prop.
const NO_COMMENTS: readonly never[] = [];

/** The comments of `commentsOnLines` that belong on this row (same file, or no file). */
export const commentsForLine = <T>(
  line: DiffLineWithFile,
  commentsOnLines: Map<number, readonly T[]> | undefined
): readonly T[] => {
  if (!isContentLine(line) || line.newLine === null || !commentsOnLines) return NO_COMMENTS;
  const onLine = commentsOnLines.get(line.newLine);
  if (!onLine) return NO_COMMENTS;
  return onLine.filter(
    (entry) => !hasFileField(entry) || entry.file === null || entry.file === line.file
  );
};
