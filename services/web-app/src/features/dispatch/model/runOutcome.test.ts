import { describe, expect, it } from "vitest";

import { pluralize, summarizeRunOutcome } from "./runOutcome";

import type { DispatchResult } from "@entities/review";

const RESULT: DispatchResult = {
  iteration_id: "22222222-2222-4222-8222-222222222222",
  comments: 4,
  errors: 0,
  json_error: null,
  truncated: false,
  kept_previous: false,
};

describe("summarizeRunOutcome", () => {
  it("reports a clean run as saved and needing nothing", () => {
    expect(summarizeRunOutcome(RESULT, undefined)).toEqual({
      savedCount: 4,
      skippedCount: 0,
      isJsonNoticeShown: false,
      isKeptPrevious: false,
      needsAttention: false,
    });
  });

  it.each([
    ["cut off", { truncated: true }],
    ["not used", { kept_previous: true }],
    ["unreadable", { json_error: "Expecting value" }],
    ["partly skipped", { errors: 2 }],
  ])("flags a run that was %s", (_label, patch) => {
    expect(summarizeRunOutcome({ ...RESULT, ...patch }, undefined).needsAttention).toBe(true);
  });

  it("takes the counts from a re-parse that read the output", () => {
    const summary = summarizeRunOutcome(
      { ...RESULT, comments: 1, json_error: "Expecting value" },
      {
        imported: 3,
        errors: [{ index: 3, reason: "body: Field required", raw: "{}" }],
        json_error: null,
      }
    );
    expect(summary).toMatchObject({
      savedCount: 3,
      skippedCount: 1,
      isJsonNoticeShown: false,
      needsAttention: true,
    });
  });

  it("keeps the run's counts when the re-parse still could not read it", () => {
    const summary = summarizeRunOutcome(
      { ...RESULT, comments: 1, json_error: "Expecting value" },
      { imported: 0, errors: [], json_error: "Expecting value" }
    );
    expect(summary).toMatchObject({
      savedCount: 1,
      isJsonNoticeShown: false,
      needsAttention: true,
    });
  });
});

describe("pluralize", () => {
  it("adds an s to anything but one", () => {
    expect(pluralize(1, "comment")).toBe("1 comment");
    expect(pluralize(0, "comment")).toBe("0 comments");
    expect(pluralize(9, "item")).toBe("9 items");
  });
});
