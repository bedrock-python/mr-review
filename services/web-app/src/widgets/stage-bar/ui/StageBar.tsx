import { useRef } from "react";
import { useNav } from "@app/navigation";
import { useReview } from "@entities/review";
import { cn } from "@shared/lib";
import { Toolbar, Tooltip } from "@shared/ui";
import type { ReviewStage } from "@entities/review";
import {
  STAGES,
  STAGE_ORDER,
  STAGE_PANEL_ID,
  isStageAvailable,
  progressIndexOf,
  resolveIteration,
  stageTabId,
} from "../model/stages";
import { useStageBarStore } from "../model/useStageBarStore";
import { useStageNavigation } from "../model/useStageNavigation";
import { useStageUrlSync } from "../model/useStageUrlSync";
import { StageNode } from "./StageNode";
import type { StageLook } from "./StageNode";

const LOCKED_OPACITY = 0.55;

const LABEL_CLASS: Record<StageLook, string> = {
  active: "font-semibold text-fg-0",
  done: "text-fg-1",
  open: "text-fg-1",
  locked: "text-fg-2",
};

const lookOf = ({
  isActive,
  locked,
  isDone,
}: {
  isActive: boolean;
  locked: boolean;
  isDone: boolean;
}): StageLook => {
  if (isActive) return "active";
  if (locked) return "locked";
  return isDone ? "done" : "open";
};

const NEXT_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * The review pipeline as tabs, drawn as the bottom row of the workspace header. A check
 * means the review really got past that stage (the server's record of the iteration), not
 * that the stage was opened; a stage the review has not reached yet is locked.
 */
export const StageBar = (): React.ReactElement => {
  useStageUrlSync();
  const activeStage = useStageBarStore((s) => s.activeStage);
  const { activeReviewId, activeIterationId, selectedMRIid } = useNav();
  const { goToStage, isPending } = useStageNavigation();
  const { data: review } = useReview(activeReviewId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = STAGE_ORDER[activeStage];
  const iteration = resolveIteration(review, activeIterationId);
  const progressIndex = progressIndexOf(iteration);
  // Furthest stage that may be opened. Brief is always open: it starts the review (or its
  // next round) when there is nothing further yet.
  const canStartBrief = activeReviewId !== null || selectedMRIid !== null;
  const reachedIndex = Math.max(
    STAGE_ORDER[iteration?.stage ?? "pick"],
    canStartBrief ? STAGE_ORDER.brief : 0
  );
  const furthestOpenIndex = Math.max(reachedIndex, activeIndex);

  const isLocked = (stage: ReviewStage, index: number): boolean =>
    !isStageAvailable(stage, review) || (index > reachedIndex && stage !== activeStage);

  /** Why a locked tab cannot be opened, shown as its tooltip. */
  const lockReason = (stage: ReviewStage): string => {
    if (!isStageAvailable(stage, review)) return "Not available for a branch diff";
    return `Finish ${STAGES[furthestOpenIndex]?.label ?? "the previous stage"} first`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = NEXT_KEYS[event.key];
    if (!next) return;
    event.preventDefault();
    tabRefs.current[next(index, STAGES.length)]?.focus();
  };

  return (
    // A Toolbar row (40px, like the list toolbars), holding tabs rather than tools.
    <Toolbar
      size="sm"
      role="tablist"
      aria-label="Review pipeline stages"
      aria-busy={isPending}
      className="gap-0 overflow-x-auto"
    >
      {STAGES.map((stage, index) => {
        const isActive = activeStage === stage.id;
        const locked = isLocked(stage.id, index);
        const isDone = !isActive && !locked && index < progressIndex;
        const look = lookOf({ isActive, locked, isDone });

        return (
          <div key={stage.id} className="flex shrink-0 items-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className="h-px w-(--space-5)"
                style={{
                  background: index <= progressIndex ? "var(--accent-fg)" : "var(--border-strong)",
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
                className={cn(
                  "flex h-(--control-md) items-center gap-(--space-2) rounded-(--radius-2) pr-(--space-2) pl-(--space-1)",
                  "transition-colors duration-(--dur-fast)",
                  locked && "cursor-not-allowed",
                  isActive && "cursor-default",
                  !locked && !isActive && "hover:bg-bg-hover cursor-pointer"
                )}
                style={{ opacity: locked ? LOCKED_OPACITY : 1 }}
              >
                <StageNode
                  look={look}
                  number={stage.short}
                  isPending={isPending && stage.id === "brief"}
                />
                <span
                  className={cn("text-(length:--fs-control) whitespace-nowrap", LABEL_CLASS[look])}
                >
                  {stage.label}
                </span>
                {isDone && <span className="ui-visually-hidden">, done</span>}
              </button>
            </Tooltip>
          </div>
        );
      })}
    </Toolbar>
  );
};
