import type {
  ImportPreview,
  ImportPreviewCounts,
  ImportResult,
  MergeStrategy,
} from "@shared/api/export-import.api";

export const MERGE_STRATEGIES: readonly MergeStrategy[] = ["skip", "merge", "replace"];

export const STRATEGY_LABELS: Record<MergeStrategy, string> = {
  skip: "Keep existing",
  merge: "Merge",
  replace: "Replace existing",
};

export const STRATEGY_DESCRIPTIONS: Record<MergeStrategy, string> = {
  skip: "Add what is new. Records that already exist here are left untouched.",
  merge:
    "Add what is new and update existing records from the file. Favourite repositories and " +
    "models are combined, and of two versions of a review or a review preset the more " +
    "recently updated one wins.",
  replace:
    "Add what is new and overwrite existing records with the file's version, " +
    "discarding local changes to them.",
};

const RECORD_KINDS = [
  ["hosts", "Hosts"],
  ["ai_providers", "AI providers"],
  ["review_presets", "Review presets"],
  ["reviews", "Reviews"],
] as const;

export const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

export const describeCounts = (counts: ImportPreviewCounts, one: string, many: string): string => {
  const total = plural(counts.total, one, many);
  return counts.existing > 0 ? `${total} (${String(counts.existing)} already here)` : total;
};

/** Records of the file that already exist here, which the chosen strategy may change. */
export const existingRecordCount = (preview: ImportPreview): number =>
  preview.hosts.existing +
  preview.ai_providers.existing +
  preview.review_presets.existing +
  preview.reviews.existing;

/** One line per record kind: what the import did with it. */
export const summarizeImportResult = (result: ImportResult): string[] =>
  RECORD_KINDS.map(([kind, label]) => {
    const added = result[`${kind}_imported`];
    const updated = result[`${kind}_updated`];
    const unchanged = result[`${kind}_skipped`];
    if (added + updated + unchanged === 0) return `${label}: none in the file`;
    return `${label}: ${String(added)} added, ${String(updated)} updated, ${String(unchanged)} unchanged`;
  });
