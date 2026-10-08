import { create } from "zustand";

type AppState = {
  navCollapsed: boolean;
  historyOpen: boolean;
  iterationHistoryOpen: boolean;
  /** The "Add host" dialog: opened from the hosts rail and from the first-run empty state. */
  addHostOpen: boolean;
};

type AppActions = {
  toggleNav: () => void;
  setNavCollapsed: (collapsed: boolean) => void;
  toggleHistory: () => void;
  setHistoryOpen: (open: boolean) => void;
  toggleIterationHistory: () => void;
  setIterationHistoryOpen: (open: boolean) => void;
  setAddHostOpen: (open: boolean) => void;
};

export const useAppStore = create<AppState & AppActions>()((set) => ({
  navCollapsed: false,
  historyOpen: false,
  iterationHistoryOpen: false,
  addHostOpen: false,

  toggleNav: () => {
    set((s) => ({ navCollapsed: !s.navCollapsed }));
  },
  setNavCollapsed: (collapsed) => {
    set({ navCollapsed: collapsed });
  },
  toggleHistory: () => {
    set((s) => ({ historyOpen: !s.historyOpen }));
  },
  setHistoryOpen: (open) => {
    set({ historyOpen: open });
  },
  toggleIterationHistory: () => {
    set((s) => ({ iterationHistoryOpen: !s.iterationHistoryOpen }));
  },
  setIterationHistoryOpen: (open) => {
    set({ iterationHistoryOpen: open });
  },
  setAddHostOpen: (open) => {
    set({ addHostOpen: open });
  },
}));
