import { useMemo, useRef, useState } from "react";
import { History, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { getReviewMRIid, useReviews } from "@entities/review";
import { useHosts } from "@entities/host";
import { TRUNCATE } from "@shared/lib";
import { Button, CountBadge, Drawer, EmptyState, ErrorState, Eyebrow, ICON_SIZE } from "@shared/ui";
import {
  countReviewsByStage,
  filterReviews,
  getReviewTargetLabel,
  groupReviewsByHost,
} from "../lib/historyList";
import { useReviewDeletion } from "../model/useReviewDeletion";
import { HistorySkeleton } from "./HistorySkeleton";
import { HistoryToolbar } from "./HistoryToolbar";
import { ReviewItem } from "./ReviewItem";
import type { Review, ReviewStage } from "@entities/review";

const GROUP_HEADER: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-4)",
  background: "var(--bg-1)",
  borderBottom: "1px solid var(--border)",
};

const ReviewCount = (): React.ReactElement | null => {
  const { data: reviews } = useReviews();
  if (!reviews || reviews.length === 0) return null;
  const count = reviews.length;
  return (
    <CountBadge count={count} label={`${String(count)} ${count === 1 ? "review" : "reviews"}`} />
  );
};

type HistoryBodyProps = {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpened: () => void;
};

/** Mounted only while the panel is open: the (large) review list is fetched only then. */
const HistoryBody = ({ searchRef, onOpened }: HistoryBodyProps): React.ReactElement => {
  const nav = useNav();
  const reviewsQuery = useReviews();
  const { data: hosts } = useHosts();
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
  const shownIds = useMemo(() => groups.flatMap((g) => g.reviews.map((r) => r.id)), [groups]);
  const deletion = useReviewDeletion({
    shownIds,
    searchRef,
    onDeleted: (review) => {
      // The open review is gone: leave its page instead of requesting it again.
      if (review.id === nav.activeReviewId) nav.setReview(null, { replace: true });
      toast.success(`Deleted the review of ${review.repo_path} ${getReviewTargetLabel(review)}`);
    },
  });

  const handleOpen = (review: Review): void => {
    nav.openReview({
      hostId: review.host_id,
      repoPath: review.repo_path,
      mrIid: getReviewMRIid(review),
      reviewId: review.id,
    });
    onOpened();
  };

  const clearFilters = (): void => {
    setSearch("");
    setStageFilter(null);
    searchRef.current?.focus();
  };

  const hasFilter = search.trim() !== "" || stageFilter !== null;

  return (
    <>
      <HistoryToolbar
        searchRef={searchRef}
        search={search}
        onSearchChange={setSearch}
        stageCounts={stageCounts}
        stageFilter={stageFilter}
        onStageFilterChange={setStageFilter}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {reviewsQuery.isPending && <HistorySkeleton />}
        {reviewsQuery.isError && (
          <ErrorState
            size="sm"
            title="Could not load the review history"
            message={reviewsQuery.error.message}
            onRetry={() => {
              void reviewsQuery.refetch();
            }}
          />
        )}
        {reviewsQuery.isSuccess && filtered.length === 0 && !hasFilter && (
          <EmptyState
            size="sm"
            icon={<History size={ICON_SIZE.inline} />}
            title="No reviews yet"
            description="Reviews you start on a merge request show up here."
          />
        )}
        {reviewsQuery.isSuccess && filtered.length === 0 && hasFilter && (
          <EmptyState
            size="sm"
            icon={<SearchX size={ICON_SIZE.inline} />}
            title="No matching reviews"
            description="Nothing matches the search and the stage filter."
            actions={
              <Button size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )}
        {groups.map((group) => (
          <section key={group.hostId} aria-label={group.label}>
            <div style={GROUP_HEADER}>
              <Eyebrow className="min-w-0 flex-1">
                <span style={{ ...TRUNCATE, display: "block" }}>{group.label}</span>
              </Eyebrow>
              <CountBadge count={group.reviews.length} />
            </div>
            {group.reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                openButtonRef={deletion.openButtonRef(review.id)}
                isActive={review.id === nav.activeReviewId}
                isDeleting={deletion.isDeleting(review.id)}
                onOpen={() => {
                  handleOpen(review);
                }}
                onDelete={() => {
                  deletion.deleteReview(review);
                }}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
};

/** Every review on every host, newest first, grouped by host. */
export const HistoryPanel = (): React.ReactElement => {
  const isOpen = useAppStore((s) => s.historyOpen);
  const setHistoryOpen = useAppStore((s) => s.setHistoryOpen);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleClose = (): void => {
    setHistoryOpen(false);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Review history"
      headerExtra={<ReviewCount />}
      initialFocusRef={searchRef}
    >
      <HistoryBody searchRef={searchRef} onOpened={handleClose} />
    </Drawer>
  );
};
