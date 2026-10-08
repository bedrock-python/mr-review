import { describe, expect, it } from "vitest";
import {
  BriefConfigSchema,
  CommentSchema,
  DEFAULT_BRIEF_CONFIG,
  getReviewBriefConfig,
} from "./review.schema";
import type { BriefConfig, Review } from "./review.schema";

const LEGACY_BRIEF = {
  preset: "security",
  include_diff: true,
  include_description: false,
  include_full_files: false,
  include_test_context: false,
  include_related_code: false,
  include_commit_history: false,
  custom_instructions: "Mind the cache",
};

describe("BriefConfigSchema (backward compat)", () => {
  it("parses a brief stored before the newer options and defaults them", () => {
    const parsed = BriefConfigSchema.parse(LEGACY_BRIEF);

    expect(parsed).toEqual({
      ...DEFAULT_BRIEF_CONFIG,
      preset: "security",
      include_description: false,
      custom_instructions: "Mind the cache",
    });
  });

  it("fills a review restored from an old cache with the defaults of the newer options", () => {
    const review = {
      iterations: [{ brief_config: LEGACY_BRIEF as unknown as BriefConfig }],
    } as unknown as Review;

    const brief = getReviewBriefConfig(review);

    expect(brief.focus_areas).toEqual([]);
    expect(brief.prompt_budget_chars).toBe(DEFAULT_BRIEF_CONFIG.prompt_budget_chars);
    expect(brief.custom_instructions).toBe("Mind the cache");
  });
});

const LEGACY_COMMENT = {
  id: "11111111-1111-4111-8111-111111111111",
  file: "src/foo.py",
  line: 10,
  severity: "minor",
  body: "Consider renaming",
  status: "kept",
  resolved: false,
};

describe("CommentSchema (backward compat)", () => {
  it("parses a legacy comment without patch fields and applies defaults", () => {
    const parsed = CommentSchema.parse(LEGACY_COMMENT);
    expect(parsed.suggested_patch).toBeNull();
    expect(parsed.patch_status).toBe("pending");
    expect(parsed.patch_ref_url).toBeNull();
    expect(parsed.patch_applied_at).toBeNull();
  });

  it("parses a comment with full patch payload", () => {
    const withPatch = {
      ...LEGACY_COMMENT,
      suggested_patch: {
        unified_diff: "@@ -1 +1 @@\n-a\n+b",
        file_path: "src/foo.py",
        anchor_lines: [10, 10] as [number, number],
        base_sha: "abc1234",
        is_stale: false,
        stats: { additions: 1, deletions: 1 },
      },
      patch_status: "applied",
      patch_ref_url: "https://github.com/o/r/pull/1#r1",
      patch_applied_at: "2026-05-17T10:00:00+00:00",
    };
    const parsed = CommentSchema.parse(withPatch);
    expect(parsed.patch_status).toBe("applied");
    expect(parsed.suggested_patch?.file_path).toBe("src/foo.py");
    expect(parsed.patch_ref_url).toContain("github.com");
  });

  it("parses a comment that was never posted", () => {
    expect(CommentSchema.parse(LEGACY_COMMENT).post ?? null).toBeNull();
    expect(CommentSchema.parse({ ...LEGACY_COMMENT, post: null }).post).toBeNull();
  });

  it("parses the record of a post as the backend sends it", () => {
    const parsed = CommentSchema.parse({
      ...LEGACY_COMMENT,
      post: {
        outcome: "general_note",
        at: "2026-10-08T10:00:00.123456Z",
        note_id: "17",
        url: null,
        reason: "x",
      },
    });
    expect(parsed.post).toEqual({
      outcome: "general_note",
      at: "2026-10-08T10:00:00.123456Z",
      note_id: "17",
      url: null,
      reason: "x",
      failure_kind: null,
    });
  });

  it("rejects an invalid patch_status", () => {
    expect(CommentSchema.safeParse({ ...LEGACY_COMMENT, patch_status: "rejected" }).success).toBe(
      false
    );
  });

  it("rejects a malformed patch_ref_url", () => {
    expect(CommentSchema.safeParse({ ...LEGACY_COMMENT, patch_ref_url: "not a url" }).success).toBe(
      false
    );
  });
});
