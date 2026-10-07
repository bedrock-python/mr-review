import { describe, expect, it } from "vitest";
import {
  READINESS_OPTIONS,
  SCOPE_OPTIONS,
  SORT_OPTIONS,
  STATE_OPTIONS,
  applyMRListView,
  isClientFiltered,
} from "./mrListView";

type Item = { id: number; title: string; draft: boolean; created_at: string };

// Server order (updated_at desc): 1, 2, 3, 4.
const ITEMS: Item[] = [
  { id: 1, title: "fix: Zebra crossing", draft: false, created_at: "2026-01-02T00:00:00Z" },
  { id: 2, title: "feat: apple pie", draft: true, created_at: "2026-03-01T00:00:00Z" },
  { id: 3, title: "chore: Mango", draft: false, created_at: "2026-02-01T00:00:00+02:00" },
  { id: 4, title: "docs: banana 10", draft: true, created_at: "2026-01-01T00:00:00Z" },
];

const ids = (items: Item[]): number[] => items.map((item) => item.id);
const self = (item: Item): Item => item;

describe("applyMRListView", () => {
  it("keeps the server order for Updated", () => {
    expect(ids(applyMRListView(ITEMS, self, { readiness: "any", sort: "updated" }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("sorts by creation date, newest first, for Created", () => {
    expect(ids(applyMRListView(ITEMS, self, { readiness: "any", sort: "created" }))).toEqual([
      2, 3, 1, 4,
    ]);
  });

  it("sorts by title, case-insensitively, for Title", () => {
    expect(ids(applyMRListView(ITEMS, self, { readiness: "any", sort: "title" }))).toEqual([
      3, 4, 2, 1,
    ]);
  });

  it("filters drafts and ready MRs on the client", () => {
    expect(ids(applyMRListView(ITEMS, self, { readiness: "draft", sort: "updated" }))).toEqual([
      2, 4,
    ]);
    expect(ids(applyMRListView(ITEMS, self, { readiness: "ready", sort: "updated" }))).toEqual([
      1, 3,
    ]);
  });

  it("combines the title filter with readiness and sort", () => {
    const view = applyMRListView(ITEMS, self, {
      readiness: "any",
      sort: "title",
      titleFilter: "  A ",
    });
    expect(ids(view)).toEqual([3, 4, 2, 1]);
    const drafts = applyMRListView(ITEMS, self, {
      readiness: "draft",
      sort: "updated",
      titleFilter: "banana",
    });
    expect(ids(drafts)).toEqual([4]);
  });

  it("does not mutate the loaded items", () => {
    const loaded = [...ITEMS];
    applyMRListView(loaded, self, { readiness: "any", sort: "title" });
    expect(ids(loaded)).toEqual([1, 2, 3, 4]);
  });
});

describe("isClientFiltered", () => {
  it("is true only when loaded items can be hidden", () => {
    expect(isClientFiltered({ readiness: "any", sort: "title" })).toBe(false);
    expect(isClientFiltered({ readiness: "any", sort: "updated", titleFilter: "  " })).toBe(false);
    expect(isClientFiltered({ readiness: "draft", sort: "updated" })).toBe(true);
    expect(isClientFiltered({ readiness: "any", sort: "updated", titleFilter: "x" })).toBe(true);
  });
});

describe("filter options", () => {
  it("maps inbox relationship chips onto the server scope", () => {
    expect(SCOPE_OPTIONS.map(({ label, value }) => [label, value])).toEqual([
      ["All", "all"],
      ["Review requested", "review_requested"],
      ["Assigned", "assigned"],
      ["Authored", "authored"],
    ]);
  });

  it("maps repository state chips onto the server state", () => {
    expect(STATE_OPTIONS.map(({ label, value }) => [label, value])).toEqual([
      ["Open", "opened"],
      ["Merged", "merged"],
      ["Closed", "closed"],
      ["All", "all"],
    ]);
  });

  it("offers the client-side readiness chips and sort keys", () => {
    expect(READINESS_OPTIONS.map((option) => option.value)).toEqual(["draft", "ready"]);
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual(["updated", "created", "title"]);
  });
});
