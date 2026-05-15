import { create } from "zustand";
import type { ReviewStage } from "@entities/review";

export type StageBarStore = {
  activeStage: ReviewStage;
  setStage: (stage: ReviewStage) => void;
};

export const useStageBarStore = create<StageBarStore>((set) => ({
  activeStage: "pick",
  setStage: (stage) => {
    set({ activeStage: stage });
  },
}));
