import { useEffect, useState } from "react";

/**
 * Consecutive pages that added no visible row — empty, or every item hidden by a
 * client-side filter — before auto-loading pauses and the list offers "Load more".
 * Without it, a list whose end stays on screen walks every page of the upstream
 * host: a filter that matches nothing, or the "All" inbox over hundreds of
 * repositories without open merge requests (each page a fan-out upstream).
 */
export const MAX_BARREN_AUTO_PAGES = 3;

export type UseAutoLoadMoreParams = {
  /** The end of the rendered list is (nearly) on screen. */
  isEndVisible: boolean;
  /** A next page exists and no fetch, page error or placeholder data is in the way. */
  canLoadMore: boolean;
  /** Number of pages loaded so far; a change means a page arrived. */
  pageCount: number;
  /** Items received from the server so far, before client-side filtering. */
  loadedCount: number;
  /** Rows actually rendered after client-side filtering. */
  visibleCount: number;
  /** Identity of the current list view (host, filters…); a change resets the guard. */
  resetKey: string;
  loadMore: () => void;
};

export type UseAutoLoadMoreResult = {
  /** Auto-loading stopped after several pages that added no visible row. */
  isAutoLoadPaused: boolean;
};

type BarrenGuard = {
  resetKey: string;
  pageCount: number;
  loadedCount: number;
  visibleCount: number;
  barrenPages: number;
};

type GuardInput = Omit<BarrenGuard, "barrenPages">;

const advanceGuard = (guard: BarrenGuard, input: GuardInput): BarrenGuard => {
  if (guard.resetKey !== input.resetKey || input.pageCount < guard.pageCount) {
    return { ...input, barrenPages: 0 };
  }
  if (input.pageCount > guard.pageCount) {
    // A page counts as barren whether it came back empty (the server may answer
    // has_more with nothing in it) or all its items got hidden: either way the
    // user saw nothing new, and the next page costs the host the same.
    const hasVisibleGrowth = input.visibleCount > guard.visibleCount;
    const barrenPages = hasVisibleGrowth
      ? 0
      : guard.barrenPages + (input.pageCount - guard.pageCount);
    return { ...input, barrenPages };
  }
  if (input.visibleCount !== guard.visibleCount || input.loadedCount !== guard.loadedCount) {
    return { ...guard, visibleCount: input.visibleCount, loadedCount: input.loadedCount };
  }
  return guard;
};

/** Requests the next page whenever the end of the list is on screen. */
export const useAutoLoadMore = ({
  isEndVisible,
  canLoadMore,
  pageCount,
  loadedCount,
  visibleCount,
  resetKey,
  loadMore,
}: UseAutoLoadMoreParams): UseAutoLoadMoreResult => {
  const [guard, setGuard] = useState<BarrenGuard>(() => ({
    resetKey,
    pageCount,
    loadedCount,
    visibleCount,
    barrenPages: 0,
  }));

  // Derived from the previous render's counts, so it is tracked with the
  // "adjust state while rendering" pattern rather than an effect.
  const nextGuard = advanceGuard(guard, { resetKey, pageCount, loadedCount, visibleCount });
  if (nextGuard !== guard) {
    setGuard(nextGuard);
  }

  const isAutoLoadPaused = nextGuard.barrenPages >= MAX_BARREN_AUTO_PAGES;
  const shouldLoad = isEndVisible && canLoadMore && !isAutoLoadPaused;

  useEffect(() => {
    if (shouldLoad) loadMore();
  }, [shouldLoad, loadMore]);

  return { isAutoLoadPaused };
};
