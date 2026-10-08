import { Search } from "lucide-react";
import { cn } from "@shared/lib";
import { EMPTY_FILTERS, SEVERITY_ORDER, SEV_COLOR, isFiltering } from "../../lib";
import type { CommentFilters, SeverityCounts, StatusFilter } from "../../lib";
import type { CommentSeverity } from "@entities/review";

export type FileFilterOption = { value: string; label: string; count: number };

type TriageFilterBarProps = {
  filters: CommentFilters;
  onFiltersChange: (filters: CommentFilters) => void;
  severityCounts: SeverityCounts;
  fileOptions: readonly FileFilterOption[];
  isGrouped: boolean;
  onGroupedChange: (isGrouped: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "kept", label: "Kept" },
  { value: "dismissed", label: "Dismissed" },
];

const ALL_FILES = "";

const toggleSeverity = (
  selected: readonly CommentSeverity[],
  severity: CommentSeverity
): CommentSeverity[] =>
  selected.includes(severity) ? selected.filter((s) => s !== severity) : [...selected, severity];

const segmentClass = (isActive: boolean): string =>
  cn(
    "rounded-[5px] px-2.5 py-1 font-mono text-[11px]",
    isActive ? "bg-bg-0 text-fg-0" : "text-fg-2 hover:text-fg-0"
  );

export const TriageFilterBar = ({
  filters,
  onFiltersChange,
  severityCounts,
  fileOptions,
  isGrouped,
  onGroupedChange,
  searchRef,
}: TriageFilterBarProps): React.ReactElement => {
  const update = (patch: Partial<CommentFilters>): void => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="border-border bg-bg-0 focus-within:border-border-strong flex min-w-[200px] flex-1 items-center gap-2 rounded-md border px-2.5 py-1">
        <Search size={13} className="text-fg-3" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search comments"
          placeholder="Search text or file…   /"
          value={filters.search}
          onChange={(event) => {
            update({ search: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (filters.search.length > 0) update({ search: "" });
            else event.currentTarget.blur();
          }}
          className="text-fg-0 placeholder:text-fg-3 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        />
      </label>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
        {SEVERITY_ORDER.map((severity) => {
          const isActive = filters.severities.includes(severity);
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                update({ severities: toggleSeverity(filters.severities, severity) });
              }}
              className={cn("sev cursor-pointer", severity)}
              style={{
                opacity: filters.severities.length === 0 || isActive ? 1 : 0.45,
                background: isActive
                  ? `color-mix(in oklch, ${SEV_COLOR[severity]} 14%, transparent)`
                  : "transparent",
              }}
            >
              <span className="dot" />
              {severityCounts[severity]} {severity}
            </button>
          );
        })}
      </div>

      <div
        className="border-border bg-bg-2 inline-flex gap-0.5 rounded-[7px] border p-0.5"
        role="group"
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.status === value}
            onClick={() => {
              update({ status: value });
            }}
            className={segmentClass(filters.status === value)}
          >
            {label}
          </button>
        ))}
      </div>

      <select
        aria-label="Filter by file"
        value={filters.file ?? ALL_FILES}
        onChange={(event) => {
          update({ file: event.target.value === ALL_FILES ? null : event.target.value });
        }}
        className="border-border bg-bg-0 text-fg-1 max-w-[260px] rounded-md border px-2 py-1 font-mono text-[11px]"
      >
        <option value={ALL_FILES}>All files</option>
        {fileOptions.map(({ value, label, count }) => (
          <option key={value} value={value}>
            {label} ({count})
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-pressed={isGrouped}
        onClick={() => {
          onGroupedChange(!isGrouped);
        }}
        className={cn(
          "border-border rounded-md border px-2.5 py-1 font-mono text-[11px]",
          isGrouped ? "bg-bg-3 text-fg-0 border-border-strong" : "bg-bg-2 text-fg-2"
        )}
      >
        Group by file
      </button>

      {isFiltering(filters) && (
        <button
          type="button"
          className="text-fg-2 hover:text-fg-0 font-mono text-[11px] underline-offset-2 hover:underline"
          onClick={() => {
            onFiltersChange(EMPTY_FILTERS);
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
};
