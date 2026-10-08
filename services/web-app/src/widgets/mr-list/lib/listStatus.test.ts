import { describe, expect, it } from "vitest";
import { formatListStatus } from "./listStatus";

describe("formatListStatus", () => {
  it("says nothing once everything is loaded and shown", () => {
    expect(
      formatListStatus({ loadedCount: 30, hasNextPage: false, isFetchingNextPage: false })
    ).toBeNull();
    expect(
      formatListStatus({
        loadedCount: 30,
        shownCount: 30,
        hasNextPage: false,
        isFetchingNextPage: false,
      })
    ).toBeNull();
  });

  it("invites to scroll while more pages are available", () => {
    expect(
      formatListStatus({ loadedCount: 37, hasNextPage: true, isFetchingNextPage: false })
    ).toBe("Showing 37 · scroll for more");
    expect(formatListStatus({ loadedCount: 37, hasNextPage: true, isFetchingNextPage: true })).toBe(
      "Showing 37 · loading more…"
    );
  });

  it("counts what a filter hides", () => {
    expect(
      formatListStatus({
        loadedCount: 52,
        shownCount: 7,
        hasNextPage: false,
        isFetchingNextPage: false,
      })
    ).toBe("7 of 52 shown");
    expect(
      formatListStatus({
        loadedCount: 52,
        shownCount: 7,
        hasNextPage: true,
        isFetchingNextPage: false,
      })
    ).toBe("7 of 52 shown · scroll for more");
  });
});
