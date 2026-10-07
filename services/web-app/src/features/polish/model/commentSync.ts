import { toast } from "sonner";
import { reviewApi, reviewKeys } from "@entities/review";
import type { QueryClient } from "@tanstack/react-query";
import type { Comment, NewCommentInput, Review, UpdateCommentInput } from "@entities/review";

export type CommentFieldPatch = Omit<UpdateCommentInput, "id">;
export type CommentPatches = ReadonlyMap<string, CommentFieldPatch>;

export type CommentSyncTransport = {
  patch: (reviewId: string, iterationId: string, comments: UpdateCommentInput[]) => Promise<Review>;
  add: (reviewId: string, iterationId: string, input: NewCommentInput) => Promise<Review>;
  remove: (reviewId: string, iterationId: string, commentId: string) => Promise<Review>;
};

export type CommentSyncState = { isSaving: boolean };

export type CommentSync = {
  /** Apply patches optimistically; consecutive patches are merged into one request. */
  patch: (iterationId: string, patches: CommentPatches) => void;
  /** Create a comment; resolves with it once the server has assigned an id. */
  add: (iterationId: string, input: NewCommentInput) => Promise<Comment>;
  /** Remove a comment optimistically; resolves false when the server refused. */
  remove: (iterationId: string, commentId: string) => Promise<boolean>;
  /** Send whatever is waiting now and resolve once everything has been answered. */
  flush: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  getState: () => CommentSyncState;
};

type CreateCommentSyncOptions = {
  queryClient: QueryClient;
  reviewId: string;
  transport?: CommentSyncTransport;
  coalesceMs?: number;
  onError?: (error: Error) => void;
};

type PatchOp = { kind: "patch"; iterationId: string; patches: Map<string, CommentFieldPatch> };
type AddOp = {
  kind: "add";
  iterationId: string;
  input: NewCommentInput;
  resolve: (comment: Comment) => void;
  reject: (error: Error) => void;
};
type RemoveOp = {
  kind: "remove";
  iterationId: string;
  commentId: string;
  resolve: (isRemoved: boolean) => void;
};
type SyncOp = PatchOp | AddOp | RemoveOp;

// Long enough to fold a burst of keyboard triage into one PATCH, short enough to feel live.
export const COALESCE_MS = 250;

const DEFAULT_TRANSPORT: CommentSyncTransport = {
  patch: (reviewId, iterationId, comments) =>
    reviewApi.update(reviewId, { iteration_id: iterationId, iteration_comments: comments }),
  add: (reviewId, iterationId, input) => reviewApi.addComment(reviewId, iterationId, input),
  remove: (reviewId, iterationId, commentId) =>
    reviewApi.deleteComment(reviewId, iterationId, commentId),
};

const reportError = (error: Error): void => {
  toast.error("Failed to save comments", { description: error.message });
};

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/** Mirrors the server: clearing the file turns the comment into a general note without a line. */
export const applyCommentPatch = (comment: Comment, patch: CommentFieldPatch): Comment => {
  const next: Comment = { ...comment };
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.body !== undefined) next.body = patch.body;
  if (patch.severity !== undefined) next.severity = patch.severity;
  if (patch.resolved !== undefined) next.resolved = patch.resolved;
  if (patch.file !== undefined) {
    next.file = patch.file;
    if (patch.file === null) next.line = null;
  }
  if (patch.line !== undefined) next.line = patch.line;
  return next;
};

const mapComments = (
  review: Review,
  iterationId: string,
  update: (comments: Comment[]) => Comment[]
): Review => ({
  ...review,
  iterations: review.iterations.map((it) =>
    it.id === iterationId ? { ...it, comments: update(it.comments) } : it
  ),
});

const applyOp = (review: Review, op: SyncOp): Review => {
  if (op.kind === "patch") {
    return mapComments(review, op.iterationId, (comments) =>
      comments.map((c) => {
        const patch = op.patches.get(c.id);
        return patch === undefined ? c : applyCommentPatch(c, patch);
      })
    );
  }
  if (op.kind === "remove") {
    return mapComments(review, op.iterationId, (comments) =>
      comments.filter((c) => c.id !== op.commentId)
    );
  }
  // Creation is not optimistic: the comment has no id until the server answers.
  return review;
};

const findCreated = (
  before: Review | undefined,
  after: Review,
  iterationId: string
): Comment | undefined => {
  const known = new Set(
    before?.iterations.find((it) => it.id === iterationId)?.comments.map((c) => c.id) ?? []
  );
  const comments = after.iterations.find((it) => it.id === iterationId)?.comments ?? [];
  // The server appends, so the newest unknown comment is the one this request created.
  return comments.filter((c) => !known.has(c.id)).pop();
};

/**
 * One queue per review: every write goes through it, one request at a time.
 *
 * The backend rewrites the whole review file on each request, so two overlapping writes
 * would silently drop one of them — serialising here is what keeps rapid edits safe.
 * The cache always shows `confirmed` (last server answer) with every unanswered operation
 * re-applied on top; a failed request is simply dropped from that stack, which rolls
 * back exactly its own change and nothing queued after it.
 */
export const createCommentSync = ({
  queryClient,
  reviewId,
  transport = DEFAULT_TRANSPORT,
  coalesceMs = COALESCE_MS,
  onError = reportError,
}: CreateCommentSyncOptions): CommentSync => {
  const queryKey = reviewKeys.detail(reviewId);
  const listeners = new Set<() => void>();
  const queue: SyncOp[] = [];
  let inFlight: SyncOp | null = null;
  let confirmed: Review | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isPumping = false;
  let drainWaiters: (() => void)[] = [];
  let state: CommentSyncState = { isSaving: false };

  const notify = (): void => {
    const isSaving = isPumping || timer !== null || queue.length > 0;
    if (isSaving !== state.isSaving) {
      state = { isSaving };
      listeners.forEach((listener) => {
        listener();
      });
    }
  };

  const render = (): void => {
    if (confirmed === undefined) return;
    const pending = inFlight === null ? queue : [inFlight, ...queue];
    queryClient.setQueryData<Review>(queryKey, pending.reduce(applyOp, confirmed));
  };

  const send = (op: SyncOp): Promise<Review> => {
    if (op.kind === "patch") {
      const comments = [...op.patches].map(([id, patch]) => ({ id, ...patch }));
      return transport.patch(reviewId, op.iterationId, comments);
    }
    if (op.kind === "add") return transport.add(reviewId, op.iterationId, op.input);
    return transport.remove(reviewId, op.iterationId, op.commentId);
  };

  const pump = async (): Promise<void> => {
    if (isPumping) return;
    isPumping = true;
    notify();
    for (let op = queue.shift(); op !== undefined; op = queue.shift()) {
      inFlight = op;
      try {
        // A refetch that started before this write would land after it with stale data.
        await queryClient.cancelQueries({ queryKey });
        const before = confirmed;
        confirmed = await send(op);
        if (op.kind === "add") {
          const created = findCreated(before, confirmed, op.iterationId);
          if (created) op.resolve(created);
          else op.reject(new Error("The server did not return the new comment"));
        } else if (op.kind === "remove") {
          op.resolve(true);
        }
      } catch (error) {
        if (op.kind === "add") {
          op.reject(toError(error));
        } else {
          if (op.kind === "remove") op.resolve(false);
          onError(toError(error));
        }
      } finally {
        inFlight = null;
        render();
      }
    }
    isPumping = false;
    // Idle again: the cache is the source of truth until the next operation starts.
    confirmed = undefined;
    notify();
    const waiters = drainWaiters;
    drainWaiters = [];
    waiters.forEach((resolve) => {
      resolve();
    });
  };

  const schedule = (isImmediate: boolean): void => {
    if (isPumping) return;
    if (timer !== null) {
      if (!isImmediate) return;
      clearTimeout(timer);
      timer = null;
    }
    if (isImmediate) {
      void pump();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, coalesceMs);
  };

  const enqueue = (op: SyncOp, isImmediate: boolean): void => {
    confirmed ??= queryClient.getQueryData<Review>(queryKey);
    const last = queue[queue.length - 1];
    if (op.kind === "patch" && last?.kind === "patch" && last.iterationId === op.iterationId) {
      op.patches.forEach((patch, id) => {
        last.patches.set(id, { ...last.patches.get(id), ...patch });
      });
    } else {
      queue.push(op);
    }
    render();
    // Cancelling a refetch restores the data it started from, so paint the optimistic state
    // again once the cancellation has settled.
    void queryClient.cancelQueries({ queryKey }).then(render);
    schedule(isImmediate);
    notify();
  };

  return {
    patch: (iterationId, patches) => {
      if (patches.size === 0) return;
      enqueue({ kind: "patch", iterationId, patches: new Map(patches) }, false);
    },
    add: (iterationId, input) =>
      new Promise<Comment>((resolve, reject) => {
        enqueue({ kind: "add", iterationId, input, resolve, reject }, true);
      }),
    remove: (iterationId, commentId) =>
      new Promise<boolean>((resolve) => {
        enqueue({ kind: "remove", iterationId, commentId, resolve }, false);
      }),
    flush: () => {
      if (timer !== null) schedule(true);
      if (!isPumping && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        drainWaiters.push(resolve);
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
  };
};

const registry = new WeakMap<QueryClient, Map<string, CommentSync>>();

/**
 * The queue outlives the component that created it: leaving the stage mid-request must not
 * let a remount start a second, overlapping queue for the same review.
 */
export const getCommentSync = (queryClient: QueryClient, reviewId: string): CommentSync => {
  let perClient = registry.get(queryClient);
  if (perClient === undefined) {
    perClient = new Map();
    registry.set(queryClient, perClient);
  }
  let sync = perClient.get(reviewId);
  if (sync === undefined) {
    sync = createCommentSync({ queryClient, reviewId });
    perClient.set(reviewId, sync);
  }
  return sync;
};
