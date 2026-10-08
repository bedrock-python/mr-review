import { useMemo, useRef, useState } from "react";
import { History, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { getReviewMRIid, useDeleteReview, useReviews } from "@entities/review";
import { useHosts } from "@entities/host";
import {
  Button,
  Chip,
  CountBadge,
  Drawer,
  EmptyState,
  ErrorState,
  Eyebrow,
  ICON_SIZE,
  Input,
} from "@shared/ui";
import {
  countReviewsByStage,
  filterReviews,
  getReviewTargetLabel,
  groupReviewsByHost,
} from "../lib/historyList";
import { STAGE_META, TRUNCATE } from "./historyStyles";
import { HistorySkeleton } from "./HistorySkeleton";
import { ReviewItem } from "./ReviewItem";
import type { Review, ReviewStage } from "@entities/review";

const TOOLBAR: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  flexShrink: 0,
  padding: "var(--space-3) var(--space-4)",
  borderBottom: "1px solid var(--border)",
};

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

  const clearFilters = (): void => {
    setSearch("");
    setStageFilter(null);
    searchRef.current?.focus();
  };

  const hasFilter = search.trim() !== "" || stageFilter !== null;

  return (
    <>
      <div style={TOOLBAR}>
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search reviews"
          placeholder="Search by host, repository or MR…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          leadingIcon={<Search size={ICON_SIZE.inline} />}
        />
        {stageCounts.size > 1 && (
          <div
            role="group"
            aria-label="Filter by stage"
            style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
          >
            <Chip
              isSelected={stageFilter === null}
              onClick={() => {
                setStageFilter(null);
              }}
            >
              All
            </Chip>
            {[...stageCounts.entries()].map(([stage, count]) => (
              <Chip
                key={stage}
                tone={STAGE_META[stage].tone}
                hasDot
                count={count}
                isSelected={stageFilter === stage}
                onSelectedChange={(isSelected) => {
                  setStageFilter(isSelected ? stage : null);
                }}
              >
                {STAGE_META[stage].label}
              </Chip>
            ))}
          </div>
        )}
      </div>

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
