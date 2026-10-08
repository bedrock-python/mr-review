import { getDiffStats } from "@entities/mr";
import { ROW_FOCUS_ATTR } from "@shared/lib";
import { formatAge } from "../lib/formatAge";
import type { MR, PipelineStatus } from "@entities/mr";

const PIPELINE_DOT_COLORS: Record<PipelineStatus, string> = {
  passed: "oklch(72% 0.18 145)",
  failed: "oklch(68% 0.20 25)",
  running: "oklch(78% 0.18 60)",
  none: "var(--fg-3)",
};

const rowFocusProps = { [ROW_FOCUS_ATTR]: "" };

export type MRItemButtonProps = {
  isSelected: boolean;
  onClick: () => void;
  /** Hover hint, e.g. the branch range when the host reported it. */
  title?: string | undefined;
  children: React.ReactNode;
};

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
    style={{
      width: "100%",
      textAlign: "left",
      borderBottom: "1px solid var(--border)",
      padding: "10px 12px 10px 11px",
      background: isSelected ? "var(--bg-2)" : "transparent",
      borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
      cursor: "pointer",
      transition: "background 0.08s",
      display: "block",
    }}
    onMouseEnter={(event) => {
      if (!isSelected) event.currentTarget.style.background = "var(--bg-hover)";
    }}
    onMouseLeave={(event) => {
      if (!isSelected) event.currentTarget.style.background = "transparent";
    }}
  >
    {children}
  </button>
);

/** Top line: iid · draft tag · pipeline dot · age. */
export const MRItemTopLine = ({ mr }: { mr: MR }): React.ReactElement => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
    <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", flexShrink: 0 }}>
      !{mr.iid}
    </span>
    {mr.draft && (
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "1px 4px",
          color: "var(--fg-3)",
        }}
      >
        DRAFT
      </span>
    )}
    {mr.pipeline !== null && mr.pipeline !== "none" && (
      <span
        title={`Pipeline ${mr.pipeline}`}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: PIPELINE_DOT_COLORS[mr.pipeline],
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    )}
    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-3)" }}>
      {formatAge(mr.created_at)}
    </span>
  </div>
);

export const MRItemTitle = ({
  title,
  isSelected,
}: {
  title: string;
  isSelected: boolean;
}): React.ReactElement => (
  <p
    style={{
      fontSize: 13,
      color: isSelected ? "var(--fg-0)" : "var(--fg-1)",
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      marginBottom: 6,
    }}
  >
    {title}
  </p>
);

export const MRItemAuthor = ({ author }: { author: string }): React.ReactElement => (
  <span
    style={{
      fontSize: 11,
      color: "var(--fg-2)",
      maxWidth: 100,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    @{author}
  </span>
);

/** "+12 -3", or nothing when the host did not report stats for list views. */
export const MRDiffStats = ({ mr }: { mr: MR }): React.ReactElement | null => {
  const stats = getDiffStats(mr);
  if (stats === null) return null;
  return (
    <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
      <span style={{ color: "oklch(72% 0.18 145)" }}>+{stats.additions}</span>{" "}
      <span style={{ color: "oklch(68% 0.20 25)" }}>-{stats.deletions}</span>
    </span>
  );
};
