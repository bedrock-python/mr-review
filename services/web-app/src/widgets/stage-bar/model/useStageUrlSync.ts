import { useEffect } from "react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { isReviewNotFound, useReview } from "@entities/review";
import { useStableCallback } from "@shared/lib";
import { normaliseStageTarget } from "./stages";

/**
 * Settles the stage and iteration in the URL once the review is known: a link without a
 * stage resumes where the review is, a missing or unknown iteration becomes the latest one,
 * and a review that no longer exists is taken out of the URL (instead of failing every
 * request for it). Every correction replaces the history entry, so Back skips it.
 */
export const useStageUrlSync = (): void => {
  const { activeReviewId, activeStage, activeIterationId, goToStage, setReview } = useNav();
  const { data: review, error } = useReview(activeReviewId);
  const isGone = activeReviewId !== null && isReviewNotFound(error);
  const loaded = review?.id === activeReviewId ? review : undefined;

  const settle = useStableCallback((): void => {
    if (isGone) {
      toast.error("This review no longer exists", { id: "review-gone" });
      setReview(null, { replace: true });
      return;
    }
    if (activeReviewId === null) {
      // Without a review only Pick can be shown.
      if ((activeStage !== null && activeStage !== "pick") || activeIterationId !== null) {
        goToStage({ stage: "pick", iterationId: null }, { replace: true });
      }
      return;
    }
    if (loaded === undefined) return;
    const target = normaliseStageTarget(loaded, activeStage, activeIterationId);
    if (target.stage !== activeStage || target.iterationId !== activeIterationId) {
      goToStage(target, { replace: true });
    }
  });

  useEffect(() => {
    settle();
  }, [settle, isGone, activeReviewId, activeStage, activeIterationId, loaded]);
};
