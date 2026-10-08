import type { Comment, CommentPost, Iteration, PostReviewResult } from "@entities/review";

/**
 * ready: nothing was sent yet. partial: some kept comments are on the MR, others failed or were
 * never sent. failed: comments were sent, none landed. posted: every kept comment is on the MR.
 */
export type PostState = "ready" | "partial" | "failed" | "posted";

export type PostSummary = {
  state: PostState;
  kept: Comment[];
  inline: number;
  generalNotes: number;
  // Kept comments whose last attempt failed, with the reason on their `post`.
  failed: Comment[];
  // The failed ones the host gave no definitive answer for: they may be on the MR already.
  ambiguous: Comment[];
  // Kept comments never sent.
  unsent: number;
  // Kept comments of a completed iteration that carry no record: posted before records were kept.
  unrecorded: number;
  // When the iteration was completed, else when its latest comment landed; null before any did.
  postedAt: string | null;
};

export const isOnMr = (post: CommentPost | null | undefined): boolean =>
  post !== null && post !== undefined && post.outcome !== "failed";

const latest = (dates: string[]): string | null =>
  dates.reduce<string | null>(
    (max, date) => (max === null || Date.parse(date) > Date.parse(max) ? date : max),
    null
  );

/** What Post has done with an iteration, read from the outcome stored on each comment. */
export const summarizePost = (iteration: Iteration): PostSummary => {
  const kept = iteration.comments.filter((c) => c.status === "kept");
  const inline = kept.filter((c) => c.post?.outcome === "inline").length;
  const generalNotes = kept.filter((c) => c.post?.outcome === "general_note").length;
  const failed = kept.filter((c) => c.post?.outcome === "failed");
  const withoutRecord = kept.filter((c) => c.post === null || c.post === undefined).length;
  const landedAt = kept.flatMap((c) => (c.post && isOnMr(c.post) ? [c.post.at] : []));
  const isCompleted = iteration.completed_at !== null;

  let state: PostState = "ready";
  if (isCompleted) state = "posted";
  else if (withoutRecord < kept.length) state = inline + generalNotes > 0 ? "partial" : "failed";

  return {
    state,
    kept,
    inline,
    generalNotes,
    failed,
    ambiguous: failed.filter((c) => c.post?.failure_kind === "ambiguous"),
    unsent: isCompleted ? 0 : withoutRecord,
    unrecorded: isCompleted ? withoutRecord : 0,
    postedAt: iteration.completed_at ?? latest(landedAt),
  };
};

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

export type PostToast = { kind: "success" | "warning" | "error" | "info"; message: string };

/** The one-line outcome of a post call, for a toast. */
export const describePostResult = (result: PostReviewResult): PostToast => {
  const { posted, failed } = result;
  if (posted === 0 && failed === 0 && result.held_back > 0) {
    return {
      kind: "info",
      message: `${plural(result.held_back, "comment")} may already be on the MR and were not sent again`,
    };
  }
  if (posted === 0 && failed === 0) {
    return { kind: "info", message: "Every kept comment is already on the MR" };
  }
  if (failed === 0) return { kind: "success", message: `Posted ${plural(posted, "comment")}` };
  if (posted === 0) {
    return { kind: "error", message: `Nothing was posted: ${plural(failed, "comment")} failed` };
  }
  return {
    kind: "warning",
    message: `Posted ${String(posted)} of ${plural(posted + failed, "comment")}; ${String(failed)} failed`,
  };
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const formatPostedAt = (iso: string): string => DATE_FORMAT.format(new Date(iso));
