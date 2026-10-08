export type ListStatusParams = {
  loadedCount: number;
  /** Rows left after client-side filtering; omitted when nothing is filtered. */
  shownCount?: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /**
   * Auto-loading stopped after pages that showed nothing new (InfiniteVirtualList reports it):
   * the rest comes from the "Load more" row at the end, not from scrolling.
   */
  isAutoLoadPaused?: boolean;
};

const describeNextPage = ({
  hasNextPage,
  isFetchingNextPage,
  isAutoLoadPaused = false,
}: ListStatusParams): string | null => {
  if (isFetchingNextPage) return "loading more…";
  if (!hasNextPage) return null;
  return isAutoLoadPaused ? "Load more below" : "more below";
};

/**
 * The line under a paginated list, or null when it has nothing to add: everything is
 * loaded and nothing is filtered out, so the list itself is the whole story.
 */
export const formatListStatus = (params: ListStatusParams): string | null => {
  const { loadedCount, shownCount } = params;
  const nextPage = describeNextPage(params);
  if (shownCount !== undefined && shownCount !== loadedCount) {
    const head = `${String(shownCount)} of ${String(loadedCount)} shown`;
    return nextPage === null ? head : `${head} · ${nextPage}`;
  }
  return nextPage === null ? null : `Showing ${String(loadedCount)} · ${nextPage}`;
};
