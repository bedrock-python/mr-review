import { describe, expect, it } from "vitest";
import type { Comment } from "@entities/review";
import { groupByFile } from "./groupByFile";

const comment = (id: string, file: string | null, line: number | null): Comment => ({
  id,
  file,
  line,
  severity: "major",
  body: id,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
});

describe("groupByFile", () => {
  it("keeps the files in the order they first appear and puts general notes last", () => {
    const groups = groupByFile([
      comment("note", null, null),
      comment("b1", "b.py", 4),
      comment("a1", "a.py", 9),
      comment("b2", "b.py", 2),
    ]);

    expect(groups.map((g) => g.file)).toEqual(["b.py", "a.py", null]);
    expect(groups.at(-1)?.comments.map((c) => c.id)).toEqual(["note"]);
  });

  it("orders a file's comments by line", () => {
    const [group] = groupByFile([comment("l30", "a.py", 30), comment("l3", "a.py", 3)]);

    expect(group?.comments.map((c) => c.id)).toEqual(["l3", "l30"]);
  });

  it("counts a comment on a whole file as a general note, as the server posts it", () => {
    const groups = groupByFile([comment("l3", "a.py", 3), comment("whole", "a.py", null)]);

    expect(groups.map((g) => [g.file, g.comments.map((c) => c.id)])).toEqual([
      ["a.py", ["l3"]],
      [null, ["whole"]],
    ]);
  });

  it("has no general notes group when every comment is on a file", () => {
    expect(groupByFile([comment("a", "a.py", 1)]).map((g) => g.file)).toEqual(["a.py"]);
    expect(groupByFile([])).toEqual([]);
  });
});
