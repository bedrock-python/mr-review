import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import { STAGES, progressIndexOf } from "./stages";
import type { Iteration } from "@entities/review";

const iteration = (overrides: Partial<Iteration>): Iteration => ({
  id: "22222222-2222-4222-8222-222222222222",
  number: 1,
  stage: "brief",
  comments: [],
  ai_provider_id: null,
  model: null,
  brief_config: DEFAULT_BRIEF_CONFIG,
  created_at: "2026-05-16T10:00:00+00:00",
  completed_at: null,
  ...overrides,
});

describe("progressIndexOf", () => {
  it("finishes nothing before there is an iteration", () => {
    expect(progressIndexOf(null)).toBe(0);
  });

  it.each([
    ["brief", 1],
    ["dispatch", 2],
    ["polish", 3],
    ["post", 4],
  ] as const)("an iteration at %s finishes the stages before it", (stage, expected) => {
    expect(progressIndexOf(iteration({ stage }))).toBe(expected);
  });

  it("finishes Post only once everything was posted", () => {
    expect(
      progressIndexOf(iteration({ stage: "post", completed_at: "2026-05-16T11:00:00+00:00" }))
    ).toBe(STAGES.length);
  });
});
