import { getReviewSource } from "@entities/review";
import type { Review, ReviewStage } from "@entities/review";

export const getReviewDisplayStage = (review: Review): ReviewStage =>
  review.iterations.at(-1)?.stage ?? "pick";

/** `!12` for a merge request review, `main…feature/x` for a branch diff. */
export const getReviewTargetLabel = (review: Review): string => {
  const source = getReviewSource(review);
  return source.kind === "mr"
    ? `!${String(source.mr_iid)}`
    : `${source.base_ref}…${source.head_ref}`;
};

export type ReviewFilter = {
  query: string;
  stage: ReviewStage | null;
  hostNames: ReadonlyMap<string, string>;
};

/** Newest first, narrowed to the stage and to the query (host, repository or target). */
export const filterReviews = (reviews: readonly Review[], filter: ReviewFilter): Review[] => {
  // A pasted query often carries a space at either end; it is never part of what is meant.
  const query = filter.query.trim().toLowerCase();
  return [...reviews]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((review) => {
      if (filter.stage !== null && getReviewDisplayStage(review) !== filter.stage) return false;
      if (!query) return true;
      const haystack = [
        filter.hostNames.get(review.host_id) ?? "",
        review.repo_path,
        getReviewTargetLabel(review),
        String(review.mr_iid),
      ];
      return haystack.some((text) => text.toLowerCase().includes(query));
    });
};

export type ReviewGroup = { hostId: string; label: string; reviews: Review[] };

/** Groups by host id: two hosts may share a name, and must still be two groups. */
export const groupReviewsByHost = (
  reviews: readonly Review[],
  hostNames: ReadonlyMap<string, string>
): ReviewGroup[] => {
  const groups = new Map<string, ReviewGroup>();
  for (const review of reviews) {
    const group = groups.get(review.host_id) ?? {
      hostId: review.host_id,
      label: hostNames.get(review.host_id) ?? review.host_id,
      reviews: [],
    };
    group.reviews.push(review);
    groups.set(review.host_id, group);
  }
  return [...groups.values()];
};

export const countReviewsByStage = (reviews: readonly Review[]): Map<ReviewStage, number> => {
  const counts = new Map<ReviewStage, number>();
  for (const review of reviews) {
    const stage = getReviewDisplayStage(review);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return counts;
};
