import { useEffect } from "react";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { useReview } from "@entities/review";
import type { Iteration, IterationStage } from "@entities/review";

/* ── Icons ─────────────────────────────────────────────────────────────── */
const CloseIcon = (): React.ReactElement => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ── Constants ──────────────────────────────────────────────────────────── */
const STAGE_META: Record<IterationStage, { label: string; color: string; bg: string }> = {
  brief: {
    label: "Brief",
    color: "var(--fg-2)",
    bg: "color-mix(in oklch, var(--fg-2) 10%, var(--bg-2))",
  },
  dispatch: {
    label: "Dispatching",
    color: "var(--c-major)",
    bg: "color-mix(in oklch, var(--c-major) 10%, var(--bg-2))",
  },
  polish: {
    label: "Polishing",
    color: "var(--accent)",
    bg: "color-mix(in oklch, var(--accent) 10%, var(--bg-2))",
  },
  post: {
    label: "Posted",
    color: "var(--c-add, #3fb950)",
    bg: "color-mix(in oklch, var(--c-add, #3fb950) 10%, var(--bg-2))",
  },
};

const SEV_COLORS: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
const formatRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${String(days)}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/* ── IterationCard ──────────────────────────────────────────────────────── */
type IterationCardProps = {
  iteration: Iteration;
  isActive: boolean;
  onClick: () => void;
};

const IterationCard = ({
  iteration,
  isActive,
  onClick,
}: IterationCardProps): React.ReactElement => {
  const meta = STAGE_META[iteration.stage];
  const completedAt = iteration.completed_at;
  const isCompleted = completedAt !== null;
  const keptComments = iteration.comments.filter((c) => c.status === "kept");
  const sevCounts: Record<string, number> = {};
  for (const c of keptComments) {
    sevCounts[c.severity] = (sevCounts[c.severity] ?? 0) + 1;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "12px 16px",
        background: isActive ? "color-mix(in oklch, var(--accent) 8%, var(--bg-1))" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        position: "relative",
        transition: "background 0.1s",
      }}
    >
      {/* Active indicator */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 32,
            background: "var(--accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}

      {/* Number badge */}
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isActive
            ? "var(--accent)"
            : "color-mix(in oklch, var(--fg-3) 12%, var(--bg-2))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color: isActive ? "var(--accent-ink)" : "var(--fg-2)",
          marginTop: 1,
        }}
      >
        {iteration.number}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Stage + status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: meta.color,
              background: meta.bg,
              padding: "1px 6px",
              borderRadius: 999,
            }}
          >
            {meta.label}
          </span>

          {!isCompleted && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "inline-block",
                  animation: "pulse-ring-centered 1.5s ease-out infinite",
                  opacity: 0.8,
                }}
              />
              in progress
            </span>
          )}

          {isCompleted && completedAt && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--fg-3)",
              }}
            >
              {formatRelative(completedAt)}
            </span>
          )}
        </div>

        {/* Model */}
        {iteration.model && (
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              marginBottom: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {iteration.model}
          </div>
        )}

        {/* Started time */}
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--fg-3)",
            marginBottom: keptComments.length > 0 ? 5 : 0,
          }}
        >
          Started {formatRelative(iteration.created_at)}
        </div>

        {/* Comment severity breakdown */}
        {keptComments.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
              {keptComments.length} comment{keptComments.length !== 1 ? "s" : ""}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {(["critical", "major", "minor", "suggestion"] as const).map((sev) => {
                const n = sevCounts[sev];
                if (!n) return null;
                return (
                  <span
                    key={sev}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: SEV_COLORS[sev],
                    }}
                  >
                    <span
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: SEV_COLORS[sev],
                        display: "inline-block",
                      }}
                    />
                    {n}
                  </span>
                );
              })}
            </span>
          </div>
        )}
      </div>
    </button>
  );
};

/* ── IterationHistoryPanel ──────────────────────────────────────────────── */
export type IterationHistoryPanelProps = {
  activeIterationId: string | null;
  onIterationSelect: (iterationId: string, stage: IterationStage) => void;
};

export const IterationHistoryPanel = ({
  activeIterationId,
  onIterationSelect,
}: IterationHistoryPanelProps): React.ReactElement => {
  const { iterationHistoryOpen, setIterationHistoryOpen } = useAppStore();
  const { activeReviewId } = useNav();
  const { data: review } = useReview(activeReviewId);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && iterationHistoryOpen) {
        setIterationHistoryOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [iterationHistoryOpen, setIterationHistoryOpen]);

  const handleIterationClick = (iteration: Iteration): void => {
    onIterationSelect(iteration.id, iteration.stage);
    setIterationHistoryOpen(false);
  };

  const iterations = review?.iterations ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => {
          setIterationHistoryOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.35)",
          opacity: iterationHistoryOpen ? 1 : 0,
          pointerEvents: iterationHistoryOpen ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Iteration history"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: 320,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-1)",
          borderLeft: "1px solid var(--border)",
          transform: iterationHistoryOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: iterationHistoryOpen ? "-8px 0 32px rgba(0,0,0,0.3)" : "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            height: 48,
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", flex: 1 }}>
            Iterations
          </span>

          {iterations.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--fg-3)",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "1px 6px",
              }}
            >
              {iterations.length}
            </span>
          )}

          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setIterationHistoryOpen(false);
            }}
            title="Close (Esc)"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Empty state */}
        {iterations.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: 8,
              color: "var(--fg-3)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity={0.35}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)" }}>No iterations yet</p>
          </div>
        )}

        {/* Iteration list (newest first) */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {[...iterations].reverse().map((iteration) => (
            <IterationCard
              key={iteration.id}
              iteration={iteration}
              isActive={iteration.id === activeIterationId}
              onClick={() => {
                handleIterationClick(iteration);
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
};
