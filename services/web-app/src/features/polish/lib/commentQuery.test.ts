import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  GENERAL_FILE_KEY,
  buildTriageRows,
  countBySeverity,
  groupByFile,
  isFiltering,
  matchesFilters,
  sortBySeverity,
} from "./commentQuery";
import type { Comment } from "@entities/review";

const comment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  file: "src/a.ts",
  line: 1,
  severity: "minor",
  body: `body ${id}`,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  ...overrides,
});

const COMMENTS: Comment[] = [
  comment("b-minor", { file: "src/b.ts", line: 3 }),
  comment("a-major-30", { line: 30, severity: "major" }),
  comment("general", { file: null, line: null, severity: "suggestion", status: "dismissed" }),
  comment("a-critical", { line: 9, severity: "critical", body: "Null DEREF here" }),
  comment("a-major-4", { line: 4, severity: "major" }),
];

const ids = (comments: readonly Comment[]): string[] => comments.map((c) => c.id);

describe("matchesFilters", () => {
  const pick = (filters: Partial<typeof EMPTY_FILTERS>): string[] =>
    ids(COMMENTS.filter((c) => matchesFilters(c, { ...EMPTY_FILTERS, ...filters })));

  it("matches everything without filters", () => {
    expect(pick({})).toHaveLength(COMMENTS.length);
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
  });

  it("combines severity, status, file and case-insensitive text search", () => {
    expect(pick({ severities: ["major", "critical"] })).toEqual([
      "a-major-30",
      "a-critical",
      "a-major-4",
    ]);
    expect(pick({ status: "dismissed" })).toEqual(["general"]);
    expect(pick({ file: GENERAL_FILE_KEY })).toEqual(["general"]);
    expect(pick({ file: "src/b.ts" })).toEqual(["b-minor"]);
    expect(pick({ search: "deref" })).toEqual(["a-critical"]);
    expect(pick({ search: "B.TS" })).toEqual(["b-minor"]);
    expect(pick({ severities: ["major"], search: "body a-major-4" })).toEqual(["a-major-4"]);
    expect(isFiltering({ ...EMPTY_FILTERS, search: "  " })).toBe(false);
  });
});

describe("sorting and grouping", () => {
  it("sorts flat by severity, then general notes first, then file and line", () => {
    expect(ids(sortBySeverity(COMMENTS))).toEqual([
      "a-critical",
      "a-major-4",
      "a-major-30",
      "b-minor",
      "general",
    ]);
  });

  it("groups general notes first, then files by path with comments by line", () => {
    expect(groupByFile(COMMENTS).map((group) => [group.label, ids(group.comments)])).toEqual([
      ["General notes", ["general"]],
      ["src/a.ts", ["a-major-4", "a-critical", "a-major-30"]],
      ["src/b.ts", ["b-minor"]],
    ]);
  });

  it("hides the comments of collapsed groups but keeps their header", () => {
    const rows = buildTriageRows(COMMENTS, true, new Set(["src/a.ts"]));

    expect(
      rows.map((row) => (row.kind === "group" ? `#${row.group.key}` : row.comment.id))
    ).toEqual([`#${GENERAL_FILE_KEY}`, "general", "#src/a.ts", "#src/b.ts", "b-minor"]);
  });

  it("counts comments per severity", () => {
    expect(countBySeverity(COMMENTS)).toEqual({ critical: 1, major: 2, minor: 1, suggestion: 1 });
  });
});
