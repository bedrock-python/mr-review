import { useMemo } from "react";
import { SEV_COLOR } from "../../lib";
import type { Comment } from "@entities/review";

type ThreadGroup = {
  key: string;
  label: string;
  comments: Comment[];
};

export type PolishThreadProps = {
  comments: Comment[];
  onToggleStatus: (id: string) => void;
};

export const PolishThread = ({
  comments,
  onToggleStatus,
}: PolishThreadProps): React.ReactElement => {
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
                      onToggleStatus(c.id);
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
