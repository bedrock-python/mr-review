import { SeverityCounts, countSeverities, isIterationPosted } from "@entities/review";
import { StatusBadge } from "@shared/ui";
import { formatRelative } from "../lib/formatRelative";
import type { Iteration, IterationStage } from "@entities/review";
import type { Status } from "@shared/ui";

const STAGE_META: Record<IterationStage, { label: string; status: Status }> = {
  brief: { label: "Brief", status: "neutral" },
  dispatch: { label: "Dispatching", status: "info" },
  polish: { label: "Polishing", status: "active" },
  post: { label: "Posted", status: "success" },
};

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  width: "100%",
  padding: "var(--space-3) var(--space-4)",
  border: 0,
  borderBottom: "1px solid var(--border)",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const ROW_ACTIVE: React.CSSProperties = {
  background: "var(--bg-2)",
  boxShadow: "inset 2px 0 0 var(--accent)",
};

const LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  minWidth: 0,
};

const META: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
};

export type IterationRowProps = {
  iteration: Iteration;
  isActive: boolean;
  /** Only the latest iteration can still be in progress; older open ones were left. */
  isLatest: boolean;
  onClick: () => void;
};

/** An iteration: when it started, its stage and how far it got, what it found. */
export const IterationRow = ({
  iteration,
  isActive,
  isLatest,
  onClick,
}: IterationRowProps): React.ReactElement => {
  const stage = STAGE_META[iteration.stage];
  const isPosted = isIterationPosted(iteration);
  const kept = iteration.comments.filter((c) => c.status === "kept");
  const isInProgress = !isPosted && isLatest;

  let progress: string | null = null;
  if (isInProgress) progress = "in progress";
  else if (!isPosted) progress = "not posted";
  else if (iteration.completed_at !== null) progress = formatRelative(iteration.completed_at);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "true" : undefined}
      className="hover:bg-bg-hover bg-transparent focus-visible:-outline-offset-2"
      style={isActive ? { ...ROW, ...ROW_ACTIVE } : ROW}
    >
      <span style={LINE}>
        <span
          style={{
            fontSize: "var(--fs-body)",
            fontWeight: "var(--fw-medium)",
            color: "var(--fg-0)",
          }}
        >
          Iteration {iteration.number}
        </span>
        <span style={{ ...META, marginLeft: "auto", flexShrink: 0 }}>
          <span className="ui-visually-hidden">Started </span>
          {formatRelative(iteration.created_at)}
        </span>
      </span>
      <span
        style={{
          ...META,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {iteration.model ?? "No model yet"}
        {kept.length > 0 &&
          ` · ${String(kept.length)} ${kept.length === 1 ? "comment" : "comments"}`}
      </span>
      <span style={{ ...LINE, gap: "var(--space-3)", marginTop: "var(--space-1)" }}>
        <span style={{ ...LINE, gap: "var(--space-2)" }}>
          <StatusBadge status={stage.status} label={stage.label} isLive={isInProgress} />
          {progress !== null && <span style={META}>{progress}</span>}
        </span>
        {kept.length > 0 && <SeverityCounts counts={countSeverities(kept)} isCompact />}
      </span>
    </button>
  );
};
