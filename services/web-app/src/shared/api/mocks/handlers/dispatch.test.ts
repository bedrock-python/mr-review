import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DispatchCommentPreviewSchema, DispatchResultSchema } from "@entities/review";
import { readEventStream } from "@shared/lib";
import {
  DISPATCH_MOCK_COMMENTS,
  DISPATCH_MOCK_ITERATION_ID,
  DISPATCH_MOCK_RAW_RESPONSE,
} from "../fixtures/dispatch";
import { createDispatchHandlers } from "./dispatch";

const server = setupServer(...createDispatchHandlers({ frameDelayMs: 0 }));

const REVIEW = "11111111-1111-4111-8111-000000000000";
const ITERATION = "22222222-2222-4222-8222-000000000000";

const dispatch = (body: Record<string, unknown>): Promise<Response> =>
  fetch(`/api/v1/reviews/${REVIEW}/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
  server.close();
});

describe("dispatch handler", () => {
  it("frames the stream with CRLF like sse-starlette", async () => {
    const res = await dispatch({ ai_provider_id: "p" });
    const raw = await res.text();

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(raw.startsWith(": ping\r\n\r\nevent: chunk\r\ndata: ")).toBe(true);
    expect(raw.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });

  it("streams the raw output, each comment once complete, then the result", async () => {
    const res = await dispatch({ ai_provider_id: "p", iteration_id: ITERATION });
    expect(res.body).not.toBeNull();
    if (!res.body) return;

    let text = "";
    const comments: unknown[] = [];
    const events: string[] = [];
    let result: unknown = null;
    for await (const { event, data } of readEventStream(res.body)) {
      events.push(event);
      const payload: unknown = JSON.parse(data);
      if (event === "chunk" && typeof payload === "string") text += payload;
      if (event === "comment") {
        const comment = DispatchCommentPreviewSchema.parse(payload);
        // A comment is only announced once its whole object has been streamed.
        expect(text).toContain(JSON.stringify(comment.body));
        comments.push(comment);
      }
      if (event === "done") result = DispatchResultSchema.parse(payload);
    }

    expect(text).toBe(DISPATCH_MOCK_RAW_RESPONSE);
    expect(comments).toEqual(
      DISPATCH_MOCK_COMMENTS.map((comment, index) => ({ index, ...comment }))
    );
    expect(events.at(-1)).toBe("done");
    expect(result).toEqual({
      iteration_id: ITERATION,
      comments: DISPATCH_MOCK_COMMENTS.length,
      errors: 0,
      json_error: null,
      truncated: false,
    });
  });

  it("reports the default iteration when the request names none", async () => {
    const res = await dispatch({ ai_provider_id: "p" });
    const raw = await res.text();

    expect(raw).toContain(`"iteration_id":"${DISPATCH_MOCK_ITERATION_ID}"`);
  });
});

describe("raw response handlers", () => {
  it("serves the streamed output as plain text", async () => {
    const res = await fetch(`/api/v1/reviews/${REVIEW}/iterations/${ITERATION}/raw-response`);

    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe(DISPATCH_MOCK_RAW_RESPONSE);
  });

  it("re-parses into the mock comments", async () => {
    const res = await fetch(`/api/v1/reviews/${REVIEW}/iterations/${ITERATION}/reparse`, {
      method: "POST",
    });

    expect(await res.json()).toEqual({
      imported: DISPATCH_MOCK_COMMENTS.length,
      errors: [],
      json_error: null,
    });
  });
});
