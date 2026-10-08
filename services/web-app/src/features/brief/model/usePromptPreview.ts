import { useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { reviewApi } from "@entities/review";
import type { BriefConfig, PromptPreview } from "@entities/review";
import { isSameBrief } from "../lib";

export type PromptPreviewState = {
  preview: PromptPreview | undefined;
  isRequested: boolean;
  isFetching: boolean;
  error: Error | null;
  /** The brief changed since the preview was built; it is shown as it was until refreshed. */
  isStale: boolean;
  refresh: () => void;
};

/**
 * The prompt preview, built only on request: editing the brief marks it out of date instead of
 * fetching and rendering a new one on every keystroke.
 */
export const usePromptPreview = (
  reviewId: string | null,
  config: BriefConfig
): PromptPreviewState => {
  const [requested, setRequested] = useState<BriefConfig | null>(null);

  const query = useQuery({
    queryKey: ["review-prompt-preview", reviewId, requested],
    queryFn: () => {
      if (reviewId === null || requested === null) {
        return Promise.reject(new Error("No preview requested"));
      }
      return reviewApi.getPromptPreview(reviewId, requested);
    },
    enabled: reviewId !== null && requested !== null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const { refetch } = query;

  const isStale = requested !== null && !isSameBrief(requested, config);

  const refresh = useCallback((): void => {
    if (requested !== null && isSameBrief(requested, config)) {
      void refetch();
      return;
    }
    setRequested({ ...config });
  }, [requested, config, refetch]);

  return {
    preview: query.data,
    isRequested: requested !== null,
    isFetching: query.isFetching,
    error: query.error,
    isStale,
    refresh,
  };
};
