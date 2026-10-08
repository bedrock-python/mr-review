import { cn } from "@shared/lib";
import { SEVERITY_ORDER } from "../lib";
import { SeverityDot } from "./SeverityDot";
import type { SeverityCountMap } from "../lib";

export type SeverityCountsProps = {
  /** Comments per severity; a missing severity counts as zero. */
  counts: Partial<SeverityCountMap>;
  /** Dot and number only ("●2 ●1"); otherwise "2 critical · 1 major". */
  isCompact?: boolean;
  /** Severities with no comments are skipped unless this is set. */
  shouldShowZero?: boolean;
  className?: string;
};

const summarise = (counts: Partial<SeverityCountMap>): string => {
  const parts = SEVERITY_ORDER.filter((severity) => (counts[severity] ?? 0) > 0).map(
    (severity) => `${String(counts[severity] ?? 0)} ${severity}`
  );
  return parts.length === 0 ? "No comments" : parts.join(", ");
};

/** One row of per-severity counts, most severe first, read as a sentence. */
export const SeverityCounts = ({
  counts,
  isCompact = false,
  shouldShowZero = false,
  className,
}: SeverityCountsProps): React.ReactElement => {
  const shown = SEVERITY_ORDER.filter((severity) => shouldShowZero || (counts[severity] ?? 0) > 0);
  return (
    <span className={cn("ui-severity-counts", className)}>
      <span className="ui-visually-hidden">{summarise(counts)}</span>
      {shown.map((severity) => (
        <span key={severity} className="ui-severity-counts__item" aria-hidden="true">
          <SeverityDot severity={severity} />
          {counts[severity] ?? 0}
          {!isCompact && <span className="ui-severity-counts__label">{severity}</span>}
        </span>
      ))}
    </span>
  );
};
