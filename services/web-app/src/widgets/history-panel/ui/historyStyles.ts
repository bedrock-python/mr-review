import type { CommentSeverity, ReviewStage } from "@entities/review";

export const STAGE_META: Record<ReviewStage, { label: string; color: string }> = {
  pick: { label: "Picking", color: "var(--fg-3)" },
  brief: { label: "Brief", color: "var(--fg-2)" },
  dispatch: { label: "Dispatching", color: "var(--c-major)" },
  polish: { label: "Polishing", color: "var(--accent)" },
  post: { label: "Posted", color: "var(--c-add)" },
};

export const SEVERITY_ORDER: readonly CommentSeverity[] = [
  "critical",
  "major",
  "minor",
  "suggestion",
];

export const SEVERITY_COLORS: Record<CommentSeverity, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};
