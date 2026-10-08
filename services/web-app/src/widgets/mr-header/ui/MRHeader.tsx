import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { useMR, useCachedRepo, getRepoNameFromPath } from "@entities/mr";
import { useHosts } from "@entities/host";
import { useReview } from "@entities/review";
import { describeLoadError } from "@shared/lib";
import { useSyncMR } from "../model/useSyncMR";
import { MRHeaderActions, MRHeaderMeta } from "./MRHeaderParts";
import {
  MRBreadcrumbs,
  MRHeaderError,
  MRHeaderFrame,
  MRMetaSkeleton,
  MRTitleSkeleton,
  NavigatorToggle,
} from "./MRHeaderStates";
import type { Host } from "@entities/host";

const buildMRUrl = (
  webUrl: string,
  host: Host | undefined,
  repoPath: string,
  mrIid: number
): string => {
  if (webUrl) return webUrl;
  if (!host) return "";
  const base = host.base_url.replace(/\/$/, "");
  if (host.type === "github") return `${base}/${repoPath}/pull/${String(mrIid)}`;
  return `${base}/${repoPath}/-/merge_requests/${String(mrIid)}`;
};

/**
 * One frame for the loading, failed and loaded merge request, so the navigator toggle and
 * the breadcrumbs stay the same elements (and keep focus) while the merge request arrives.
 */
export const MRHeader = (): React.ReactElement | null => {
  const navCollapsed = useAppStore((s) => s.navCollapsed);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const toggleIterationHistory = useAppStore((s) => s.toggleIterationHistory);
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId } = useNav();
  const { data: hosts } = useHosts();
  // Only reuses repo data the sidebar already loaded: fetching the repository
  // list (potentially thousands of entries) just for a breadcrumb is wasteful.
  const cachedRepo = useCachedRepo(selectedHostId, selectedRepoPath);
  const mrQuery = useMR(selectedHostId, selectedRepoPath, selectedMRIid);
  const { data: review } = useReview(activeReviewId);
  const syncMR = useSyncMR();

  if (!selectedHostId || !selectedRepoPath || !selectedMRIid) return null;

  const host = hosts?.find((h) => h.id === selectedHostId);
  const mr = mrQuery.data;
  const isLoading = mr === undefined && !mrQuery.isError;

  const handleSync = (): void => {
    syncMR.mutate({
      hostId: selectedHostId,
      repoPath: selectedRepoPath,
      mrIid: selectedMRIid,
      reviewId: activeReviewId,
    });
  };

  const mrLabel = `merge request !${String(selectedMRIid)}`;
  const retry = (): void => {
    void mrQuery.refetch();
  };

  const renderTitle = (): React.ReactNode => {
    if (mr !== undefined) {
      return (
        <h1 className="text-fg-0 m-0 line-clamp-2 font-(family-name:--font-display) text-(length:--fs-page) leading-(--lh-tight) font-semibold">
          {mr.title}
        </h1>
      );
    }
    if (mrQuery.isError) {
      const { title, message } = describeLoadError(mrQuery.error, mrLabel);
      return (
        <MRHeaderError
          title={title}
          message={message}
          isRetrying={mrQuery.isFetching}
          onRetry={retry}
        />
      );
    }
    return <MRTitleSkeleton label="Loading merge request" />;
  };

  // A refresh that failed over a loaded merge request: the header stays, this says it is old.
  const renderRefreshError = (): React.ReactNode => {
    if (mr === undefined || !mrQuery.isError || mrQuery.isFetching) return null;
    const { message } = describeLoadError(mrQuery.error, mrLabel);
    return (
      <MRHeaderError
        title={`Could not refresh ${mrLabel}`}
        message={message}
        isRetrying={mrQuery.isFetching}
        onRetry={retry}
      />
    );
  };

  return (
    <MRHeaderFrame
      topRow={
        <>
          <NavigatorToggle isNavCollapsed={navCollapsed} onToggleNav={toggleNav} />
          <MRBreadcrumbs
            hostName={host?.name ?? selectedHostId}
            repoName={cachedRepo?.name ?? getRepoNameFromPath(selectedRepoPath)}
            repoPath={selectedRepoPath}
            leaf={`!${String(selectedMRIid)}`}
          />
          {isLoading && <MRMetaSkeleton />}
          {mr !== undefined && <MRHeaderMeta mr={mr} />}
          {mr !== undefined && (
            <MRHeaderActions
              iterationCount={review?.iterations.length ?? 0}
              onShowHistory={toggleIterationHistory}
              isSyncing={syncMR.isPending}
              onSync={handleSync}
              mrUrl={buildMRUrl(mr.web_url, host, selectedRepoPath, selectedMRIid)}
            />
          )}
        </>
      }
    >
      {renderTitle()}
      {renderRefreshError()}
    </MRHeaderFrame>
  );
};
