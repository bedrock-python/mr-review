import { useRef } from "react";
import { Keyboard, Search, X } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE, IconButton, Input, Kbd, Toolbar, ToolbarSpacer } from "@shared/ui";
import { EMPTY_FILTERS, SEVERITY_ORDER, isFiltering, useFittingLayout } from "../../lib";
import { BulkMenu } from "./BulkMenu";
import { FileFilter, FiltersPopover, GroupToggle, StatusFilter } from "./ListFilters";
import { NewCommentButton } from "./NewCommentButton";
import { SeverityChips } from "./SeverityChips";
import type { FileFilterOption } from "./ListFilters";
import type { CommentFilters, SeverityCounts } from "../../lib";
import type { CommentSeverity } from "@entities/review";

/**
 * wide: everything in the row. medium: the file filter and grouping move into "Filters".
 * narrow: the status filter joins them and "New comment" keeps only its icon. The row takes
 * the roomiest one that fits on one line, whatever the theme's fonts.
 */
const TOOLBAR_LAYOUTS = ["wide", "medium", "narrow"] as const;

type TriageToolbarProps = {
  filters: CommentFilters;
  onFiltersChange: (filters: CommentFilters) => void;
  severityCounts: SeverityCounts;
  fileOptions: readonly FileFilterOption[];
  isGrouped: boolean;
  onGroupedChange: (isGrouped: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Comments on screen, which the bulk actions apply to. */
  shownCount: number;
  totalCount: number;
  /** Filters or collapsed groups hide some comments. */
  isPartial: boolean;
  onKeepAll: () => void;
  onDismissAll: () => void;
  onSetSeverity: (severity: CommentSeverity) => void;
  onAdd: () => void;
  isLocked: boolean;
  onShowShortcuts: () => void;
};

/** The list's own row: search and filters on the left, bulk actions and "new" on the right. */
export const TriageToolbar = ({
  filters,
  onFiltersChange,
  severityCounts,
  fileOptions,
  isGrouped,
  onGroupedChange,
  searchRef,
  shownCount,
  totalCount,
  isPartial,
  onKeepAll,
  onDismissAll,
  onSetSeverity,
  onAdd,
  isLocked,
  onShowShortcuts,
}: TriageToolbarProps): React.ReactElement => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isFiltered = isFiltering(filters);
  // What changes the row's width: counts, the "N of M shown ×" slot, the Filters badge.
  const contentKey = [
    SEVERITY_ORDER.map((severity) => severityCounts[severity]).join(","),
    isPartial ? `${String(shownCount)}/${String(totalCount)}` : "",
    isFiltered,
    filters.status,
    filters.file !== null,
    isGrouped,
  ].join("|");
  const layout = useFittingLayout(toolbarRef, TOOLBAR_LAYOUTS, contentKey);
  const update = (patch: Partial<CommentFilters>): void => {
    onFiltersChange({ ...filters, ...patch });
  };

  const status = {
    value: filters.status,
    onChange: (value: CommentFilters["status"]) => {
      update({ status: value });
    },
  };
  const file = {
    value: filters.file,
    options: fileOptions,
    onChange: (value: string | null) => {
      update({ file: value });
    },
  };
  const group = { isGrouped, onChange: onGroupedChange };

  return (
    // Wraps only where even the narrow layout does not fit (the merge request list open beside).
    <Toolbar
      ref={toolbarRef}
      size="sm"
      className="flex-wrap gap-y-(--space-2) py-(--space-1)"
      data-layout={layout}
    >
      <Input
        ref={searchRef}
        size="sm"
        type="search"
        aria-label="Search comments"
        placeholder="Search"
        value={filters.search}
        leadingIcon={<Search size={ICON_SIZE.inline} />}
        trailing={
          filters.search.length === 0 ? (
            <span aria-hidden="true">
              <Kbd>/</Kbd>
            </span>
          ) : undefined
        }
        // Never narrower than the placeholder with the icon, the "/" key cap and the padding
        // around them, in the theme's own type: the row takes a tighter layout first.
        className="max-w-[320px] min-w-[calc(9ch_+_2_*_var(--control-sm)_+_var(--space-4))] flex-[4_1_0%]"
        onChange={(event) => {
          update({ search: event.target.value });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (filters.search.length > 0) update({ search: "" });
          else event.currentTarget.blur();
        }}
      />
      <SeverityChips
        selected={filters.severities}
        counts={severityCounts}
        onChange={(severities) => {
          update({ severities });
        }}
      />
      {layout !== "narrow" && <StatusFilter value={status.value} onChange={status.onChange} />}
      {layout === "wide" ? (
        <span className="flex shrink-0 items-center gap-(--space-1)">
          <FileFilter {...file} className="w-[200px]" />
          <GroupToggle {...group} />
        </span>
      ) : (
        <FiltersPopover status={layout === "narrow" ? status : null} file={file} group={group} />
      )}

      <ToolbarSpacer />

      {/* Always in the page so the count is announced; takes no room while nothing is hidden. */}
      <span
        className={cn(
          "text-fg-2 shrink-0 font-mono text-(length:--fs-meta) whitespace-nowrap",
          !isPartial && "ui-visually-hidden"
        )}
        aria-live="polite"
      >
        {isPartial ? `${String(shownCount)} of ${String(totalCount)} shown` : ""}
      </span>
      {isFiltered && (
        <IconButton
          size="sm"
          label="Clear filters"
          icon={<X size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={() => {
            onFiltersChange(EMPTY_FILTERS);
          }}
        />
      )}
      <BulkMenu
        scope={isPartial ? "shown" : "all"}
        count={shownCount}
        onKeepAll={onKeepAll}
        onDismissAll={onDismissAll}
        onSetSeverity={onSetSeverity}
      />
      <NewCommentButton isCompact={layout === "narrow"} isLocked={isLocked} onAdd={onAdd} />
      <IconButton
        size="sm"
        label="Keyboard shortcuts"
        shortcut="?"
        icon={<Keyboard size={ICON_SIZE.inline} aria-hidden="true" />}
        onClick={onShowShortcuts}
      />
    </Toolbar>
  );
};
