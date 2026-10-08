import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import {
  fetchLatestReview,
  isIterationPosted,
  useCreateIteration,
  useCreateReview,
} from "@entities/review";
import type { Review, ReviewStage } from "@entities/review";
import { resolveIteration } from "./stages";

export type StageNavigation = {
  /** Moves to a stage; Brief also creates the review and the iteration it needs. */
  goToStage: (stage: ReviewStage) => Promise<void>;
  /** Brief is being prepared: the review read, or a review or iteration created. */
  isPending: boolean;
};

export const useStageNavigation = (): StageNavigation => {
  const nav = useNav();
  const qc = useQueryClient();
  const createReview = useCreateReview();
  const createIteration = useCreateIteration();
  const [isPreparingBrief, setIsPreparingBrief] = useState(false);

  // Whether the last iteration was posted decides between continuing it and starting a new
  // one, so it is read from the server: the cached copy can predate a post made a moment ago.
  const loadReview = async (): Promise<Review | null> => {
    if (nav.activeReviewId !== null) return fetchLatestReview(qc, nav.activeReviewId);
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
  // starts a new one (with the brief of the iteration on screen) once that one reached Post —
  // the server refuses a brief saved to a posted iteration.
  const goToBrief = async (): Promise<void> => {
    const target = await loadReview();
    if (target === null) return;
    const latest = target.iterations.at(-1);
    let iterationId = latest?.id ?? null;
    if (latest === undefined || isIterationPosted(latest)) {
      const viewed = resolveIteration(target, nav.activeIterationId);
      const updated = await createIteration.mutateAsync({
        reviewId: target.id,
        ...(viewed ? { briefConfig: viewed.brief_config } : {}),
      });
      const started = updated.iterations.at(-1);
      if (started === undefined || isIterationPosted(started)) {
        // Going to Brief of a posted iteration would only end in refused saves.
        toast.error("Could not start a new iteration", {
          description: "The server kept the posted one as the latest. Try again in a moment.",
        });
        return;
      }
      iterationId = started.id;
    }
    nav.goToStage({ reviewId: target.id, stage: "brief", iterationId });
  };

  const goToStage = async (stage: ReviewStage): Promise<void> => {
    if (stage !== "brief") {
      nav.goToStage({ stage });
      return;
    }
    setIsPreparingBrief(true);
    try {
      await goToBrief();
    } catch {
      // The mutation hooks and the query cache report the failure; the user stays put.
    } finally {
      setIsPreparingBrief(false);
    }
  };

  return { goToStage, isPending: isPreparingBrief };
};
