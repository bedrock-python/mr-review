import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, reviewApi, reviewKeys } from "@entities/review";
import type { Comment, CommentSeverity } from "@entities/review";
import { DiffViewer } from "@shared/ui";
import type { DiffLineWithFile } from "@shared/ui";

type ViewMode = "pinned" | "list" | "thread";

const SEVERITY_ORDER: CommentSeverity[] = ["critical", "major", "minor", "suggestion"];

const SEV_COLOR: Record<CommentSeverity, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

// ── CommentEditor (pinned right panel) ───────────────────────────────────────

type CommentEditorProps = {
  comment: Comment;
  onPrev: () => void;
  onNext: () => void;
  position: number;
  total: number;
  onUpdate: (id: string, patch: Partial<Comment>) => void;
  isPending: boolean;
};

const CommentEditor = ({
  comment,
  onPrev,
  onNext,
  position,
  total,
  onUpdate,
  isPending,
}: CommentEditorProps): React.ReactElement => {
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
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous comment">
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
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next comment">
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
              onUpdate(comment.id, {
                status: comment.status === "dismissed" ? "kept" : "dismissed",
              });
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

// ── ReviewDiffViewer ──────────────────────────────────────────────────────────
// Thin wrapper around shared DiffViewer: fetches review diff and renders
// severity-coloured markers for inline comments.

type ReviewDiffViewerProps = {
  reviewId: string;
  targetFile: string | null;
  targetLine: number | null;
  commentsOnLines: Map<number, Comment[]>;
  onCommentClick: (id: string) => void;
};

const ReviewDiffViewer = ({
  reviewId,
  targetFile,
  targetLine,
  commentsOnLines,
  onCommentClick,
}: ReviewDiffViewerProps): React.ReactElement => {
  const { data: rawDiff, isLoading } = useQuery({
    queryKey: ["review-diff", reviewId],
    queryFn: () => reviewApi.getDiff(reviewId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          color: "var(--fg-3)",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
          }}
          className="animate-spin motion-reduce:animate-none"
        />
        <span style={{ fontSize: 12 }}>Loading diff…</span>
      </div>
    );
  }

  return (
    <DiffViewer<Comment>
      diff={rawDiff ?? ""}
      mode="full"
      highlightFile={targetFile}
      highlightLine={targetLine}
      commentsOnLines={commentsOnLines}
      ariaLabel="Review diff"
      renderLineDecoration={({
        line,
        comments,
      }: {
        line: DiffLineWithFile;
        comments: readonly Comment[];
      }) =>
        comments.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              onCommentClick(c.id);
            }}
            title={c.body.slice(0, 80)}
            aria-label={`${c.severity} comment on ${line.file}:${String(line.newLine ?? "")}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: SEV_COLOR[c.severity],
              border: "none",
              cursor: "pointer",
              padding: 0,
              opacity: c.status === "dismissed" ? 0.4 : 1,
            }}
          />
        ))
      }
    />
  );
};

// ── PolishPinned ──────────────────────────────────────────────────────────────

type PolishPinnedProps = {
  reviewId: string;
  comments: Comment[];
  activeCommentId: string | null;
  setActiveCommentId: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Comment>) => void;
  isPending: boolean;
};

const PolishPinned = ({
  reviewId,
  comments,
  activeCommentId,
  setActiveCommentId,
  onUpdate,
  isPending,
}: PolishPinnedProps): React.ReactElement => {
  const inlineComments = comments.filter((c) => c.file !== null && c.status !== "dismissed");
  const generalComments = comments.filter((c) => c.file === null);
  const active = comments.find((c) => c.id === activeCommentId) ?? null;

  // Map new-line → comments for diff markers
  const commentsOnLines = useMemo((): Map<number, Comment[]> => {
    const map = new Map<number, Comment[]>();
    for (const c of comments) {
      if (c.line !== null) {
        const existing = map.get(c.line);
        if (existing) {
          existing.push(c);
        } else {
          map.set(c.line, [c]);
        }
      }
    }
    return map;
  }, [comments]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 380px", flex: 1, overflow: "hidden" }}
      >
        {/* Left: real diff viewer */}
        <div
          style={{
            overflow: "hidden",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* File path header */}
          {active?.file && (
            <div
              style={{
                padding: "6px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-2)",
                flexShrink: 0,
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
                {active.file}
              </span>
              {active.line !== null && (
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 4 }}
                >
                  :{active.line}
                </span>
              )}
            </div>
          )}
          <ReviewDiffViewer
            reviewId={reviewId}
            targetFile={active?.file ?? null}
            targetLine={active?.line ?? null}
            commentsOnLines={commentsOnLines}
            onCommentClick={setActiveCommentId}
          />
        </div>

        {/* Right: comment pane */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
          {active !== null && active.file !== null ? (
            <CommentEditor
              comment={active}
              onPrev={() => {
                const idx = inlineComments.findIndex((c) => c.id === active.id);
                const prev = inlineComments[idx - 1];
                if (idx > 0 && prev) setActiveCommentId(prev.id);
              }}
              onNext={() => {
                const idx = inlineComments.findIndex((c) => c.id === active.id);
                const next = inlineComments[idx + 1];
                if (idx < inlineComments.length - 1 && next) setActiveCommentId(next.id);
              }}
              position={inlineComments.findIndex((c) => c.id === active.id)}
              total={inlineComments.length}
              onUpdate={onUpdate}
              isPending={isPending}
            />
          ) : (
            <div style={{ padding: "20px 16px" }}>
              {/* Comment list for navigation */}
              {inlineComments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--fg-3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 4,
                    }}
                  >
                    Inline comments
                  </div>
                  {inlineComments.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setActiveCommentId(c.id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        background: "var(--bg-2)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: SEV_COLOR[c.severity],
                          flexShrink: 0,
                          marginTop: 3,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="mono"
                          style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 2 }}
                        >
                          {c.file?.split("/").pop()}
                          {c.line !== null ? `:${String(c.line)}` : ""}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--fg-1)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.body}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {inlineComments.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--fg-3)",
                    fontSize: 12,
                    paddingTop: 20,
                  }}
                >
                  No inline comments
                </div>
              )}
            </div>
          )}

          {/* General notes section */}
          {generalComments.length > 0 && (
            <div style={{ padding: 16, borderTop: "1px solid var(--border)", marginTop: "auto" }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--fg-3)",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                General notes
              </div>
              {generalComments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: 12,
                    background: "var(--bg-1)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    marginBottom: 8,
                    opacity: c.status === "dismissed" ? 0.45 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span className={`sev ${c.severity}`}>
                      <span className="dot" />
                      {c.severity}
                    </span>
                    <div style={{ marginLeft: "auto" }}>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          onUpdate(c.id, {
                            status: c.status === "dismissed" ? "kept" : "dismissed",
                          });
                        }}
                      >
                        {c.status === "dismissed" ? (
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
                        ) : (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--fg-1)" }}>
                    {c.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── PolishList ────────────────────────────────────────────────────────────────

type PolishListProps = {
  comments: Comment[];
  onUpdate: (id: string, patch: Partial<Comment>) => void;
  isPending: boolean;
};

const PolishList = ({ comments, onUpdate, isPending }: PolishListProps): React.ReactElement => {
  const [filter, setFilter] = useState<"all" | "kept" | "dismissed">("all");

  const visible = comments.filter((c) => {
    if (filter === "kept") return c.status !== "dismissed";
    if (filter === "dismissed") return c.status === "dismissed";
    return true;
  });

  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%" }}>
      {/* Filter row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {(["all", "kept", "dismissed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
            }}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              background: filter === f ? "var(--bg-3)" : "var(--bg-2)",
              color: filter === f ? "var(--fg-0)" : "var(--fg-2)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              border: `1px solid ${filter === f ? "var(--border-strong)" : "var(--border)"}`,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((c) => (
          <div
            key={c.id}
            style={{
              padding: 14,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              opacity: c.status === "dismissed" ? 0.5 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span className={`sev ${c.severity}`}>
                <span className="dot" />
                {c.severity}
              </span>
              {c.file !== null ? (
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-1)" }}>
                  {c.file}
                  <span style={{ color: "var(--fg-3)" }}>:</span>
                  {c.line}
                </span>
              ) : (
                <span className="chip dim" style={{ fontSize: 10 }}>
                  general
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={isPending}
                  onClick={() => {
                    onUpdate(c.id, { status: c.status === "dismissed" ? "kept" : "dismissed" });
                  }}
                  title={c.status === "dismissed" ? "Keep" : "Dismiss"}
                >
                  {c.status === "dismissed" ? (
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
                  ) : (
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
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--fg-1)",
                whiteSpace: "pre-wrap",
              }}
            >
              {c.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── PolishThread ──────────────────────────────────────────────────────────────

type ThreadGroup = {
  key: string;
  label: string;
  comments: Comment[];
};

type PolishThreadProps = {
  comments: Comment[];
  onUpdate: (id: string, patch: Partial<Comment>) => void;
};

const PolishThread = ({ comments, onUpdate }: PolishThreadProps): React.ReactElement => {
  const groups = useMemo((): ThreadGroup[] => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      const key = c.file ?? "__general__";
      const existing = map.get(key);
      if (existing) {
        existing.push(c);
      } else {
        map.set(key, [c]);
      }
    }
    return Array.from(map.entries()).map(([key, groupComments]) => ({
      key,
      label: key === "__general__" ? "General Notes" : key,
      comments: groupComments,
    }));
  }, [comments]);

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        {groups.flatMap((group) =>
          group.comments.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                gap: 14,
                paddingBottom: 14,
                opacity: c.status === "dismissed" ? 0.45 : 1,
              }}
            >
              {/* Spine */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingTop: 6,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: SEV_COLOR[c.severity],
                  }}
                />
                {i < group.comments.length - 1 && (
                  <div style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 6 }} />
                )}
              </div>

              {/* Bubble */}
              <div
                style={{
                  flex: 1,
                  background: "var(--bg-1)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap" as const,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--accent)",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                    Mr. Reviewer
                  </span>
                  <span className={`sev ${c.severity}`}>
                    <span className="dot" />
                    {c.severity}
                  </span>
                  {c.file !== null && (
                    <span className="mono" style={{ fontSize: 10, color: "var(--fg-2)" }}>
                      {c.file.split("/").pop()}:{c.line}
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ marginLeft: "auto" }}
                    onClick={() => {
                      onUpdate(c.id, { status: c.status === "dismissed" ? "kept" : "dismissed" });
                    }}
                    title={c.status === "dismissed" ? "Keep" : "Dismiss"}
                  >
                    {c.status === "dismissed" ? (
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
                    ) : (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: "var(--fg-1)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {c.body}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ── Main PolishStage ──────────────────────────────────────────────────────────

export const PolishStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const { setStage, activeIterationId } = useStageBarStore();
  const { data: review, isLoading } = useReview(activeReviewId);

  const activeIteration =
    review?.iterations.find((it) => it.id === activeIterationId) ??
    review?.iterations[review.iterations.length - 1] ??
    null;

  const qc = useQueryClient();
  const updateComments = useMutation({
    mutationFn: (comments: Comment[]) => {
      if (!activeReviewId) throw new Error("No active review");
      return reviewApi.update(activeReviewId, {
        ...(activeIterationId ? { iteration_id: activeIterationId } : {}),
        iteration_comments: comments.map((c) => ({
          id: c.id,
          status: c.status,
          body: c.body,
          severity: c.severity,
          resolved: c.resolved,
        })),
      });
    },
    onError: (err: Error) => {
      toast.error("Failed to save comments", { description: err.message });
    },
    onSuccess: (updated) => {
      if (activeReviewId) {
        qc.setQueryData(reviewKeys.detail(activeReviewId), updated);
      }
    },
  });

  const [viewMode, setViewMode] = useState<ViewMode>("pinned");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const handleUpdate = (id: string, patch: Partial<Comment>): void => {
    if (!activeIteration) return;
    const updatedComments = activeIteration.comments.map((c) =>
      c.id === id ? { ...c, ...patch } : c
    );
    updateComments.mutate(updatedComments);
  };

  const handleAdvance = (): void => {
    setStage("post");
  };

  if (activeReviewId === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--fg-3)",
          fontSize: 13,
        }}
      >
        No active review. Go back to Pick to select a merge request.
      </div>
    );
  }

  if (isLoading || review === undefined) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 10,
          color: "var(--fg-3)",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
          }}
          className="animate-spin"
        />
        <span style={{ fontSize: 13 }}>Loading review…</span>
      </div>
    );
  }

  const comments = activeIteration?.comments ?? [];

  if (comments.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          color: "var(--fg-3)",
        }}
      >
        <p style={{ fontSize: 13 }}>No comments generated. Go back to Dispatch and try again.</p>
      </div>
    );
  }

  // Severity counts for toolbar chips
  type SevCounts = {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    dismissed: number;
  };
  const counts = comments.reduce<SevCounts>(
    (acc, c) => {
      if (c.status === "dismissed") {
        return { ...acc, dismissed: acc.dismissed + 1 };
      }
      return { ...acc, [c.severity]: acc[c.severity] + 1 };
    },
    { critical: 0, major: 0, minor: 0, suggestion: 0, dismissed: 0 }
  );

  const activeId = activeCommentId ?? comments[0]?.id ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
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
        {/* Severity summary chips */}
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {SEVERITY_ORDER.map((s) =>
            counts[s] > 0 ? (
              <span key={s} className={`sev ${s}`}>
                <span className="dot" />
                {counts[s]} {s}
              </span>
            ) : null
          )}
          {counts.dismissed > 0 && (
            <span className="chip" style={{ color: "var(--fg-3)" }}>
              {counts.dismissed} dismissed
            </span>
          )}
          {updateComments.isPending && (
            <span className="chip" style={{ color: "var(--fg-3)" }}>
              saving…
            </span>
          )}
        </div>

        {/* View toggle */}
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
          {(
            [
              { id: "pinned" as const, label: "Diff + pins" },
              { id: "list" as const, label: "List" },
              { id: "thread" as const, label: "Thread" },
            ] as { id: ViewMode; label: string }[]
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setViewMode(v.id);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 5,
                color: viewMode === v.id ? "var(--fg-0)" : "var(--fg-2)",
                background: viewMode === v.id ? "var(--bg-0)" : "transparent",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              aria-pressed={viewMode === v.id}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button type="button" className="btn primary" onClick={handleAdvance}>
          Continue to post
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {viewMode === "pinned" && (
          <PolishPinned
            reviewId={activeReviewId}
            comments={comments}
            activeCommentId={activeId}
            setActiveCommentId={setActiveCommentId}
            onUpdate={handleUpdate}
            isPending={updateComments.isPending}
          />
        )}
        {viewMode === "list" && (
          <PolishList
            comments={comments}
            onUpdate={handleUpdate}
            isPending={updateComments.isPending}
          />
        )}
        {viewMode === "thread" && <PolishThread comments={comments} onUpdate={handleUpdate} />}
      </div>
    </div>
  );
};
