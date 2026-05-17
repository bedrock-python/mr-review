import { describe, expect, it } from "vitest";
import { attachFileInfo, parseDiff } from "./parseDiff";

const SAMPLE = `--- a/src/auth/login.py
+++ b/src/auth/login.py
@@ -10,3 +10,3 @@
 def get_user(user_id):
-    foo: Optional[str] = None
+    foo: str | None = None
     return foo`;

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

  it("handles hunk header without ranges (defaults to 0)", () => {
    const minimal = "@@ -1 +1 @@\n+hello";
    const lines = parseDiff(minimal);
    expect(lines[0]).toMatchObject({ type: "header" });
    expect(lines[1]).toMatchObject({ type: "added", newLine: 1 });
  });

  it("handles malformed hunk header gracefully", () => {
    const lines = parseDiff("@@ broken header\n+x");
    expect(lines[0]).toMatchObject({ type: "header" });
    // counters remain at 0, so added line starts at 0
    expect(lines[1]).toMatchObject({ type: "added", newLine: 0 });
  });

  it("treats unprefixed lines as context with raw content", () => {
    const lines = parseDiff("plain text");
    expect(lines[0]).toMatchObject({ type: "context", content: "plain text" });
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
    const lines = attachFileInfo(parseDiff("+++ b/some/path.py\n+hi"));
    expect(lines[1]?.file).toBe("some/path.py");
  });

  it("supports headers without `b/` prefix", () => {
    const lines = attachFileInfo(parseDiff("+++ raw/path.ts\n+hi"));
    expect(lines[1]?.file).toBe("raw/path.ts");
  });

  it("returns empty file before any +++ header", () => {
    const lines = attachFileInfo(parseDiff("@@ -1 +1 @@\n+hi"));
    expect(lines[1]?.file).toBe("");
  });
});
