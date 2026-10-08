import { getDiffStats } from "@entities/mr";
import { ROW_FOCUS_ATTR, cn, formatAge } from "@shared/lib";
import { StatusBadge } from "@shared/ui";
import type { MR, PipelineStatus } from "@entities/mr";

const PIPELINE_DOT: Record<Exclude<PipelineStatus, "none">, { color: string; label: string }> = {
  passed: { color: "var(--c-success)", label: "Pipeline passed" },
  failed: { color: "var(--c-danger)", label: "Pipeline failed" },
  running: { color: "var(--c-warn)", label: "Pipeline running" },
};

const rowFocusProps = { [ROW_FOCUS_ATTR]: "" };

const formatDate = (iso: string): string => new Date(iso).toLocaleString();

export type MRItemButtonProps = {
  isSelected: boolean;
  onClick: () => void;
  /** Hover hint, e.g. the branch range when the host reported it. */
  title?: string | undefined;
  children: React.ReactNode;
};

/** One row of the list: a full-width button, the selected one marked by the accent bar. */
export const MRItemButton = ({
  isSelected,
  onClick,
  title,
  children,
}: MRItemButtonProps): React.ReactElement => (
  <button
    type="button"
    {...rowFocusProps}
    onClick={onClick}
    aria-pressed={isSelected}
    title={title}
    className={cn(
      "border-border flex w-full flex-col gap-(--space-1) border-b border-l-[3px] py-(--space-2) pr-(--space-3) pl-[calc(var(--space-3)-3px)] text-left",
      "transition-colors duration-(--dur-fast)",
      isSelected
        ? "bg-bg-2 border-l-(--accent-fg)"
        : "hover:bg-bg-hover border-l-transparent bg-transparent"
    )}
  >
    {children}
  </button>
);

/** First line: the title (two lines at most) and its age. */
export const MRItemHeadline = ({
  mr,
  isSelected,
}: {
  mr: MR;
  isSelected: boolean;
}): React.ReactElement => (
  <div className="flex items-start gap-(--space-2)">
    <p
      className={cn(
        "m-0 line-clamp-2 min-w-0 flex-1 text-(length:--fs-body) leading-(--lh-tight) font-medium",
        isSelected ? "text-fg-0" : "text-fg-1"
      )}
    >
      {mr.title}
    </p>
    {/* The last update, which is the list's default order. */}
    <time
      dateTime={mr.updated_at}
      title={`Updated ${formatDate(mr.updated_at)} · opened ${formatDate(mr.created_at)}`}
      className="text-fg-2 shrink-0 pt-px text-(length:--fs-meta) tabular-nums"
    >
      {formatAge(mr.updated_at)}
    </time>
  </div>
);

const PipelineDot = ({ status }: { status: MR["pipeline"] }): React.ReactElement | null => {
  if (status === null || status === "none") return null;
  const look = PIPELINE_DOT[status];
  return (
    <span
      role="img"
      aria-label={look.label}
      title={look.label}
      className="size-[6px] shrink-0 rounded-full"
      style={{ background: look.color }}
    />
  );
};

/** "+12 −3", or nothing when the host did not report stats for list views. */
const MRDiffStats = ({ mr }: { mr: MR }): React.ReactElement | null => {
  const stats = getDiffStats(mr);
  if (stats === null) return null;
  return (
    <span className="shrink-0 tabular-nums">
      <span className="text-(--c-add-fg)">+{stats.additions}</span>{" "}
      <span className="text-(--c-del-fg)">-{stats.deletions}</span>
    </span>
  );
};

export type MRItemMetaProps = {
  mr: MR;
  /** The inbox names the repository; a repository's own list does not repeat it. */
  repoName?: string;
  repoPath?: string;
};

/** Second line, mono: repository · !iid · @author, then draft, pipeline and size. */
export const MRItemMeta = ({ mr, repoName, repoPath }: MRItemMetaProps): React.ReactElement => (
  <div className="text-fg-2 flex min-w-0 items-center gap-(--space-2) font-mono text-(length:--fs-meta)">
    <span className="flex min-w-0 items-center gap-(--space-1)">
      {repoName !== undefined && (
        <>
          <span title={repoPath} className="truncate">
            {repoName}
          </span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className="shrink-0">!{mr.iid}</span>
      <span aria-hidden="true">·</span>
      <span className="truncate">@{mr.author}</span>
    </span>
    {mr.draft && <StatusBadge status="neutral" label="Draft" />}
    <span className="ml-auto flex shrink-0 items-center gap-(--space-2)">
      <PipelineDot status={mr.pipeline} />
      <MRDiffStats mr={mr} />
    </span>
  </div>
);
