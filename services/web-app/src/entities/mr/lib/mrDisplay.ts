import type { DiffFile, MR } from "../model/mr.schema";

/** Last path segment of a repository path ("group/sub/repo" → "repo"). */
export const getRepoNameFromPath = (repoPath: string): string => {
  const segments = repoPath.split("/").filter((segment) => segment !== "");
  return segments.at(-1) ?? repoPath;
};

/**
 * "source → target" for display. Hosts may omit either branch in list views
 * (GitHub search results carry neither), so missing sides are dropped and
 * `null` means there is nothing to show.
 */
export const formatBranchRange = (sourceBranch: string, targetBranch: string): string | null => {
  const source = sourceBranch.trim();
  const target = targetBranch.trim();
  if (source && target) return `${source} → ${target}`;
  if (source) return source;
  if (target) return `→ ${target}`;
  return null;
};

export type MRDiffStats = { additions: number; deletions: number };

/**
 * Diff stats when the host reported them. `null` means "unknown" (not zero) and
 * must not be rendered as "+0 -0".
 */
export const getDiffStats = (mr: Pick<MR, "additions" | "deletions">): MRDiffStats | null =>
  mr.additions === null || mr.deletions === null
    ? null
    : { additions: mr.additions, deletions: mr.deletions };

/** Totals over a loaded diff, for hosts that do not report MR-level stats. */
export const sumDiffStats = (
  files: readonly Pick<DiffFile, "additions" | "deletions">[]
): MRDiffStats =>
  files.reduce<MRDiffStats>(
    (total, file) => ({
      additions: total.additions + file.additions,
      deletions: total.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 }
  );
