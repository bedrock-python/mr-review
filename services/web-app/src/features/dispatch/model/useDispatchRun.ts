import { useCallback, useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { reviewApi, reviewKeys } from "@entities/review";

import { createDispatchSession } from "./dispatchSession";
import { waitForSavedRun } from "./waitForSavedRun";

import type { DispatchRequest, DispatchResult, Review } from "@entities/review";
import type { DispatchSession } from "./dispatchSession";

export type DispatchRunStatus = "streaming" | "done" | "stopped" | "error";
export type DispatchStatus = "idle" | DispatchRunStatus;

/** Who answers a run: shown on its output while and after it streams. */
export type DispatchRunInfo = {
  providerName: string;
  model: string;
};

export type DispatchRun = {
  /** The streamed output; tokens update it, not React state. */
  session: DispatchSession;
  status: DispatchStatus;
  run: DispatchRunInfo | null;
  /** What the server saved, once `done` arrived. */
  result: DispatchResult | null;
  error: string | null;
  start: (request: DispatchRequest, run: DispatchRunInfo) => Promise<void>;
  stop: () => void;
};

/**
 * One dispatch run at a time: streams the answer into the session, then reports what the server
 * saved. Unmounting aborts the run instead of streaming into a screen that is gone.
 */
export const useDispatchRun = (reviewId: string): DispatchRun => {
  const qc = useQueryClient();
  // Streamed output lives in this store, not in state: tokens must not re-render
  // the screen, only the panel parts subscribed to the store.
  const [session] = useState(createDispatchSession);
  const [status, setStatus] = useState<DispatchStatus>("idle");
  const [run, setRun] = useState<DispatchRunInfo | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const start = useCallback(
    async (request: DispatchRequest, info: DispatchRunInfo): Promise<void> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const runId = ++runIdRef.current;

      session.reset();
      setRun(info);
      setResult(null);
      setError(null);
      setStatus("streaming");

      let outcome: DispatchResult | null = null;
      let failure: string | null = null;
      try {
        for await (const event of reviewApi.dispatchStream(reviewId, request, ctrl.signal)) {
          if (event.type === "chunk") session.appendText(event.text);
          else if (event.type === "comment") session.addComment(event.comment);
          else if (event.type === "done") outcome = event.result;
          else failure = event.message;
        }
      } catch (err) {
        failure = err instanceof Error ? err.message : "Dispatch failed";
      }
      session.flush();

      if (outcome) {
        // `done` arrives after the iteration is written: one refetch shows what was saved.
        await qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
        if (runId !== runIdRef.current) return;
        if (!outcome.kept_previous) {
          // The saved comments, not the previews: the final parse can drop a draft the
          // stream already showed, or read a comment the preview could not.
          const iterationId = outcome.iteration_id;
          const saved = qc
            .getQueryData<Review>(reviewKeys.detail(reviewId))
            ?.iterations.find((it) => it.id === iterationId)?.comments;
          if (saved) {
            session.replaceComments(
              saved.map(({ file, line, severity, body }, index) => ({
                index,
                file,
                line,
                severity,
                body,
              }))
            );
          }
        }
        setResult(outcome);
        setStatus("done");
        return;
      }
      if (runId !== runIdRef.current) return;
      // Without `done` the server writes what it kept once it notices the stream ended, which
      // can be after this point: wait for that write, so no screen shows the run as still going.
      const saved = waitForSavedRun(qc, reviewId);
      if (ctrl.signal.aborted) {
        setStatus("stopped");
      } else {
        setError(failure ?? "Dispatch failed");
        setStatus("error");
      }
      await saved;
    },
    [reviewId, session, qc]
  );

  const stop = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  return { session, status, run, result, error, start, stop };
};
