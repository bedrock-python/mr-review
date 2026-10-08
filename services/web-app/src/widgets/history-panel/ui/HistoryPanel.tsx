import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { getReviewMRIid, useDeleteReview, useReviews } from "@entities/review";
import { useHosts } from "@entities/host";
import { ListMessage, SideSheet } from "@shared/ui";
import {
  countReviewsByStage,
  filterReviews,
  getReviewTargetLabel,
  groupReviewsByHost,
} from "../lib/historyList";
import { STAGE_META } from "./historyStyles";
import { ReviewItem } from "./ReviewItem";
import type { Review, ReviewStage } from "@entities/review";

const SKELETON_ROWS = 5;

const SearchIcon = (): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const pillStyle = (isActive: boolean, color: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  background: isActive ? `color-mix(in oklch, ${color} 15%, var(--bg-2))` : "var(--bg-2)",
  color: isActive ? color : "var(--fg-2)",
  border: isActive
    ? `1px solid color-mix(in oklch, ${color} 40%, transparent)`
    : "1px solid var(--border)",
  cursor: "pointer",
  fontWeight: isActive ? 600 : 400,
});

const ReviewCount = (): React.ReactElement | null => {
  const { data: reviews } = useReviews();
  if (!reviews || reviews.length === 0) return null;
  return (
    <span
      className="mono"
      aria-label={`${String(reviews.length)} reviews`}
      style={{
        fontSize: 10,
        color: "var(--fg-2)",
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-pill)",
        padding: "1px 6px",
      }}
    >
      {reviews.length}
    </span>
  );
};

const ListSkeleton = (): React.ReactElement => (
  <div aria-busy="true" aria-label="Loading reviews">
    {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
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
            width: 100 + (i % 3) * 30,
            background: "var(--bg-2)",
            borderRadius: "var(--radius-1)",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            height: 9,
            width: 70,
            background: "var(--bg-2)",
            borderRadius: "var(--radius-1)",
            opacity: 0.3,
          }}
        />
      </div>
    ))}
  </div>
);

type HistoryBodyProps = {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpened: () => void;
};

/** Mounted only while the panel is open: the (large) review list is fetched only then. */
const HistoryBody = ({ searchRef, onOpened }: HistoryBodyProps): React.ReactElement => {
  const nav = useNav();
  const reviewsQuery = useReviews();
  const { data: hosts } = useHosts();
  const deleteReview = useDeleteReview();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ReviewStage | null>(null);

  const reviews = reviewsQuery.data;
  const hostNames = useMemo(() => new Map(hosts?.map((h) => [h.id, h.name]) ?? []), [hosts]);
  const filtered = useMemo(
    () => filterReviews(reviews ?? [], { query: search, stage: stageFilter, hostNames }),
    [reviews, search, stageFilter, hostNames]
  );
  const groups = useMemo(() => groupReviewsByHost(filtered, hostNames), [filtered, hostNames]);
  const stageCounts = useMemo(() => countReviewsByStage(reviews ?? []), [reviews]);

  const handleOpen = (review: Review): void => {
    nav.openReview({
      hostId: review.host_id,
      repoPath: review.repo_path,
      mrIid: getReviewMRIid(review),
      reviewId: review.id,
    });
    onOpened();
  };

  const handleDelete = (review: Review): void => {
    deleteReview.mutate(review.id, {
      onSuccess: () => {
        // The open review is gone: leave its page instead of requesting it again.
        if (review.id === nav.activeReviewId) nav.setReview(null, { replace: true });
        toast.success(`Deleted the review of ${review.repo_path} ${getReviewTargetLabel(review)}`);
      },
    });
  };

  const hasFilter = search.trim() !== "" || stageFilter !== null;

  return (
    <>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-2)",
            padding: "5px 8px",
          }}
        >
          <span style={{ color: "var(--fg-2)", flexShrink: 0, display: "flex" }}>
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="search"
            aria-label="Search reviews"
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
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              style={{ width: 18, height: 18 }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {stageCounts.size > 1 && (
        <div
          role="group"
          aria-label="Filter by stage"
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
            aria-pressed={stageFilter === null}
            onClick={() => {
              setStageFilter(null);
            }}
            style={pillStyle(stageFilter === null, "var(--accent)")}
          >
            All
          </button>
          {[...stageCounts.entries()].map(([stage, count]) => {
            const isActive = stageFilter === stage;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setStageFilter(isActive ? null : stage);
                }}
                style={pillStyle(isActive, STAGE_META[stage].color)}
              >
                {STAGE_META[stage].label}
                <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {reviewsQuery.isPending && <ListSkeleton />}
        {reviewsQuery.isError && (
          <ListMessage
            isError
            actionLabel="Retry"
            onAction={() => {
              void reviewsQuery.refetch();
            }}
          >
            Could not load the review history: {reviewsQuery.error.message}
          </ListMessage>
        )}
        {reviewsQuery.isSuccess && filtered.length === 0 && (
          <ListMessage>{hasFilter ? "No matching reviews" : "No reviews yet"}</ListMessage>
        )}
        {groups.map((group) => (
          <section key={group.hostId} aria-label={group.label}>
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
                fontSize: 10,
                fontWeight: 600,
                color: "var(--fg-2)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {group.label}
              </span>
              <span className="mono">{group.reviews.length}</span>
            </div>
            {group.reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                location={`${group.label} / ${review.repo_path}`}
                isActive={review.id === nav.activeReviewId}
                isDeleting={deleteReview.isPending && deleteReview.variables === review.id}
                onOpen={() => {
                  handleOpen(review);
                }}
                onDelete={() => {
                  handleDelete(review);
                }}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
};

export const HistoryPanel = (): React.ReactElement => {
  const isOpen = useAppStore((s) => s.historyOpen);
  const setHistoryOpen = useAppStore((s) => s.setHistoryOpen);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleClose = (): void => {
    setHistoryOpen(false);
  };

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Review History"
      headerExtra={<ReviewCount />}
      initialFocusRef={searchRef}
    >
      <HistoryBody searchRef={searchRef} onOpened={handleClose} />
    </SideSheet>
  );
};
