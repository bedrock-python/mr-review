import { ArrowsIcon, ExternalLinkIcon, HistoryIcon, SyncIcon } from "./MRHeaderIcons";
import type { MR } from "@entities/mr";

const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;

const formatAge = (dateStr: string): string => {
  const diffHours = Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_HOUR);
  if (diffHours < 1) return "just now";
  if (diffHours < HOURS_PER_DAY) return `${String(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
  if (diffDays < DAYS_PER_MONTH) return `${String(diffDays)}d ago`;
  return `${String(Math.floor(diffDays / DAYS_PER_MONTH))}mo ago`;
};

const actionStyle: React.CSSProperties = { padding: "5px 10px", gap: 6 };

export type MRHeaderActionsProps = {
  iterationCount: number;
  onShowHistory: () => void;
  isSyncing: boolean;
  onSync: () => void;
  mrUrl: string;
};

export const MRHeaderActions = ({
  iterationCount,
  onShowHistory,
  isSyncing,
  onSync,
  mrUrl,
}: MRHeaderActionsProps): React.ReactElement => (
  <div style={{ display: "flex", gap: 6, flexShrink: 0, paddingTop: 4 }}>
    {iterationCount > 0 && (
      <button
        type="button"
        className="btn ghost"
        style={actionStyle}
        onClick={onShowHistory}
        title="View iteration history"
      >
        <HistoryIcon />
        History
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--fg-2)",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            padding: "0 5px",
            lineHeight: "1.6",
          }}
        >
          {iterationCount}
        </span>
      </button>
    )}
    <button
      type="button"
      className="btn ghost"
      style={actionStyle}
      onClick={onSync}
      disabled={isSyncing}
      aria-busy={isSyncing}
      title="Drop cached host data and reload this MR"
    >
      <SyncIcon isSpinning={isSyncing} />
      {isSyncing ? "Syncing…" : "Sync"}
    </button>
    {mrUrl ? (
      <a
        href={mrUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn ghost"
        style={{ ...actionStyle, textDecoration: "none" }}
      >
        <ExternalLinkIcon />
        Open
      </a>
    ) : (
      <button type="button" className="btn ghost" style={actionStyle} disabled>
        <ExternalLinkIcon />
        Open
      </button>
    )}
  </div>
);

/** Author · branches · sha · draft. Missing branches (GitHub search) hide the chip. */
export const MRHeaderMeta = ({ mr }: { mr: MR }): React.ReactElement => {
  const sha = (mr as MR & { sha?: string }).sha;
  const hasBranches = mr.source_branch.trim() !== "" || mr.target_branch.trim() !== "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--bg-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "var(--fg-2)",
            border: "1px solid var(--border)",
          }}
        >
          {mr.author.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 12, color: "var(--fg-1)" }}>{mr.author}</span>
        <span style={{ fontSize: 11, color: "var(--fg-2)" }}>{formatAge(mr.created_at)}</span>
      </div>

      {hasBranches && (
        <>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowsIcon />
            {mr.source_branch && (
              <span className="mono" style={{ fontSize: 10 }}>
                {mr.source_branch}
              </span>
            )}
            {mr.target_branch && (
              <>
                <span style={{ color: "var(--fg-2)" }}>→</span>
                <span className="mono" style={{ fontSize: 10 }}>
                  {mr.target_branch}
                </span>
              </>
            )}
          </span>
        </>
      )}

      {sha && (
        <span className="chip mono" style={{ fontSize: 10 }}>
          {sha.slice(0, 8)}
        </span>
      )}

      {mr.draft && (
        <span className="chip" style={{ color: "var(--fg-2)", fontSize: 10 }}>
          DRAFT
        </span>
      )}
    </div>
  );
};
