import { useEffect } from "react";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { HostsRail, ReposPane } from "@widgets/sidebar";
import { MRList } from "@widgets/mr-list";
import { StageBar } from "@widgets/stage-bar";
import { MRHeader } from "@widgets/mr-header";
import { HistoryPanel } from "@widgets/history-panel";
import { IterationHistoryPanel } from "@widgets/iteration-history-panel";
import { UpdateBanner } from "@features/check-update";
import { ActiveStage } from "./ui/ActiveStage";
import { BranchDiffHeader } from "./ui/BranchDiffHeader";

const EmptyState = (): React.ReactElement => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 12,
      color: "var(--fg-3)",
    }}
  >
    <div
      className="mono"
      style={{
        fontSize: 48,
        fontWeight: 600,
        opacity: 0.1,
        userSelect: "none",
        letterSpacing: "0.05em",
      }}
    >
      MR
    </div>
    <p style={{ fontSize: 13, color: "var(--fg-3)" }}>Select a merge request to start a review</p>
  </div>
);

const CollapseToggle = ({ collapsed }: { collapsed: boolean }): React.ReactElement => {
  const toggleNav = useAppStore((s) => s.toggleNav);
  return (
    <button
      type="button"
      onClick={toggleNav}
      title={collapsed ? "Show navigator" : "Hide navigator"}
      style={{
        position: "absolute",
        left: 0,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 10,
        width: 16,
        height: 48,
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderLeft: "none",
        borderRadius: "0 6px 6px 0",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fg-3)",
        padding: 0,
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--fg-0)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--fg-3)";
      }}
    >
      <svg
        width="8"
        height="12"
        viewBox="0 0 8 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
          transition: "transform 0.2s",
        }}
      >
        <polyline points="2,1 6,6 2,11" />
      </svg>
    </button>
  );
};

export const MainPage = (): React.ReactElement => {
  // Selectors: a panel toggling elsewhere in the store must not re-render the open stage.
  const navCollapsed = useAppStore((s) => s.navCollapsed);
  const setNavCollapsed = useAppStore((s) => s.setNavCollapsed);
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

  // Collapse nav when a MR (or a branch diff review) is opened
  useEffect(() => {
    if (isWorkspaceOpen) setNavCollapsed(true);
  }, [isWorkspaceOpen, setNavCollapsed]);

  // Expand nav when a host is selected but nothing is open (includes inbox)
  useEffect(() => {
    if (selectedHostId !== null && !isWorkspaceOpen) setNavCollapsed(false);
  }, [selectedHostId, isWorkspaceOpen, setNavCollapsed]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
      }}
    >
      <UpdateBanner />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <HostsRail />

        {/* Collapsible nav: ReposPane + MRList */}
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            overflow: "hidden",
            width: navCollapsed ? 0 : 628,
            transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <ReposPane />
          <MRList />
        </div>

        {/* Main content with collapse toggle on the left edge */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <CollapseToggle collapsed={navCollapsed} />

          {isWorkspaceOpen ? (
            <>
              {isBranchDiffOpen ? <BranchDiffHeader /> : <MRHeader />}
              <StageBar />
              <ActiveStage />
            </>
          ) : (
            <EmptyState />
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
