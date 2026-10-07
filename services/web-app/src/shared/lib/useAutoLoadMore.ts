import { useEffect, useState } from "react";

/**
 * Consecutive pages whose items were all hidden by client-side filtering before
 * auto-loading pauses. A client-side filter that matches nothing would otherwise
 * keep the list end on screen and walk every page of the upstream host.
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
  /** Auto-loading stopped after several pages whose items were all filtered out. */
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
    // The server may return short or even empty pages while has_more is true
    // (pages are cut by upstream batches); such pages are not the filter's fault
    // and must keep loading, so only pages whose items all got hidden count.
    const hasVisibleGrowth = input.visibleCount > guard.visibleCount;
    const hasHiddenItems = input.loadedCount > guard.loadedCount;
    let barrenPages = guard.barrenPages;
    if (hasVisibleGrowth) barrenPages = 0;
    else if (hasHiddenItems) barrenPages += 1;
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
