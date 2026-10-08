import { memo } from "react";

import { useStore } from "zustand";

import { SeverityBadge } from "@entities/review";
import { useStickToBottom } from "@shared/lib";
import { Card, Eyebrow, Markdown, Spinner, StatusBadge } from "@shared/ui";

import { pluralize } from "../model/runOutcome";

import type { DispatchCommentPreview } from "@entities/review";
import type { Status } from "@shared/ui";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchSessionState } from "../model/dispatchSession";
import type { DispatchRunInfo, DispatchRunStatus } from "../model/useDispatchRun";

const STREAMING_LIST_MAX_HEIGHT_PX = 260;
const RAW_VIEW_MAX_HEIGHT_PX = 160;
// Re-laying out a huge <pre> every frame is what makes long runs sluggish, so the
// live view shows only the tail; the full output is available once the run ends.
const RAW_TAIL_CHARS = 4000;

type SessionStore = StoreApi<DispatchSessionState>;

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-3) var(--space-4)",
  borderTop: "1px solid var(--border)",
  fontSize: "var(--fs-control)",
  color: "var(--fg-2)",
};

/* ── Header: the run in one line ────────────────────────────── */
type PanelHeaderProps = {
  store: SessionStore;
  status: DispatchRunStatus;
  run: DispatchRunInfo;
  isOutputUnsaved: boolean;
  needsAttention: boolean;
  actions: React.ReactNode;
};

const doneStatus = (needsAttention: boolean): Status => (needsAttention ? "warning" : "success");

const PanelHeader = memo(
  ({
    store,
    status,
    run,
    isOutputUnsaved,
    needsAttention,
    actions,
  }: PanelHeaderProps): React.ReactElement => {
    const count = useStore(store, (s) => s.comments.length);
    let badge: React.ReactElement;
    if (status === "streaming") {
      badge = (
        <StatusBadge
          status="active"
          isLive
          label={count > 0 ? `${pluralize(count, "comment")}…` : "Generating…"}
        />
      );
    } else if (status === "done") {
      badge = (
        <StatusBadge
          status={doneStatus(needsAttention || isOutputUnsaved)}
          label={isOutputUnsaved ? "Not saved" : "Done"}
        />
      );
    } else if (status === "stopped") {
      badge = <StatusBadge status="neutral" label="Stopped" />;
    } else {
      badge = <StatusBadge status="danger" label="Failed" />;
    }

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          // Room for a small button, so the line keeps its height when Edit appears.
          minHeight: "calc(var(--control-sm) + 2 * var(--space-2))",
          padding: "var(--space-2) var(--space-2) var(--space-2) var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-2)",
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: "var(--fs-control)",
              fontWeight: "var(--fw-medium)",
              color: "var(--fg-0)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {run.providerName}
          </span>
          {run.model && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-meta)",
                color: "var(--fg-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {run.model}
            </span>
          )}
        </div>
        {badge}
        {actions}
      </div>
    );
  }
);
PanelHeader.displayName = "PanelHeader";

/* ── Comment previews ───────────────────────────────────────── */
const CommentPreviewRow = memo(
  ({ comment }: { comment: DispatchCommentPreview }): React.ReactElement => (
    <li
      style={{
        padding: "var(--space-3) var(--space-4)",
        borderTop: "1px solid var(--border)",
        animation: "fadeSlideIn var(--dur-base) var(--ease-out) both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-1)",
          minWidth: 0,
        }}
      >
        <SeverityBadge severity={comment.severity} />
        <span
          style={{
            fontFamily: comment.file ? "var(--font-mono)" : undefined,
            fontSize: "var(--fs-meta)",
            color: "var(--fg-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {comment.file
            ? `${comment.file}${comment.line !== null ? `:${String(comment.line)}` : ""}`
            : "General note"}
        </span>
      </div>
      <Markdown>{comment.body}</Markdown>
    </li>
  )
);
CommentPreviewRow.displayName = "CommentPreviewRow";

type LiveCommentListProps = {
  store: SessionStore;
  status: DispatchRunStatus;
  /** The run saved its answer: an empty list then means the model found nothing to say. */
  isSaved: boolean;
};

const LiveCommentList = memo(
  ({ store, status, isSaved }: LiveCommentListProps): React.ReactElement | null => {
    const comments = useStore(store, (s) => s.comments);
    const isStreaming = status === "streaming";
    const { ref, handleScroll } = useStickToBottom<HTMLDivElement>(comments.length);

    if (comments.length === 0) {
      if (isStreaming) {
        return (
          <div style={rowStyle}>
            <Spinner size="sm" isDecorative />
            Analyzing…
          </div>
        );
      }
      // A failed or unused run is explained by its notice; an empty list would only repeat it.
      return isSaved ? <div style={rowStyle}>The answer had no comments.</div> : null;
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
          {comments.map((comment) => (
            <CommentPreviewRow key={comment.index} comment={comment} />
          ))}
        </ul>
        {isStreaming && (
          <div style={{ ...rowStyle, padding: "var(--space-2) var(--space-4)" }}>
            <Spinner size="sm" isDecorative />
            Writing the next comment…
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
      <div style={{ padding: "var(--space-2) var(--space-4)", background: "var(--bg-2)" }}>
        <Eyebrow>
          Raw output · {isTruncated ? `last ${RAW_TAIL_CHARS.toLocaleString()} of ` : ""}
          {text.length.toLocaleString()} chars
        </Eyebrow>
      </div>
      <pre
        ref={ref}
        onScroll={handleScroll}
        aria-label="Raw model output"
        style={{
          margin: 0,
          padding: "var(--space-2) var(--space-4)",
          maxHeight: RAW_VIEW_MAX_HEIGHT_PX,
          overflowY: "auto",
          background: "var(--bg-0)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-meta)",
          lineHeight: "var(--lh-body)",
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
  /** The finished run was cut off, unreadable or skipped items: amber, not green. */
  needsAttention?: boolean;
  /** Right end of the header: Edit once the run is over. */
  actions?: React.ReactNode;
};

/**
 * Live output of a dispatch run, headed by the run in one line: provider, model, status. Each
 * part subscribes to its own slice of the session store, so a token re-renders only the raw
 * view and a comment only the list — never the settings around the panel.
 */
export const DispatchStreamPanel = memo(
  ({
    store,
    status,
    run,
    isOutputUnsaved = false,
    needsAttention = false,
    actions,
  }: DispatchStreamPanelProps): React.ReactElement => (
    <Card as="section" padding="none" aria-label="Generation output" style={{ overflow: "hidden" }}>
      <PanelHeader
        store={store}
        status={status}
        run={run}
        isOutputUnsaved={isOutputUnsaved}
        needsAttention={needsAttention}
        actions={actions}
      />
      <LiveCommentList
        store={store}
        status={status}
        isSaved={status === "done" && !isOutputUnsaved}
      />
      {/* After a successful run the full stored output is one click away instead. */}
      {status !== "done" && <RawStreamView store={store} />}
    </Card>
  )
);
DispatchStreamPanel.displayName = "DispatchStreamPanel";
