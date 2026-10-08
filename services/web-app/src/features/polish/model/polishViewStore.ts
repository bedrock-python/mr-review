import { create } from "zustand";

export type PolishViewMode = "list" | "pinned" | "thread";

export type PolishViewStore = {
  viewMode: PolishViewMode;
  isGroupedByFile: boolean;
  setViewMode: (mode: PolishViewMode) => void;
  setGroupedByFile: (isGrouped: boolean) => void;
};

// Layout preferences outlive a stage switch; filters are per visit and live in the view.
export const usePolishViewStore = create<PolishViewStore>((set) => ({
  viewMode: "list",
  isGroupedByFile: false,
  setViewMode: (viewMode) => {
    set({ viewMode });
  },
  setGroupedByFile: (isGroupedByFile) => {
    set({ isGroupedByFile });
  },
}));
