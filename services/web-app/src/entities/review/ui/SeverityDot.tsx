import { cn } from "@shared/lib";
import type { CommentSeverity } from "../model";

export type SeverityDotProps = {
  severity: CommentSeverity;
  className?: string;
};

/**
 * A severity's dot, beside a word or a count that names it: decorative, the text carries the
 * meaning. Menu items, segmented options, pinned comments and SeverityCounts use it.
 */
export const SeverityDot = ({ severity, className }: SeverityDotProps): React.ReactElement => (
  <span className={cn("ui-dot", className)} data-tone={severity} aria-hidden="true" />
);
