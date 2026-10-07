import { useMemo } from "react";
import { SEVERITY_ORDER, countBySeverity } from "../lib";
import type { PolishViewMode } from "../model";
import type { Comment } from "@entities/review";

type PolishToolbarProps = {
  comments: readonly Comment[];
  isSaving: boolean;
  viewMode: PolishViewMode;
  onViewModeChange: (mode: PolishViewMode) => void;
  onContinue: () => void;
};

const VIEW_MODES: { id: PolishViewMode; label: string }[] = [
  { id: "list", label: "List" },
  { id: "pinned", label: "Diff + pins" },
  { id: "thread", label: "Thread" },
];

export const PolishToolbar = ({
  comments,
  isSaving,
  viewMode,
  onViewModeChange,
  onContinue,
}: PolishToolbarProps): React.ReactElement => {
  const kept = useMemo(() => comments.filter((c) => c.status !== "dismissed"), [comments]);
  const keptBySeverity = useMemo(() => countBySeverity(kept), [kept]);
  const dismissedCount = comments.length - kept.length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        flexShrink: 0,
      }}
    >
      {/* What will be posted: kept comments per severity, then the kept/dismissed split. */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
        role="status"
        aria-label="Comment summary"
      >
        {SEVERITY_ORDER.map((s) =>
          keptBySeverity[s] > 0 ? (
            <span key={s} className={`sev ${s}`}>
              <span className="dot" />
              {keptBySeverity[s]} {s}
            </span>
          ) : null
        )}
        <span className="chip">{kept.length} kept</span>
        {dismissedCount > 0 && (
          <span className="chip" style={{ color: "var(--fg-3)" }}>
            {dismissedCount} dismissed
          </span>
        )}
        {isSaving && (
          <span className="chip" style={{ color: "var(--fg-3)" }}>
            saving…
          </span>
        )}
      </div>

      <div
        style={{
          display: "inline-flex",
          gap: 2,
          padding: 2,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 7,
        }}
        role="group"
        aria-label="View mode"
      >
        {VIEW_MODES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              onViewModeChange(v.id);
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 5,
              color: viewMode === v.id ? "var(--fg-0)" : "var(--fg-2)",
              background: viewMode === v.id ? "var(--bg-0)" : "transparent",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            aria-pressed={viewMode === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <button type="button" className="btn primary" onClick={onContinue}>
        Continue to post
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </div>
  );
};
