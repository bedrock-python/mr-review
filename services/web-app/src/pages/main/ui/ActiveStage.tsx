import { lazy, Suspense } from "react";
import type { LazyExoticComponent } from "react";
import { useNav } from "@app/navigation";
import { STAGE_PANEL_ID, stageTabId, useStageBarStore } from "@widgets/stage-bar";
import { isChunkLoadError, reloadOnStaleChunk } from "@shared/lib";
import { StageLoading } from "@shared/ui";
import { ErrorBoundary } from "@shared/ui/error-boundary";
import type { ErrorFallbackProps } from "@shared/ui/error-boundary";
import type { ReviewStage } from "@entities/review";

type StageComponent = LazyExoticComponent<() => React.ReactElement>;

// Each stage is its own chunk: opening a merge request loads Pick, not the Polish editor.
const STAGE_COMPONENTS: Record<ReviewStage, StageComponent> = {
  pick: lazy(
    reloadOnStaleChunk(() => import("@features/pick").then((m) => ({ default: m.PickStage })))
  ),
  brief: lazy(
    reloadOnStaleChunk(() => import("@features/brief").then((m) => ({ default: m.BriefStage })))
  ),
  dispatch: lazy(
    reloadOnStaleChunk(() =>
      import("@features/dispatch").then((m) => ({ default: m.DispatchStage }))
    )
  ),
  polish: lazy(
    reloadOnStaleChunk(() => import("@features/polish").then((m) => ({ default: m.PolishStage })))
  ),
  post: lazy(
    reloadOnStaleChunk(() => import("@features/post").then((m) => ({ default: m.PostStage })))
  ),
};

const reloadPage = (): void => {
  window.location.reload();
};

/** A stage that failed, inside its panel: the stage bar and header stay usable. */
const StageError = ({ error, reset }: ErrorFallbackProps): React.ReactElement => {
  const isChunkError = isChunkLoadError(error);
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        height: "100%",
        padding: 24,
        textAlign: "center",
        color: "var(--fg-2)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--fg-0)" }}>This stage could not be shown</div>
      <div style={{ fontSize: 12, maxWidth: 420 }}>
        {isChunkError
          ? "mr-review was probably updated since this page was opened. Reload to get the current version."
          : error.message}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn primary" onClick={reloadPage}>
          Reload page
        </button>
        {!isChunkError && (
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
};

/** The stage the stage bar has selected, as the panel its tabs control. */
export const ActiveStage = (): React.ReactElement => {
  const activeStage = useStageBarStore((s) => s.activeStage);
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId } = useNav();
  const Component = STAGE_COMPONENTS[activeStage];
  // A stage keeps local state (selected file, drafts, a running stream): it must start
  // over for another merge request or review, never show the previous one's.
  const workspaceKey = [selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId].join("|");

  return (
    <div
      role="tabpanel"
      id={STAGE_PANEL_ID}
      aria-labelledby={stageTabId(activeStage)}
      style={{ flex: 1, overflow: "auto" }}
    >
      {/* Keyed like the stage: an error in one stage does not stick to the next. */}
      <ErrorBoundary key={`${activeStage}|${workspaceKey}`} fallbackRender={StageError}>
        <Suspense fallback={<StageLoading />}>
          <Component key={workspaceKey} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};
