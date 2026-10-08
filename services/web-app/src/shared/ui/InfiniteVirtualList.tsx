import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAutoLoadMore, useVirtualListKeyboardNav } from "@shared/lib";
import { LoadMoreRow } from "./ListStates";

/** Rows past the last rendered one at which the next page is requested. */
const PREFETCH_ROWS = 5;
const DEFAULT_OVERSCAN = 6;
const STALE_OPACITY = 0.55;

export type ListPagination = {
  pageCount: number;
  /** Items received from the server, before client-side filtering. */
  loadedCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  /** No refetch, filter transition or other request is in the way of the next page. */
  isIdle: boolean;
  fetchNextPage: () => void;
  /** Shown next to "Retry" when the next page fails. */
  errorMessage: string;
  /** Shown next to "Load more" when auto-loading paused on pages with nothing visible. */
  pausedMessage: string;
};

export type InfiniteVirtualListProps<TRow> = {
  rows: readonly TRow[];
  getRowKey: (row: TRow) => string;
  /** Exact height for fixed rows, a best guess when `shouldMeasureRows` is set. */
  estimateRowSize: (row: TRow) => number;
  /** Measure rendered rows (variable heights) instead of trusting the estimate. */
  shouldMeasureRows?: boolean;
  /**
   * Keep the first visible row in place when rows are inserted above it (grouped
   * lists where a new page lands inside groups above the viewport). Requires
   * exact row sizes, so it is ignored for measured rows.
   */
  shouldAnchorScroll?: boolean;
  renderRow: (row: TRow) => React.ReactNode;
  /** Rows the arrow keys may land on; rows rendering no focus target must return false. */
  isRowFocusable?: (row: TRow) => boolean;
  ariaLabel: string;
  /** Identity of the list view; a change scrolls back to the top and resets auto-loading. */
  resetKey: string;
  pagination: ListPagination;
  /** Rows are a placeholder from the previous view while the new one loads. */
  isStale?: boolean;
  /** Extra content under the rows (skeletons, empty or error messages). */
  footer?: React.ReactNode;
  /**
   * Told when auto-loading pauses after pages that showed nothing new, and when it resumes:
   * the list's status line can then point at the "Load more" row.
   */
  onAutoLoadPausedChange?: (isAutoLoadPaused: boolean) => void;
};

type ScrollAnchor = { key: string; offsetInRow: number };

const findAnchor = <TRow,>(
  rows: readonly TRow[],
  scrollTop: number,
  getRowKey: (row: TRow) => string,
  getSize: (row: TRow) => number
): ScrollAnchor | null => {
  let start = 0;
  for (const row of rows) {
    const size = getSize(row);
    if (start + size > scrollTop) return { key: getRowKey(row), offsetInRow: scrollTop - start };
    start += size;
  }
  return null;
};

const findRowStart = <TRow,>(
  rows: readonly TRow[],
  key: string,
  getRowKey: (row: TRow) => string,
  getSize: (row: TRow) => number
): number | null => {
  let start = 0;
  for (const row of rows) {
    if (getRowKey(row) === key) return start;
    start += getSize(row);
  }
  return null;
};

export const InfiniteVirtualList = <TRow,>({
  rows,
  getRowKey,
  estimateRowSize,
  shouldMeasureRows = false,
  shouldAnchorScroll = false,
  renderRow,
  isRowFocusable,
  ariaLabel,
  resetKey,
  pagination,
  isStale = false,
  footer,
  onAutoLoadPausedChange,
}: InfiniteVirtualListProps<TRow>): React.ReactElement => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<{ rows: readonly TRow[]; resetKey: string } | null>(null);

  // Stable per `rows` so the virtualizer only rebuilds its measurements when the
  // list changes, not on every scroll-driven render.
  const estimateSize = useCallback(
    (index: number): number => {
      const row = rows[index];
      return row === undefined ? 0 : estimateRowSize(row);
    },
    [rows, estimateRowSize]
  );
  const getItemKey = useCallback(
    (index: number): string | number => {
      const row = rows[index];
      return row === undefined ? index : getRowKey(row);
    },
    [rows, getRowKey]
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is read during render only, never memoized
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: DEFAULT_OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? -1;
  const isEndVisible = lastIndex >= rows.length - 1 - PREFETCH_ROWS;

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, isIdle, fetchNextPage } =
    pagination;
  const { isAutoLoadPaused } = useAutoLoadMore({
    isEndVisible,
    canLoadMore: hasNextPage && !isFetchingNextPage && !isFetchNextPageError && isIdle,
    pageCount: pagination.pageCount,
    loadedCount: pagination.loadedCount,
    visibleCount: rows.length,
    resetKey,
    loadMore: fetchNextPage,
  });

  // The same condition as the "Load more" row below: not while a page loads or has failed.
  const isPausedWithMore =
    isAutoLoadPaused && hasNextPage && !isFetchingNextPage && !isFetchNextPageError;
  useEffect(() => {
    onAutoLoadPausedChange?.(isPausedWithMore);
  }, [isPausedWithMore, onAutoLoadPausedChange]);

  const isIndexFocusable = useCallback(
    (index: number): boolean => {
      const row = rows[index];
      return row !== undefined && (isRowFocusable?.(row) ?? true);
    },
    [rows, isRowFocusable]
  );
  const handleKeyDown = useVirtualListKeyboardNav(virtualizer, rows.length, isIndexFocusable);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previous = previousRef.current;
    previousRef.current = { rows, resetKey };
    if (!element || !previous) return;
    if (previous.resetKey !== resetKey) {
      element.scrollTop = 0;
      return;
    }
    if (!shouldAnchorScroll || shouldMeasureRows || previous.rows === rows) return;
    if (element.scrollTop <= 0) return;
    const anchor = findAnchor(previous.rows, element.scrollTop, getRowKey, estimateRowSize);
    if (!anchor) return;
    const start = findRowStart(rows, anchor.key, getRowKey, estimateRowSize);
    if (start === null) return;
    const target = start + anchor.offsetInRow;
    if (Math.abs(target - element.scrollTop) >= 1) element.scrollTop = target;
  }, [rows, resetKey, shouldAnchorScroll, shouldMeasureRows, getRowKey, estimateRowSize]);

  return (
    <div
      ref={scrollRef}
      data-virtual-scroll=""
      style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowAnchor: "none" }}
    >
      <div
        role="list"
        aria-label={ariaLabel}
        aria-busy={isStale}
        onKeyDown={handleKeyDown}
        style={{
          position: "relative",
          width: "100%",
          height: virtualizer.getTotalSize(),
          opacity: isStale ? STALE_OPACITY : 1,
          transition: "opacity 0.12s",
        }}
      >
        {virtualItems.map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={shouldMeasureRows ? virtualizer.measureElement : undefined}
              role="listitem"
              aria-posinset={item.index + 1}
              aria-setsize={hasNextPage ? -1 : rows.length}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: shouldMeasureRows ? undefined : item.size,
                transform: `translateY(${String(item.start)}px)`,
              }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && <LoadMoreRow state="loading" />}
      {isFetchNextPageError && !isFetchingNextPage && (
        <LoadMoreRow state="error" message={pagination.errorMessage} onRetry={fetchNextPage} />
      )}
      {isAutoLoadPaused && hasNextPage && !isFetchingNextPage && !isFetchNextPageError && (
        <LoadMoreRow state="paused" message={pagination.pausedMessage} onLoadMore={fetchNextPage} />
      )}
      {footer}
    </div>
  );
};
