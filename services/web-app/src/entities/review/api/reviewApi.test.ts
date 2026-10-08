import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ApiError, httpClient } from "@shared/api";
import { reviewApi } from "./reviewApi";
import type { DispatchStreamEvent } from "../model/dispatch.schema";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";

const encoder = new TextEncoder();

/** Frames one event the way sse-starlette does: CRLF line endings. */
const frame = (event: string, data: string): string => `event: ${event}\r\ndata: ${data}\r\n\r\n`;

const MODEL_OUTPUT =
  '[{"file": "a.py", "line": 3, "severity": "major", "body": "Use `{}` for \\"x\\"\\n"}]';
const COMMENT = { index: 0, file: "a.py", line: 3, severity: "major", body: 'Use `{}` for "x"\n' };
const RESULT = {
  iteration_id: ITERATION_ID,
  comments: 1,
  errors: 0,
  json_error: null,
  truncated: false,
  kept_previous: false,
};

const FULL_STREAM =
  frame("chunk", JSON.stringify(MODEL_OUTPUT.slice(0, 30))) +
  ": ping\r\n\r\n" +
  frame("chunk", JSON.stringify(MODEL_OUTPUT.slice(30))) +
  frame("comment", JSON.stringify(COMMENT)) +
  frame("done", JSON.stringify(RESULT));

/** A response body that delivers `bytes` in pieces cut at the given offsets. */
const bodyCutAt = (text: string, cuts: number[]): ReadableStream<Uint8Array> => {
  const bytes = encoder.encode(text);
  const bounds = [0, ...cuts, bytes.length];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bounds.length - 1; i++) {
        controller.enqueue(bytes.slice(bounds[i], bounds[i + 1]));
      }
      controller.close();
    },
  });
};

const bodyInPiecesOf = (text: string, size: number): ReadableStream<Uint8Array> => {
  const length = encoder.encode(text).length;
  const cuts = Array.from({ length: Math.ceil(length / size) - 1 }, (_, i) => (i + 1) * size);
  return bodyCutAt(text, cuts);
};

const mockFetch = (response: Response): Mock<typeof fetch> => {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const sseResponse = (body: ReadableStream<Uint8Array>): Response =>
  new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });

const dispatchAll = async (signal?: AbortSignal): Promise<DispatchStreamEvent[]> => {
  const events: DispatchStreamEvent[] = [];
  for await (const event of reviewApi.dispatchStream(
    REVIEW_ID,
    {
      aiProviderId: PROVIDER_ID,
      model: "model-x",
      temperature: 0.2,
      reasoningEffort: "high",
      maxOutputTokens: 40_000,
      structuredOutput: false,
      systemPrompt: "Only security.",
      iterationId: ITERATION_ID,
    },
    signal
  )) {
    events.push(event);
  }
  return events;
};

describe("reviewApi.dispatchStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the dispatch settings as the snake_case request body", async () => {
    const fetchMock = mockFetch(sseResponse(bodyInPiecesOf(FULL_STREAM, 64)));
    const controller = new AbortController();

    await dispatchAll(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/api/v1/reviews/${REVIEW_ID}/dispatch$`)),
      expect.objectContaining({ method: "POST", signal: controller.signal })
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toEqual({
      ai_provider_id: PROVIDER_ID,
      model: "model-x",
      temperature: 0.2,
      reasoning_budget: null,
      reasoning_effort: "high",
      max_output_tokens: 40_000,
      structured_output: false,
      system_prompt: "Only security.",
      iteration_id: ITERATION_ID,
    });
  });

  it.each([1, 3, 7, 16])(
    "yields typed events when the body arrives in %i-byte pieces",
    async (size) => {
      mockFetch(sseResponse(bodyInPiecesOf(FULL_STREAM, size)));

      const events = await dispatchAll();

      expect(events).toEqual([
        { type: "chunk", text: MODEL_OUTPUT.slice(0, 30) },
        { type: "chunk", text: MODEL_OUTPUT.slice(30) },
        { type: "comment", comment: COMMENT },
        { type: "done", result: RESULT },
      ]);
    }
  );

  it("reassembles model output that parses as JSON", async () => {
    mockFetch(sseResponse(bodyInPiecesOf(FULL_STREAM, 5)));

    const text = (await dispatchAll())
      .map((event) => (event.type === "chunk" ? event.text : ""))
      .join("");

    expect(text).toBe(MODEL_OUTPUT);
    expect(text).not.toContain("\r");
    expect(JSON.parse(text)).toEqual([COMMENT].map(({ index: _index, ...rest }) => rest));
  });

  it("handles a CRLF split between two reads", async () => {
    const firstCr = FULL_STREAM.indexOf("\r\n");
    const blankLineCr = FULL_STREAM.indexOf("\r\n\r\n") + 2;
    mockFetch(sseResponse(bodyCutAt(FULL_STREAM, [firstCr + 1, blankLineCr + 1])));

    const events = await dispatchAll();

    expect(events.map((event) => event.type)).toEqual(["chunk", "chunk", "comment", "done"]);
  });

  it("stops at an error event and surfaces its message", async () => {
    mockFetch(
      sseResponse(
        bodyInPiecesOf(
          frame("chunk", '"[{"') + frame("error", '{"message": "Provider quota exceeded"}'),
          4
        )
      )
    );

    const events = await dispatchAll();

    expect(events).toEqual([
      { type: "chunk", text: "[{" },
      { type: "error", message: "Provider quota exceeded" },
    ]);
  });

  it("stops reading once the result arrives", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame("done", JSON.stringify(RESULT))));
        // The connection stays open — the client must not wait for it to close.
      },
      cancel,
    });
    mockFetch(sseResponse(body));

    const events = await dispatchAll();

    expect(events).toEqual([{ type: "done", result: RESULT }]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("delivers a final event that is not followed by a blank line", async () => {
    mockFetch(sseResponse(bodyInPiecesOf(`event: done\r\ndata: ${JSON.stringify(RESULT)}`, 9)));

    expect(await dispatchAll()).toEqual([{ type: "done", result: RESULT }]);
  });

  it("throws when the stream ends without a result", async () => {
    mockFetch(sseResponse(bodyInPiecesOf(frame("chunk", '"[{"'), 4)));

    await expect(dispatchAll()).rejects.toThrow("ended before the server reported a result");
  });

  it("throws when the result is malformed", async () => {
    mockFetch(sseResponse(bodyInPiecesOf(frame("done", '{"comments": 1}'), 8)));

    await expect(dispatchAll()).rejects.toThrow("malformed dispatch result");
  });

  it("throws the API error detail for a non-2xx response", async () => {
    mockFetch(
      new Response(JSON.stringify({ detail: "AI provider not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(dispatchAll()).rejects.toThrow("AI provider not found");
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    mockFetch(new Response("Bad gateway", { status: 502 }));

    await expect(dispatchAll()).rejects.toThrow("Dispatch failed: 502");
  });

  it("propagates an abort", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode(frame("chunk", '"[{"')));
        controller.signal.addEventListener("abort", () => {
          stream.error(new DOMException("The operation was aborted.", "AbortError"));
        });
      },
    });
    mockFetch(sseResponse(body));

    const events: DispatchStreamEvent[] = [];
    const run = async (): Promise<void> => {
      for await (const event of reviewApi.dispatchStream(
        REVIEW_ID,
        { aiProviderId: PROVIDER_ID },
        controller.signal
      )) {
        events.push(event);
        controller.abort();
      }
    };

    await expect(run()).rejects.toMatchObject({ name: "AbortError" });
    expect(events).toEqual([{ type: "chunk", text: "[{" }]);
  });
});

describe("reviewApi raw response endpoints", () => {
  let http: MockAdapter;
  const rawUrl = `/api/v1/reviews/${REVIEW_ID}/iterations/${ITERATION_ID}/raw-response`;

  beforeEach(() => {
    http = new MockAdapter(httpClient);
  });

  afterEach(() => {
    http.restore();
  });

  it("returns the raw response verbatim even when it is valid JSON", async () => {
    http.onGet(rawUrl).reply(200, MODEL_OUTPUT, { "content-type": "text/plain" });

    await expect(reviewApi.getRawResponse(REVIEW_ID, ITERATION_ID)).resolves.toBe(MODEL_OUTPUT);
  });

  it("returns null when no raw response was stored", async () => {
    http.onGet(rawUrl).reply(404, { detail: "No raw response" });

    await expect(reviewApi.getRawResponse(REVIEW_ID, ITERATION_ID)).resolves.toBeNull();
  });

  it("rethrows other failures", async () => {
    http.onGet(rawUrl).reply(500, { detail: "boom" });

    await expect(reviewApi.getRawResponse(REVIEW_ID, ITERATION_ID)).rejects.toBeInstanceOf(
      ApiError
    );
  });

  it("re-parses an iteration and validates the report", async () => {
    http
      .onPost(`/api/v1/reviews/${REVIEW_ID}/iterations/${ITERATION_ID}/reparse`)
      .reply(200, { imported: 2, errors: [{ index: 2, reason: "missing body", raw: "{}" }] });

    await expect(reviewApi.reparseIteration(REVIEW_ID, ITERATION_ID)).resolves.toEqual({
      imported: 2,
      errors: [{ index: 2, reason: "missing body", raw: "{}" }],
      json_error: null,
    });
  });
});
