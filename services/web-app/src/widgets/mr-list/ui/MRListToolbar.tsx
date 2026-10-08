import { SearchField, SegmentedControl, Select, Toolbar } from "@shared/ui";
import { SCOPE_OPTIONS, SORT_OPTIONS, STATE_OPTIONS } from "../lib/mrListView";
import { ReadinessFilter } from "./ReadinessFilter";
import type { InboxScope, MRStateFilter } from "@entities/mr";
import type { MRSortKey, ReadinessFilter as Readiness } from "../lib/mrListView";

export type MRListToolbarProps = {
  isInbox: boolean;
  state: MRStateFilter;
  onStateChange: (state: MRStateFilter) => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  readiness: Readiness;
  onReadinessChange: (readiness: Readiness) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isSearchBusy: boolean;
  sort: MRSortKey;
  onSortChange: (sort: MRSortKey) => void;
};

const isSortKey = (value: string): value is MRSortKey =>
  SORT_OPTIONS.some((option) => option.value === value);

/**
 * Two rows over the list: which merge requests (the relationship in the inbox, the state in a
 * repository), then search, order and the draft filter.
 */
export const MRListToolbar = ({
  isInbox,
  state,
  onStateChange,
  scope,
  onScopeChange,
  readiness,
  onReadinessChange,
  search,
  onSearchChange,
  isSearchBusy,
  sort,
  onSortChange,
}: MRListToolbarProps): React.ReactElement => (
  <>
    <Toolbar size="sm" hasBorder={false} className="px-(--space-3) pt-(--space-1)">
      {/* Relationship options need the user's identity, which only the inbox endpoint has. */}
      {isInbox ? (
        <SegmentedControl
          aria-label="Relationship"
          size="sm"
          options={SCOPE_OPTIONS}
          value={scope}
          onValueChange={onScopeChange}
          isFullWidth
        />
      ) : (
        <SegmentedControl
          aria-label="State"
          size="sm"
          options={STATE_OPTIONS}
          value={state}
          onValueChange={onStateChange}
          isFullWidth
        />
      )}
    </Toolbar>
    <Toolbar size="sm" className="px-(--space-3) pb-(--space-1)">
      <SearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder={isInbox ? "Filter loaded MRs…" : "Search MRs…"}
        ariaLabel="Search merge requests"
        isBusy={isSearchBusy}
      />
      <Select
        aria-label="Sort by"
        value={sort}
        onChange={(event) => {
          if (isSortKey(event.target.value)) onSortChange(event.target.value);
        }}
        isFullWidth={false}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <ReadinessFilter value={readiness} onValueChange={onReadinessChange} />
    </Toolbar>
  </>
);
