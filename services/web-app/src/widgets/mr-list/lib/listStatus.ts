export type ListStatusParams = {
  loadedCount: number;
  /** Rows left after client-side filtering; omitted when nothing is filtered. */
  shownCount?: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

const describeNextPage = (hasNextPage: boolean, isFetchingNextPage: boolean): string | null => {
  if (isFetchingNextPage) return "loading more…";
  return hasNextPage ? "scroll for more" : null;
};

/**
 * The line under a paginated list, or null when it has nothing to add: everything is
 * loaded and nothing is filtered out, so the list itself is the whole story.
 */
export const formatListStatus = ({
  loadedCount,
  shownCount,
  hasNextPage,
  isFetchingNextPage,
}: ListStatusParams): string | null => {
  const nextPage = describeNextPage(hasNextPage, isFetchingNextPage);
  if (shownCount !== undefined && shownCount !== loadedCount) {
    const head = `${String(shownCount)} of ${String(loadedCount)} shown`;
    return nextPage === null ? head : `${head} · ${nextPage}`;
  }
  return nextPage === null ? null : `Showing ${String(loadedCount)} · ${nextPage}`;
};
