import { useMemo } from "react";
import { SEV_COLOR } from "../../lib";
import { PinnedCommentEditor } from "./PinnedCommentEditor";
import { ReviewDiffViewer } from "./ReviewDiffViewer";
import type { CommentFieldPatch } from "../../model";
import type { Comment } from "@entities/review";

export type PolishPinnedProps = {
  reviewId: string;
  comments: Comment[];
  activeCommentId: string | null;
  setActiveCommentId: (id: string) => void;
  onUpdate: (id: string, patch: CommentFieldPatch) => void;
  onToggleStatus: (id: string) => void;
  isPending: boolean;
};

export const PolishPinned = ({
  reviewId,
  comments,
  activeCommentId,
  setActiveCommentId,
  onUpdate,
  onToggleStatus,
  isPending,
}: PolishPinnedProps): React.ReactElement => {
  const inlineComments = comments.filter((c) => c.file !== null && c.status !== "dismissed");
  const generalComments = comments.filter((c) => c.file === null);
  const active = comments.find((c) => c.id === activeCommentId) ?? null;

  // Navigation spans every inline comment, dismissed ones included: dismissing the
  // open comment must not drop it out of the sequence and strand the arrows.
  const navComments = comments.filter((c) => c.file !== null);
  const activeIndex = active === null ? -1 : navComments.findIndex((c) => c.id === active.id);
  const prevComment = activeIndex > 0 ? navComments[activeIndex - 1] : undefined;
  const nextComment = activeIndex >= 0 ? navComments[activeIndex + 1] : undefined;

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
            activeCommentId={activeCommentId}
            commentsOnLines={commentsOnLines}
            onCommentClick={setActiveCommentId}
          />
        </div>

        {/* Right: comment pane */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
          {active !== null && active.file !== null ? (
            <PinnedCommentEditor
              // Remount per comment: body/severity live in local state, so without a
              // fresh instance the editor keeps showing (and saving) the previous one.
              key={active.id}
              comment={active}
              onPrev={() => {
                if (prevComment) setActiveCommentId(prevComment.id);
              }}
              onNext={() => {
                if (nextComment) setActiveCommentId(nextComment.id);
              }}
              canGoPrev={prevComment !== undefined}
              canGoNext={nextComment !== undefined}
              position={activeIndex}
              total={navComments.length}
              onUpdate={onUpdate}
              onToggleStatus={onToggleStatus}
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
                          onToggleStatus(c.id);
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
