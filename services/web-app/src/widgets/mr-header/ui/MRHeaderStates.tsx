import { CircleAlert, PanelLeftClose, PanelLeftOpen, RotateCw } from "lucide-react";
import { Button, ICON_SIZE, IconButton, Skeleton } from "@shared/ui";

/** The key that shows and hides the navigator (repositories and merge requests). */
export const NAVIGATOR_SHORTCUT = "[";
/** The id of the navigator's container, which the toggle controls. */
export const NAVIGATOR_ID = "navigator";

export type MRHeaderFrameProps = {
  /** The first row: breadcrumbs, meta, actions. */
  topRow: React.ReactNode;
  /** The second row: the title, or its placeholder or error. */
  children: React.ReactNode;
  role?: "status";
  "aria-label"?: string;
};

/**
 * The workspace header: a meta row and the title. The stage bar under it is its bottom row
 * and draws the border, so the three read as one block.
 */
export const MRHeaderFrame = ({
  topRow,
  children,
  ...aria
}: MRHeaderFrameProps): React.ReactElement => (
  <div
    {...aria}
    className="bg-bg-1 flex shrink-0 flex-col gap-(--space-1) px-(--space-4) pt-(--space-2) pb-(--space-1)"
  >
    <div className="flex min-h-(--control-sm) flex-wrap items-center gap-x-(--space-3) gap-y-(--space-1)">
      {topRow}
    </div>
    {children}
  </div>
);

export type NavigatorToggleProps = {
  isNavCollapsed: boolean;
  onToggleNav: () => void;
};

/** Shows or hides the repositories and merge requests next to the workspace. */
export const NavigatorToggle = ({
  isNavCollapsed,
  onToggleNav,
}: NavigatorToggleProps): React.ReactElement => (
  <IconButton
    size="sm"
    label={isNavCollapsed ? "Show navigator" : "Hide navigator"}
    shortcut={NAVIGATOR_SHORTCUT}
    tooltipSide="bottom"
    aria-expanded={!isNavCollapsed}
    aria-controls={NAVIGATOR_ID}
    onClick={onToggleNav}
    icon={
      isNavCollapsed ? (
        <PanelLeftOpen size={ICON_SIZE.inline} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={ICON_SIZE.inline} aria-hidden="true" />
      )
    }
  />
);

export type MRBreadcrumbsProps = {
  hostName: string;
  repoName: string;
  repoPath: string;
  /** The last crumb: "!12", or "branch diff". */
  leaf: string;
};

/** "host › repo › !iid" in the meta row. */
export const MRBreadcrumbs = ({
  hostName,
  repoName,
  repoPath,
  leaf,
}: MRBreadcrumbsProps): React.ReactElement => (
  <nav
    aria-label="Breadcrumbs"
    className="text-fg-2 flex min-w-0 shrink-0 items-center gap-(--space-1) font-mono text-(length:--fs-meta)"
  >
    <span>{hostName}</span>
    <span aria-hidden="true">›</span>
    <span title={repoPath}>{repoName}</span>
    <span aria-hidden="true">›</span>
    <span className="text-fg-1">{leaf}</span>
  </nav>
);

/** A thin rule between the groups of the meta row. */
export const MetaDivider = (): React.ReactElement => (
  <span aria-hidden="true" className="bg-border h-(--space-3) w-px shrink-0" />
);

/** Placeholder with the header's footprint while the MR loads. */
export const MRHeaderSkeleton = ({ topRow }: { topRow: React.ReactNode }): React.ReactElement => (
  <MRHeaderFrame
    role="status"
    aria-label="Loading merge request"
    topRow={
      <>
        {topRow}
        <Skeleton width="20%" height="var(--fs-meta)" />
      </>
    }
  >
    <Skeleton width="55%" height="var(--fs-page)" radius="control" />
  </MRHeaderFrame>
);

export type MRHeaderErrorProps = {
  topRow: React.ReactNode;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
};

/** Compact failure row; keeps the breadcrumbs so the user knows what failed. */
export const MRHeaderError = ({
  topRow,
  message,
  isRetrying,
  onRetry,
}: MRHeaderErrorProps): React.ReactElement => (
  <MRHeaderFrame topRow={topRow}>
    <div
      role="alert"
      className="text-fg-1 flex min-h-(--control-md) items-center gap-(--space-2) text-(length:--fs-control)"
    >
      <CircleAlert size={ICON_SIZE.inline} aria-hidden="true" className="text-(--c-danger-fg)" />
      <span>{message}</span>
      <Button
        variant="ghost"
        size="sm"
        icon={<RotateCw size={ICON_SIZE.inline} aria-hidden="true" />}
        isLoading={isRetrying}
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  </MRHeaderFrame>
);
