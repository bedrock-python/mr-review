import { describe, expect, it } from "vitest";
import { formatPostBody } from "./postBody";
import type { SeverityLabel } from "@entities/review";

// The same cases as the server's tests/unit/test_post_body.py: both must read alike.
describe("formatPostBody", () => {
  const comment = { severity: "major", body: "Use a constant." } as const;

  it.each<[SeverityLabel, string | null, string]>([
    ["bold", null, "**Major** · Use a constant."],
    ["tag", null, "[major] Use a constant."],
    ["off", null, "Use a constant."],
    ["bold", "src/a.py", "**Major** · `src/a.py`\n\nUse a constant."],
    ["tag", "src/a.py:12", "[major] `src/a.py:12`\n\nUse a constant."],
    ["off", "src/a.py:12", "`src/a.py:12`\n\nUse a constant."],
  ])("labels with %s at %s", (style, location, expected) => {
    expect(formatPostBody(comment, style, location)).toBe(expected);
  });

  it.each(["```python\nx = 1\n```", "- one\n- two", "# Heading", "> quoted", "1. first"])(
    "puts the label on its own line before a block: %j",
    (body) => {
      expect(formatPostBody({ severity: "minor", body }, "bold")).toBe(`**Minor**\n\n${body}`);
    }
  );

  it("keeps a path with backticks in one code span", () => {
    expect(formatPostBody({ severity: "minor", body: "x" }, "off", "docs/`odd`.md")).toBe(
      "``docs/`odd`.md``\n\nx"
    );
  });
});
