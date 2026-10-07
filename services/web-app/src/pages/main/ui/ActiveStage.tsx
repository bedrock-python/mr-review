import { useNav } from "@app/navigation";
import { STAGE_PANEL_ID, stageTabId, useStageBarStore } from "@widgets/stage-bar";
import { PickStage } from "@features/pick";
import { BriefStage } from "@features/brief";
import { DispatchStage } from "@features/dispatch";
import { PolishStage } from "@features/polish";
import { PostStage } from "@features/post";
import type { ReviewStage } from "@entities/review";

const STAGE_COMPONENTS: Record<ReviewStage, () => React.ReactElement> = {
  pick: PickStage,
  brief: BriefStage,
  dispatch: DispatchStage,
  polish: PolishStage,
  post: PostStage,
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
      <Component key={workspaceKey} />
    </div>
  );
};
