import { useNav } from "@app/navigation";
import type { ReviewStage } from "@entities/review";

export type StageBarStore = {
  activeStage: ReviewStage;
  /** The iteration the stages work on; null until the review has one. */
  activeIterationId: string | null;
  /** Moves to a stage, keeping the iteration. */
  setStage: (stage: ReviewStage) => void;
  setIterationId: (id: string | null) => void;
};

/**
 * The review stage and iteration, read from and written to the URL (`?stage=&it=`), so a
 * link reopens the same view, Back and Forward move between stages, and opening another
 * merge request starts from a clean state instead of carrying the last one's iteration.
 *
 * Kept in the shape of the store it replaces: `useStageBarStore((s) => s.setStage)`.
 */
export const useStageBarStore = <T = StageBarStore>(selector?: (state: StageBarStore) => T): T => {
  const { activeStage, activeIterationId, goToStage } = useNav();
  const stage = activeStage ?? "pick";
  const state: StageBarStore = {
    activeStage: stage,
    activeIterationId,
    setStage: (next) => {
      goToStage({ stage: next });
    },
    setIterationId: (id) => {
      goToStage({ stage, iterationId: id });
    },
  };
  return selector ? selector(state) : (state as T);
};
