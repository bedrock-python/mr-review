import { useNav } from "@app/navigation";
import {
  isIterationCompleted,
  useCreateIteration,
  useCreateReview,
  useReview,
} from "@entities/review";
import type { Review, ReviewStage } from "@entities/review";
import { resolveIteration } from "./stages";

export type StageNavigation = {
  /** Moves to a stage; Brief also creates the review and the iteration it needs. */
  goToStage: (stage: ReviewStage) => Promise<void>;
  /** A review or iteration is being created for Brief. */
  isPending: boolean;
};

export const useStageNavigation = (): StageNavigation => {
  const nav = useNav();
  const { data: loadedReview } = useReview(nav.activeReviewId);
  const createReview = useCreateReview();
  const createIteration = useCreateIteration();

  const review = loadedReview?.id === nav.activeReviewId ? loadedReview : undefined;

  const ensureReview = async (): Promise<Review | null> => {
    if (nav.activeReviewId !== null) return review ?? null;
    const { selectedHostId, selectedRepoPath, selectedMRIid } = nav;
    if (selectedHostId === null || selectedRepoPath === null || selectedMRIid === null) {
      return null;
    }
    // The server returns the merge request's existing review when there is one.
    return createReview.mutateAsync({
      host_id: selectedHostId,
      repo_path: selectedRepoPath,
      mr_iid: selectedMRIid,
    });
  };

  // Brief is where a round starts: it works on the last iteration while that is open, and
  // starts a new one (with the brief of the iteration on screen) once that one was posted —
  // the server refuses a brief saved to a posted iteration.
  const goToBrief = async (): Promise<void> => {
    const target = await ensureReview();
    if (target === null) return;
    const latest = target.iterations.at(-1);
    let iterationId = latest?.id ?? null;
    if (latest === undefined || isIterationCompleted(latest)) {
      const viewed = resolveIteration(target, nav.activeIterationId);
      const updated = await createIteration.mutateAsync({
        reviewId: target.id,
        ...(viewed ? { briefConfig: viewed.brief_config } : {}),
      });
      iterationId = updated.iterations.at(-1)?.id ?? null;
    }
    nav.goToStage({ reviewId: target.id, stage: "brief", iterationId });
  };

  const goToStage = async (stage: ReviewStage): Promise<void> => {
    if (stage !== "brief") {
      nav.goToStage({ stage });
      return;
    }
    try {
      await goToBrief();
    } catch {
      // The mutation hooks have reported the failure; the user stays where they were.
    }
  };

  return { goToStage, isPending: createReview.isPending || createIteration.isPending };
};
