import type { CommentSeverity } from "@entities/review";

export const SEVERITY_ORDER: readonly CommentSeverity[] = [
  "critical",
  "major",
  "minor",
  "suggestion",
];

export const SEV_COLOR: Record<CommentSeverity, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

export const SEVERITY_RANK: Record<CommentSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  suggestion: 3,
};
