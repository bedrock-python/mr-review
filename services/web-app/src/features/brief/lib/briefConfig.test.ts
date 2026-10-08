import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import {
  applyPreset,
  changedFields,
  isSameBrief,
  parseLines,
  presetOverridesFrom,
} from "./briefConfig";

const PRESET_ID = "33333333-3333-4333-8333-333333333333";

describe("parseLines", () => {
  it("trims, drops blank lines and keeps the first of duplicates", () => {
    expect(parseLines("  docs/ \n\n README.md\ndocs/\n")).toEqual(["docs/", "README.md"]);
  });
});

describe("isSameBrief", () => {
  it("ignores key order and compares list contents", () => {
    const reordered = Object.fromEntries(
      Object.entries(DEFAULT_BRIEF_CONFIG).reverse()
    ) as typeof DEFAULT_BRIEF_CONFIG;

    expect(isSameBrief(DEFAULT_BRIEF_CONFIG, reordered)).toBe(true);
    expect(
      isSameBrief(DEFAULT_BRIEF_CONFIG, { ...DEFAULT_BRIEF_CONFIG, focus_areas: ["Tests"] })
    ).toBe(false);
  });
});

describe("presets", () => {
  it("stores everything but the selection and repository-specific paths", () => {
    const overrides = presetOverridesFrom({
      ...DEFAULT_BRIEF_CONFIG,
      custom_preset_id: PRESET_ID,
      context_files: ["docs/"],
      include_paths: ["src/**"],
      exclude_paths: ["*.snap"],
      min_severity: "major",
    });

    expect(overrides).not.toHaveProperty("custom_preset_id");
    expect(overrides).not.toHaveProperty("context_files");
    expect(overrides).not.toHaveProperty("include_paths");
    expect(overrides).toMatchObject({ exclude_paths: ["*.snap"], min_severity: "major" });
  });

  it("applies stored fields over the brief and selects the preset", () => {
    const applied = applyPreset({ ...DEFAULT_BRIEF_CONFIG, context_files: ["docs/"] }, PRESET_ID, {
      output_language: "German",
      max_comments: 5,
    });

    expect(applied).toMatchObject({
      custom_preset_id: PRESET_ID,
      output_language: "German",
      max_comments: 5,
      context_files: ["docs/"],
    });
  });

  it("ignores stored fields this version does not understand", () => {
    const applied = applyPreset(DEFAULT_BRIEF_CONFIG, PRESET_ID, { min_severity: "catastrophic" });

    expect(applied).toEqual({ ...DEFAULT_BRIEF_CONFIG, custom_preset_id: PRESET_ID });
  });
});

describe("changedFields", () => {
  it("returns the old values of only the fields that changed", () => {
    const before = {
      ...DEFAULT_BRIEF_CONFIG,
      focus_areas: ["Tests"],
      min_severity: "minor" as const,
    };
    const after = applyPreset(before, PRESET_ID, { min_severity: "major", max_comments: 5 });

    expect(changedFields(before, after)).toEqual({
      custom_preset_id: null,
      min_severity: "minor",
      max_comments: null,
    });
  });
});
