import { useCallback, useMemo } from "react";
import { ApiError } from "@shared/api";
import { EmptyState, ErrorState, InfiniteVirtualList, Skeleton } from "@shared/ui";
import { getVcsErrorMessage } from "@shared/lib";
import {
  REPO_ROW_HEIGHT,
  getRepoRowHeight,
  getRepoRowKey,
  isRepoRowFocusable,
} from "../lib/repoTree";
import { DividerRow, NamespaceRow, RepoRow, SectionLabelRow } from "./RepoRows";
import type { InfiniteListResult, RepoPage } from "@entities/mr";
import type { ListPagination } from "@shared/ui";
import type { RepoListRow } from "../lib/repoTree";

const SKELETON_ROWS = 8;
const SKELETON_NAME_WIDTHS: readonly string[] = ["58%", "42%", "66%", "50%"];
const HTTP_UNAUTHORIZED = 401;

const ReposSkeleton = (): React.ReactElement => (
  <div aria-label="Loading repositories" role="status">
    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
      <div
        key={i}
        className="flex items-center gap-(--space-2) px-(--space-3)"
        style={{ height: REPO_ROW_HEIGHT.repo }}
      >
        <Skeleton width="var(--icon-inline)" height="var(--icon-inline)" />
        <Skeleton
          width={SKELETON_NAME_WIDTHS[i % SKELETON_NAME_WIDTHS.length] ?? "50%"}
          height="var(--fs-control)"
        />
      </div>
    ))}
  </div>
);

/** What failed, in the host's words; a rejected token is named as such. */
const LoadError = ({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}): React.ReactElement => {
  const isAuthError = error instanceof ApiError && error.status === HTTP_UNAUTHORIZED;
  return (
    <ErrorState
      size="sm"
      title={isAuthError ? "Authentication failed" : "Could not load repositories"}
      message={
        isAuthError ? "The host rejected the access token. Update it in Settings." : error?.message
      }
      onRetry={onRetry}
    />
  );
};

export type RepoListProps = {
  rows: RepoListRow[];
  loadedCount: number;
  reposQuery: InfiniteListResult<RepoPage>;
  isSearching: boolean;
  resetKey: string;
  selectedRepoPath: string | null;
  favouriteRepos: ReadonlySet<string>;
  onSelectRepo: (repoPath: string) => void;
  onToggleFavourite: (repoPath: string) => void;
  onToggleNamespace: (fullPath: string) => void;
};

export const RepoList = ({
  rows,
  loadedCount,
  reposQuery,
  isSearching,
  resetKey,
  selectedRepoPath,
  favouriteRepos,
  onSelectRepo,
  onToggleFavourite,
  onToggleNamespace,
}: RepoListProps): React.ReactElement => {
  const { data, error, isError, isFetching, isPending, isPlaceholderData, fetchNextPage, refetch } =
    reposQuery;

  // A favourite is listed twice, on top and in its namespace; only the first is highlighted.
  const selectedRowKey = useMemo(
    () =>
      rows.find((row) => row.kind === "repo" && row.repo.path === selectedRepoPath)?.key ?? null,
    [rows, selectedRepoPath]
  );

  const loadNextPage = useCallback((): void => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const handleRetry = useCallback((): void => {
    void refetch();
  }, [refetch]);

  const renderRow = useCallback(
    (row: RepoListRow): React.ReactNode => {
      switch (row.kind) {
        case "section":
          return <SectionLabelRow label={row.label} />;
        case "divider":
          return <DividerRow />;
        case "namespace":
          return (
            <NamespaceRow
              name={row.name}
              fullPath={row.fullPath}
              depth={row.depth}
              isOpen={row.isOpen}
              onToggle={onToggleNamespace}
            />
          );
        case "repo":
          return (
            <RepoRow
              repo={row.repo}
              depth={row.depth}
              isSelected={row.key === selectedRowKey}
              isFavourite={favouriteRepos.has(row.repo.path)}
              onSelect={onSelectRepo}
              onToggleFavourite={onToggleFavourite}
            />
          );
      }
    },
    [selectedRowKey, favouriteRepos, onSelectRepo, onToggleFavourite, onToggleNamespace]
  );

  const pagination: ListPagination = {
    pageCount: data?.pages.length ?? 0,
    loadedCount,
    hasNextPage: reposQuery.hasNextPage,
    isFetchingNextPage: reposQuery.isFetchingNextPage,
    isFetchNextPageError: reposQuery.isFetchNextPageError,
    isIdle: !isFetching && !isPlaceholderData,
    fetchNextPage: loadNextPage,
    errorMessage: `${getVcsErrorMessage(error)} more repositories`,
    pausedMessage: "No new repositories shown in the last pages — some may be in collapsed groups",
  };

  const renderFooter = (): React.ReactNode => {
    if (isPending && isFetching) return <ReposSkeleton />;
    if (isError && data === undefined) return <LoadError error={error} onRetry={handleRetry} />;
    if (data !== undefined && loadedCount === 0 && !isPlaceholderData) {
      return isSearching ? (
        <EmptyState
          size="sm"
          title="No repositories found"
          description="Search matches repository names and paths the host token can read."
        />
      ) : (
        <EmptyState
          size="sm"
          title="No repositories yet"
          description="The host token cannot see any. Pin one by its URL with the + above."
        />
      );
    }
    return null;
  };

  return (
    <InfiniteVirtualList
      rows={rows}
      getRowKey={getRepoRowKey}
      estimateRowSize={getRepoRowHeight}
      shouldAnchorScroll
      renderRow={renderRow}
      isRowFocusable={isRepoRowFocusable}
      ariaLabel="Repository list"
      resetKey={resetKey}
      pagination={pagination}
      isStale={isPlaceholderData}
      footer={renderFooter()}
    />
  );
};
