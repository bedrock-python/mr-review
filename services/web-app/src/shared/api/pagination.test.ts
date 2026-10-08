import { describe, expect, it } from "vitest";
import { flattenPages, getNextPageParam } from "./pagination";
import type { Page } from "./pagination";

const page = <T>(items: T[], pageNumber: number, hasMore: boolean): Page<T> => ({
  items,
  page: pageNumber,
  per_page: 2,
  has_more: hasMore,
});

describe("getNextPageParam", () => {
  it("returns the following page number while the server reports more", () => {
    expect(getNextPageParam(page([1, 2], 1, true))).toBe(2);
    expect(getNextPageParam(page([3, 4], 7, true))).toBe(8);
  });

  it("returns undefined on the last page so hasNextPage turns false", () => {
    expect(getNextPageParam(page([5], 3, false))).toBeUndefined();
  });

  it("follows has_more even when a page is empty", () => {
    expect(getNextPageParam(page([], 2, true))).toBe(3);
    expect(getNextPageParam(page([], 2, false))).toBeUndefined();
  });
});

describe("flattenPages", () => {
  const byId = (item: { id: string }): string => item.id;

  it("returns an empty list when nothing is loaded", () => {
    expect(flattenPages(undefined, byId)).toEqual([]);
  });

  it("concatenates pages in order", () => {
    const data = {
      pages: [page([{ id: "a" }, { id: "b" }], 1, true), page([{ id: "c" }], 2, false)],
      pageParams: [1, 2],
    };
    expect(flattenPages(data, byId).map(byId)).toEqual(["a", "b", "c"]);
  });

  it("drops items repeated on a later page after the list shifted", () => {
    const data = {
      pages: [
        page([{ id: "a" }, { id: "b" }], 1, true),
        page([{ id: "b" }, { id: "c" }], 2, false),
      ],
      pageParams: [1, 2],
    };
    expect(flattenPages(data, byId).map(byId)).toEqual(["a", "b", "c"]);
  });
});
