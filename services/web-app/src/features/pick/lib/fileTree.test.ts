import { describe, expect, it } from "vitest";
import { buildFileTree, collectDirPaths, flatFileRows, visibleTreeRows } from "./fileTree";
import type { DiffFile } from "@entities/mr";

const file = (path: string): DiffFile => ({
  path,
  old_path: null,
  additions: 1,
  deletions: 0,
  hunks: [],
});

const FILES = [file("src/b.ts"), file("README.md"), file("src/lib/a.ts"), file("docs/x.md")];

describe("visibleTreeRows", () => {
  it("lists folders before files, each alphabetically, with their depth and parent", () => {
    const tree = buildFileTree(FILES);
    const rows = visibleTreeRows(tree, new Set(collectDirPaths(tree)));

    expect(rows.map((row) => [row.path, row.depth, row.parentPath])).toEqual([
      ["docs", 0, null],
      ["docs/x.md", 1, "docs"],
      ["src", 0, null],
      ["src/lib", 1, "src"],
      ["src/lib/a.ts", 2, "src/lib"],
      ["src/b.ts", 1, "src"],
      ["README.md", 0, null],
    ]);
  });

  it("hides what is inside a closed folder", () => {
    const tree = buildFileTree(FILES);
    const rows = visibleTreeRows(tree, new Set(["docs"]));

    expect(rows.map((row) => row.path)).toEqual(["docs", "docs/x.md", "src", "README.md"]);
    expect(rows.find((row) => row.path === "src")?.isOpen).toBe(false);
  });

  it("numbers each row among its siblings", () => {
    const tree = buildFileTree(FILES);
    const rows = visibleTreeRows(tree, new Set());

    expect(rows.map((row) => [row.position, row.siblingCount])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

describe("flatFileRows", () => {
  it("names each file by its whole path, in the order given", () => {
    expect(flatFileRows(FILES).map((row) => row.name)).toEqual([
      "src/b.ts",
      "README.md",
      "src/lib/a.ts",
      "docs/x.md",
    ]);
  });
});
