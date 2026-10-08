import { useRef } from "react";
import { Check } from "lucide-react";
import { useNav } from "@app/navigation";
import { useReview } from "@entities/review";
import { Tooltip } from "@shared/ui";
import type { ReviewStage } from "@entities/review";
import {
  STAGES,
  STAGE_ORDER,
  STAGE_PANEL_ID,
  isStageAvailable,
  resolveIteration,
  stageTabId,
} from "../model/stages";
import { useStageBarStore } from "../model/useStageBarStore";
import { useStageNavigation } from "../model/useStageNavigation";
import { useStageUrlSync } from "../model/useStageUrlSync";

const NODE_SIZE = 26;
const CONNECTOR_WIDTH = 28;
const LOCKED_OPACITY = 0.55;

/** active: the lime node; done: a check on a 15% accent tint; ahead: an outlined number. */
type StageLook = "active" | "done" | "ahead";

type LookStyle = { background: string; color: string; border: string; label: string };

const LOOK: Record<StageLook, LookStyle> = {
  active: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    border: "1px solid transparent",
    label: "var(--fg-0)",
  },
  done: {
    background: "color-mix(in oklch, var(--accent) 15%, var(--bg-2))",
    color: "var(--accent-fg)",
    border: "1px solid transparent",
    label: "var(--fg-1)",
  },
  ahead: {
    background: "transparent",
    color: "var(--fg-2)",
    border: "1px solid var(--border-strong)",
    label: "var(--fg-2)",
  },
};

const NEXT_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

export const StageBar = (): React.ReactElement => {
  useStageUrlSync();
  const activeStage = useStageBarStore((s) => s.activeStage);
  const { activeReviewId, activeIterationId, selectedMRIid } = useNav();
  const { goToStage, isPending } = useStageNavigation();
  const { data: review } = useReview(activeReviewId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = STAGE_ORDER[activeStage];
  const iteration = resolveIteration(review, activeIterationId);
  // Furthest stage the server has recorded for this iteration. Brief is always open: it
  // starts the review (or its next round) when there is nothing further yet.
  const canStartBrief = activeReviewId !== null || selectedMRIid !== null;
  const reachedIndex = Math.max(
    STAGE_ORDER[iteration?.stage ?? "pick"],
    canStartBrief ? STAGE_ORDER.brief : 0
  );

  const isLocked = (stage: ReviewStage, index: number): boolean =>
    !isStageAvailable(stage, review) || (index > reachedIndex && stage !== activeStage);

  /** Why a locked tab cannot be opened, shown as its tooltip. */
  const lockReason = (stage: ReviewStage): string => {
    if (!isStageAvailable(stage, review)) return "Not available for a branch diff";
    return `Finish ${STAGES[reachedIndex]?.label ?? "the previous stage"} first`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = NEXT_KEYS[event.key];
    if (!next) return;
    event.preventDefault();
    tabRefs.current[next(index, STAGES.length)]?.focus();
  };

  return (
    <header
      role="tablist"
      aria-label="Review pipeline stages"
      aria-busy={isPending}
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
        const isReached = index <= reachedIndex;
        const locked = isLocked(stage.id, index);
        const isDone = !isActive && !locked && (index < activeIndex || isReached);
        const look = LOOK[isActive ? "active" : isDone ? "done" : "ahead"];

        return (
          <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
            {index > 0 && (
              <div
                aria-hidden="true"
                style={{
                  width: CONNECTOR_WIDTH,
                  height: 1,
                  background: isReached ? "var(--accent-fg)" : "var(--border-strong)",
                }}
              />
            )}

            {/* Always wrapped, so locking a tab never remounts it under the user's focus */}
            <Tooltip content={lockReason(stage.id)} side="bottom" isDisabled={!locked}>
              <button
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={stageTabId(stage.id)}
                aria-controls={isActive ? STAGE_PANEL_ID : undefined}
                aria-selected={isActive}
                aria-disabled={locked}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(event) => {
                  handleKeyDown(event, index);
                }}
                onClick={() => {
                  if (locked || isActive || isPending) return;
                  void goToStage(stage.id);
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "none",
                  border: "none",
                  height: 36,
                  padding: "0 6px",
                  borderRadius: "var(--radius-2)",
                  cursor: locked ? "not-allowed" : isActive ? "default" : "pointer",
                  opacity: locked ? LOCKED_OPACITY : 1,
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: NODE_SIZE,
                      height: NODE_SIZE,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      opacity: 0.3,
                      animation: "pulse-ring-centered 1.5s ease-out infinite",
                    }}
                  />
                )}

                <span
                  aria-hidden="true"
                  style={{
                    width: NODE_SIZE,
                    height: NODE_SIZE,
                    borderRadius: "50%",
                    background: look.background,
                    border: look.border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: look.color,
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                    transition: "background 0.15s",
                  }}
                >
                  {isDone ? <Check size={13} strokeWidth={2.5} /> : stage.short}
                </span>

                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: look.label,
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stage.label}
                </span>
              </button>
            </Tooltip>
          </div>
        );
      })}
    </header>
  );
};
