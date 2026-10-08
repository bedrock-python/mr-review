import { useCallback } from "react";
import { InfiniteVirtualList, ListMessage, Skeleton } from "@shared/ui";
import { getVcsErrorMessage } from "@shared/lib";
import { getRepoRowHeight, getRepoRowKey, isRepoRowFocusable } from "../lib/repoTree";
import { DividerRow, NamespaceRow, RepoRow, SectionLabelRow } from "./RepoRows";
import type { InfiniteListResult, RepoPage } from "@entities/mr";
import type { ListPagination } from "@shared/ui";
import type { RepoListRow } from "../lib/repoTree";

const SKELETON_ROWS = 6;

const ReposSkeleton = (): React.ReactElement => (
  <div aria-label="Loading repositories" role="status" style={{ padding: "4px 0" }}>
    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
      <div
        key={i}
        style={{ padding: "7px 10px", display: "flex", flexDirection: "column", gap: 5 }}
      >
        <Skeleton style={{ width: `${String(50 + (i % 4) * 15)}%`, height: 13, borderRadius: 4 }} />
        <Skeleton style={{ width: `${String(35 + (i % 3) * 12)}%`, height: 10, borderRadius: 4 }} />
      </div>
    ))}
  </div>
);

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
              isSelected={selectedRepoPath === row.repo.path}
              isFavourite={favouriteRepos.has(row.repo.path)}
              onSelect={onSelectRepo}
              onToggleFavourite={onToggleFavourite}
            />
          );
      }
    },
    [selectedRepoPath, favouriteRepos, onSelectRepo, onToggleFavourite, onToggleNamespace]
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
    if (isError && data === undefined) {
      return (
        <ListMessage isError actionLabel="Retry" onAction={handleRetry}>
          {getVcsErrorMessage(error)} repositories
        </ListMessage>
      );
    }
    if (data !== undefined && loadedCount === 0 && !isPlaceholderData) {
      return (
        <ListMessage>{isSearching ? "No repositories found" : "No repositories yet"}</ListMessage>
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
