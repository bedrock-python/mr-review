import { useQuery } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";

// ~1 token per 4 chars — rough estimate
const CHARS_PER_TOKEN = 4;

// Warn at 40k tokens, hard limit at 100k tokens
export const DIFF_WARN_CHARS = 40_000 * CHARS_PER_TOKEN; // 160 KB
export const DIFF_HARD_CHARS = 100_000 * CHARS_PER_TOKEN; // 400 KB

export type DiffSizeLevel = "ok" | "warn" | "large";

export const COMMIT_HISTORY_FILE_LIMIT = 50;

export type DiffSizeInfo = {
  chars: number;
  tokens: number;
  level: DiffSizeLevel;
  fileCount: number;
  isLoading: boolean;
};

const formatSize = (chars: number): string => {
  if (chars < 1024) return `${String(chars)} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(0)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDiffSize = formatSize;

export const useDiffSize = (reviewId: string | null): DiffSizeInfo => {
  const { data: diff, isLoading } = useQuery({
    queryKey: ["review-diff", reviewId],
    queryFn: () => reviewApi.getDiff(reviewId ?? ""),
    enabled: reviewId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const chars = diff?.length ?? 0;
  const tokens = Math.round(chars / CHARS_PER_TOKEN);
  const level: DiffSizeLevel =
    chars === 0
      ? "ok"
      : chars >= DIFF_HARD_CHARS
        ? "large"
        : chars >= DIFF_WARN_CHARS
          ? "warn"
          : "ok";
  const fileCount = diff ? (diff.match(/^--- a\//gm) ?? []).length : 0;

  return { chars, tokens, level, fileCount, isLoading };
};
