import { describe, it, expect } from "vitest";
import { compareVersions, isNewerVersion } from "./compareVersions";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("returns positive when first version is greater", () => {
    expect(compareVersions("1.0.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.1", "0.1.0")).toBeGreaterThan(0);
  });

  it("returns negative when first version is smaller", () => {
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
  });

  it("handles different length versions", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  it("compares multi-digit version parts correctly", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
  });
});

describe("isNewerVersion", () => {
  it("returns true when first version is newer", () => {
    expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.5")).toBe(true);
  });

  it("returns false when first version is older or equal", () => {
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false);
  });
});
