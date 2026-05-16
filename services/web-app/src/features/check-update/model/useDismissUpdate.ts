import { create } from "zustand";
import { persist } from "zustand/middleware";

type DismissState = {
  dismissed: string[];
  dismiss: (tagName: string) => void;
};

// Persisted so the user doesn't see the same banner again after a page refresh.
// Keys are full tag names (e.g. "mr-review-v1.2.0", "web-app-v1.2.0").
export const useDismissStore = create<DismissState>()(
  persist(
    (set, get) => ({
      dismissed: [],
      dismiss: (tagName) => {
        if (!get().dismissed.includes(tagName)) {
          set((s) => ({ dismissed: [...s.dismissed, tagName] }));
        }
      },
    }),
    { name: "mr-review-dismissed-updates" }
  )
);

export const useDismissUpdate = (): {
  isDismissed: (tagName: string) => boolean;
  dismiss: (tagName: string) => void;
} => {
  const { dismissed, dismiss } = useDismissStore();
  return {
    isDismissed: (tagName) => dismissed.includes(tagName),
    dismiss,
  };
};
