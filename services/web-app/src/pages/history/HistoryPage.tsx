import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useReviews } from "@entities/review";
import { useHosts } from "@entities/host";
import type { Review } from "@entities/review";

/* ── Icons ──────────────────────────────────────────────────────────── */
const BackIcon = (): React.ReactElement => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const SearchIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ClockIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ChevronRight = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const CommentIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/* ── Constants ──────────────────────────────────────────────────────── */
type StageMeta = { label: string; color: string; bg: string };
const STAGE_META: Record<"pick" | "brief" | "dispatch" | "polish" | "post", StageMeta> = {
  pick: { label: "Picking", color: "var(--fg-3)", bg: "var(--bg-2)" },
  brief: { label: "Brief", color: "var(--fg-2)", bg: "var(--bg-2)" },
  dispatch: {
    label: "Dispatching",
    color: "var(--c-major)",
    bg: "color-mix(in oklch, var(--c-major) 12%, transparent)",
  },
  polish: {
    label: "Polishing",
    color: "var(--accent)",
    bg: "color-mix(in oklch, var(--accent) 12%, transparent)",
  },
  post: {
    label: "Posted",
    color: "var(--c-add, #3fb950)",
    bg: "color-mix(in oklch, var(--c-add, #3fb950) 12%, transparent)",
  },
};

const SEV_COLORS: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggest)",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
const getDisplayStage = (review: Review): string => {
  return review.iterations.at(-1)?.stage ?? "pick";
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${String(days)}d ago`;
  return formatDate(iso);
};

/* ── StageBadge ─────────────────────────────────────────────────────── */
type StageBadgeProps = { stage: string };

const StageBadge = ({ stage }: StageBadgeProps): React.ReactElement => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const meta = STAGE_META[stage as keyof typeof STAGE_META] ?? {
    label: stage,
    color: "var(--fg-2)",
    bg: "var(--bg-2)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.05em",
        fontWeight: 600,
        color: meta.color,
        background: meta.bg,
        border: `1px solid color-mix(in oklch, ${meta.color} 30%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
};

/* ── SeverityBar ────────────────────────────────────────────────────── */
type SeverityBarProps = { review: Review };

const SeverityBar = ({ review }: SeverityBarProps): React.ReactElement | null => {
  const latestComments = review.iterations.at(-1)?.comments ?? [];
  const kept = latestComments.filter((c) => c.status === "kept");
  if (kept.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const c of kept) {
    counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {(["critical", "major", "minor", "suggestion"] as const).map((sev) => {
        const n = counts[sev];
        if (!n) return null;
        return (
          <span
            key={sev}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: SEV_COLORS[sev],
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: SEV_COLORS[sev],
                flexShrink: 0,
              }}
            />
            {n}
          </span>
        );
      })}
    </div>
  );
};

/* ── ReviewCard ─────────────────────────────────────────────────────── */
type ReviewCardProps = {
  review: Review;
  hostName: string;
  onOpen: () => void;
};

const ReviewCard = ({ review, hostName, onOpen }: ReviewCardProps): React.ReactElement => {
  const [hovered, setHovered] = useState(false);
  const latestComments = review.iterations.at(-1)?.comments ?? [];
  const keptCount = latestComments.filter((c) => c.status === "kept").length;
  const totalCount = latestComments.length;

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
        gap: 16,
        width: "100%",
        padding: "12px 16px",
        background: hovered ? "var(--bg-hover)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.1s",
        color: "inherit",
      }}
    >
      {/* Left: MR info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", flexShrink: 0 }}>
            {hostName}
          </span>
          <span style={{ color: "var(--border-strong)", flexShrink: 0 }}>/</span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {review.repo_path}
          </span>
          <span
            className="chip"
            style={{ fontSize: 10, flexShrink: 0, paddingTop: 1, paddingBottom: 1 }}
          >
            !{review.mr_iid}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--fg-3)",
            }}
          >
            <ClockIcon />
            <span title={formatDate(review.created_at)}>{formatRelative(review.created_at)}</span>
          </span>

          {totalCount > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--fg-2)",
              }}
            >
              <CommentIcon />
              {keptCount}/{totalCount}
            </span>
          )}

          <SeverityBar review={review} />
        </div>
      </div>

      {/* Right: stage + arrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <StageBadge stage={getDisplayStage(review)} />
        <span style={{ color: hovered ? "var(--fg-1)" : "var(--fg-3)", transition: "color 0.1s" }}>
          <ChevronRight />
        </span>
      </div>
    </button>
  );
};

/* ── GroupHeader ────────────────────────────────────────────────────── */
type GroupHeaderProps = { label: string; count: number };

const GroupHeader = ({ label, count }: GroupHeaderProps): React.ReactElement => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px 6px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-0)",
      position: "sticky",
      top: 0,
      zIndex: 1,
    }}
  >
    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-2)", letterSpacing: "0.04em" }}>
      {label}
    </span>
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
      {count}
    </span>
  </div>
);

/* ── FilterChip ─────────────────────────────────────────────────────── */
type FilterChipProps = {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
};

const FilterChip = ({ label, active, count, onClick }: FilterChipProps): React.ReactElement => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      background: active ? "var(--accent)" : "var(--bg-2)",
      color: active ? "var(--accent-ink)" : "var(--fg-2)",
      border: active ? "1px solid transparent" : "1px solid var(--border)",
      cursor: "pointer",
      transition: "all 0.1s",
      whiteSpace: "nowrap",
    }}
  >
    {label}
    {count !== undefined && (
      <span
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          opacity: active ? 0.75 : 1,
        }}
      >
        {count}
      </span>
    )}
  </button>
);

/* ── EmptyState ─────────────────────────────────────────────────────── */
type EmptyStateProps = { hasFilter: boolean };

const EmptyState = ({ hasFilter }: EmptyStateProps): React.ReactElement => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 60,
      color: "var(--fg-3)",
    }}
  >
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      opacity={0.4}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>
      {hasFilter ? "No reviews match this filter" : "No reviews yet"}
    </p>
    {hasFilter && (
      <p style={{ margin: 0, fontSize: 11 }}>Try a different stage or clear the search</p>
    )}
  </div>
);

/* ── HistoryPage ────────────────────────────────────────────────────── */
export const HistoryPage = (): React.ReactElement => {
  const navigate = useNavigate();
  const { data: reviews, isLoading, isError } = useReviews();
  const { data: hosts } = useHosts();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const hostMap = useMemo(() => new Map(hosts?.map((h) => [h.id, h.name]) ?? []), [hosts]);

  const filtered = useMemo(() => {
    const all = [...(reviews ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return all.filter((r) => {
      if (stageFilter && getDisplayStage(r) !== stageFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hostName = (hostMap.get(r.host_id) ?? r.host_id).toLowerCase();
        if (
          !hostName.includes(q) &&
          !r.repo_path.toLowerCase().includes(q) &&
          !String(r.mr_iid).includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [reviews, stageFilter, search, hostMap]);

  // Group by host+repo
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; reviews: Review[] }>();
    for (const r of filtered) {
      const key = `${r.host_id}::${r.repo_path}`;
      if (!map.has(key)) {
        const hostName = hostMap.get(r.host_id) ?? r.host_id;
        map.set(key, { label: `${hostName} / ${r.repo_path}`, reviews: [] });
      }
      map.get(key)?.reviews.push(r);
    }
    return [...map.values()];
  }, [filtered, hostMap]);

  // Stage counts for filter chips
  const stageCounts = useMemo(() => {
    const all = reviews ?? [];
    return {
      pick: all.filter((r) => getDisplayStage(r) === "pick").length,
      brief: all.filter((r) => getDisplayStage(r) === "brief").length,
      dispatch: all.filter((r) => getDisplayStage(r) === "dispatch").length,
      polish: all.filter((r) => getDisplayStage(r) === "polish").length,
      post: all.filter((r) => getDisplayStage(r) === "post").length,
    };
  }, [reviews]);

  const handleOpen = (review: Review): void => {
    const hostId = review.host_id;
    const repo = encodeURIComponent(review.repo_path);
    void navigate(
      `/${encodeURIComponent(hostId)}/${repo}/mrs/${String(review.mr_iid)}?review=${review.id}`
    );
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "column",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          height: 48,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            void navigate("/");
          }}
          title="Back"
        >
          <BackIcon />
        </button>

        <div style={{ width: 1, height: 16, background: "var(--border)" }} />

        <h1 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", margin: 0 }}>
          Review History
        </h1>

        {reviews && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--fg-3)",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "1px 7px",
            }}
          >
            {reviews.length}
          </span>
        )}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            flex: "0 0 200px",
          }}
        >
          <span style={{ color: "var(--fg-3)" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search host, repo, MR…"
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
        </div>

        <div style={{ width: 1, height: 16, background: "var(--border)" }} />

        {/* Stage filter chips */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <FilterChip
            label="All"
            active={stageFilter === null}
            {...(reviews?.length !== undefined ? { count: reviews.length } : {})}
            onClick={() => {
              setStageFilter(null);
            }}
          />
          {(["pick", "brief", "dispatch", "polish", "post"] as const).map((stage) => {
            const count = stageCounts[stage];
            if (count === 0) return null;
            return (
              <FilterChip
                key={stage}
                label={STAGE_META[stage].label}
                active={stageFilter === stage}
                count={count}
                onClick={() => {
                  setStageFilter(stageFilter === stage ? null : stage);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              padding: "8px 0",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    height: 11,
                    width: `${String(140 + (i % 3) * 40)}px`,
                    background: "var(--bg-2)",
                    borderRadius: 3,
                    opacity: 0.6,
                  }}
                />
                <div
                  style={{
                    height: 10,
                    width: "80px",
                    background: "var(--bg-2)",
                    borderRadius: 3,
                    opacity: 0.4,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--c-critical)",
              fontSize: 13,
            }}
          >
            Failed to load review history
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState hasFilter={stageFilter !== null || search.trim().length > 0} />
        )}

        {!isLoading &&
          !isError &&
          groups.map((group) => (
            <div key={group.label}>
              <GroupHeader label={group.label} count={group.reviews.length} />
              {group.reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  hostName={hostMap.get(review.host_id) ?? review.host_id}
                  onOpen={() => {
                    handleOpen(review);
                  }}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
};
