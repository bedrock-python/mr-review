import { z } from "zod";
import { SeveritySchema } from "./review.schema";

/**
 * Payloads of the `POST /reviews/{id}/dispatch` event stream. Events arrive in
 * this order: any number of `chunk` and `comment` events, then exactly one
 * terminal `done` or `error` event.
 */

/** `event: chunk` — `data` is a JSON string literal holding a raw model text delta. */
export const DispatchChunkPayloadSchema = z.string();

/**
 * `event: comment` — a top-level comment object the server has finished parsing.
 * A preview only: ids are assigned when the iteration is persisted.
 */
export const DispatchCommentPreviewSchema = z.object({
  index: z.number().int().nonnegative(),
  file: z.string().nullable().default(null),
  line: z.number().int().nullable().default(null),
  severity: SeveritySchema,
  body: z.string(),
});

/** `event: done` — sent once, after the server has written the iteration. */
export const DispatchResultSchema = z.object({
  iteration_id: z.string().uuid(),
  /** Comments the iteration holds now: the new ones, or the previous ones when `kept_previous`. */
  comments: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  json_error: z.string().nullable().default(null),
  /** The model output was cut off (e.g. at max tokens), so comments may be missing. */
  truncated: z.boolean().default(false),
  /**
   * The answer was not used — unreadable, cut off or empty — so the iteration kept its
   * previous comments and stage. Its raw output exists only in the streamed text.
   */
  kept_previous: z.boolean().default(false),
});

/**
 * `event: error` — generation failed and the stream ends without `done`. The iteration keeps
 * its comments; one that had none takes the complete comments that arrived before the failure.
 */
export const DispatchErrorPayloadSchema = z.object({
  message: z.string(),
});

export type DispatchCommentPreview = z.infer<typeof DispatchCommentPreviewSchema>;
export type DispatchResult = z.infer<typeof DispatchResultSchema>;

export type DispatchStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "comment"; comment: DispatchCommentPreview }
  | { type: "done"; result: DispatchResult }
  | { type: "error"; message: string };
