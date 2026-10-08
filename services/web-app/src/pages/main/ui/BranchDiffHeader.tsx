import { GitCompareArrows, History } from "lucide-react";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { useHosts } from "@entities/host";
import { getRepoNameFromPath } from "@entities/mr";
import { getReviewSource, useReview } from "@entities/review";
import { Button, CountBadge, ICON_SIZE } from "@shared/ui";
import { MRBreadcrumbs, MRHeaderFrame, MetaDivider, NavigatorToggle } from "@widgets/mr-header";

/** Header of a review that has no merge request: the repository and the two refs. */
export const BranchDiffHeader = (): React.ReactElement | null => {
  const { selectedHostId, selectedRepoPath, activeReviewId } = useNav();
  const { navCollapsed, toggleNav, toggleIterationHistory } = useAppStore();
  const { data: review } = useReview(activeReviewId);
  const { data: hosts } = useHosts();
  if (!review || selectedRepoPath === null) return null;
  const source = getReviewSource(review);
  if (source.kind !== "branch_diff") return null;
  const iterationCount = review.iterations.length;

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
                  label={
                    iterationCount === 1 ? "1 iteration" : `${String(iterationCount)} iterations`
                  }
                />
              }
              onClick={toggleIterationHistory}
            >
              Iterations
            </Button>
          </div>
        </>
      }
    >
      <h1 className="text-fg-0 m-0 line-clamp-2 font-(family-name:--font-display) text-(length:--fs-page) leading-(--lh-tight) font-semibold">
        {source.title || `${source.head_ref} into ${source.base_ref}`}
      </h1>
    </MRHeaderFrame>
  );
};
