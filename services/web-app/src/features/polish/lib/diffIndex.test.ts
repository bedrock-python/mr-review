import { describe, expect, it } from "vitest";
import { buildDiffIndex, describeAnchorProblem, getDiffSnippet, isLineInDiff } from "./diffIndex";

const DIFF = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1111111..2222222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,3 +1,4 @@",
  " one",
  "-two",
  "+TWO",
  "+two and a half",
  " three",
  "@@ -40,2 +41,2 @@",
  " forty",
  "-forty-one",
  "+FORTY-ONE",
  " \\ No newline at end of file",
  "diff --git a/old.txt b/old.txt",
  "--- a/old.txt",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-gone",
  "--- a/src/new.ts",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+--- a/not-a-header",
  "++++ b/still-content",
].join("\n");

describe("buildDiffIndex", () => {
  const index = buildDiffIndex(DIFF);

  it("lists the files a comment can be anchored to, deleted ones excluded", () => {
    expect(index.files).toEqual(["src/app.ts", "src/new.ts"]);
  });

  it("knows which new-side lines the diff shows", () => {
    expect([1, 2, 3, 4].map((line) => isLineInDiff(index, "src/app.ts", line))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(isLineInDiff(index, "src/app.ts", 41)).toBe(true);
    expect(isLineInDiff(index, "src/app.ts", 42)).toBe(true);
    // Between hunks and after the last one: not part of the diff.
    expect(isLineInDiff(index, "src/app.ts", 10)).toBe(false);
    expect(isLineInDiff(index, "src/app.ts", 43)).toBe(false);
  });

  it("does not count git headers or the no-newline marker as lines", () => {
    const rows = index.byPath.get("src/app.ts")?.rows ?? [];
    expect(rows.some((row) => row.content.startsWith("diff --git"))).toBe(false);
    expect(rows.some((row) => row.content.includes("No newline"))).toBe(false);
  });

  it("reads added lines that look like file headers as content", () => {
    expect(index.byPath.get("src/new.ts")?.rows.map((row) => row.content)).toEqual([
      "@@ -0,0 +1,2 @@",
      "--- a/not-a-header",
      "+++ b/still-content",
    ]);
  });
});

describe("getDiffSnippet", () => {
  const index = buildDiffIndex(DIFF);

  it("returns up to three rows on each side, clipped at the hunk", () => {
    const snippet = getDiffSnippet(index, "src/app.ts", 2);

    expect(snippet?.rows.map((row) => row.content)).toEqual([
      "one",
      "two",
      "TWO",
      "two and a half",
      "three",
    ]);
    expect(snippet?.targetIndex).toBe(2);
  });

  it("returns null for a line the diff does not show", () => {
    expect(getDiffSnippet(index, "src/app.ts", 20)).toBeNull();
    expect(getDiffSnippet(index, "src/missing.ts", 1)).toBeNull();
  });
});

describe("describeAnchorProblem", () => {
  const index = buildDiffIndex(DIFF);

  it("has nothing to say about general comments, shown lines or an unknown diff", () => {
    expect(describeAnchorProblem(index, null, null)).toBeNull();
    expect(describeAnchorProblem(index, "src/app.ts", 3)).toBeNull();
    expect(describeAnchorProblem(null, "src/app.ts", 999)).toBeNull();
  });

  it("explains why a comment will fall back to a general note", () => {
    expect(describeAnchorProblem(index, "src/app.ts", 10)).toBe(
      "Line 10 is not part of the diff — it will be posted as a general note."
    );
    expect(describeAnchorProblem(index, "README.md", 1)).toBe(
      "README.md is not part of the diff — it will be posted as a general note."
    );
    expect(describeAnchorProblem(index, "src/app.ts", null)).toBe(
      "No line set — it will be posted as a general note."
    );
  });
});
