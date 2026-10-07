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

/** `event: done` — sent once the iteration has been persisted with stage=polish. */
export const DispatchResultSchema = z.object({
  iteration_id: z.string().uuid(),
  comments: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  json_error: z.string().nullable().default(null),
  /** The model output was cut off (e.g. at max tokens), so comments may be missing. */
  truncated: z.boolean().default(false),
});

/** `event: error` — generation failed; the iteration keeps its previous comments. */
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
