import { useEffect } from "react";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { HostsRail, ReposPane } from "@widgets/sidebar";
import { MRList } from "@widgets/mr-list";
import { StageBar } from "@widgets/stage-bar";
import { MRHeader, NAVIGATOR_ID } from "@widgets/mr-header";
import { HistoryPanel } from "@widgets/history-panel";
import { IterationHistoryPanel } from "@widgets/iteration-history-panel";
import { UpdateBanner } from "@features/check-update";
import { useNavigatorHotkey } from "./lib/useNavigatorHotkey";
import { ActiveStage } from "./ui/ActiveStage";
import { BranchDiffHeader } from "./ui/BranchDiffHeader";
import { WorkspaceEmptyState } from "./ui/WorkspaceEmptyState";

/** Repositories pane (268) + merge request list (360). */
const NAV_WIDTH_PX = 628;

export const MainPage = (): React.ReactElement => {
  // Selectors: a panel toggling elsewhere in the store must not re-render the open stage.
  const navCollapsed = useAppStore((s) => s.navCollapsed);
  const setNavCollapsed = useAppStore((s) => s.setNavCollapsed);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const setAddHostOpen = useAppStore((s) => s.setAddHostOpen);
  const {
    selectedHostId,
    selectedRepoPath,
    selectedMRIid,
    activeReviewId,
    activeIterationId,
    goToStage,
  } = useNav();
  // A branch diff review has no merge request: it opens on its repository with ?review=.
  const isBranchDiffOpen =
    selectedMRIid === null && selectedRepoPath !== null && activeReviewId !== null;
  const isWorkspaceOpen = selectedMRIid !== null || isBranchDiffOpen;

  useNavigatorHotkey(toggleNav);

  // Collapse nav when a MR (or a branch diff review) is opened
  useEffect(() => {
    if (isWorkspaceOpen) setNavCollapsed(true);
  }, [isWorkspaceOpen, setNavCollapsed]);

  // Expand nav when a host is selected but nothing is open (includes inbox)
  useEffect(() => {
    if (selectedHostId !== null && !isWorkspaceOpen) setNavCollapsed(false);
  }, [selectedHostId, isWorkspaceOpen, setNavCollapsed]);

  return (
    <div className="bg-bg-0 text-fg-0 flex h-screen flex-col overflow-hidden">
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <HostsRail />

        {/* Collapsible nav: ReposPane + MRList */}
        <div
          id={NAVIGATOR_ID}
          className="flex shrink-0 overflow-hidden transition-[width] duration-(--dur-base) ease-(--ease-out)"
          style={{ width: navCollapsed ? 0 : NAV_WIDTH_PX }}
          // Hidden is hidden: no Tab stop may land in the collapsed navigator.
          inert={navCollapsed}
        >
          <ReposPane />
          <MRList />
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {isWorkspaceOpen ? (
            <>
              {isBranchDiffOpen ? <BranchDiffHeader /> : <MRHeader />}
              <StageBar />
              <ActiveStage />
            </>
          ) : (
            <WorkspaceEmptyState
              isNavCollapsed={navCollapsed}
              onShowNav={toggleNav}
              onAddHost={() => {
                setAddHostOpen(true);
              }}
            />
          )}
        </main>

        <HistoryPanel />
        <IterationHistoryPanel
          activeIterationId={activeIterationId}
          onIterationSelect={(id, stage) => {
            goToStage({ stage, iterationId: id });
          }}
        />
      </div>
    </div>
  );
};
