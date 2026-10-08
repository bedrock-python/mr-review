import { Skeleton } from "@shared/ui";
import { PanelsIcon } from "./MRHeaderIcons";

const headerContainerStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-1)",
  padding: "12px 20px 10px",
  flexShrink: 0,
};

/** Outer box shared by the loaded, loading and error header variants. */
export const MRHeaderFrame = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div style={headerContainerStyle}>{children}</div>
);

export type MRBreadcrumbsProps = {
  hostName: string;
  repoName: string;
  repoPath: string;
  mrIid: number;
  isNavCollapsed: boolean;
  onShowNav: () => void;
};

/** "host › repo › !iid", with the navigator toggle while the nav is collapsed. */
export const MRBreadcrumbs = ({
  hostName,
  repoName,
  repoPath,
  mrIid,
  isNavCollapsed,
  onShowNav,
}: MRBreadcrumbsProps): React.ReactElement => (
  <nav
    aria-label="Breadcrumbs"
    className="mono"
    style={{
      fontSize: 11,
      color: "var(--fg-2)",
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    {isNavCollapsed && (
      <button
        type="button"
        onClick={onShowNav}
        title="Show navigator"
        aria-label="Show navigator"
        style={{
          marginRight: 6,
          padding: "2px 4px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-1)",
          cursor: "pointer",
          color: "var(--fg-2)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <PanelsIcon />
      </button>
    )}
    <span>{hostName}</span>
    <span aria-hidden="true">›</span>
    <span title={repoPath}>{repoName}</span>
    <span aria-hidden="true">›</span>
    <span style={{ color: "var(--fg-2)" }}>!{mrIid}</span>
  </nav>
);

/** Placeholder with the header's footprint while the MR loads. */
export const MRHeaderSkeleton = ({
  breadcrumbs,
}: {
  breadcrumbs: React.ReactNode;
}): React.ReactElement => (
  <div style={headerContainerStyle} role="status" aria-label="Loading merge request">
    {breadcrumbs}
    <Skeleton
      style={{ width: "55%", height: 24, borderRadius: "var(--radius-2)", marginBottom: 12 }}
    />
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Skeleton style={{ width: 20, height: 20, borderRadius: "50%" }} />
      <Skeleton style={{ width: 120, height: 12, borderRadius: "var(--radius-1)" }} />
      <Skeleton style={{ width: 160, height: 16, borderRadius: "var(--radius-pill)" }} />
    </div>
  </div>
);

export type MRHeaderErrorProps = {
  breadcrumbs: React.ReactNode;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
};

/** Compact failure row; keeps the breadcrumbs so the user knows what failed. */
export const MRHeaderError = ({
  breadcrumbs,
  message,
  isRetrying,
  onRetry,
}: MRHeaderErrorProps): React.ReactElement => (
  <div style={headerContainerStyle}>
    {breadcrumbs}
    <div
      role="alert"
      style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg-2)" }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-critical)" }}
      />
      <span>{message}</span>
      <button
        type="button"
        className="btn ghost"
        style={{ padding: "3px 10px", fontSize: 11 }}
        onClick={onRetry}
        disabled={isRetrying}
      >
        {isRetrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  </div>
);
