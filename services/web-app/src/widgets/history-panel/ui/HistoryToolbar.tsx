import { Search } from "lucide-react";
import { Chip, ICON_SIZE, Input } from "@shared/ui";
import { STAGE_META } from "./historyStyles";
import type { ReviewStage } from "@entities/review";

const TOOLBAR: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  flexShrink: 0,
  padding: "var(--space-3) var(--space-4)",
  borderBottom: "1px solid var(--border)",
};

export type HistoryToolbarProps = {
  searchRef: React.RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (value: string) => void;
  /** Reviews per stage; the stage filter shows once there is more than one stage. */
  stageCounts: ReadonlyMap<ReviewStage, number>;
  stageFilter: ReviewStage | null;
  onStageFilterChange: (stage: ReviewStage | null) => void;
};

/** The search box and the stage filter above the review list. */
export const HistoryToolbar = ({
  searchRef,
  search,
  onSearchChange,
  stageCounts,
  stageFilter,
  onStageFilterChange,
}: HistoryToolbarProps): React.ReactElement => (
  <div style={TOOLBAR}>
    <Input
      ref={searchRef}
      type="search"
      aria-label="Search reviews"
      placeholder="Search by host, repository or MR…"
      value={search}
      onChange={(event) => {
        onSearchChange(event.target.value);
      }}
      leadingIcon={<Search size={ICON_SIZE.inline} />}
    />
    {stageCounts.size > 1 && (
      <div
        role="group"
        aria-label="Filter by stage"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
      >
        <Chip
          isSelected={stageFilter === null}
          onClick={() => {
            onStageFilterChange(null);
          }}
        >
          All
        </Chip>
        {[...stageCounts.entries()].map(([stage, count]) => (
          <Chip
            key={stage}
            tone={STAGE_META[stage].tone}
            hasDot
            count={count}
            isSelected={stageFilter === stage}
            onSelectedChange={(isSelected) => {
              onStageFilterChange(isSelected ? stage : null);
            }}
          >
            {STAGE_META[stage].label}
          </Chip>
        ))}
      </div>
    )}
  </div>
);
