import { describe, expect, it } from "vitest";
import {
  AppliedPatchSchema,
  PatchErrorEnvelopeSchema,
  PatchStatsSchema,
  PatchStatusSchema,
  SuggestedPatchSchema,
} from "./patch.schema";

const VALID_PATCH = {
  unified_diff: "@@ -1 +1 @@\n-foo\n+bar",
  file_path: "src/foo.py",
  anchor_lines: [10, 12] as [number, number],
  base_sha: "abc1234",
  is_stale: false,
  stats: { additions: 1, deletions: 1 },
};

describe("PatchStatusSchema", () => {
  it.each(["pending", "applied", "posted", "discarded"] as const)("accepts %s", (status) => {
    expect(PatchStatusSchema.parse(status)).toBe(status);
  });

  it("rejects unknown status", () => {
    expect(PatchStatusSchema.safeParse("rejected").success).toBe(false);
  });
});

describe("PatchStatsSchema", () => {
  it("accepts zero counts", () => {
    expect(PatchStatsSchema.parse({ additions: 0, deletions: 0 })).toEqual({
      additions: 0,
      deletions: 0,
    });
  });

  it("rejects negative additions", () => {
    expect(PatchStatsSchema.safeParse({ additions: -1, deletions: 0 }).success).toBe(false);
  });

  it("rejects non-integer counts", () => {
    expect(PatchStatsSchema.safeParse({ additions: 1.5, deletions: 0 }).success).toBe(false);
  });

  it("accepts large additions", () => {
    expect(PatchStatsSchema.parse({ additions: 1_000_000, deletions: 0 }).additions).toBe(
      1_000_000
    );
  });
});

describe("SuggestedPatchSchema", () => {
  it("parses a well-formed patch", () => {
    expect(SuggestedPatchSchema.parse(VALID_PATCH)).toEqual(VALID_PATCH);
  });

  it("rejects empty unified_diff", () => {
    expect(SuggestedPatchSchema.safeParse({ ...VALID_PATCH, unified_diff: "" }).success).toBe(
      false
    );
  });

  it("rejects anchor_lines where end < start", () => {
    const result = SuggestedPatchSchema.safeParse({ ...VALID_PATCH, anchor_lines: [12, 10] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("end must be >= start");
    }
  });

  it("accepts anchor_lines where start == end (single-line hunk)", () => {
    expect(
      SuggestedPatchSchema.parse({ ...VALID_PATCH, anchor_lines: [42, 42] }).anchor_lines
    ).toEqual([42, 42]);
  });

  it("rejects non-positive anchor lines", () => {
    expect(SuggestedPatchSchema.safeParse({ ...VALID_PATCH, anchor_lines: [0, 10] }).success).toBe(
      false
    );
  });

  it("accepts null base_sha (uncommitted scenario)", () => {
    expect(SuggestedPatchSchema.parse({ ...VALID_PATCH, base_sha: null }).base_sha).toBeNull();
  });

  it("rejects too-short base_sha", () => {
    expect(SuggestedPatchSchema.safeParse({ ...VALID_PATCH, base_sha: "abc" }).success).toBe(false);
  });

  it("handles is_stale=true", () => {
    expect(SuggestedPatchSchema.parse({ ...VALID_PATCH, is_stale: true }).is_stale).toBe(true);
  });

  it("rejects missing stats", () => {
    const { stats: _stats, ...rest } = VALID_PATCH;
    expect(SuggestedPatchSchema.safeParse(rest).success).toBe(false);
  });
});

describe("AppliedPatchSchema", () => {
  const VALID_APPLIED = {
    comment_id: "11111111-1111-4111-8111-111111111111",
    before_sha: "before123",
    after_sha: "after456",
    applied_at: "2026-05-17T10:00:00+00:00",
  };

  it("parses a well-formed AppliedPatch", () => {
    expect(AppliedPatchSchema.parse(VALID_APPLIED)).toEqual(VALID_APPLIED);
  });

  it("rejects non-UUID comment_id", () => {
    expect(AppliedPatchSchema.safeParse({ ...VALID_APPLIED, comment_id: "not-uuid" }).success).toBe(
      false
    );
  });

  it("rejects applied_at without offset", () => {
    expect(
      AppliedPatchSchema.safeParse({ ...VALID_APPLIED, applied_at: "2026-05-17T10:00:00" }).success
    ).toBe(false);
  });
});

describe("PatchErrorEnvelopeSchema", () => {
  it.each([
    "PATCH_NOT_FOUND",
    "PATCH_STALE",
    "PATCH_ALREADY_APPLIED",
    "PATCH_ALREADY_POSTED",
    "PATCH_INVALID_DIFF",
    "PATCH_NO_BEFORE_SHA",
    "PATCH_REVERT_SHA_MISMATCH",
    "VCS_ERROR",
  ] as const)("accepts %s code", (code) => {
    expect(PatchErrorEnvelopeSchema.parse({ code, message: "boom" })).toMatchObject({
      code,
      message: "boom",
    });
  });

  it("allows an optional context bag", () => {
    expect(
      PatchErrorEnvelopeSchema.parse({
        code: "PATCH_STALE",
        message: "file changed",
        context: { current_sha: "deadbeef", expected_sha: "1234567" },
      }).context
    ).toEqual({ current_sha: "deadbeef", expected_sha: "1234567" });
  });

  it("rejects unknown error codes", () => {
    expect(PatchErrorEnvelopeSchema.safeParse({ code: "WHATEVER", message: "x" }).success).toBe(
      false
    );
  });

  it("parses without context when omitted", () => {
    const parsed = PatchErrorEnvelopeSchema.parse({ code: "PATCH_NOT_FOUND", message: "x" });
    expect(parsed.context).toBeUndefined();
  });

  it("strips extra unknown fields by default (Zod passthrough policy)", () => {
    const parsed = PatchErrorEnvelopeSchema.parse({
      code: "PATCH_STALE",
      message: "x",
      extraField: "ignored",
    });
    expect(parsed).not.toHaveProperty("extraField");
  });
});
