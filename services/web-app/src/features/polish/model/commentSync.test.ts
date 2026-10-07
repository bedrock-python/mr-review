import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG, reviewKeys } from "@entities/review";
import { applyCommentPatch, createCommentSync } from "./commentSync";
import { planPatch } from "./planPatch";
import type { CommentSyncTransport } from "./commentSync";
import type { Comment, Review, UpdateCommentInput } from "@entities/review";

const REVIEW_ID = "review";
const ITERATION_ID = "iteration";
const COALESCE_MS = 100;

const comment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  file: "src/a.ts",
  line: 5,
  severity: "minor",
  body: `body ${id}`,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  ...overrides,
});

const review = (comments: Comment[]): Review => ({
  id: REVIEW_ID,
  host_id: "host",
  repo_path: "group/project",
  mr_iid: 1,
  iterations: [
    {
      id: ITERATION_ID,
      number: 1,
      stage: "polish",
      comments,
      ai_provider_id: null,
      model: null,
      brief_config: DEFAULT_BRIEF_CONFIG,
      created_at: "2026-05-16T10:00:00+00:00",
      completed_at: null,
    },
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

type Deferred = { resolve: () => void; reject: (error: Error) => void };

/** A server whose answers are released by the test, applying the backend's merge rules. */
const createControlledServer = (initial: Comment[]) => {
  let comments = initial;
  const pending: Deferred[] = [];
  const calls: { kind: string; payload: unknown }[] = [];

  const answer = <T>(compute: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending.push({
        resolve: () => {
          resolve(compute());
        },
        reject,
      });
    });

  const transport: CommentSyncTransport = {
    patch: (_reviewId, _iterationId, patches: UpdateCommentInput[]) => {
      calls.push({ kind: "patch", payload: patches });
      return answer(() => {
        const byId = new Map(patches.map((p) => [p.id, p]));
        comments = comments.map((c) => {
          const patch = byId.get(c.id);
          if (patch === undefined) return c;
          const { id: _id, ...fields } = patch;
          return applyCommentPatch(c, fields);
        });
        return review(comments);
      });
    },
    add: (_reviewId, _iterationId, input) => {
      calls.push({ kind: "add", payload: input });
      return answer(() => {
        comments = [...comments, comment(`created-${String(calls.length)}`, input)];
        return review(comments);
      });
    },
    remove: (_reviewId, _iterationId, commentId) => {
      calls.push({ kind: "remove", payload: commentId });
      return answer(() => {
        comments = comments.filter((c) => c.id !== commentId);
        return review(comments);
      });
    },
  };

  return {
    transport,
    calls,
    inFlight: () => pending.length,
    release: async (): Promise<void> => {
      pending.shift()?.resolve();
      await vi.runAllTimersAsync();
    },
    fail: async (message: string): Promise<void> => {
      pending.shift()?.reject(new Error(message));
      await vi.runAllTimersAsync();
    },
  };
};

const setup = (initial: Comment[]) => {
  // No observers here, so keep the query from being garbage-collected when timers run.
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  queryClient.setQueryData(reviewKeys.detail(REVIEW_ID), review(initial));
  const server = createControlledServer(initial);
  const onError = vi.fn();
  const sync = createCommentSync({
    queryClient,
    reviewId: REVIEW_ID,
    transport: server.transport,
    coalesceMs: COALESCE_MS,
    onError,
  });
  const cached = (): Comment[] =>
    queryClient.getQueryData<Review>(reviewKeys.detail(REVIEW_ID))?.iterations[0]?.comments ?? [];
  const statusOf = (id: string): string | undefined => cached().find((c) => c.id === id)?.status;
  return { sync, server, onError, cached, statusOf };
};

const patches = (entries: [string, Partial<UpdateCommentInput>][]) => new Map(entries);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCommentSync", () => {
  it("applies patches at once and folds a burst into one request", async () => {
    const { sync, server, statusOf } = setup([comment("a"), comment("b")]);

    sync.patch(ITERATION_ID, patches([["a", { status: "dismissed" }]]));
    sync.patch(ITERATION_ID, patches([["b", { status: "dismissed" }]]));
    sync.patch(ITERATION_ID, patches([["a", { severity: "major" }]]));

    expect(statusOf("a")).toBe("dismissed");
    expect(sync.getState().isSaving).toBe(true);
    expect(server.calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect(server.calls).toEqual([
      {
        kind: "patch",
        payload: [
          { id: "a", status: "dismissed", severity: "major" },
          { id: "b", status: "dismissed" },
        ],
      },
    ]);
    await server.release();
    expect(sync.getState().isSaving).toBe(false);
  });

  it("keeps at most one request in flight and sends later changes after it", async () => {
    const { sync, server, statusOf } = setup([comment("a"), comment("b")]);

    sync.patch(ITERATION_ID, patches([["a", { status: "dismissed" }]]));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    sync.patch(ITERATION_ID, patches([["b", { status: "dismissed" }]]));
    sync.remove(ITERATION_ID, "a").catch(() => undefined);
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 3);

    expect(server.inFlight()).toBe(1);
    expect(statusOf("b")).toBe("dismissed");

    await server.release();
    expect(server.calls.map((call) => call.kind)).toEqual(["patch", "patch"]);
    expect(server.inFlight()).toBe(1);
    await server.release();
    expect(server.calls.map((call) => call.kind)).toEqual(["patch", "patch", "remove"]);
    await server.release();
    expect(server.inFlight()).toBe(0);
  });

  it("rolls back only the refused change and keeps later optimistic ones", async () => {
    const { sync, server, onError, statusOf } = setup([comment("a"), comment("b")]);

    sync.patch(ITERATION_ID, patches([["a", { status: "dismissed" }]]));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    sync.patch(ITERATION_ID, patches([["b", { status: "dismissed" }]]));

    await server.fail("disk full");

    expect(onError).toHaveBeenCalledWith(new Error("disk full"));
    expect(statusOf("a")).toBe("kept");
    expect(statusOf("b")).toBe("dismissed");

    await server.release();
    expect(statusOf("b")).toBe("dismissed");
  });

  it("removes optimistically and restores the comment if the server refuses", async () => {
    const { sync, server, cached } = setup([comment("a"), comment("b")]);

    const removal = sync.remove(ITERATION_ID, "a");
    expect(cached().map((c) => c.id)).toEqual(["b"]);

    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await server.fail("locked");

    await expect(removal).resolves.toBe(false);
    expect(cached().map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("creates right away and resolves with the server's comment", async () => {
    const { sync, server, cached } = setup([comment("a")]);

    const creation = sync.add(ITERATION_ID, {
      file: null,
      line: null,
      severity: "major",
      body: "manual",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls.map((call) => call.kind)).toEqual(["add"]);
    await server.release();

    await expect(creation).resolves.toMatchObject({ id: "created-1", body: "manual" });
    expect(cached().map((c) => c.id)).toEqual(["a", "created-1"]);
  });

  it("flush sends a waiting batch now and resolves once it is answered", async () => {
    const { sync, server } = setup([comment("a")]);

    sync.patch(ITERATION_ID, patches([["a", { status: "dismissed" }]]));
    let isFlushed = false;
    void sync.flush().then(() => {
      isFlushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(server.calls).toHaveLength(1);
    expect(isFlushed).toBe(false);
    await server.release();
    expect(isFlushed).toBe(true);
  });
});

describe("planPatch", () => {
  const comments = [comment("a", { file: "src/a.ts", line: 5 }), comment("b")];

  it("keeps only real changes and records the values to restore", () => {
    const plan = planPatch(
      comments,
      patches([
        ["a", { status: "kept", severity: "critical" }],
        ["b", { status: "kept" }],
        ["missing", { status: "dismissed" }],
      ])
    );

    expect([...plan.forward]).toEqual([["a", { severity: "critical" }]]);
    expect([...plan.inverse]).toEqual([["a", { severity: "minor" }]]);
  });

  it("restores the line too when clearing the file dropped it", () => {
    const plan = planPatch(comments, patches([["a", { file: null }]]));

    expect(plan.forward.get("a")).toEqual({ file: null, line: null });
    expect(plan.inverse.get("a")).toEqual({ file: "src/a.ts", line: 5 });
  });
});
