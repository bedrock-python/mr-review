import type { BriefConfig, BriefPreset, ExcludedFiles } from "@entities/review";

/** The built-in presets as cards; labels render before the server's preset texts arrive. */
export const BUILTIN_PRESET_CARDS: { id: BriefPreset; label: string; description: string }[] = [
  { id: "thorough", label: "Thorough", description: "Complete review, bugs, logic, naming" },
  { id: "security", label: "Security", description: "Injections, auth, crypto, exposure" },
  { id: "style", label: "Style", description: "Naming, readability, conventions" },
  { id: "performance", label: "Performance", description: "Complexity, queries, allocations" },
];

/** "3 of 40 changed files excluded", or null while unknown or when the MR changes nothing. */
export const excludedSummary = (excluded: ExcludedFiles | undefined): string | null => {
  if (!excluded || excluded.total === 0 || excluded.excluded.length === 0) return null;
  return `${String(excluded.excluded.length)} of ${String(excluded.total)} changed files excluded`;
};

/** Whether the path filters leave none of the change's files — the server refuses to dispatch. */
export const isEverythingExcluded = (excluded: ExcludedFiles | undefined): boolean =>
  excluded !== undefined && excluded.total > 0 && excluded.excluded.length === excluded.total;

/** `path` as a pattern matching exactly that path: glob characters are escaped with `\`. */
export const escapeGlob = (path: string): string => path.replace(/[\\*?[\]]/g, "\\$&");

type ContextKey =
  | "include_diff"
  | "include_description"
  | "include_full_files"
  | "include_test_context"
  | "include_related_code"
  | "include_commit_history"
  | "include_context";

const CONTEXT_SHORT_NAMES: { key: ContextKey; name: string }[] = [
  { key: "include_diff", name: "diff" },
  { key: "include_description", name: "description" },
  { key: "include_full_files", name: "full files" },
  { key: "include_test_context", name: "tests" },
  { key: "include_related_code", name: "related code" },
  { key: "include_commit_history", name: "commit history" },
  { key: "include_context", name: "project context" },
];

/** What the prompt carries besides the instructions: "diff + description + full files". */
export const includedContextSummary = (config: BriefConfig): string => {
  const names = CONTEXT_SHORT_NAMES.filter(({ key }) => config[key]).map(({ name }) => name);
  return names.length > 0 ? names.join(" + ") : "instructions only";
};

const COMPACT_NUMBER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 1734 → "1.7k", 950 → "950", 1 250 000 → "1.3m": a size at a glance. */
export const formatCompactCount = (value: number): string =>
  COMPACT_NUMBER.format(value).toLowerCase();
