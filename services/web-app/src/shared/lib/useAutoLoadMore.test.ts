import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_BARREN_AUTO_PAGES, useAutoLoadMore } from "./useAutoLoadMore";
import type { UseAutoLoadMoreParams } from "./useAutoLoadMore";

type Props = Omit<UseAutoLoadMoreParams, "loadMore">;

const PAGE_SIZE = 30;

const BASE: Props = {
  isEndVisible: true,
  canLoadMore: true,
  pageCount: 1,
  loadedCount: PAGE_SIZE,
  visibleCount: 10,
  resetKey: "view-a",
};

const setup = (
  initial: Partial<Props> = {}
): {
  loadMore: ReturnType<typeof vi.fn>;
  rerender: (next: Partial<Props>) => void;
  result: { current: { isAutoLoadPaused: boolean } };
} => {
  const loadMore = vi.fn();
  const hook = renderHook((props: Props) => useAutoLoadMore({ ...props, loadMore }), {
    initialProps: { ...BASE, ...initial },
  });
  return {
    loadMore,
    rerender: (next) => {
      hook.rerender({ ...BASE, ...next });
    },
    result: hook.result,
  };
};

/** Simulates a page whose items all end up hidden by a client-side filter. */
const hiddenPage = (page: number): Partial<Props> => ({
  pageCount: page,
  loadedCount: page * PAGE_SIZE,
  visibleCount: 0,
});

describe("useAutoLoadMore", () => {
  it("loads the next page when the end of the list is on screen", () => {
    const { loadMore } = setup();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("does not load while the end is off screen or loading is blocked", () => {
    const { loadMore, rerender } = setup({ isEndVisible: false });
    rerender({ isEndVisible: false });
    rerender({ isEndVisible: true, canLoadMore: false });
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("loads again after a page arrives and the end is still visible", () => {
    const { loadMore, rerender } = setup();
    rerender({ canLoadMore: false });
    rerender({ canLoadMore: true, pageCount: 2, loadedCount: 2 * PAGE_SIZE, visibleCount: 20 });
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it("keeps loading through empty pages the server marks has_more", () => {
    const { loadMore, rerender, result } = setup({ loadedCount: 0, visibleCount: 0 });
    const emptyPages = MAX_BARREN_AUTO_PAGES + 3;
    for (let page = 2; page <= emptyPages; page += 1) {
      rerender({ canLoadMore: false, pageCount: page - 1, loadedCount: 0, visibleCount: 0 });
      rerender({ canLoadMore: true, pageCount: page, loadedCount: 0, visibleCount: 0 });
    }
    expect(result.current.isAutoLoadPaused).toBe(false);
    expect(loadMore).toHaveBeenCalledTimes(emptyPages);
  });

  it("pauses after several pages whose items were all filtered out", () => {
    const { loadMore, rerender, result } = setup(hiddenPage(1));
    for (let page = 2; page <= MAX_BARREN_AUTO_PAGES + 1; page += 1) {
      rerender({ ...hiddenPage(page - 1), canLoadMore: false });
      rerender({ ...hiddenPage(page), canLoadMore: true });
    }
    expect(result.current.isAutoLoadPaused).toBe(true);
    const callsWhenPaused = loadMore.mock.calls.length;
    rerender({ ...hiddenPage(MAX_BARREN_AUTO_PAGES + 1), canLoadMore: false });
    rerender({ ...hiddenPage(MAX_BARREN_AUTO_PAGES + 1), canLoadMore: true });
    expect(loadMore).toHaveBeenCalledTimes(callsWhenPaused);
  });

  it("resumes when a page shows something or the view changes", () => {
    const { rerender, result } = setup(hiddenPage(1));
    for (let page = 2; page <= MAX_BARREN_AUTO_PAGES + 1; page += 1) {
      rerender(hiddenPage(page));
    }
    expect(result.current.isAutoLoadPaused).toBe(true);

    const nextPage = MAX_BARREN_AUTO_PAGES + 2;
    rerender({ pageCount: nextPage, loadedCount: nextPage * PAGE_SIZE, visibleCount: 1 });
    expect(result.current.isAutoLoadPaused).toBe(false);

    for (let page = nextPage + 1; page <= nextPage + MAX_BARREN_AUTO_PAGES; page += 1) {
      rerender({ pageCount: page, loadedCount: page * PAGE_SIZE, visibleCount: 1 });
    }
    expect(result.current.isAutoLoadPaused).toBe(true);
    rerender({ resetKey: "view-b", pageCount: 1, loadedCount: PAGE_SIZE, visibleCount: 1 });
    expect(result.current.isAutoLoadPaused).toBe(false);
  });
});
