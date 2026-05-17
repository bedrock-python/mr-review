import type { AppliedPatch, Comment, SuggestedPatch } from "@entities/review";

// ── Stable mock IDs ──────────────────────────────────────────────────────────
// 4-th character of UUID v4 is intentionally "4" to pass z.string().uuid().

const REVIEW_ID = "11111111-1111-4111-8111-000000000000";
const COMMENT_HAPPY = "22222222-2222-4222-8222-000000000001";
const COMMENT_STALE = "22222222-2222-4222-8222-000000000002";
const COMMENT_POST_HAPPY = "22222222-2222-4222-8222-000000000003";
const COMMENT_POST_VCS_FAIL = "22222222-2222-4222-8222-000000000004";
const COMMENT_DISCARD = "22222222-2222-4222-8222-000000000005";
const COMMENT_REVERT_HAPPY = "22222222-2222-4222-8222-000000000006";
const COMMENT_REVERT_CONFLICT = "22222222-2222-4222-8222-000000000007";
const COMMENT_INVALID_DIFF = "22222222-2222-4222-8222-000000000008";
const COMMENT_NO_PATCH = "22222222-2222-4222-8222-000000000009";

export const MOCK_REVIEW_ID = REVIEW_ID;

/**
 * Stable map of comment IDs that drive deterministic mock behaviour for the
 * 9 FSM scenarios documented in #4372d67b (comment afcd657e). Each ID is a
 * fixed "address" — handlers branch on it to return the matching response.
 */
export const PATCH_MOCK_COMMENT_IDS = {
  applyHappy: COMMENT_HAPPY,
  applyStale: COMMENT_STALE,
  postHappy: COMMENT_POST_HAPPY,
  postVcsFail: COMMENT_POST_VCS_FAIL,
  discardHappy: COMMENT_DISCARD,
  revertHappy: COMMENT_REVERT_HAPPY,
  revertConflict: COMMENT_REVERT_CONFLICT,
  applyInvalidDiff: COMMENT_INVALID_DIFF,
  noPatchPresent: COMMENT_NO_PATCH,
} as const;

// ── Base shapes ──────────────────────────────────────────────────────────────

const SAMPLE_DIFF = `@@ -42,3 +42,3 @@
-    foo: Optional[str] = None
+    foo: str | None = None
     return foo`;

export const makeSuggestedPatch = (overrides: Partial<SuggestedPatch> = {}): SuggestedPatch => ({
  unified_diff: SAMPLE_DIFF,
  file_path: "src/auth/login.py",
  anchor_lines: [42, 44],
  base_sha: "abc1234",
  is_stale: false,
  stats: { additions: 1, deletions: 1 },
  ...overrides,
});

const baseComment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  file: "src/auth/login.py",
  line: 43,
  severity: "minor",
  body: "Consider using PEP 604 union syntax.",
  status: "kept",
  resolved: false,
  suggested_patch: makeSuggestedPatch(),
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  ...overrides,
});

// ── Per-scenario comment fixtures ────────────────────────────────────────────

export const FIXTURE_COMMENTS: Record<keyof typeof PATCH_MOCK_COMMENT_IDS, Comment> = {
  applyHappy: baseComment(COMMENT_HAPPY),
  applyStale: baseComment(COMMENT_STALE, {
    suggested_patch: makeSuggestedPatch({ is_stale: true }),
  }),
  postHappy: baseComment(COMMENT_POST_HAPPY),
  postVcsFail: baseComment(COMMENT_POST_VCS_FAIL),
  discardHappy: baseComment(COMMENT_DISCARD),
  revertHappy: baseComment(COMMENT_REVERT_HAPPY, {
    patch_status: "applied",
    patch_applied_at: "2026-05-17T10:00:00+00:00",
  }),
  revertConflict: baseComment(COMMENT_REVERT_CONFLICT, {
    patch_status: "applied",
    patch_applied_at: "2026-05-17T10:00:00+00:00",
  }),
  applyInvalidDiff: baseComment(COMMENT_INVALID_DIFF, {
    suggested_patch: makeSuggestedPatch({ unified_diff: "@@ malformed @@" }),
  }),
  noPatchPresent: baseComment(COMMENT_NO_PATCH, {
    suggested_patch: null,
    patch_status: "pending",
  }),
};

// ── Success responses ────────────────────────────────────────────────────────

export const APPLIED_PATCH_FIXTURE: AppliedPatch = {
  comment_id: COMMENT_HAPPY,
  before_sha: "before9999",
  after_sha: "after1111",
  applied_at: "2026-05-17T11:00:00+00:00",
};

export const POSTED_COMMENT_FIXTURE: Comment = {
  ...FIXTURE_COMMENTS.postHappy,
  patch_status: "posted",
  patch_ref_url: "https://github.com/example/repo/pull/42#discussion_r1",
};

export const DISCARDED_COMMENT_FIXTURE: Comment = {
  ...FIXTURE_COMMENTS.discardHappy,
  patch_status: "discarded",
};

export const REVERTED_COMMENT_FIXTURE: Comment = {
  ...FIXTURE_COMMENTS.revertHappy,
  patch_status: "pending",
  patch_applied_at: null,
};

// ── Error envelopes (FastAPI structured-detail shape: { detail: {...} }) ────

export type PatchErrorBody = {
  detail: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
};

export const errorEnvelope = (
  code: string,
  message: string,
  context?: Record<string, unknown>
): PatchErrorBody => ({
  detail: { code, message, ...(context !== undefined ? { context } : {}) },
});
