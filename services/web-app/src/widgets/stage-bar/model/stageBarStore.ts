import { create } from "zustand";
import type { ReviewStage } from "@entities/review";

export type StageBarStore = {
  activeStage: ReviewStage;
  activeIterationId: string | null;
  setStage: (stage: ReviewStage) => void;
  setIterationId: (id: string | null) => void;
  reset: () => void;
};

export const useStageBarStore = create<StageBarStore>((set) => ({
  activeStage: "pick",
  activeIterationId: null,
  setStage: (stage) => {
    set({ activeStage: stage });
  },
  setIterationId: (id) => {
    set({ activeIterationId: id });
  },
  reset: () => {
    set({ activeStage: "pick", activeIterationId: null });
  },
}));
