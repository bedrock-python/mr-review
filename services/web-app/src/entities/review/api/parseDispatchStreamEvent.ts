import {
  DispatchChunkPayloadSchema,
  DispatchCommentPreviewSchema,
  DispatchErrorPayloadSchema,
  DispatchResultSchema,
} from "../model/dispatch.schema";
import type { DispatchStreamEvent } from "../model/dispatch.schema";

const FALLBACK_ERROR_MESSAGE = "Dispatch failed";

const parseJson = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * Turns one server-sent event of the dispatch stream into a typed event.
 *
 * `chunk` and `comment` only feed the live preview, so a malformed one is skipped
 * (returns null) instead of aborting a generation the server keeps persisting.
 * A malformed `done` throws: the outcome of the run would otherwise be unknown.
 * Unknown event types return null, so the server can add events safely.
 */
export const parseDispatchStreamEvent = (
  event: string,
  data: string
): DispatchStreamEvent | null => {
  switch (event) {
    case "chunk": {
      const parsed = DispatchChunkPayloadSchema.safeParse(parseJson(data));
      if (parsed.success) return { type: "chunk", text: parsed.data };
      console.warn("Skipping malformed dispatch chunk event:", data);
      return null;
    }
    case "comment": {
      const parsed = DispatchCommentPreviewSchema.safeParse(parseJson(data));
      if (parsed.success) return { type: "comment", comment: parsed.data };
      console.warn("Skipping malformed dispatch comment event:", data);
      return null;
    }
    case "done": {
      const parsed = DispatchResultSchema.safeParse(parseJson(data));
      if (parsed.success) return { type: "done", result: parsed.data };
      throw new Error("The server sent a malformed dispatch result", { cause: parsed.error });
    }
    case "error": {
      // Fall back to the raw payload so a plain-text error still reaches the user.
      const parsed = DispatchErrorPayloadSchema.safeParse(parseJson(data));
      const message = (parsed.success ? parsed.data.message : data).trim();
      return { type: "error", message: message || FALLBACK_ERROR_MESSAGE };
    }
    default:
      return null;
  }
};
