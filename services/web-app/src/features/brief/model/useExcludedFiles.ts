import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { reviewApi } from "@entities/review";
import type { BriefConfig, ExcludedFiles } from "@entities/review";

const FILTER_DEBOUNCE_MS = 400;
const EXCLUDED_STALE_MS = 60_000;

type PathFilters = Pick<BriefConfig, "include_paths" | "exclude_paths" | "use_default_excludes">;

const sameFilters = (a: PathFilters, b: PathFilters): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Which changed files the brief's path filters leave out, checked shortly after they change. */
export const useExcludedFiles = (
  reviewId: string | null,
  config: BriefConfig
): UseQueryResult<ExcludedFiles> => {
  const { include_paths, exclude_paths, use_default_excludes } = config;
  const filters = useMemo<PathFilters>(
    () => ({ include_paths, exclude_paths, use_default_excludes }),
    [include_paths, exclude_paths, use_default_excludes]
  );
  const [debounced] = useDebounce(filters, FILTER_DEBOUNCE_MS, { equalityFn: sameFilters });

  return useQuery({
    queryKey: ["review-excluded-files", reviewId, debounced],
    queryFn: () => {
      if (reviewId === null) return Promise.reject(new Error("reviewId is null"));
      return reviewApi.getExcludedFiles(reviewId, debounced);
    },
    enabled: reviewId !== null,
    staleTime: EXCLUDED_STALE_MS,
    // The last answer for this review stays up while changed filters are re-checked: the
    // list (and the button focus is on) does not vanish and come back, nor Dispatch flicker.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === reviewId ? previous : undefined,
  });
};
