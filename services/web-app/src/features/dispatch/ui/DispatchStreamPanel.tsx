import { memo } from "react";

import { useStore } from "zustand";

import { useStickToBottom } from "@shared/lib";

import type { CommentSeverity, DispatchCommentPreview } from "@entities/review";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchSessionState } from "../model/dispatchSession";

export type DispatchRunStatus = "streaming" | "done" | "stopped" | "error";

export type DispatchRunInfo = {
  providerName: string;
  model: string;
  accentColor: string;
};

const SEVERITY_COLOR: Record<CommentSeverity, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

const STATUS_LABEL: Record<DispatchRunStatus, string> = {
  streaming: "generating…",
  done: "done",
  stopped: "stopped",
  error: "failed",
};

const STATUS_DOT_COLOR: Record<Exclude<DispatchRunStatus, "streaming">, string> = {
  done: "var(--c-add)",
  stopped: "var(--fg-3)",
  error: "var(--c-critical)",
};

const STREAMING_LIST_MAX_HEIGHT_PX = 260;
const RAW_VIEW_MAX_HEIGHT_PX = 160;
// Re-laying out a huge <pre> every frame is what makes long runs sluggish, so the
// live view shows only the tail; the full output is available once the run ends.
const RAW_TAIL_CHARS = 4000;

type SessionStore = StoreApi<DispatchSessionState>;

const PulseDot = ({ color, size }: { color: string; size: number }): React.ReactElement => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
      animation: "pulse-ring 1.2s ease-out infinite",
    }}
  />
);

const Cursor = ({ color }: { color: string }): React.ReactElement => (
  <span style={{ animation: "blink 1s step-end infinite", color }}>▌</span>
);

/* ── Header ─────────────────────────────────────────────────── */
type PanelHeaderProps = {
  store: SessionStore;
  status: DispatchRunStatus;
  run: DispatchRunInfo;
  isOutputUnsaved: boolean;
};

const PanelHeader = memo(
  ({ store, status, run, isOutputUnsaved }: PanelHeaderProps): React.ReactElement => {
    const count = useStore(store, (s) => s.comments.length);
    const isStreaming = status === "streaming";
    const countLabel = `${String(count)} comment${count !== 1 ? "s" : ""}`;
    const doneLabel = isOutputUnsaved ? `${countLabel} · not saved` : countLabel;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {isStreaming ? (
          <PulseDot color={run.accentColor} size={7} />
        ) : (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: STATUS_DOT_COLOR[status],
              flexShrink: 0,
            }}
          />
        )}
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-2)", flex: 1 }}>
          {run.providerName} · {STATUS_LABEL[status]}
        </span>
        {run.model && (
          <span className="mono" style={{ fontSize: 10, color: "var(--fg-2)" }}>
            {run.model}
          </span>
        )}
        <span className="chip" style={{ fontSize: 10 }}>
          {isStreaming ? (count > 0 ? `${countLabel}…` : "parsing…") : doneLabel}
        </span>
      </div>
    );
  }
);
PanelHeader.displayName = "PanelHeader";

/* ── Comment previews ───────────────────────────────────────── */
type CommentPreviewRowProps = {
  comment: DispatchCommentPreview;
  isShaded: boolean;
};

const CommentPreviewRow = memo(
  ({ comment, isShaded }: CommentPreviewRowProps): React.ReactElement => (
    <li
      style={{
        padding: "9px 14px",
        borderBottom: "1px solid var(--border)",
        background: isShaded ? "var(--bg-1)" : "var(--bg-0)",
        animation: "fadeSlideIn 0.18s ease both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 4,
            background: `color-mix(in oklch, ${SEVERITY_COLOR[comment.severity]} 15%, transparent)`,
            color: SEVERITY_COLOR[comment.severity],
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {comment.severity}
        </span>
        {comment.file ? (
          <span
            className="mono"
            style={{
              fontSize: 10.5,
              color: "var(--fg-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {comment.file}
            {comment.line !== null ? `:${String(comment.line)}` : ""}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: "var(--fg-2)" }}>general note</span>
        )}
      </div>
      <div
        style={{ fontSize: 12.5, color: "var(--fg-1)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}
      >
        {comment.body}
      </div>
    </li>
  )
);
CommentPreviewRow.displayName = "CommentPreviewRow";

type LiveCommentListProps = {
  store: SessionStore;
  isStreaming: boolean;
  accentColor: string;
};

const LiveCommentList = memo(
  ({ store, isStreaming, accentColor }: LiveCommentListProps): React.ReactElement => {
    const comments = useStore(store, (s) => s.comments);
    const { ref, handleScroll } = useStickToBottom<HTMLDivElement>(comments.length);

    if (comments.length === 0) {
      return isStreaming ? (
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--fg-2)",
            fontSize: 12,
          }}
        >
          <PulseDot color={accentColor} size={6} />
          Analyzing…
          <Cursor color={accentColor} />
        </div>
      ) : (
        <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--fg-2)" }}>
          No comments were parsed from the response.
        </div>
      );
    }

    return (
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{
          maxHeight: isStreaming ? STREAMING_LIST_MAX_HEIGHT_PX : undefined,
          overflowY: "auto",
        }}
      >
        <ul aria-label="Generated comments" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {comments.map((comment, i) => (
            <CommentPreviewRow key={comment.index} comment={comment} isShaded={i % 2 === 1} />
          ))}
        </ul>
        {isStreaming && (
          <div
            style={{
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--fg-2)",
              fontSize: 11,
            }}
          >
            <PulseDot color={accentColor} size={5} />
            <Cursor color={accentColor} />
          </div>
        )}
      </div>
    );
  }
);
LiveCommentList.displayName = "LiveCommentList";

/* ── Raw stream ─────────────────────────────────────────────── */
const RawStreamView = memo(({ store }: { store: SessionStore }): React.ReactElement | null => {
  const text = useStore(store, (s) => s.text);
  const { ref, handleScroll } = useStickToBottom<HTMLPreElement>(text);

  if (text === "") return null;

  const isTruncated = text.length > RAW_TAIL_CHARS;
  const visibleText = isTruncated ? `…${text.slice(-RAW_TAIL_CHARS)}` : text;

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div
        className="mono"
        style={{
          padding: "6px 14px",
          fontSize: 10,
          color: "var(--fg-2)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          background: "var(--bg-1)",
        }}
      >
        Raw output · {isTruncated ? `last ${RAW_TAIL_CHARS.toLocaleString()} of ` : ""}
        {text.length.toLocaleString()} chars
      </div>
      <pre
        ref={ref}
        onScroll={handleScroll}
        aria-label="Raw model output"
        style={{
          margin: 0,
          padding: "8px 14px",
          maxHeight: RAW_VIEW_MAX_HEIGHT_PX,
          overflowY: "auto",
          background: "var(--bg-0)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {visibleText}
      </pre>
    </div>
  );
});
RawStreamView.displayName = "RawStreamView";

/* ── Panel ──────────────────────────────────────────────────── */
export type DispatchStreamPanelProps = {
  store: SessionStore;
  status: DispatchRunStatus;
  run: DispatchRunInfo;
  /** The run finished but its output was not used, so the comments listed were not saved. */
  isOutputUnsaved?: boolean;
};

/**
 * Live output of a dispatch run. Each part subscribes to its own slice of the
 * session store, so a token re-renders only the raw view and a comment only the
 * list — never the provider and model settings around the panel.
 */
export const DispatchStreamPanel = memo(
  ({
    store,
    status,
    run,
    isOutputUnsaved = false,
  }: DispatchStreamPanelProps): React.ReactElement => (
    <section
      aria-label="Generation output"
      style={{
        borderRadius: 10,
        border: "1px solid var(--border)",
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <PanelHeader store={store} status={status} run={run} isOutputUnsaved={isOutputUnsaved} />
      <LiveCommentList
        store={store}
        isStreaming={status === "streaming"}
        accentColor={run.accentColor}
      />
      {/* After a successful run the full stored output is one click away instead. */}
      {status !== "done" && <RawStreamView store={store} />}
    </section>
  )
);
DispatchStreamPanel.displayName = "DispatchStreamPanel";
