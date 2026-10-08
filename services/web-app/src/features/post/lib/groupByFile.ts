import type { Comment } from "@entities/review";

/** The comments on one file, or the general notes (`file` null). */
export type FileGroup = { file: string | null; comments: Comment[] };

const byLine = (a: Comment, b: Comment): number =>
  (a.line ?? Number.NEGATIVE_INFINITY) - (b.line ?? Number.NEGATIVE_INFINITY);

/**
 * The comments as the MR will read them: one group per file in the order the files first
 * appear, comments by line within a file (a file-level one first), general notes last.
 */
export const groupByFile = (comments: readonly Comment[]): FileGroup[] => {
  const files = new Map<string, Comment[]>();
  const notes: Comment[] = [];
  for (const comment of comments) {
    if (comment.file === null) {
      notes.push(comment);
      continue;
    }
    const group = files.get(comment.file) ?? [];
    group.push(comment);
    files.set(comment.file, group);
  }
  const groups: FileGroup[] = [...files].map(([file, group]) => ({
    file,
    comments: group.sort(byLine),
  }));
  if (notes.length > 0) groups.push({ file: null, comments: notes });
  return groups;
};
