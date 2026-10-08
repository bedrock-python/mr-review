import { GitCompareArrows, History } from "lucide-react";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { useHosts } from "@entities/host";
import { getRepoNameFromPath } from "@entities/mr";
import { getReviewSource, useReview } from "@entities/review";
import { describeLoadError } from "@shared/lib";
import { Button, CountBadge, ICON_SIZE } from "@shared/ui";
import {
  MRBreadcrumbs,
  MRHeaderError,
  MRHeaderFrame,
  MRMetaSkeleton,
  MRTitleSkeleton,
  MetaDivider,
  NavigatorToggle,
} from "@widgets/mr-header";
import type { Review } from "@entities/review";

const TITLE_CLASS =
  "text-fg-0 m-0 line-clamp-2 font-(family-name:--font-display) text-(length:--fs-page) leading-(--lh-tight) font-semibold";

/** The two refs and the iterations button, once the review is here. */
const BranchDiffMeta = ({
  review,
  onShowIterations,
}: {
  review: Review;
  onShowIterations: () => void;
}): React.ReactElement | null => {
  const source = getReviewSource(review);
  if (source.kind !== "branch_diff") return null;
  const iterationCount = review.iterations.length;
  return (
    <>
      <MetaDivider />
      <span className="text-fg-1 flex min-w-0 items-center gap-(--space-1) font-mono text-(length:--fs-meta)">
        <GitCompareArrows size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-2" />
        <span className="truncate">
          {source.base_ref} … {source.head_ref}
        </span>
      </span>
      <div className="ml-auto flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          icon={<History size={ICON_SIZE.inline} aria-hidden="true" />}
          iconRight={
            <CountBadge
              count={iterationCount}
              label={iterationCount === 1 ? "1 iteration" : `${String(iterationCount)} iterations`}
            />
          }
          onClick={onShowIterations}
        >
          Iterations
        </Button>
      </div>
    </>
  );
};

/**
 * Header of a review that has no merge request: the repository and the two refs. Like the
 * merge request header, its frame and navigator toggle are there from the start; the review
 * fills in, or says why it could not.
 */
export const BranchDiffHeader = (): React.ReactElement | null => {
  const { selectedHostId, selectedRepoPath, activeReviewId } = useNav();
  const navCollapsed = useAppStore((s) => s.navCollapsed);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const toggleIterationHistory = useAppStore((s) => s.toggleIterationHistory);
  const reviewQuery = useReview(activeReviewId);
  const { data: hosts } = useHosts();
  if (selectedRepoPath === null) return null;

  const review = reviewQuery.data;
  const isLoading = review === undefined && !reviewQuery.isError;

  const renderTitle = (): React.ReactNode => {
    if (review !== undefined) {
      const source = getReviewSource(review);
      const title =
        source.kind === "branch_diff"
          ? source.title || `${source.head_ref} into ${source.base_ref}`
          : "Review";
      return <h1 className={TITLE_CLASS}>{title}</h1>;
    }
    if (reviewQuery.isError) {
      const { title, message } = describeLoadError(reviewQuery.error, "branch diff review");
      return (
        <MRHeaderError
          title={title}
          message={message}
          isRetrying={reviewQuery.isFetching}
          onRetry={() => {
            void reviewQuery.refetch();
          }}
        />
      );
    }
    return <MRTitleSkeleton label="Loading branch diff review" />;
  };

  return (
    <MRHeaderFrame
      topRow={
        <>
          <NavigatorToggle isNavCollapsed={navCollapsed} onToggleNav={toggleNav} />
          <MRBreadcrumbs
            hostName={hosts?.find((host) => host.id === selectedHostId)?.name ?? ""}
            repoName={getRepoNameFromPath(selectedRepoPath)}
            repoPath={selectedRepoPath}
            leaf="branch diff"
          />
          {isLoading && <MRMetaSkeleton />}
          {review !== undefined && (
            <BranchDiffMeta review={review} onShowIterations={toggleIterationHistory} />
          )}
        </>
      }
    >
      {renderTitle()}
    </MRHeaderFrame>
  );
};
