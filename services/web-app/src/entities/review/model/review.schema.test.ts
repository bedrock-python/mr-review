import { describe, expect, it } from "vitest";
import { CommentSchema } from "./review.schema";

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
