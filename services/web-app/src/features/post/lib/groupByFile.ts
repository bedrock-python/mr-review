import type { Comment } from "@entities/review";

/** The inline comments on one file, or the general notes (`file` null). */
export type FileGroup = { file: string | null; comments: Comment[] };

const byLine = (a: Comment, b: Comment): number => (a.line ?? 0) - (b.line ?? 0);

/**
 * The comments as the MR will read them: one group per file in the order the files first
 * appear, comments by line within a file, then the general notes. A comment on a whole file
 * (a path, no line) is posted as a general note, so it is one here too.
 */
export const groupByFile = (comments: readonly Comment[]): FileGroup[] => {
  const files = new Map<string, Comment[]>();
  const notes: Comment[] = [];
  for (const comment of comments) {
    if (comment.file === null || comment.line === null) {
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
