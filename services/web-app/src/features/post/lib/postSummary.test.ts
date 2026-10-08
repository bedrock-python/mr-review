import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import type { Comment, CommentPost, Iteration, PostReviewResult } from "@entities/review";
import { describePostResult, summarizePost } from "./postSummary";

const AT = "2026-10-08T10:00:00+00:00";
const LATER = "2026-10-08T11:30:00+00:00";

const comment = (
  id: string,
  post: CommentPost | null,
  status: Comment["status"] = "kept"
): Comment => ({
  id,
  file: "src/a.py",
  line: 3,
  severity: "major",
  body: id,
  status,
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  post,
});

const posted = (outcome: CommentPost["outcome"], at = AT): CommentPost => ({
  outcome,
  at,
  note_id: outcome === "failed" ? null : "1",
  url: null,
  reason: outcome === "failed" ? "403 Forbidden" : null,
  failure_kind: outcome === "failed" ? "rejected" : null,
});

const iteration = (comments: Comment[], completedAt: string | null = null): Iteration => ({
  id: "22222222-2222-4222-8222-222222222222",
  number: 1,
  stage: completedAt === null ? "polish" : "post",
  comments,
  ai_provider_id: null,
  model: null,
  brief_config: DEFAULT_BRIEF_CONFIG,
  created_at: AT,
  completed_at: completedAt,
});

describe("summarizePost", () => {
  it("is ready while nothing was sent", () => {
    const summary = summarizePost(iteration([comment("a", null), comment("b", null)]));
    expect(summary).toMatchObject({ state: "ready", unsent: 2, postedAt: null });
  });

  it("counts outcomes from the records and ignores dismissed comments", () => {
    const summary = summarizePost(
      iteration([
        comment("a", posted("inline")),
        comment("b", posted("general_note", LATER)),
        comment("c", posted("failed")),
        comment("d", null),
        comment("e", posted("failed"), "dismissed"),
      ])
    );
    expect(summary.state).toBe("partial");
    expect([summary.inline, summary.generalNotes, summary.failed.length, summary.unsent]).toEqual([
      1, 1, 1, 1,
    ]);
    expect(summary.postedAt).toBe(LATER);
  });

  it("is failed when comments were sent and none landed", () => {
    expect(summarizePost(iteration([comment("a", posted("failed"))])).state).toBe("failed");
  });

  it("singles out the failures that may be on the MR after all", () => {
    const unknown: CommentPost = { ...posted("failed"), failure_kind: "ambiguous" };
    const summary = summarizePost(
      iteration([comment("a", posted("failed")), comment("b", unknown)])
    );
    expect(summary.failed.map((c) => c.id)).toEqual(["a", "b"]);
    expect(summary.ambiguous.map((c) => c.id)).toEqual(["b"]);
  });

  it("is posted once the iteration is completed, dated by completed_at", () => {
    const summary = summarizePost(iteration([comment("a", posted("inline"))], LATER));
    expect(summary).toMatchObject({ state: "posted", postedAt: LATER, unrecorded: 0 });
  });

  it("counts comments of an iteration posted before records were kept as unrecorded", () => {
    const summary = summarizePost(iteration([comment("a", null), comment("b", null)], LATER));
    expect(summary).toMatchObject({ state: "posted", inline: 0, unsent: 0, unrecorded: 2 });
  });
});

describe("describePostResult", () => {
  const result = (posted: number, failed: number, heldBack = 0): PostReviewResult =>
    ({
      posted,
      failed,
      skipped: 0,
      held_back: heldBack,
      completed: failed === 0,
      results: [],
    }) as unknown as PostReviewResult;

  it("says when comments that may be on the MR were held back", () => {
    expect(describePostResult(result(0, 0, 2))).toEqual({
      kind: "info",
      message: "2 comments may already be on the MR and were not sent again",
    });
  });

  it.each([
    [2, 0, "success", "Posted 2 comments"],
    [1, 1, "warning", "Posted 1 of 2 comments; 1 failed"],
    [0, 3, "error", "Nothing was posted: 3 comments failed"],
    [0, 0, "info", "Every kept comment is already on the MR"],
  ] as const)("%i posted, %i failed -> %s", (posted, failed, kind, message) => {
    expect(describePostResult(result(posted, failed))).toEqual({ kind, message });
  });
});
