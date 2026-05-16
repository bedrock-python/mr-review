import { useEffect } from "react";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { HostsRail, ReposPane } from "@widgets/sidebar";
import { MRList } from "@widgets/mr-list";
import { StageBar, useStageBarStore } from "@widgets/stage-bar";
import { MRHeader } from "@widgets/mr-header";
import { HistoryPanel } from "@widgets/history-panel";
import { IterationHistoryPanel } from "@widgets/iteration-history-panel";
import { PickStage } from "@features/pick";
import { BriefStage } from "@features/brief";
import { DispatchStage } from "@features/dispatch";
import { PolishStage } from "@features/polish";
import { PostStage } from "@features/post";
import { UpdateBanner } from "@features/check-update";
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
        fontWeight: 700,
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
  const { navCollapsed, setNavCollapsed } = useAppStore();
  const { selectedHostId, selectedMRIid } = useNav();
  const { activeIterationId, setStage, setIterationId } = useStageBarStore();

  // Collapse nav when a MR is opened
  useEffect(() => {
    if (selectedMRIid !== null) setNavCollapsed(true);
  }, [selectedMRIid, setNavCollapsed]);

  // Expand nav when a host is selected but no MR is open (includes inbox)
  useEffect(() => {
    if (selectedHostId !== null && selectedMRIid === null) setNavCollapsed(false);
  }, [selectedHostId, selectedMRIid, setNavCollapsed]);

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

          {selectedMRIid !== null ? (
            <>
              <MRHeader />
              <StageBar />
              <div style={{ flex: 1, overflow: "auto" }}>
                <ActiveStage />
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </main>

        <HistoryPanel />
        <IterationHistoryPanel
          activeIterationId={activeIterationId}
          onIterationSelect={(id, stage) => {
            setIterationId(id);
            setStage(stage);
          }}
        />
      </div>
    </div>
  );
};
