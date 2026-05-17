import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppliedPatchSchema, CommentSchema, PatchErrorEnvelopeSchema } from "@entities/review";
import { PATCH_MOCK_COMMENT_IDS } from "../fixtures/patch";
import { patchHandlers } from "./patch";

const server = setupServer(...patchHandlers);

const REVIEW = "11111111-1111-4111-8111-000000000000";

const post = async (
  commentId: string,
  endpoint: "apply-patch" | "post-patch" | "discard-patch" | "revert-patch"
): Promise<{ status: number; body: unknown }> => {
  const res = await fetch(`/api/v1/reviews/${REVIEW}/comments/${commentId}/${endpoint}`, {
    method: "POST",
  });
  const body: unknown = await res.json();
  return { status: res.status, body };
};

const parseError = (body: unknown): ReturnType<typeof PatchErrorEnvelopeSchema.parse> => {
  const wrapped = body as { detail: unknown };
  return PatchErrorEnvelopeSchema.parse(wrapped.detail);
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe("apply-patch handler", () => {
  it("returns AppliedPatch on happy path", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.applyHappy, "apply-patch");
    expect(status).toBe(200);
    const parsed = AppliedPatchSchema.parse(body);
    expect(parsed.comment_id).toBe(PATCH_MOCK_COMMENT_IDS.applyHappy);
  });

  it("returns 409 PATCH_STALE for stale source", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.applyStale, "apply-patch");
    expect(status).toBe(409);
    const err = parseError(body);
    expect(err.code).toBe("PATCH_STALE");
    expect(err.context).toMatchObject({ current_sha: "deadbeef" });
  });

  it("returns 422 PATCH_INVALID_DIFF for malformed diff", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.applyInvalidDiff, "apply-patch");
    expect(status).toBe(422);
    expect(parseError(body).code).toBe("PATCH_INVALID_DIFF");
  });

  it("returns 404 PATCH_NOT_FOUND when comment has no patch", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.noPatchPresent, "apply-patch");
    expect(status).toBe(404);
    expect(parseError(body).code).toBe("PATCH_NOT_FOUND");
  });
});

describe("post-patch handler", () => {
  it("returns posted Comment on happy path", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.postHappy, "post-patch");
    expect(status).toBe(200);
    const parsed = CommentSchema.parse(body);
    expect(parsed.patch_status).toBe("posted");
    expect(parsed.patch_ref_url).toContain("github.com");
  });

  it("returns 502 VCS_ERROR when VCS fails", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.postVcsFail, "post-patch");
    expect(status).toBe(502);
    expect(parseError(body).code).toBe("VCS_ERROR");
  });

  it("returns 404 when comment has no patch", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.noPatchPresent, "post-patch");
    expect(status).toBe(404);
    expect(parseError(body).code).toBe("PATCH_NOT_FOUND");
  });
});

describe("discard-patch handler", () => {
  it("returns Comment with patch_status=discarded on happy path", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.discardHappy, "discard-patch");
    expect(status).toBe(200);
    const parsed = CommentSchema.parse(body);
    expect(parsed.patch_status).toBe("discarded");
  });

  it("returns 404 when comment has no patch", async () => {
    const { status } = await post(PATCH_MOCK_COMMENT_IDS.noPatchPresent, "discard-patch");
    expect(status).toBe(404);
  });
});

describe("revert-patch handler", () => {
  it("returns Comment with patch_status=pending on happy path", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.revertHappy, "revert-patch");
    expect(status).toBe(200);
    const parsed = CommentSchema.parse(body);
    expect(parsed.patch_status).toBe("pending");
    expect(parsed.patch_applied_at).toBeNull();
  });

  it("returns 409 PATCH_REVERT_SHA_MISMATCH when file changed after apply", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.revertConflict, "revert-patch");
    expect(status).toBe(409);
    expect(parseError(body).code).toBe("PATCH_REVERT_SHA_MISMATCH");
  });

  it("returns 422 PATCH_NO_BEFORE_SHA for never-applied patch", async () => {
    const { status, body } = await post(PATCH_MOCK_COMMENT_IDS.applyHappy, "revert-patch");
    expect(status).toBe(422);
    expect(parseError(body).code).toBe("PATCH_NO_BEFORE_SHA");
  });

  it("returns 404 when comment has no patch", async () => {
    const { status } = await post(PATCH_MOCK_COMMENT_IDS.noPatchPresent, "revert-patch");
    expect(status).toBe(404);
  });
});
