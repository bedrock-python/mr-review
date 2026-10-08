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
  /** Parsed comments dropped by the brief's minimum severity or comment cap. */
  filtered: z.number().int().nonnegative().optional(),
});

/**
 * `event: error` — generation failed and the stream ends without `done`. The iteration keeps
 * its comments; one that had none takes the complete comments that arrived before the failure.
 */
export const DispatchErrorPayloadSchema = z.object({
  message: z.string(),
});

/**
 * The body of `POST /reviews/{id}/dispatch`. `null`/absent means the default: the provider's first
 * model, the model's own sampling and reasoning, a model-sized output limit, structured output
 * where the provider type turns it on, the built-in system prompt. The server drops or adapts
 * whatever the model does not accept.
 */
export type DispatchRequest = {
  aiProviderId: string;
  model?: string | null;
  temperature?: number | null;
  /** `none`…`max`; the nearest level the model has is used. */
  reasoningEffort?: string | null;
  reasoningBudget?: number | null;
  maxOutputTokens?: number | null;
  structuredOutput?: boolean | null;
  systemPrompt?: string | null;
  iterationId?: string | null;
};

export type DispatchCommentPreview = z.infer<typeof DispatchCommentPreviewSchema>;
export type DispatchResult = z.infer<typeof DispatchResultSchema>;

export type DispatchStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "comment"; comment: DispatchCommentPreview }
  | { type: "done"; result: DispatchResult }
  | { type: "error"; message: string };
