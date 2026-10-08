import { SearchField } from "@shared/ui";
import { READINESS_OPTIONS, SCOPE_OPTIONS, SORT_OPTIONS, STATE_OPTIONS } from "../lib/mrListView";
import type { InboxScope, MRStateFilter } from "@entities/mr";
import type { MRSortKey, Option, ReadinessFilter } from "../lib/mrListView";

type ChipProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

const Chip = ({ label, isActive, onClick }: ChipProps): React.ReactElement => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={isActive}
    style={{
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontFamily: "var(--font-mono)",
      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
      background: isActive ? "var(--accent)" : "transparent",
      color: isActive ? "var(--accent-ink)" : "var(--fg-1)",
      cursor: "pointer",
      transition: "all 0.08s",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
);

type ChipGroupProps<TValue extends string> = {
  ariaLabel: string;
  options: readonly Option<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
};

const ChipGroup = <TValue extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: ChipGroupProps<TValue>): React.ReactElement => (
  <div role="group" aria-label={ariaLabel} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    {options.map((option) => (
      <Chip
        key={option.value}
        label={option.label}
        isActive={option.value === value}
        onClick={() => {
          onChange(option.value);
        }}
      />
    ))}
  </div>
);

export type MRListToolbarProps = {
  isInbox: boolean;
  state: MRStateFilter;
  onStateChange: (state: MRStateFilter) => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  readiness: ReadinessFilter;
  onReadinessChange: (readiness: ReadinessFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isSearchBusy: boolean;
  sort: MRSortKey;
  onSortChange: (sort: MRSortKey) => void;
};

const isSortKey = (value: string): value is MRSortKey =>
  SORT_OPTIONS.some((option) => option.value === value);

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
    <div
      style={{
        padding: "10px 12px 8px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 12px",
      }}
    >
      {/* Relationship chips need the user's identity, which only the inbox endpoint has. */}
      {isInbox ? (
        <ChipGroup
          ariaLabel="Relationship"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={onScopeChange}
        />
      ) : (
        <ChipGroup
          ariaLabel="State"
          options={STATE_OPTIONS}
          value={state}
          onChange={onStateChange}
        />
      )}
      {/* Client-side toggles sit apart, right-aligned; they wrap as one unit. */}
      <div
        role="group"
        aria-label="Readiness"
        style={{ display: "flex", gap: 4, marginLeft: "auto", flexShrink: 0 }}
      >
        {READINESS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            isActive={readiness === option.value}
            onClick={() => {
              onReadinessChange(readiness === option.value ? "any" : option.value);
            }}
          />
        ))}
      </div>
    </div>

    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <SearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder={isInbox ? "Filter loaded MRs…" : "Search MRs…"}
        ariaLabel="Search merge requests"
        isBusy={isSearchBusy}
      />
      <select
        value={sort}
        onChange={(event) => {
          if (isSortKey(event.target.value)) onSortChange(event.target.value);
        }}
        aria-label="Sort by"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 11,
          color: "var(--fg-1)",
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  </>
);
