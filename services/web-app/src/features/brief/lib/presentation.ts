import type { BriefPreset, ExcludedFiles } from "@entities/review";

/** The built-in presets as cards; labels render before the server's preset texts arrive. */
export const BUILTIN_PRESET_CARDS: { id: BriefPreset; label: string; description: string }[] = [
  { id: "thorough", label: "THOROUGH", description: "Complete review, bugs, logic, naming" },
  { id: "security", label: "SECURITY", description: "Injections, auth, crypto, exposure" },
  { id: "style", label: "STYLE", description: "Naming, readability, conventions" },
  { id: "performance", label: "PERFORMANCE", description: "Complexity, queries, allocations" },
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
