import { useState } from "react";
import { SEVERITY_ORDER, SEV_COLOR } from "../../lib";
import type { CommentFieldPatch } from "../../model";
import type { Comment, CommentSeverity } from "@entities/review";

type PinnedCommentEditorProps = {
  comment: Comment;
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  position: number;
  total: number;
  onUpdate: (id: string, patch: CommentFieldPatch) => void;
  onToggleStatus: (id: string) => void;
  isPending: boolean;
};

export const PinnedCommentEditor = ({
  comment,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  position,
  total,
  onUpdate,
  onToggleStatus,
  isPending,
}: PinnedCommentEditorProps): React.ReactElement => {
  const [body, setBody] = useState(comment.body);
  const [severity, setSeverity] = useState<CommentSeverity>(comment.severity);

  const locationLabel =
    comment.file !== null
      ? `${comment.file.split("/").pop() ?? ""}${comment.line !== null ? `:${String(comment.line)}` : ""}`
      : "General";

  const handleSave = (): void => {
    onUpdate(comment.id, { body, severity });
  };

  return (
    <div
      className="comment-editor"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
            {locationLabel}
          </span>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {position + 1}/{total}
          </span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label="Previous comment"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next comment"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Severity row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--fg-3)",
          }}
        >
          severity
        </span>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeverity(s);
              }}
              className={`sev ${s}`}
              style={{
                opacity: severity === s ? 1 : 0.4,
                cursor: "pointer",
                ...(severity === s
                  ? { background: `color-mix(in oklch, ${SEV_COLOR[s]} 12%, transparent)` }
                  : {}),
              }}
            >
              <span className="dot" />
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
        }}
        style={{
          flex: 1,
          minHeight: 180,
          padding: 12,
          background: "var(--bg-0)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--fg-0)",
          fontFamily: "var(--font-sans)",
          fontSize: 12.5,
          lineHeight: 1.55,
          resize: "vertical",
          outline: "none",
        }}
        aria-label="Edit comment body"
      />

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn ghost"
            disabled={isPending}
            onClick={handleSave}
            style={{ color: "var(--fg-0)" }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onToggleStatus(comment.id);
            }}
            style={{ color: comment.status === "dismissed" ? "var(--fg-0)" : "var(--c-critical)" }}
          >
            {comment.status === "dismissed" ? (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Keep
              </>
            ) : (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
                Dismiss
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
