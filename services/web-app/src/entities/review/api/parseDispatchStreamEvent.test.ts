import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDispatchStreamEvent } from "./parseDispatchStreamEvent";

const ITERATION_ID = "22222222-2222-4222-8222-222222222222";

describe("parseDispatchStreamEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes a chunk's JSON string literal into raw text", () => {
    expect(parseDispatchStreamEvent("chunk", '"[{\\"file\\": \\"a.py\\",\\n"')).toEqual({
      type: "chunk",
      text: '[{"file": "a.py",\n',
    });
  });

  it("validates a comment preview and fills omitted nullable fields", () => {
    expect(
      parseDispatchStreamEvent("comment", '{"index": 0, "severity": "major", "body": "Fix it"}')
    ).toEqual({
      type: "comment",
      comment: { index: 0, file: null, line: null, severity: "major", body: "Fix it" },
    });
  });

  it("skips a malformed chunk or comment instead of failing the stream", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(parseDispatchStreamEvent("chunk", "not json")).toBeNull();
    expect(parseDispatchStreamEvent("chunk", '{"text": "x"}')).toBeNull();
    expect(
      parseDispatchStreamEvent("comment", '{"index": 0, "severity": "blocker", "body": "x"}')
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("validates the done result", () => {
    expect(
      parseDispatchStreamEvent(
        "done",
        `{"iteration_id": "${ITERATION_ID}", "comments": 3, "errors": 1, "json_error": null}`
      )
    ).toEqual({
      type: "done",
      result: { iteration_id: ITERATION_ID, comments: 3, errors: 1, json_error: null },
    });
  });

  it("throws on a malformed done result", () => {
    expect(() => parseDispatchStreamEvent("done", '{"comments": 3}')).toThrow(
      "malformed dispatch result"
    );
  });

  it("reads the message of an error event", () => {
    expect(parseDispatchStreamEvent("error", '{"message": "Rate limited"}')).toEqual({
      type: "error",
      message: "Rate limited",
    });
  });

  it("keeps a plain-text error payload and falls back when it is empty", () => {
    expect(parseDispatchStreamEvent("error", "Provider timeout")).toEqual({
      type: "error",
      message: "Provider timeout",
    });
    expect(parseDispatchStreamEvent("error", '{"message": " "}')).toEqual({
      type: "error",
      message: "Dispatch failed",
    });
  });

  it("ignores unknown event types", () => {
    expect(parseDispatchStreamEvent("message", '"x"')).toBeNull();
    expect(parseDispatchStreamEvent("progress", "{}")).toBeNull();
  });
});
