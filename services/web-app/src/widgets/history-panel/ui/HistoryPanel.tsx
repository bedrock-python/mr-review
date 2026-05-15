import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useReviews, useDeleteReview } from "@entities/review";
import { useHosts } from "@entities/host";
import { useAppStore } from "@app/store";
import type { Review } from "@entities/review";

/* ── Icons ──────────────────────────────────────────────────────────── */
const CloseIcon = (): React.ReactElement => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SearchIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ClockIcon = (): React.ReactElement => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ChevronRight = (): React.ReactElement => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const TrashIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

/* ── Constants ──────────────────────────────────────────────────────── */
const STAGE_META: Record<string, { label: string; color: string }> = {
  pick: { label: "Picking", color: "var(--fg-3)" },
  brief: { label: "Brief", color: "var(--fg-2)" },
  dispatch: { label: "Dispatching", color: "var(--c-major)" },
  polish: { label: "Polishing", color: "var(--accent)" },
  post: { label: "Posted", color: "var(--c-add, #3fb950)" },
};

const SEV_COLORS: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
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

/* ── ReviewItem ─────────────────────────────────────────────────────── */
type ReviewItemProps = {
  review: Review;
  hostName: string;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

const ReviewItem = ({
  review,
  hostName,
  isActive,
  onOpen,
  onDelete,
}: ReviewItemProps): React.ReactElement => {
  const [hovered, setHovered] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);

  const keptComments = review.comments.filter((c) => c.status === "kept");
  const sevCounts: Record<string, number> = {};
  for (const c of keptComments) {
    sevCounts[c.severity] = (sevCounts[c.severity] ?? 0) + 1;
  }

  const stageMeta = STAGE_META[review.stage] ?? { label: review.stage, color: "var(--fg-2)" };

  const bg = isActive ? "var(--bg-3)" : hovered ? "var(--bg-hover)" : "transparent";

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 14px",
        background: bg,
        border: "none",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.1s",
        color: "inherit",
        position: "relative",
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
            height: 28,
            background: "var(--accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: repo + MR iid */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 4,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--fg-0)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {review.repo_path.split("/").pop() ?? review.repo_path}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              flexShrink: 0,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "0 4px",
            }}
          >
            !{review.mr_iid}
          </span>
        </div>

        {/* Bottom row: meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10,
              color: "var(--fg-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <ClockIcon />
            {formatRelative(review.created_at)}
          </span>

          {/* Stage */}
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: stageMeta.color,
              fontWeight: 500,
            }}
          >
            {stageMeta.label}
          </span>

          {/* Severity dots */}
          {keptComments.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginLeft: "auto",
              }}
            >
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
          )}
        </div>

        {/* Host label (small, dimmed) */}
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-3)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hostName}
        </div>
      </div>

      {/* Right side: delete button (hover) or arrow */}
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        {hovered ? (
          <span
            role="button"
            aria-label="Delete review"
            onMouseEnter={() => {
              setDeleteHovered(true);
            }}
            onMouseLeave={() => {
              setDeleteHovered(false);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 4,
              background: deleteHovered
                ? "color-mix(in oklch, var(--c-critical) 15%, transparent)"
                : "transparent",
              color: deleteHovered ? "var(--c-critical)" : "var(--fg-3)",
              cursor: "pointer",
              transition: "all 0.1s",
            }}
          >
            <TrashIcon />
          </span>
        ) : (
          <span style={{ color: "var(--fg-3)", transition: "color 0.1s" }}>
            <ChevronRight />
          </span>
        )}
      </span>
    </button>
  );
};

/* ── GroupLabel ─────────────────────────────────────────────────────── */
type GroupLabelProps = { label: string; count: number };

const GroupLabel = ({ label, count }: GroupLabelProps): React.ReactElement => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px 4px",
      background: "var(--bg-0)",
      position: "sticky",
      top: 0,
      zIndex: 1,
      borderBottom: "1px solid var(--border)",
    }}
  >
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--fg-3)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
        minWidth: 0,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        color: "var(--fg-3)",
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        padding: "0 5px",
        flexShrink: 0,
      }}
    >
      {count}
    </span>
  </div>
);

/* ── HistoryPanel ────────────────────────────────────────────────────── */
export const HistoryPanel = (): React.ReactElement => {
  const navigate = useNavigate();
  const { historyOpen, setHistoryOpen } = useAppStore();
  const { data: reviews, isLoading } = useReviews();
  const { data: hosts } = useHosts();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search when panel opens
  useEffect(() => {
    if (historyOpen) {
      setTimeout(() => {
        searchRef.current?.focus();
      }, 150);
    } else {
      setTimeout(() => {
        setSearch("");
        setStageFilter(null);
      }, 0);
    }
  }, [historyOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && historyOpen) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [historyOpen, setHistoryOpen]);

  const hostMap = useMemo(() => new Map(hosts?.map((h) => [h.id, h.name]) ?? []), [hosts]);

  const filtered = useMemo(() => {
    const all = [...(reviews ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return all.filter((r) => {
      if (stageFilter && r.stage !== stageFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hostName = (hostMap.get(r.host_id) ?? "").toLowerCase();
        if (
          !hostName.includes(q) &&
          !r.repo_path.toLowerCase().includes(q) &&
          !String(r.mr_iid).includes(q)
        )
          return false;
      }
      return true;
    });
  }, [reviews, stageFilter, search, hostMap]);

  // Group by host
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; reviews: Review[] }>();
    for (const r of filtered) {
      const key = r.host_id;
      if (!map.has(key)) {
        map.set(key, { label: hostMap.get(r.host_id) ?? r.host_id, reviews: [] });
      }
      map.get(key)?.reviews.push(r);
    }
    return [...map.values()];
  }, [filtered, hostMap]);

  // Stage options with counts
  const stageCounts = useMemo(() => {
    const all = reviews ?? [];
    const counts: Record<string, number> = {};
    for (const r of all) {
      counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    }
    return counts;
  }, [reviews]);

  const { mutate: deleteReview } = useDeleteReview();

  const handleOpen = (review: Review): void => {
    void navigate(
      `/${encodeURIComponent(review.host_id)}/${encodeURIComponent(review.repo_path)}/mrs/${String(review.mr_iid)}?review=${review.id}`
    );
    setHistoryOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => {
          setHistoryOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.35)",
          opacity: historyOpen ? 1 : 0,
          pointerEvents: historyOpen ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Review history"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: 340,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-1)",
          borderLeft: "1px solid var(--border)",
          transform: historyOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: historyOpen ? "-8px 0 32px rgba(0,0,0,0.3)" : "none",
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
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--fg-0)",
              flex: 1,
            }}
          >
            Review History
          </span>

          {reviews && reviews.length > 0 && (
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
              {reviews.length}
            </span>
          )}

          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setHistoryOpen(false);
            }}
            title="Close (Esc)"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 8px",
            }}
          >
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              style={{
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--fg-0)",
                width: "100%",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--fg-3)",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {/* Stage filter pills */}
        {Object.keys(stageCounts).length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 14px",
              flexWrap: "wrap",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setStageFilter(null);
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                background: stageFilter === null ? "var(--accent)" : "var(--bg-2)",
                color: stageFilter === null ? "var(--accent-ink)" : "var(--fg-2)",
                border: stageFilter === null ? "1px solid transparent" : "1px solid var(--border)",
                cursor: "pointer",
                fontWeight: stageFilter === null ? 600 : 400,
              }}
            >
              All
            </button>
            {Object.entries(stageCounts).map(([stage, count]) => {
              const meta = STAGE_META[stage];
              const isActive = stageFilter === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => {
                    setStageFilter(isActive ? null : stage);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    background: isActive
                      ? `color-mix(in oklch, ${meta?.color ?? "var(--fg-2)"} 15%, var(--bg-2))`
                      : "var(--bg-2)",
                    color: isActive ? (meta?.color ?? "var(--fg-2)") : "var(--fg-3)",
                    border: isActive
                      ? `1px solid color-mix(in oklch, ${meta?.color ?? "var(--fg-2)"} 40%, transparent)`
                      : "1px solid var(--border)",
                    cursor: "pointer",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {meta?.label ?? stage}
                  <span style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {isLoading && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  <div
                    style={{
                      height: 11,
                      width: `${String(100 + (i % 3) * 30)}px`,
                      background: "var(--bg-2)",
                      borderRadius: 3,
                      opacity: 0.5,
                    }}
                  />
                  <div
                    style={{
                      height: 9,
                      width: "70px",
                      background: "var(--bg-2)",
                      borderRadius: 3,
                      opacity: 0.3,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 40,
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
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)" }}>
                {search || stageFilter ? "No matching reviews" : "No reviews yet"}
              </p>
            </div>
          )}

          {!isLoading &&
            groups.map((group) => (
              <div key={group.label}>
                <GroupLabel label={group.label} count={group.reviews.length} />
                {group.reviews.map((review) => (
                  <ReviewItem
                    key={review.id}
                    review={review}
                    hostName={`${hostMap.get(review.host_id) ?? review.host_id} / ${review.repo_path}`}
                    isActive={false}
                    onOpen={() => {
                      handleOpen(review);
                    }}
                    onDelete={() => {
                      deleteReview(review.id);
                    }}
                  />
                ))}
              </div>
            ))}
        </div>
      </div>
    </>
  );
};
