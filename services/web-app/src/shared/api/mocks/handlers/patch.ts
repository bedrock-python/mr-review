import { http, HttpResponse } from "msw";
import {
  APPLIED_PATCH_FIXTURE,
  DISCARDED_COMMENT_FIXTURE,
  FIXTURE_COMMENTS,
  PATCH_MOCK_COMMENT_IDS,
  POSTED_COMMENT_FIXTURE,
  REVERTED_COMMENT_FIXTURE,
  errorEnvelope,
} from "../fixtures/patch";

/**
 * MSW handlers for the 4 patch endpoints from C1 Inline Fix Suggestions.
 * Behaviour is keyed off the `commentId` path parameter — see
 * `PATCH_MOCK_COMMENT_IDS` in fixtures for the address book of the 9
 * FSM scenarios documented in #4372d67b (comment afcd657e).
 */
export const patchHandlers = [
  // 1) POST apply-patch ─────────────────────────────────────────────────────
  http.post("/api/v1/reviews/:reviewId/comments/:commentId/apply-patch", ({ params }) => {
    const commentId = String(params.commentId);

    if (commentId === PATCH_MOCK_COMMENT_IDS.noPatchPresent) {
      return HttpResponse.json(
        errorEnvelope("PATCH_NOT_FOUND", "Comment has no suggested patch."),
        { status: 404 }
      );
    }

    if (commentId === PATCH_MOCK_COMMENT_IDS.applyStale) {
      return HttpResponse.json(
        errorEnvelope("PATCH_STALE", "Source file changed since patch was generated.", {
          current_sha: "deadbeef",
          expected_sha: "abc1234",
        }),
        { status: 409 }
      );
    }

    if (commentId === PATCH_MOCK_COMMENT_IDS.applyInvalidDiff) {
      return HttpResponse.json(
        errorEnvelope("PATCH_INVALID_DIFF", "Diff is malformed and cannot be applied."),
        { status: 422 }
      );
    }

    // happy path (including any other comment id) — returns AppliedPatch
    return HttpResponse.json({ ...APPLIED_PATCH_FIXTURE, comment_id: commentId });
  }),

  // 2) POST post-patch ──────────────────────────────────────────────────────
  http.post("/api/v1/reviews/:reviewId/comments/:commentId/post-patch", ({ params }) => {
    const commentId = String(params.commentId);

    if (commentId === PATCH_MOCK_COMMENT_IDS.noPatchPresent) {
      return HttpResponse.json(
        errorEnvelope("PATCH_NOT_FOUND", "Comment has no suggested patch."),
        { status: 404 }
      );
    }

    if (commentId === PATCH_MOCK_COMMENT_IDS.postVcsFail) {
      return HttpResponse.json(errorEnvelope("VCS_ERROR", "GitHub returned 502 Bad Gateway."), {
        status: 502,
      });
    }

    return HttpResponse.json({ ...POSTED_COMMENT_FIXTURE, id: commentId });
  }),

  // 3) POST discard-patch ───────────────────────────────────────────────────
  http.post("/api/v1/reviews/:reviewId/comments/:commentId/discard-patch", ({ params }) => {
    const commentId = String(params.commentId);

    if (commentId === PATCH_MOCK_COMMENT_IDS.noPatchPresent) {
      return HttpResponse.json(
        errorEnvelope("PATCH_NOT_FOUND", "Comment has no suggested patch."),
        { status: 404 }
      );
    }

    return HttpResponse.json({ ...DISCARDED_COMMENT_FIXTURE, id: commentId });
  }),

  // 4) POST revert-patch ────────────────────────────────────────────────────
  http.post("/api/v1/reviews/:reviewId/comments/:commentId/revert-patch", ({ params }) => {
    const commentId = String(params.commentId);

    if (commentId === PATCH_MOCK_COMMENT_IDS.noPatchPresent) {
      return HttpResponse.json(
        errorEnvelope("PATCH_NOT_FOUND", "Comment has no applied patch to revert."),
        { status: 404 }
      );
    }

    if (commentId === PATCH_MOCK_COMMENT_IDS.revertConflict) {
      return HttpResponse.json(
        errorEnvelope(
          "PATCH_REVERT_SHA_MISMATCH",
          "File changed after apply; cannot safely revert.",
          { current_sha: "user_edit_99", expected_sha: "after1111" }
        ),
        { status: 409 }
      );
    }

    if (commentId === PATCH_MOCK_COMMENT_IDS.applyHappy) {
      // Comment was never applied → 422.
      return HttpResponse.json(
        errorEnvelope("PATCH_NO_BEFORE_SHA", "Cannot revert: no before_sha recorded."),
        { status: 422 }
      );
    }

    return HttpResponse.json({ ...REVERTED_COMMENT_FIXTURE, id: commentId });
  }),
];

// Convenience re-export so test fixtures can drive scenarios deterministically.
export { FIXTURE_COMMENTS, PATCH_MOCK_COMMENT_IDS };
