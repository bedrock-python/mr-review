import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchCommentPreview } from "@entities/review";

export type DispatchSessionState = {
  /** Raw model output received so far. */
  text: string;
  /** Comment previews in the order the server emitted them. */
  comments: DispatchCommentPreview[];
};

export type DispatchSession = {
  store: StoreApi<DispatchSessionState>;
  appendText: (delta: string) => void;
  addComment: (comment: DispatchCommentPreview) => void;
  /** Publishes buffered updates now instead of on the next frame. */
  flush: () => void;
  /** Drops buffered updates and empties the store for a new run. */
  reset: () => void;
};

const EMPTY_STATE: DispatchSessionState = { text: "", comments: [] };

/**
 * Holds the live output of a dispatch run outside React state.
 *
 * Tokens arrive far more often than the screen refreshes, so updates are buffered
 * and published to the store at most once per animation frame. Components
 * subscribe to the slice they render, so the rest of the screen does not
 * re-render per token.
 */
export const createDispatchSession = (): DispatchSession => {
  const store = createStore<DispatchSessionState>(() => EMPTY_STATE);
  let pendingText = "";
  let pendingComments: DispatchCommentPreview[] = [];
  let frame: number | null = null;

  const publish = (): void => {
    frame = null;
    if (pendingText === "" && pendingComments.length === 0) return;
    const { text, comments } = store.getState();
    store.setState({
      text: text + pendingText,
      comments: pendingComments.length > 0 ? [...comments, ...pendingComments] : comments,
    });
    pendingText = "";
    pendingComments = [];
  };

  const schedule = (): void => {
    frame ??= requestAnimationFrame(publish);
  };

  const cancelScheduled = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  return {
    store,
    appendText: (delta) => {
      pendingText += delta;
      schedule();
    },
    addComment: (comment) => {
      pendingComments.push(comment);
      schedule();
    },
    flush: () => {
      cancelScheduled();
      publish();
    },
    reset: () => {
      cancelScheduled();
      pendingText = "";
      pendingComments = [];
      store.setState(EMPTY_STATE);
    },
  };
};
