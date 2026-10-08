import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { useMR, useCachedRepo, getRepoNameFromPath } from "@entities/mr";
import { useHosts } from "@entities/host";
import { useReview } from "@entities/review";
import { getVcsErrorMessage } from "@shared/lib";
import { useSyncMR } from "../model/useSyncMR";
import { MRHeaderActions, MRHeaderMeta } from "./MRHeaderParts";
import { MRBreadcrumbs, MRHeaderError, MRHeaderFrame, MRHeaderSkeleton } from "./MRHeaderStates";
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

export const MRHeader = (): React.ReactElement | null => {
  const { navCollapsed, toggleNav, toggleIterationHistory } = useAppStore();
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
  const breadcrumbs = (
    <MRBreadcrumbs
      hostName={host?.name ?? selectedHostId}
      repoName={cachedRepo?.name ?? getRepoNameFromPath(selectedRepoPath)}
      repoPath={selectedRepoPath}
      mrIid={selectedMRIid}
      isNavCollapsed={navCollapsed}
      onShowNav={toggleNav}
    />
  );

  const mr = mrQuery.data;
  if (!mr) {
    if (mrQuery.isError) {
      return (
        <MRHeaderError
          breadcrumbs={breadcrumbs}
          message={`${getVcsErrorMessage(mrQuery.error)} merge request !${String(selectedMRIid)}`}
          isRetrying={mrQuery.isFetching}
          onRetry={() => {
            void mrQuery.refetch();
          }}
        />
      );
    }
    return <MRHeaderSkeleton breadcrumbs={breadcrumbs} />;
  }

  const handleSync = (): void => {
    syncMR.mutate({
      hostId: selectedHostId,
      repoPath: selectedRepoPath,
      mrIid: selectedMRIid,
      reviewId: activeReviewId,
    });
  };

  return (
    <MRHeaderFrame>
      {breadcrumbs}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <h1
          style={{
            flex: 1,
            fontSize: 22,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            color: "var(--fg-0)",
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          {mr.title}
        </h1>
        <MRHeaderActions
          iterationCount={review?.iterations.length ?? 0}
          onShowHistory={toggleIterationHistory}
          isSyncing={syncMR.isPending}
          onSync={handleSync}
          mrUrl={buildMRUrl(mr.web_url, host, selectedRepoPath, selectedMRIid)}
        />
      </div>

      <MRHeaderMeta mr={mr} />
    </MRHeaderFrame>
  );
};
