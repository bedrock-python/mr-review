import type { DiffLineWithFile } from "./types";

const RENAME_FROM = "rename from ";
const RENAME_TO = "rename to ";
const BINARY_PREFIX = "Binary files ";

/** The title of one file's header block: its path, "old → new" for a rename. */
const describeFile = (block: readonly DiffLineWithFile[], file: string): string => {
  const contents = block.map((line) => line.content.replace(/\r$/, ""));
  const from = contents.find((content) => content.startsWith(RENAME_FROM));
  const to = contents.find((content) => content.startsWith(RENAME_TO));
  const title =
    from !== undefined && to !== undefined
      ? `${from.slice(RENAME_FROM.length)} → ${to.slice(RENAME_TO.length)}`
      : file;
  return contents.some((content) => content.startsWith(BINARY_PREFIX))
    ? `${title} (binary)`
    : title;
};

/**
 * Folds each file's git header block (`diff --git`, `index`, `---`, `+++`, mode and rename
 * lines) into one row titled with the file's path. The raw lines mean nothing to a reader
 * and repeated the path three times between every two files.
 */
export const collapseFileHeaders = (lines: readonly DiffLineWithFile[]): DiffLineWithFile[] => {
  const result: DiffLineWithFile[] = [];
  let block: DiffLineWithFile[] = [];

  const flush = (): void => {
    const last = block.at(-1);
    if (last === undefined) return;
    result.push({
      type: "file",
      content: describeFile(block, last.file),
      newLine: null,
      oldLine: null,
      file: last.file,
    });
    block = [];
  };

  for (const line of lines) {
    if (line.type === "file") {
      block.push(line);
      continue;
    }
    flush();
    result.push(line);
  }
  flush();
  return result;
};
