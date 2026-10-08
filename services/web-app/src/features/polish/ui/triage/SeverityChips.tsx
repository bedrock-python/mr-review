import { Chip } from "@shared/ui";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "../../lib";
import type { SeverityCounts } from "../../lib";
import type { CommentSeverity } from "@entities/review";

type SeverityChipsProps = {
  selected: readonly CommentSeverity[];
  counts: SeverityCounts;
  onChange: (selected: CommentSeverity[]) => void;
};

/** The severity filter: one toggle per severity, with how many comments each would show. */
export const SeverityChips = ({
  selected,
  counts,
  onChange,
}: SeverityChipsProps): React.ReactElement => (
  <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Filter by severity">
    {SEVERITY_ORDER.map((severity) => (
      <Chip
        key={severity}
        tone={severity}
        hasDot
        count={counts[severity]}
        isSelected={selected.includes(severity)}
        onSelectedChange={(isSelected) => {
          onChange(isSelected ? [...selected, severity] : selected.filter((s) => s !== severity));
        }}
      >
        {SEVERITY_LABEL[severity]}
      </Chip>
    ))}
  </div>
);
