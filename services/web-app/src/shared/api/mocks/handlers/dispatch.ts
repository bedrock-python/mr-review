import { delay, http, HttpResponse } from "msw";
import type { HttpHandler } from "msw";
import {
  DISPATCH_MOCK_COMMENTS,
  DISPATCH_MOCK_COMMENT_END_OFFSETS,
  DISPATCH_MOCK_ITERATION_ID,
  DISPATCH_MOCK_RAW_RESPONSE,
} from "../fixtures/dispatch";

const CHUNK_SIZE = 24;
const DEFAULT_FRAME_DELAY_MS = 30;

// sse-starlette terminates every line with CRLF; the mock does the same so the
// client's line handling is exercised as in production.
const EOL = "\r\n";

const sseFrame = (event: string, data: unknown): string =>
  `event: ${event}${EOL}data: ${JSON.stringify(data)}${EOL}${EOL}`;

const SSE_PING = `: ping${EOL}${EOL}`;

/**
 * The frames of one dispatch run: the raw output in `chunk` events, a `comment`
 * event as soon as a comment object is complete, then the `done` result.
 */
const buildDispatchFrames = (iterationId: string): string[] => {
  const frames = [SSE_PING];
  let emittedComments = 0;
  for (let offset = 0; offset < DISPATCH_MOCK_RAW_RESPONSE.length; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, DISPATCH_MOCK_RAW_RESPONSE.length);
    frames.push(sseFrame("chunk", DISPATCH_MOCK_RAW_RESPONSE.slice(offset, end)));
    while (
      emittedComments < DISPATCH_MOCK_COMMENTS.length &&
      (DISPATCH_MOCK_COMMENT_END_OFFSETS[emittedComments] ?? Infinity) <= end
    ) {
      frames.push(
        sseFrame("comment", {
          index: emittedComments,
          ...DISPATCH_MOCK_COMMENTS[emittedComments],
        })
      );
      emittedComments++;
    }
  }
  frames.push(
    sseFrame("done", {
      iteration_id: iterationId,
      comments: DISPATCH_MOCK_COMMENTS.length,
      errors: 0,
      json_error: null,
      truncated: false,
      kept_previous: false,
    })
  );
  return frames;
};

const readIterationId = async (request: Request): Promise<string> => {
  try {
    const body = (await request.json()) as { iteration_id?: unknown };
    return typeof body.iteration_id === "string" ? body.iteration_id : DISPATCH_MOCK_ITERATION_ID;
  } catch {
    return DISPATCH_MOCK_ITERATION_ID;
  }
};

export type DispatchHandlersOptions = {
  /** Pause between SSE frames, so the UI streams visibly; 0 in tests. */
  frameDelayMs?: number;
};

/** MSW handlers for AI dispatch: the SSE stream and the stored raw response. */
export const createDispatchHandlers = ({
  frameDelayMs = DEFAULT_FRAME_DELAY_MS,
}: DispatchHandlersOptions = {}): HttpHandler[] => [
  http.post("/api/v1/reviews/:reviewId/dispatch", async ({ request }) => {
    const frames = buildDispatchFrames(await readIterationId(request));
    const encoder = new TextEncoder();
    let next = 0;
    // Pull-based, so a client that stops reading (Stop button) stops the mock too.
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (frameDelayMs > 0) await delay(frameDelayMs);
        const frame = frames[next++];
        if (frame === undefined) controller.close();
        else controller.enqueue(encoder.encode(frame));
      },
    });
    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }),

  http.get("/api/v1/reviews/:reviewId/iterations/:iterationId/raw-response", () => {
    return new HttpResponse(DISPATCH_MOCK_RAW_RESPONSE, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }),

  http.post("/api/v1/reviews/:reviewId/iterations/:iterationId/reparse", () => {
    return HttpResponse.json({
      imported: DISPATCH_MOCK_COMMENTS.length,
      errors: [],
      json_error: null,
    });
  }),
];

export const dispatchHandlers = createDispatchHandlers();
