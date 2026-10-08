import { describe, expect, it } from "vitest";
import { attachFileInfo, parseDiff } from "./parseDiff";
import cases from "./__fixtures__/unifiedDiffCases.json";
import type { DiffLine, DiffLineWithFile } from "./types";

// The backend parser is tested against the same table (services/mr-review/tests/fixtures);
// the two copies are kept byte-identical.
type ExpectedLine = (string | number | null)[];
type PatchCase = { name: string; patch: string; lines: ExpectedLine[] };
type DiffCase = {
  name: string;
  diff: string;
  files: { path: string; old_path: string | null; lines: ExpectedLine[] }[];
};

const PATCH_CASES: PatchCase[] = cases.patches;
const DIFF_CASES: DiffCase[] = cases.diffs;

const isContentLine = (line: DiffLine): boolean =>
  line.type === "added" || line.type === "removed" || line.type === "context";

const toRow = (line: DiffLine): ExpectedLine => [
  line.type,
  line.oldLine,
  line.newLine,
  line.content,
];

const SAMPLE = `--- a/src/auth/login.py
+++ b/src/auth/login.py
@@ -10,3 +10,3 @@
 def get_user(user_id):
-    foo: Optional[str] = None
+    foo: str | None = None
     return foo`;

describe("parseDiff — shared cases", () => {
  it.each(PATCH_CASES.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const rows = parseDiff(testCase.patch).filter(isContentLine).map(toRow);
    expect(rows).toEqual(testCase.lines);
  });

  it.each(DIFF_CASES.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const lines: DiffLineWithFile[] = attachFileInfo(parseDiff(testCase.diff));

    // Every file of the diff shows up, deleted, binary and rename-only ones included.
    const files = [...new Set(lines.map((l) => l.file).filter((f) => f !== ""))];
    expect(files).toEqual(testCase.files.map((f) => f.path));

    for (const file of testCase.files) {
      const rows = lines.filter((l) => l.file === file.path && isContentLine(l)).map(toRow);
      expect(rows).toEqual(file.lines);
    }
  });
});

describe("parseDiff", () => {
  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("parses file headers", () => {
    const lines = parseDiff(SAMPLE);
    expect(lines[0]).toMatchObject({ type: "file", content: "--- a/src/auth/login.py" });
    expect(lines[1]).toMatchObject({ type: "file", content: "+++ b/src/auth/login.py" });
  });

  it("parses hunk headers and initializes line counters", () => {
    const lines = parseDiff(SAMPLE);
    expect(lines[2]).toMatchObject({ type: "header" });
    // first context line should start at 10 (new and old)
    expect(lines[3]).toMatchObject({ type: "context", newLine: 10, oldLine: 10 });
  });

  it("classifies added / removed / context lines", () => {
    const lines = parseDiff(SAMPLE);
    expect(lines[4]).toMatchObject({
      type: "removed",
      content: "    foo: Optional[str] = None",
      oldLine: 11,
      newLine: null,
    });
    expect(lines[5]).toMatchObject({
      type: "added",
      content: "    foo: str | None = None",
      newLine: 11,
      oldLine: null,
    });
    expect(lines[6]).toMatchObject({ type: "context", newLine: 12, oldLine: 12 });
  });

  it("handles hunk header without ranges (a count of 1)", () => {
    const minimal = "@@ -1 +1 @@\n+hello";
    const lines = parseDiff(minimal);
    expect(lines[0]).toMatchObject({ type: "header" });
    expect(lines[1]).toMatchObject({ type: "added", newLine: 1 });
  });

  it("does not number lines after a malformed hunk header", () => {
    const lines = parseDiff("@@ broken header\n+x");
    expect(lines[0]).toMatchObject({ type: "header" });
    expect(lines[1]).toMatchObject({ type: "file", content: "+x", newLine: null, oldLine: null });
  });

  it("does not number text outside a hunk", () => {
    const lines = parseDiff("plain text");
    expect(lines).toEqual([{ type: "file", content: "plain text", newLine: null, oldLine: null }]);
  });

  it("numbers the lines after a no-newline marker without counting the marker", () => {
    const lines = parseDiff("@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c");
    expect(lines.filter((l) => l.type === "added").map((l) => l.newLine)).toEqual([2, 3]);
    expect(lines.some((l) => l.content.startsWith("\\"))).toBe(false);
  });
});

describe("attachFileInfo", () => {
  it("propagates the current file path to subsequent lines", () => {
    const lines = attachFileInfo(parseDiff(SAMPLE));
    // file header lines keep empty file before the +++ marker is consumed
    const added = lines.find((l) => l.type === "added");
    expect(added?.file).toBe("src/auth/login.py");
  });

  it("strips the `b/` prefix", () => {
    const lines = attachFileInfo(parseDiff("+++ b/some/path.py\n@@ -0,0 +1 @@\n+hi"));
    expect(lines[2]?.file).toBe("some/path.py");
  });

  it("supports headers without `b/` prefix", () => {
    const lines = attachFileInfo(parseDiff("+++ raw/path.ts\n@@ -0,0 +1 @@\n+hi"));
    expect(lines[2]?.file).toBe("raw/path.ts");
  });

  it("returns empty file before any +++ header", () => {
    const lines = attachFileInfo(parseDiff("@@ -1 +1 @@\n+hi"));
    expect(lines[1]?.file).toBe("");
  });

  it("keeps an added `+++` content line in its file instead of switching files", () => {
    const diff = "--- a/notes.md\n+++ b/notes.md\n@@ -1 +1,2 @@\n x\n+++ b/other.md";
    const lines = attachFileInfo(parseDiff(diff));
    expect(lines[lines.length - 1]).toMatchObject({
      type: "added",
      content: "++ b/other.md",
      file: "notes.md",
      newLine: 2,
    });
  });

  it("files a deleted file's lines under its old path", () => {
    const diff = "--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x";
    const lines = attachFileInfo(parseDiff(diff));
    expect(lines[lines.length - 1]).toMatchObject({ type: "removed", file: "gone.txt" });
  });
});
