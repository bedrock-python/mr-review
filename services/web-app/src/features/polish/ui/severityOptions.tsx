import { SEVERITY_LABEL, SEVERITY_ORDER, SEV_COLOR } from "../lib";
import type { CommentSeverity } from "@entities/review";
import type { SegmentedOption } from "@shared/ui";

/** Severity as a segmented control: the word, with the severity's dot before it. */
export const SEVERITY_OPTIONS: readonly SegmentedOption<CommentSeverity>[] = SEVERITY_ORDER.map(
  (severity) => ({
    value: severity,
    label: SEVERITY_LABEL[severity],
    icon: (
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: SEV_COLOR[severity] }}
        aria-hidden="true"
      />
    ),
  })
);
