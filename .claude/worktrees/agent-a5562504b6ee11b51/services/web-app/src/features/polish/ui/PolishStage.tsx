import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@app/providers";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, reviewApi, reviewKeys } from "@entities/review";
import type { Comment, CommentSeverity } from "@entities/review";
import { cn } from "@shared/lib";

// ── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "pinned" | "thread";

type EditState = {
  id: string;
  body: string;
  severity: CommentSeverity;
};

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: CommentSeverity[] = ["critical", "major", "minor", "suggestion"];

const SEVERITY_BADGE: Record<CommentSeverity, string> = {
  critical: "bg-red-900/40 text-red-300 border border-red-700/50",
  major: "bg-orange-900/40 text-orange-300 border border-orange-700/50",
  minor: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50",
  suggestion: "bg-blue-900/40 text-blue-300 border border-blue-700/50",
};

const SeverityBadge = ({ severity }: { severity: CommentSeverity }): React.ReactElement => (
  <span
    className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider",
      SEVERITY_BADGE[severity],
    )}
  >
    {severity}
  </span>
);

// ── Comment Card ─────────────────────────────────────────────────────────────

type CommentCardProps = {
  comment: Comment;
  isEditing: boolean;
  editState: EditState | null;
  isPending: boolean;
  onEdit: (comment: Comment) => void;
  onEditChange: (patch: Partial<EditState>) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onToggleStatus: (id: string, status: "kept" | "dismissed") => void;
  isSelected?: boolean;
  onSelect?: (comment: Comment) => void;
  compact?: boolean;
};

const CommentCard = ({
  comment,
  isEditing,
  editState,
  isPending,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onToggleStatus,
  isSelected = false,
  onSelect,
  compact = false,
}: CommentCardProps): React.ReactElement => {
  const isDismissed = comment.status === "dismissed";

  const locationLabel =
    comment.file !== null
      ? `${comment.file}${comment.line !== null ? `:${comment.line}` : ""}`
      : "General";

  return (
    <div
      className={cn(
        "rounded border transition-colors",
        isDismissed ? "opacity-50 border-border/50 bg-surface/50" : "border-border bg-surface",
        isSelected && "ring-1 ring-[var(--accent)]",
        onSelect && "cursor-pointer",
      )}
      onClick={onSelect ? () => onSelect(comment) : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(comment);
              }
            }
          : undefined
      }
      aria-label={onSelect ? `Select comment: ${comment.body.slice(0, 60)}` : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <SeverityBadge severity={comment.severity} />
        <span className="font-mono text-[11px] text-text-muted truncate flex-1" title={locationLabel}>
          {locationLabel}
        </span>
        {!compact && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              aria-label="Edit comment"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(comment);
              }}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded transition-colors",
                "text-text-muted hover:text-text bg-transparent hover:bg-surface-2",
                isEditing && "text-[var(--accent)]",
              )}
            >
              Edit
            </button>
            <button
              type="button"
              aria-label="Keep comment"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus(comment.id, "kept");
              }}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded transition-colors",
                comment.status === "kept"
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "text-text-muted hover:text-text bg-transparent hover:bg-surface-2",
              )}
            >
              Keep
            </button>
            <button
              type="button"
              aria-label="Dismiss comment"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus(comment.id, "dismissed");
              }}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded transition-colors",
                comment.status === "dismissed"
                  ? "bg-red-900/30 text-red-400"
                  : "text-text-muted hover:text-text bg-transparent hover:bg-surface-2",
              )}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Body / Edit form */}
      {isEditing && editState !== null ? (
        <div
          className="p-3 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {/* Severity selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {SEVERITY_ORDER.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer text-[11px]",
                  "transition-colors",
                  editState.severity === s
                    ? SEVERITY_BADGE[s]
                    : "border-border/40 text-text-muted hover:border-border",
                )}
              >
                <input
                  type="radio"
                  name={`severity-${comment.id}`}
                  value={s}
                  checked={editState.severity === s}
                  onChange={() => onEditChange({ severity: s })}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
          {/* Body textarea */}
          <textarea
            className={cn(
              "w-full rounded border border-border bg-bg text-text text-sm",
              "p-2 resize-y font-mono min-h-[80px] focus:outline-none focus:border-[var(--accent)]",
            )}
            value={editState.body}
            onChange={(e) => onEditChange({ body: e.target.value })}
            aria-label="Edit comment body"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={onEditSave}
              className="px-3 py-1 text-xs rounded bg-[var(--accent)] text-[rgb(var(--accent-fg))] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onEditCancel}
              className="px-3 py-1 text-xs rounded bg-surface border border-border text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "px-3 py-2 text-sm",
            isDismissed && "line-through text-text-muted",
          )}
        >
          <pre className="whitespace-pre-wrap font-sans leading-relaxed m-0">{comment.body}</pre>
        </div>
      )}
    </div>
  );
};

// ── Pinned right-side edit panel ──────────────────────────────────────────────

type PinnedEditPanelProps = {
  comment: Comment;
  isPending: boolean;
  onSave: (patch: { body: string; severity: CommentSeverity }) => void;
};

const PinnedEditPanel = ({
  comment,
  isPending,
  onSave,
}: PinnedEditPanelProps): React.ReactElement => {
  const [body, setBody] = useState(comment.body);
  const [severity, setSeverity] = useState<CommentSeverity>(comment.severity);

  // Reset when comment changes
  const commentId = comment.id;
  useMemo(() => {
    setBody(comment.body);
    setSeverity(comment.severity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentId]);

  const locationLabel =
    comment.file !== null
      ? `${comment.file}${comment.line !== null ? `:${comment.line}` : ""}`
      : "General";

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      <div>
        <p className="text-[11px] font-mono text-text-muted mb-1">{locationLabel}</p>
        <p className="text-xs text-text-muted">Editing comment</p>
      </div>

      {/* Severity */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">
          Severity
        </span>
        <div className="flex flex-wrap gap-2">
          {SEVERITY_ORDER.map((s) => (
            <label
              key={s}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded border cursor-pointer text-[11px]",
                "transition-colors",
                severity === s
                  ? SEVERITY_BADGE[s]
                  : "border-border/40 text-text-muted hover:border-border",
              )}
            >
              <input
                type="radio"
                name="pinned-severity"
                value={s}
                checked={severity === s}
                onChange={() => setSeverity(s)}
                className="sr-only"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 flex-1">
        <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">Body</span>
        <textarea
          className={cn(
            "w-full flex-1 rounded border border-border bg-bg text-text text-sm",
            "p-2 resize-none font-mono focus:outline-none focus:border-[var(--accent)]",
            "min-h-[200px]",
          )}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Edit comment body"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onSave({ body, severity })}
          className="px-4 py-1.5 text-sm rounded bg-[var(--accent)] text-[rgb(var(--accent-fg))] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setBody(comment.body);
            setSeverity(comment.severity);
          }}
          className="px-4 py-1.5 text-sm rounded bg-surface border border-border text-text-muted hover:text-text transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

// ── View: List ────────────────────────────────────────────────────────────────

type ListViewProps = {
  comments: Comment[];
  editState: EditState | null;
  isPending: boolean;
  onEdit: (comment: Comment) => void;
  onEditChange: (patch: Partial<EditState>) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onToggleStatus: (id: string, status: "kept" | "dismissed") => void;
};

const ListView = ({
  comments,
  editState,
  isPending,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onToggleStatus,
}: ListViewProps): React.ReactElement => (
  <div className="flex flex-col gap-2 p-4">
    {comments.map((comment) => (
      <CommentCard
        key={comment.id}
        comment={comment}
        isEditing={editState?.id === comment.id}
        editState={editState?.id === comment.id ? editState : null}
        isPending={isPending}
        onEdit={onEdit}
        onEditChange={onEditChange}
        onEditSave={onEditSave}
        onEditCancel={onEditCancel}
        onToggleStatus={onToggleStatus}
      />
    ))}
  </div>
);

// ── View: Pinned ──────────────────────────────────────────────────────────────

type PinnedViewProps = {
  comments: Comment[];
  selectedId: string | null;
  isPending: boolean;
  onSelect: (comment: Comment) => void;
  onSave: (id: string, patch: { body: string; severity: CommentSeverity }) => void;
  onToggleStatus: (id: string, status: "kept" | "dismissed") => void;
};

const PinnedView = ({
  comments,
  selectedId,
  isPending,
  onSelect,
  onSave,
  onToggleStatus,
}: PinnedViewProps): React.ReactElement => {
  const selectedComment = comments.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: narrow list */}
      <div className="w-64 flex-shrink-0 border-r border-border overflow-auto flex flex-col gap-1.5 p-2">
        {comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            isEditing={false}
            editState={null}
            isPending={isPending}
            onEdit={() => onSelect(comment)}
            onEditChange={() => undefined}
            onEditSave={() => undefined}
            onEditCancel={() => undefined}
            onToggleStatus={onToggleStatus}
            isSelected={comment.id === selectedId}
            onSelect={onSelect}
            compact
          />
        ))}
      </div>

      {/* Right: edit panel */}
      <div className="flex-1 overflow-auto bg-bg/40">
        {selectedComment !== null ? (
          <PinnedEditPanel
            key={selectedComment.id}
            comment={selectedComment}
            isPending={isPending}
            onSave={(patch) => onSave(selectedComment.id, patch)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Select a comment to edit
          </div>
        )}
      </div>
    </div>
  );
};

// ── View: Thread ──────────────────────────────────────────────────────────────

type ThreadViewProps = {
  comments: Comment[];
  editState: EditState | null;
  isPending: boolean;
  onEdit: (comment: Comment) => void;
  onEditChange: (patch: Partial<EditState>) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onToggleStatus: (id: string, status: "kept" | "dismissed") => void;
};

type ThreadGroup = {
  key: string;
  label: string;
  comments: Comment[];
};

const ThreadView = ({
  comments,
  editState,
  isPending,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onToggleStatus,
}: ThreadViewProps): React.ReactElement => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo((): ThreadGroup[] => {
    const map = new Map<string, Comment[]>();
    for (const comment of comments) {
      const key = comment.file ?? "__general__";
      const existing = map.get(key);
      if (existing) {
        existing.push(comment);
      } else {
        map.set(key, [comment]);
      }
    }
    return Array.from(map.entries()).map(([key, groupComments]) => ({
      key,
      label: key === "__general__" ? "General Notes" : key,
      comments: groupComments,
    }));
  }, [comments]);

  const toggleGroup = (key: string): void => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] === true;
        return (
          <div key={group.key} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-surface transition-colors"
              aria-expanded={!isCollapsed}
            >
              <span className="text-[var(--accent)] font-mono text-xs w-3">
                {isCollapsed ? "▶" : "▼"}
              </span>
              <span className="font-mono text-xs text-text truncate flex-1" title={group.label}>
                {group.label}
              </span>
              <span className="text-[11px] text-text-muted ml-auto flex-shrink-0">
                {group.comments.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="flex flex-col gap-2 ml-5 mt-1">
                {group.comments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    isEditing={editState?.id === comment.id}
                    editState={editState?.id === comment.id ? editState : null}
                    isPending={isPending}
                    onEdit={onEdit}
                    onEditChange={onEditChange}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    onToggleStatus={onToggleStatus}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Main PolishStage ──────────────────────────────────────────────────────────

export const PolishStage = (): React.ReactElement => {
  const { activeReviewId } = useAppStore();
  const { setStage } = useStageBarStore();
  const { data: review, isLoading } = useReview(activeReviewId);

  const qc = useQueryClient();
  const updateComments = useMutation({
    mutationFn: (comments: Comment[]) => {
      if (!activeReviewId) throw new Error("No active review");
      return reviewApi.update(activeReviewId, { comments });
    },
    onSuccess: (updated) => {
      if (activeReviewId) {
        qc.setQueryData(reviewKeys.detail(activeReviewId), updated);
      }
    },
  });

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [pinnedSelectedId, setPinnedSelectedId] = useState<string | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleEdit = (comment: Comment): void => {
    setEditState({ id: comment.id, body: comment.body, severity: comment.severity });
  };

  const handleEditChange = (patch: Partial<EditState>): void => {
    setEditState((prev) => (prev !== null ? { ...prev, ...patch } : null));
  };

  const handleEditSave = (): void => {
    if (editState === null || !review) return;
    const updatedComments = review.comments.map((c) =>
      c.id === editState.id ? { ...c, body: editState.body, severity: editState.severity } : c,
    );
    updateComments.mutate(updatedComments, {
      onSuccess: () => setEditState(null),
    });
  };

  const handleEditCancel = (): void => {
    setEditState(null);
  };

  const handleToggleStatus = (commentId: string, status: "kept" | "dismissed"): void => {
    if (!review) return;
    const updatedComments = review.comments.map((c) =>
      c.id === commentId ? { ...c, status } : c,
    );
    updateComments.mutate(updatedComments);
  };

  const handlePinnedSave = (
    id: string,
    patch: { body: string; severity: CommentSeverity },
  ): void => {
    if (!review) return;
    const updatedComments = review.comments.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    updateComments.mutate(updatedComments);
  };

  const handlePinnedSelect = (comment: Comment): void => {
    setPinnedSelectedId(comment.id);
  };

  const handleAdvance = (): void => {
    setStage("post");
  };

  // ── Loading / no review ──────────────────────────────────────────────────────

  if (activeReviewId === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <p className="text-sm">No active review. Go back to Pick to select a merge request.</p>
      </div>
    );
  }

  if (isLoading || review === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading review…
      </div>
    );
  }

  if (review.comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <p className="text-sm">
          No comments generated. Go back to Dispatch and try again.
        </p>
      </div>
    );
  }

  const keptCount = review.comments.filter((c) => c.status === "kept").length;
  const totalCount = review.comments.length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
        {/* View mode switcher */}
        <div
          className="flex items-center border border-border rounded overflow-hidden text-[11px] font-mono"
          role="group"
          aria-label="View mode"
        >
          {(["list", "pinned", "thread"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1 transition-colors uppercase tracking-wider",
                viewMode === mode
                  ? "bg-[var(--accent)] text-[rgb(var(--accent-fg))] font-semibold"
                  : "text-text-muted hover:text-text hover:bg-surface-2",
              )}
              aria-pressed={viewMode === mode}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Comment count */}
        <span className="text-xs text-text-muted">
          <span className="text-[var(--accent)] font-semibold font-mono">{keptCount}</span>
          <span className="mx-1">/</span>
          <span className="font-mono">{totalCount}</span>
          <span className="ml-1">kept</span>
        </span>

        {/* Pending spinner */}
        {updateComments.isPending && (
          <span className="text-xs text-text-muted animate-pulse ml-1">saving…</span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Advance button */}
        <button
          type="button"
          onClick={handleAdvance}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded bg-[var(--accent)] text-[rgb(var(--accent-fg))] font-semibold hover:opacity-90 transition-opacity"
        >
          Post
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        {viewMode === "list" && (
          <ListView
            comments={review.comments}
            editState={editState}
            isPending={updateComments.isPending}
            onEdit={handleEdit}
            onEditChange={handleEditChange}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
            onToggleStatus={handleToggleStatus}
          />
        )}
        {viewMode === "pinned" && (
          <PinnedView
            comments={review.comments}
            selectedId={pinnedSelectedId}
            isPending={updateComments.isPending}
            onSelect={handlePinnedSelect}
            onSave={handlePinnedSave}
            onToggleStatus={handleToggleStatus}
          />
        )}
        {viewMode === "thread" && (
          <ThreadView
            comments={review.comments}
            editState={editState}
            isPending={updateComments.isPending}
            onEdit={handleEdit}
            onEditChange={handleEditChange}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </div>
    </div>
  );
};
