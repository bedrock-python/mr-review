import { lazy, Suspense } from "react";
import { useNav } from "@app/navigation";
import { STAGE_PANEL_ID, stageTabId, useStageBarStore } from "@widgets/stage-bar";
import { Spinner } from "@shared/ui";
import type { ReviewStage } from "@entities/review";

// Each stage is its own chunk: opening a merge request loads Pick, not the Polish editor.
const STAGE_COMPONENTS: Record<ReviewStage, React.LazyExoticComponent<() => React.ReactElement>> = {
  pick: lazy(() => import("@features/pick").then((m) => ({ default: m.PickStage }))),
  brief: lazy(() => import("@features/brief").then((m) => ({ default: m.BriefStage }))),
  dispatch: lazy(() => import("@features/dispatch").then((m) => ({ default: m.DispatchStage }))),
  polish: lazy(() => import("@features/polish").then((m) => ({ default: m.PolishStage }))),
  post: lazy(() => import("@features/post").then((m) => ({ default: m.PostStage }))),
};

const StageLoading = (): React.ReactElement => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
    <Spinner />
  </div>
);

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
      <Suspense fallback={<StageLoading />}>
        <Component key={workspaceKey} />
      </Suspense>
    </div>
  );
};
