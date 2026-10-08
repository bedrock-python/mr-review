import { reviewApi, reviewKeys } from "@entities/review";
import type { Review } from "@entities/review";
import type { QueryClient } from "@tanstack/react-query";

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 300;

const isDispatching = (review: Review): boolean =>
  review.iterations.some((iteration) => iteration.stage === "dispatch");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Reloads the review until the server has written a run that ended without `done`.
 *
 * After Stop, or when the connection drops, the server settles the iteration only once it
 * notices the stream is gone, so an immediate read can still show it dispatching. A settled
 * run never leaves an iteration in `dispatch`, which is what this waits for — a bounded number
 * of times. Every read lands in the query cache, so screens showing the review follow along.
 */
export const waitForSavedRun = async (qc: QueryClient, reviewId: string): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    let review: Review;
    try {
      review = await qc.fetchQuery({
        queryKey: reviewKeys.detail(reviewId),
        queryFn: () => reviewApi.get(reviewId),
        staleTime: 0,
      });
    } catch {
      // The review query reports its own errors; the next refetch picks the state up.
      return;
    }
    if (!isDispatching(review) || attempt >= POLL_ATTEMPTS) return;
    await sleep(POLL_INTERVAL_MS);
  }
};
