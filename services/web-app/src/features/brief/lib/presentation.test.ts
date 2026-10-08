import { describe, expect, it } from "vitest";
import { escapeGlob, isEverythingExcluded } from "./presentation";

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
