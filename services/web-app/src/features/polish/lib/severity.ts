import type { CommentSeverity } from "@entities/review";

// The severity map lives with the review entity; Polish keeps its old import path.
export { SEVERITY_ORDER, SEV_COLOR, SEV_TEXT_COLOR, SEVERITY_RANK } from "@entities/review";

/** A severity as a word in a sentence-case control ("Critical"); badges use the raw value. */
export const SEVERITY_LABEL: Record<CommentSeverity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  suggestion: "Suggestion",
};

/** The triage key that sets each severity. */
export const SEVERITY_KEY: Record<CommentSeverity, string> = {
  critical: "1",
  major: "2",
  minor: "3",
  suggestion: "4",
};
