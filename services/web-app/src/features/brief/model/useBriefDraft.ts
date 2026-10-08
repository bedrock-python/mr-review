import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_BRIEF_CONFIG,
  getReviewBriefConfig,
  useReview,
  useUpdateReview,
} from "@entities/review";
import type { BriefConfig, Review } from "@entities/review";

const SAVE_DEBOUNCE_MS = 500;

export type BriefDraft = {
  review: Review | undefined;
  isLoading: boolean;
  config: BriefConfig;
  /** Change the brief now and save it a moment later, together with whatever follows. */
  update: (patch: Partial<BriefConfig>) => void;
  /** Save the brief right away; rejects when the server refuses it. */
  flush: () => Promise<void>;
};

/** The brief being edited: loaded once from the review, saved in the background as it changes. */
export const useBriefDraft = (reviewId: string | null): BriefDraft => {
  const { data: review, isLoading } = useReview(reviewId);
  const { mutate, mutateAsync } = useUpdateReview(reviewId ?? "");
  const [config, setConfig] = useState<BriefConfig>(DEFAULT_BRIEF_CONFIG);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // The latest brief, readable from timers and handlers without waiting for a render.
  const latestRef = useRef<BriefConfig>(DEFAULT_BRIEF_CONFIG);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (review && reviewId !== null && loadedFor !== reviewId) {
    setLoadedFor(reviewId);
    setConfig(getReviewBriefConfig(review));
  }

  useEffect(() => {
    latestRef.current = config;
  }, [config]);

  // Leaving the Brief with a save still pending sends it now rather than dropping it.
  useEffect(
    () => () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      mutate({ brief_config: latestRef.current });
    },
    [mutate]
  );

  const update = useCallback(
    (patch: Partial<BriefConfig>): void => {
      const next = { ...latestRef.current, ...patch };
      latestRef.current = next;
      setConfig(next);
      if (reviewId === null) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        mutate({ brief_config: next });
      }, SAVE_DEBOUNCE_MS);
    },
    [reviewId, mutate]
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (reviewId === null) return;
    await mutateAsync({ brief_config: latestRef.current });
  }, [reviewId, mutateAsync]);

  return { review, isLoading, config, update, flush };
};
