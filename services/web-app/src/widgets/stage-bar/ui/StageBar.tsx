import { useEffect } from "react";
import { useNav } from "@app/navigation";
import { useCreateReview } from "@entities/review";
import type { ReviewStage } from "@entities/review";
import { useStageBarStore } from "../model/stageBarStore";

const STAGES: { id: ReviewStage; label: string; short: number }[] = [
  { id: "pick", label: "Pick", short: 1 },
  { id: "brief", label: "Brief", short: 2 },
  { id: "dispatch", label: "Dispatch", short: 3 },
  { id: "polish", label: "Polish", short: 4 },
  { id: "post", label: "Post", short: 5 },
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
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId, setReview } = useNav();
  const createReview = useCreateReview();
  const activeIndex = STAGE_ORDER[activeStage];

  useEffect(() => {
    setStage("pick");
  }, [selectedMRIid, setStage]);

  const handleStageClick = async (stageId: ReviewStage): Promise<void> => {
    if (stageId !== "pick" && activeReviewId === null) {
      if (!selectedHostId || !selectedRepoPath || selectedMRIid === null) return;
      const review = await createReview.mutateAsync({
        host_id: selectedHostId,
        repo_path: selectedRepoPath,
        mr_iid: selectedMRIid,
      });
      setReview(review.id);
    }
    setStage(stageId);
  };

  return (
    <header
      role="tablist"
      aria-label="Review pipeline stages"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        padding: "0 24px",
        height: 52,
        gap: 0,
        position: "relative",
      }}
    >
      {STAGES.map((stage, index) => {
        const isActive = activeStage === stage.id;
        const isCompleted = index < activeIndex;
        const isFuture = index > activeIndex;

        const nodeSize = 26;

        let nodeBg: string;
        let nodeColor: string;
        let nodeBorder: string;

        if (isActive) {
          nodeBg = "var(--accent)";
          nodeColor = "var(--accent-ink)";
          nodeBorder = "none";
        } else if (isCompleted) {
          nodeBg = "color-mix(in oklch, var(--accent) 20%, var(--bg-2))";
          nodeColor = "var(--accent)";
          nodeBorder = "none";
        } else {
          nodeBg = "transparent";
          nodeColor = "var(--fg-3)";
          nodeBorder = "1px solid var(--border)";
        }

        return (
          <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
            {/* Connector line before node (skip first) */}
            {index > 0 && (
              <div
                style={{
                  width: 28,
                  height: 1,
                  background: isCompleted ? "var(--accent)" : "var(--border)",
                  opacity: isCompleted ? 0.5 : 1,
                }}
              />
            )}

            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                void handleStageClick(stage.id);
              }}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "none",
                border: "none",
                padding: "0 4px",
                cursor: isFuture ? "default" : "pointer",
              }}
            >
              {/* Pulse ring on active */}
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: nodeSize,
                    height: nodeSize,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    opacity: 0.3,
                    animation: "pulse-ring 1.5s ease-out infinite",
                  }}
                />
              )}

              {/* Node circle */}
              <div
                style={{
                  width: nodeSize,
                  height: nodeSize,
                  borderRadius: "50%",
                  background: nodeBg,
                  border: nodeBorder,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: nodeColor,
                  flexShrink: 0,
                  position: "relative",
                  zIndex: 1,
                  transition: "background 0.15s",
                }}
              >
                {isCompleted ? (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <polyline
                      points="2,6 5,9 10,3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  stage.short
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--fg-0)" : isCompleted ? "var(--fg-2)" : "var(--fg-3)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {stage.label}
              </span>
            </button>
          </div>
        );
      })}
    </header>
  );
};
