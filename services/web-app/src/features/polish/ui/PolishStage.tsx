import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview } from "@entities/review";
import { Button, EmptyState, ICON_SIZE, StageLoading } from "@shared/ui";
import { isIterationLocked } from "../lib";
import { usePolishActions, usePolishViewStore } from "../model";
import { PolishToolbar } from "./PolishToolbar";
import { PolishPinned } from "./pinned/PolishPinned";
import { PolishThread } from "./thread/PolishThread";
import { TriageView } from "./triage/TriageView";
import type { PolishViewMode } from "../model";
import type { LeaveGuard } from "./triage/TriageView";
import type { Iteration } from "@entities/review";

type PolishWorkspaceProps = {
  reviewId: string;
  iteration: Iteration;
  isComposingInitially: boolean;
  onAdvance: () => void;
};

const PolishWorkspace = ({
  reviewId,
  iteration,
  isComposingInitially,
  onAdvance,
}: PolishWorkspaceProps): React.ReactElement => {
  const { actions, isSaving } = usePolishActions(reviewId, iteration.id);
  const viewMode = usePolishViewStore((s) => s.viewMode);
  const setViewMode = usePolishViewStore((s) => s.setViewMode);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const comments = iteration.comments;

  // The list view registers a guard so leaving it cannot silently drop an unsaved edit.
  const leaveGuardRef = useRef<LeaveGuard | null>(null);
  const registerLeaveGuard = useCallback((guard: LeaveGuard) => {
    leaveGuardRef.current = guard;
    return () => {
      if (leaveGuardRef.current === guard) leaveGuardRef.current = null;
    };
  }, []);
  const leave = (action: () => void): void => {
    const guard = leaveGuardRef.current;
    if (guard === null) action();
    else guard.run(action);
  };

  // Closing the tab or reloading cannot be intercepted any other way: ask the browser to
  // confirm while a draft has changes or edits are still on their way to the server.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const hasDraft = leaveGuardRef.current?.hasUnsavedDraft() === true;
      if (!hasDraft && !actions.hasPendingChanges()) return;
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [actions]);

  const handleViewModeChange = (mode: PolishViewMode): void => {
    if (mode !== viewMode) {
      leave(() => {
        setViewMode(mode);
      });
    }
  };

  const handleContinue = (): void => {
    leave(() => {
      // Coalesced edits must reach the server before the Post stage reads the review.
      void actions.flush().then(onAdvance);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PolishToolbar
        comments={comments}
        isSaving={isSaving}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onContinue={handleContinue}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === "list" && (
          <TriageView
            reviewId={reviewId}
            comments={comments}
            isLocked={isIterationLocked(iteration)}
            isComposingInitially={isComposingInitially}
            actions={actions}
            registerLeaveGuard={registerLeaveGuard}
          />
        )}
        {viewMode === "pinned" && (
          <PolishPinned
            reviewId={reviewId}
            comments={comments}
            activeCommentId={activeCommentId ?? comments[0]?.id ?? null}
            setActiveCommentId={setActiveCommentId}
            onUpdate={actions.updateComment}
            onToggleStatus={actions.toggleStatus}
            isPending={isSaving}
          />
        )}
        {viewMode === "thread" && (
          <PolishThread comments={comments} onToggleStatus={actions.toggleStatus} />
        )}
      </div>
    </div>
  );
};

export const PolishStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const { setStage, activeIterationId } = useStageBarStore();
  const { data: review, isLoading } = useReview(activeReviewId);
  const setViewMode = usePolishViewStore((s) => s.setViewMode);
  // The iteration whose workspace is on screen. Once shown it stays mounted even if every
  // comment is deleted: swapping in the empty state would discard an open draft and the
  // undo history with it.
  const [openIterationId, setOpenIterationId] = useState<string | null>(null);

  if (activeReviewId === null) {
    return (
      <EmptyState
        isFill
        title="No active review"
        description="Go back to Pick to select a merge request."
      />
    );
  }

  if (isLoading || review === undefined) {
    return <StageLoading label="Loading review…" />;
  }

  const activeIteration =
    review.iterations.find((it) => it.id === activeIterationId) ??
    review.iterations[review.iterations.length - 1] ??
    null;

  if (activeIteration === null) {
    return (
      <EmptyState
        isFill
        title="No iteration yet"
        description="Go back to Dispatch to run a review."
      />
    );
  }

  const hasComments = activeIteration.comments.length > 0;
  const isOpen = openIterationId === activeIteration.id;
  if (hasComments && !isOpen) {
    // Adjusting state while rendering (React's documented pattern): remember that this
    // iteration's workspace is now on screen.
    setOpenIterationId(activeIteration.id);
  }

  if (!hasComments && !isOpen) {
    return (
      <EmptyState
        isFill
        title="No comments generated"
        description="Go back to Dispatch and try again, or write the review yourself."
        actions={
          isIterationLocked(activeIteration) ? undefined : (
            <Button
              icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={() => {
                setViewMode("list");
                setOpenIterationId(activeIteration.id);
              }}
            >
              Write a comment yourself
            </Button>
          )
        }
      />
    );
  }

  return (
    <PolishWorkspace
      key={activeIteration.id}
      reviewId={activeReviewId}
      iteration={activeIteration}
      // Read once, when the workspace mounts: empty then means "Write a comment yourself".
      isComposingInitially={!hasComments}
      onAdvance={() => {
        setStage("post");
      }}
    />
  );
};
