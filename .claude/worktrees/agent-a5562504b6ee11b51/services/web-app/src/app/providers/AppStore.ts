import { create } from "zustand";

export type AppState = {
  selectedHostId: string | null;
  selectedRepoPath: string | null;
  selectedMRIid: number | null;
  activeReviewId: string | null;
  setHost: (id: string) => void;
  setRepo: (path: string) => void;
  setMR: (iid: number) => void;
  setReview: (id: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedHostId: null,
  selectedRepoPath: null,
  selectedMRIid: null,
  activeReviewId: null,
  setHost: (id) =>
    set({ selectedHostId: id, selectedRepoPath: null, selectedMRIid: null, activeReviewId: null }),
  setRepo: (path) =>
    set({ selectedRepoPath: path, selectedMRIid: null, activeReviewId: null }),
  setMR: (iid) => set({ selectedMRIid: iid }),
  setReview: (id) => set({ activeReviewId: id }),
}));
