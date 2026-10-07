import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDispatchSession } from "./dispatchSession";
import type { DispatchCommentPreview } from "@entities/review";

const comment = (index: number): DispatchCommentPreview => ({
  index,
  file: "a.py",
  line: index + 1,
  severity: "minor",
  body: `comment ${String(index)}`,
});

describe("createDispatchSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes many updates as one store change per frame", () => {
    const session = createDispatchSession();
    const listener = vi.fn();
    session.store.subscribe(listener);

    session.appendText("[{");
    session.appendText('"file"');
    session.addComment(comment(0));
    session.appendText(": 1}");

    expect(listener).not.toHaveBeenCalled();
    expect(session.store.getState().text).toBe("");

    vi.advanceTimersToNextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.store.getState()).toEqual({ text: '[{"file": 1}', comments: [comment(0)] });
  });

  it("keeps the comments array when only text changed", () => {
    const session = createDispatchSession();
    session.addComment(comment(0));
    vi.advanceTimersToNextFrame();
    const { comments } = session.store.getState();

    session.appendText("more");
    vi.advanceTimersToNextFrame();

    expect(session.store.getState().comments).toBe(comments);
  });

  it("publishes immediately on flush and cancels the scheduled frame", () => {
    const session = createDispatchSession();
    const listener = vi.fn();
    session.store.subscribe(listener);

    session.appendText("tail");
    session.flush();

    expect(session.store.getState().text).toBe("tail");
    vi.advanceTimersToNextFrame();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("drops buffered updates on reset", () => {
    const session = createDispatchSession();
    session.appendText("old run");
    session.flush();
    session.appendText(" pending");
    session.addComment(comment(1));

    session.reset();
    vi.advanceTimersToNextFrame();

    expect(session.store.getState()).toEqual({ text: "", comments: [] });
  });
});
