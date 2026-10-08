import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import {
  escapeGlob,
  formatCompactCount,
  includedContextSummary,
  isEverythingExcluded,
} from "./presentation";

describe("includedContextSummary", () => {
  it("names what the prompt carries, in prompt order", () => {
    const brief = {
      ...DEFAULT_BRIEF_CONFIG,
      include_diff: true,
      include_description: true,
      include_full_files: false,
      include_test_context: true,
      include_related_code: false,
      include_commit_history: false,
      include_context: true,
    };

    expect(includedContextSummary(brief)).toBe("diff + description + tests + project context");
  });

  it("says so when nothing but the instructions is left", () => {
    const brief = {
      ...DEFAULT_BRIEF_CONFIG,
      include_diff: false,
      include_description: false,
      include_full_files: false,
      include_test_context: false,
      include_related_code: false,
      include_commit_history: false,
      include_context: false,
    };

    expect(includedContextSummary(brief)).toBe("instructions only");
  });
});

describe("formatCompactCount", () => {
  it("rounds to one decimal with a lower-case unit", () => {
    expect(formatCompactCount(950)).toBe("950");
    expect(formatCompactCount(1734)).toBe("1.7k");
    expect(formatCompactCount(1_250_000)).toBe("1.3m");
  });
});

describe("escapeGlob", () => {
  it("escapes every glob character so the pattern matches only that path", () => {
    expect(escapeGlob("app/[slug]/page.tsx")).toBe("app/\\[slug\\]/page.tsx");
    expect(escapeGlob("a*b?c\\d")).toBe("a\\*b\\?c\\\\d");
    expect(escapeGlob("src/plain.py")).toBe("src/plain.py");
  });
});

describe("isEverythingExcluded", () => {
  it("is true only when the change has files and every one is excluded", () => {
    const one = { path: "a.py", reason: "*.py" };

    expect(isEverythingExcluded(undefined)).toBe(false);
    expect(isEverythingExcluded({ total: 0, excluded: [] })).toBe(false);
    expect(isEverythingExcluded({ total: 2, excluded: [one] })).toBe(false);
    expect(isEverythingExcluded({ total: 1, excluded: [one] })).toBe(true);
  });
});
