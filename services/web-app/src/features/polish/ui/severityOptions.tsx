import { SeverityDot } from "@entities/review";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "../lib";
import type { CommentSeverity } from "@entities/review";
import type { SegmentedOption } from "@shared/ui";

/** Severity as a segmented control: the word, with the severity's dot before it. */
export const SEVERITY_OPTIONS: readonly SegmentedOption<CommentSeverity>[] = SEVERITY_ORDER.map(
  (severity) => ({
    value: severity,
    label: SEVERITY_LABEL[severity],
    icon: <SeverityDot severity={severity} />,
  })
);
