import type { CommentSeverity } from "../model";

/** Most severe first: the order of filters, counts and sorting. */
export const SEVERITY_ORDER: readonly CommentSeverity[] = [
  "critical",
  "major",
  "minor",
  "suggestion",
];

/** The hue of a severity, for dots, fills and tints. */
export const SEV_COLOR: Record<CommentSeverity, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

/** The same hue when it colours text or a thin border: AA on every theme. */
export const SEV_TEXT_COLOR: Record<CommentSeverity, string> = {
  critical: "var(--c-critical-fg)",
  major: "var(--c-major-fg)",
  minor: "var(--c-minor-fg)",
  suggestion: "var(--c-suggest-fg)",
};

export const SEVERITY_RANK: Record<CommentSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  suggestion: 3,
};

export type SeverityCountMap = Record<CommentSeverity, number>;

/** How many comments of each severity, zeros included, for SeverityCounts. */
export const countSeverities = (
  items: readonly { severity: CommentSeverity }[]
): SeverityCountMap => {
  const counts: SeverityCountMap = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
};
