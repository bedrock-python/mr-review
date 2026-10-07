import { describe, expect, it } from "vitest";
import { formatBranchRange, getDiffStats, getRepoNameFromPath, sumDiffStats } from "./mrDisplay";

describe("getRepoNameFromPath", () => {
  it("returns the last path segment", () => {
    expect(getRepoNameFromPath("group/sub/repo")).toBe("repo");
    expect(getRepoNameFromPath("owner/repo/")).toBe("repo");
    expect(getRepoNameFromPath("single")).toBe("single");
  });
});

describe("formatBranchRange", () => {
  it("shows both branches when known", () => {
    expect(formatBranchRange("feat/x", "main")).toBe("feat/x → main");
  });

  it("drops a missing side instead of rendering a dangling arrow", () => {
    expect(formatBranchRange("feat/x", "")).toBe("feat/x");
    expect(formatBranchRange("", "main")).toBe("→ main");
  });

  it("returns null when the host reported no branches", () => {
    expect(formatBranchRange("", "  ")).toBeNull();
  });
});

describe("getDiffStats", () => {
  it("returns the stats when the host reported them, zeros included", () => {
    expect(getDiffStats({ additions: 0, deletions: 4 })).toEqual({ additions: 0, deletions: 4 });
  });

  it("returns null when either side is unknown", () => {
    expect(getDiffStats({ additions: null, deletions: null })).toBeNull();
    expect(getDiffStats({ additions: 3, deletions: null })).toBeNull();
  });
});

describe("sumDiffStats", () => {
  it("totals a loaded diff, zero for an empty one", () => {
    expect(
      sumDiffStats([
        { additions: 10, deletions: 2 },
        { additions: 1, deletions: 0 },
      ])
    ).toEqual({ additions: 11, deletions: 2 });
    expect(sumDiffStats([])).toEqual({ additions: 0, deletions: 0 });
  });
});
