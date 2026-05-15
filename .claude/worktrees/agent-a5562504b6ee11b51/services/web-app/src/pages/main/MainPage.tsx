import { useAppStore } from "@app/providers";
import { HostsRail, ReposPane } from "@widgets/sidebar";
import { MRList } from "@widgets/mr-list";
import { StageBar, useStageBarStore } from "@widgets/stage-bar";
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

const ActiveStage = (): React.ReactElement => {
  const activeStage = useStageBarStore((s) => s.activeStage);
  const Component = STAGE_COMPONENTS[activeStage];
  return <Component />;
};

const EmptyState = (): React.ReactElement => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
    <div className="text-5xl font-mono font-bold text-text/10 select-none">MR</div>
    <p className="text-sm">Select a merge request to start a review</p>
  </div>
);

export const MainPage = (): React.ReactElement => {
  const { selectedMRIid } = useAppStore();

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text">
      <HostsRail />
      <ReposPane />
      <MRList />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedMRIid !== null ? (
          <>
            <StageBar />
            <div className="flex-1 overflow-auto">
              <ActiveStage />
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
};
