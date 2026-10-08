import type { DispatchResult, ImportResponseResult } from "@entities/review";

/** What a finished run left on the iteration, after an optional re-parse of its output. */
export type RunOutcomeSummary = {
  /** Comments the iteration holds because of this run (or kept from before, if it was unused). */
  savedCount: number;
  /** Items in the answer that could not be read as comments. */
  skippedCount: number;
  /** The answer was not valid JSON and no re-parse has been tried yet. */
  isJsonNoticeShown: boolean;
  /** Nothing from the run was saved: the previous comments stayed. */
  isKeptPrevious: boolean;
  /** Something needs a look: cut off, unreadable, unused, or items skipped. */
  needsAttention: boolean;
};

export const pluralize = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count !== 1 ? "s" : ""}`;

/**
 * A re-parse that read the output replaces the iteration's comments, so its report supersedes
 * the run's; one that still could not read it leaves the comments alone.
 */
export const summarizeRunOutcome = (
  result: DispatchResult,
  reparsed: ImportResponseResult | undefined
): RunOutcomeSummary => {
  const replacing =
    reparsed !== undefined && (reparsed.json_error === null || reparsed.imported > 0)
      ? reparsed
      : null;
  const savedCount = replacing ? replacing.imported : result.comments;
  const skippedCount = replacing ? replacing.errors.length : result.errors;
  const isJsonNoticeShown = result.json_error !== null && reparsed === undefined;
  const isStillUnreadable = (replacing ?? result).json_error !== null;
  return {
    savedCount,
    skippedCount,
    isJsonNoticeShown,
    isKeptPrevious: result.kept_previous,
    needsAttention:
      result.kept_previous || result.truncated || isStillUnreadable || skippedCount > 0,
  };
};
