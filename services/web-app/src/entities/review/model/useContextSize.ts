import { useQuery } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";

// ~1 token per 4 chars — rough estimate, mirrors backend CONTEXT_EMBED_CHARS = 40_000 * 4
const CHARS_PER_TOKEN = 4;
export const CONTEXT_LARGE_CHARS = 40_000 * CHARS_PER_TOKEN; // 160 KB

export type ContextSizeLevel = "ok" | "large";

export type ContextSizeInfo = {
  chars: number;
  tokens: number;
  level: ContextSizeLevel;
  isLoading: boolean;
};

export const formatContextSize = (chars: number): string => {
  if (chars < 1024) return `${String(chars)} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(0)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
};

export const useContextSize = (reviewId: string | null): ContextSizeInfo => {
  const { data: context, isLoading } = useQuery({
    queryKey: ["review-context", reviewId],
    queryFn: () => reviewApi.getContext(reviewId ?? ""),
    enabled: reviewId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const chars = context?.length ?? 0;
  const tokens = Math.round(chars / CHARS_PER_TOKEN);
  const level: ContextSizeLevel = chars >= CONTEXT_LARGE_CHARS ? "large" : "ok";

  return { chars, tokens, level, isLoading };
};
