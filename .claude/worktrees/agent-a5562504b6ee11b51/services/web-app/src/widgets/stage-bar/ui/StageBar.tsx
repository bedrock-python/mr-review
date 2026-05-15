import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "@shared/lib";
import { useAppStore } from "@app/providers";
import { useCreateReview } from "@entities/review";
import type { ReviewStage, Review } from "@entities/review";

export type StageBarStore = {
  activeStage: ReviewStage;
  setStage: (stage: ReviewStage) => void;
};

export const useStageBarStore = create<StageBarStore>((set) => ({
  activeStage: "pick",
  setStage: (stage) => set({ activeStage: stage }),
}));

const STAGES: { id: ReviewStage; label: string }[] = [
  { id: "pick", label: "PICK" },
  { id: "brief", label: "BRIEF" },
  { id: "dispatch", label: "DISPATCH" },
  { id: "polish", label: "POLISH" },
  { id: "post", label: "POST" },
];

const STAGE_ORDER: Record<ReviewStage, number> = {
  pick: 0,
  brief: 1,
  dispatch: 2,
  polish: 3,
  post: 4,
};

export const StageBar = (): React.ReactElement => {
  const { activeStage, setStage } = useStageBarStore();
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId, setReview } =
    useAppStore();
  const createReview = useCreateReview();
  const activeIndex = STAGE_ORDER[activeStage];

  // Reset to "pick" whenever the selected MR changes
  useEffect(() => {
    setStage("pick");
  }, [selectedMRIid, setStage]);

  const handleStageClick = async (stageId: ReviewStage): Promise<void> => {
    // If trying to advance past pick with no active review, create one first
    if (stageId !== "pick" && activeReviewId === null) {
      if (!selectedHostId || !selectedRepoPath || selectedMRIid === null) return;
      const review = await createReview.mutateAsync({
        host_id: selectedHostId,
        repo_path: selectedRepoPath,
        mr_iid: selectedMRIid,
      });
      setReview((review as Review).id);
    }
    setStage(stageId);
  };

  return (
    <header
      className="flex items-center h-10 bg-surface border-b border-border px-4 gap-0 flex-shrink-0"
      role="tablist"
      aria-label="Review pipeline stages"
    >
      {STAGES.map((stage, index) => {
        const isActive = activeStage === stage.id;
        const isCompleted = index < activeIndex;

        return (
          <button
            key={stage.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              void handleStageClick(stage.id);
            }}
            className={cn(
              "flex items-center gap-2 px-4 h-full text-[11px] font-mono font-semibold tracking-widest",
              "transition-colors border-b-2 relative",
              isActive
                ? "border-[var(--accent)] text-text"
                : isCompleted
                  ? "border-transparent text-text-muted/60 hover:text-text-muted"
                  : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {isCompleted && (
              <span className="text-[var(--accent)] text-[10px]" aria-hidden="true">
                ✓
              </span>
            )}
            {stage.label}
            {index < STAGES.length - 1 && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 text-border text-xs"
                aria-hidden="true"
              >
                /
              </span>
            )}
          </button>
        );
      })}
    </header>
  );
};
