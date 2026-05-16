import type { InboxMR, PipelineStatus } from "@entities/mr";

const PIPELINE_DOT_COLORS: Record<NonNullable<PipelineStatus>, string> = {
  passed: "oklch(72% 0.18 145)",
  failed: "oklch(68% 0.20 25)",
  running: "oklch(78% 0.18 60)",
  none: "var(--fg-3)",
};

const formatAge = (dateStr: string): string => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d";
  if (diffDays < 30) return `${String(diffDays)}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${String(diffMonths)}mo`;
};

export type InboxMRListItemProps = {
  mr: InboxMR;
  isSelected: boolean;
  onClick: () => void;
};

export const InboxMRListItem = ({
  mr,
  isSelected,
  onClick,
}: InboxMRListItemProps): React.ReactElement => {
  const repoName = mr.repo_path.split("/").pop() ?? mr.repo_path;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      style={{
        width: "100%",
        textAlign: "left",
        borderBottom: "1px solid var(--border)",
        padding: "10px 12px 10px 14px",
        background: isSelected ? "var(--bg-2)" : "transparent",
        borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
        paddingLeft: 11,
        cursor: "pointer",
        transition: "background 0.08s",
        display: "block",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      {/* Repo path badge */}
      <div style={{ marginBottom: 4 }}>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-3)",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "1px 5px",
          }}
        >
          {repoName}
        </span>
      </div>

      {/* Top line: iid · draft tag · pipeline dot · age */}
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
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: PIPELINE_DOT_COLORS[mr.pipeline as PipelineStatus],
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-3)" }}>
          {formatAge(mr.created_at)}
        </span>
      </div>

      {/* Title — max 2 lines */}
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
        {mr.title}
      </p>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          @{mr.author}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
          <span style={{ color: "oklch(72% 0.18 145)" }}>+{mr.additions}</span>{" "}
          <span style={{ color: "oklch(68% 0.20 25)" }}>-{mr.deletions}</span>
        </span>
      </div>
    </button>
  );
};
