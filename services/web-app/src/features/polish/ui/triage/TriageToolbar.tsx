import { useRef } from "react";
import { Keyboard, Plus, Search, X } from "lucide-react";
import {
  Button,
  ICON_SIZE,
  IconButton,
  Input,
  Kbd,
  Toolbar,
  ToolbarSpacer,
  Tooltip,
} from "@shared/ui";
import { EMPTY_FILTERS, isFiltering, useElementWidth } from "../../lib";
import { BulkMenu } from "./BulkMenu";
import { FileFilter, FiltersPopover, GroupToggle, StatusFilter } from "./ListFilters";
import { SeverityChips } from "./SeverityChips";
import type { FileFilterOption } from "./ListFilters";
import type { CommentFilters, SeverityCounts } from "../../lib";
import type { CommentSeverity } from "@entities/review";

// Measured widths of the row with every filter set (the widest it gets), so typing a search
// never reshuffles the controls. Below the narrowest layout's width the row wraps.
/** Below this toolbar width the file filter and grouping move into "Filters". */
export const TOOLBAR_WIDE_MIN_PX = 1300;
/** Below this width the status filter joins them and "New comment" keeps only its icon. */
export const TOOLBAR_MEDIUM_MIN_PX = 1180;

type ToolbarLayout = "wide" | "medium" | "narrow";

const layoutFor = (width: number | null): ToolbarLayout => {
  if (width === null || width >= TOOLBAR_WIDE_MIN_PX) return "wide";
  return width >= TOOLBAR_MEDIUM_MIN_PX ? "medium" : "narrow";
};

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
  const layout = layoutFor(useElementWidth(toolbarRef));
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
    <Toolbar ref={toolbarRef} size="sm" className="flex-wrap gap-y-(--space-2) py-(--space-1)">
      <Input
        ref={searchRef}
        size="sm"
        type="search"
        aria-label="Search comments"
        placeholder="Search text or file"
        value={filters.search}
        leadingIcon={<Search size={ICON_SIZE.inline} />}
        trailing={
          filters.search.length === 0 ? (
            <span aria-hidden="true">
              <Kbd>/</Kbd>
            </span>
          ) : undefined
        }
        className="max-w-[320px] min-w-[144px] flex-1"
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

      <span className="flex shrink-0 items-center gap-(--space-1)">
        <span
          className="text-fg-2 font-mono text-(length:--fs-meta) whitespace-nowrap"
          aria-live="polite"
        >
          {isPartial ? `${String(shownCount)} of ${String(totalCount)} shown` : ""}
        </span>
        {isFiltering(filters) && (
          <IconButton
            size="sm"
            label="Clear filters"
            icon={<X size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={() => {
              onFiltersChange(EMPTY_FILTERS);
            }}
          />
        )}
      </span>
      <BulkMenu
        scope={isPartial ? "shown" : "all"}
        count={shownCount}
        onKeepAll={onKeepAll}
        onDismissAll={onDismissAll}
        onSetSeverity={onSetSeverity}
      />
      {layout === "narrow" ? (
        <IconButton
          size="sm"
          variant="secondary"
          label="New comment"
          shortcut="n"
          disabled={isLocked}
          icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={onAdd}
        />
      ) : (
        <Tooltip content="New comment" shortcut="n" isDisabled={isLocked}>
          <Button
            size="sm"
            icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
            disabled={isLocked}
            onClick={onAdd}
          >
            New comment
          </Button>
        </Tooltip>
      )}
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
