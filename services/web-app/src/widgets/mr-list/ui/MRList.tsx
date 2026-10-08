import { useCallback, useState } from "react";
import { Book } from "lucide-react";
import { useNav } from "@app/navigation";
import {
  EmptyState,
  ICON_SIZE,
  InfiniteVirtualList,
  ListLoadError,
  ListStatusBar,
  RefreshErrorNote,
} from "@shared/ui";
import { formatLoadError, useDebouncedSearch, useStableCallback } from "@shared/lib";
import {
  DEFAULT_READINESS,
  DEFAULT_SCOPE,
  DEFAULT_SORT,
  DEFAULT_STATE,
  getPausedMessage,
  isClientFiltered,
} from "../lib/mrListView";
import { useMRListRows } from "../model/useMRListRows";
import { InboxMRListItem } from "./InboxMRListItem";
import { MRListItem } from "./MRListItem";
import { EmptyList, MRListSkeleton } from "./MRListStates";
import { MRListToolbar } from "./MRListToolbar";
import { TruncatedReposNote } from "./TruncatedReposNote";
import type { InboxMR, InboxScope, MR, MRStateFilter } from "@entities/mr";
import type { ListPagination } from "@shared/ui";
import type { MRSortKey, ReadinessFilter } from "../lib/mrListView";
import type { MRListRow } from "../model/useMRListRows";

/** Width of the list column; the navigator is the repositories pane plus this. */
const MR_LIST_WIDTH_PX = 360;
/**
 * Both kinds of row are a title (one or two lines) over a meta line; rows are measured, this
 * is the first guess: a one-line title is 56px, a wrapped one 74px.
 */
const ESTIMATED_ROW_PX = 60;

const getRowKey = (row: MRListRow): string => row.key;
const estimateRowSize = (): number => ESTIMATED_ROW_PX;

export const MRList = (): React.ReactElement => {
  const [state, setState] = useState<MRStateFilter>(DEFAULT_STATE);
  const [scope, setScope] = useState<InboxScope>(DEFAULT_SCOPE);
  const [readiness, setReadiness] = useState<ReadinessFilter>(DEFAULT_READINESS);
  const [sort, setSort] = useState<MRSortKey>(DEFAULT_SORT);
  const [isAutoLoadPaused, setIsAutoLoadPaused] = useState(false);
  const search = useDebouncedSearch();
  const { selectedHostId, selectedRepoPath, selectedMRIid, isInbox, setMR, setRepo } = useNav();

  const { rows, loadedCount, truncatedRepos, list } = useMRListRows({
    hostId: selectedHostId,
    repoPath: selectedRepoPath,
    isInbox,
    state,
    scope,
    query: search.debouncedValue,
    readiness,
    sort,
  });

  const handleSelectMR = useStableCallback((mr: MR): void => {
    if (selectedHostId && selectedRepoPath) setMR(selectedHostId, selectedRepoPath, mr.iid);
  });
  const handleSelectInboxMR = useStableCallback((mr: InboxMR): void => {
    if (selectedHostId) setMR(selectedHostId, mr.repo_path, mr.iid);
  });
  const handleOpenRepo = useStableCallback((repoPath: string): void => {
    if (selectedHostId) setRepo(selectedHostId, repoPath);
  });
  const handleClearFilters = (): void => {
    setReadiness(DEFAULT_READINESS);
    search.setValue("");
  };

  const renderRow = useCallback(
    (row: MRListRow): React.ReactNode =>
      row.kind === "inbox" ? (
        <InboxMRListItem
          mr={row.mr}
          isSelected={selectedMRIid === row.mr.iid && selectedRepoPath === row.mr.repo_path}
          onSelect={handleSelectInboxMR}
        />
      ) : (
        <MRListItem
          mr={row.mr}
          isSelected={selectedMRIid === row.mr.iid}
          onSelect={handleSelectMR}
        />
      ),
    [selectedMRIid, selectedRepoPath, handleSelectInboxMR, handleSelectMR]
  );

  const isScopeSelected = isInbox ? selectedHostId !== null : selectedRepoPath !== null;
  const viewOptions = { readiness, sort, titleFilter: isInbox ? search.debouncedValue : undefined };
  const isFiltered = isClientFiltered(viewOptions);
  const isSearching = !isInbox && search.debouncedValue.trim() !== "";
  const listScope = isInbox ? `inbox:${scope}` : `repo:${selectedRepoPath ?? ""}:${state}`;
  const resetKey = [selectedHostId, listScope, search.debouncedValue, readiness, sort].join("\n");
  const isServerSearchBusy =
    !isInbox && search.debouncedValue !== "" && list.isFetching && !list.isFetchingNextPage;
  const hasRefreshFailed =
    list.isError && list.hasData && !list.isFetchNextPageError && !list.isFetching;

  const pagination: ListPagination = {
    pageCount: list.pageCount,
    loadedCount,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    isIdle: !list.isFetching && !list.isPlaceholderData,
    fetchNextPage: list.fetchNextPage,
    errorMessage: formatLoadError(list.error, "more merge requests"),
    pausedMessage: getPausedMessage({ isFiltered, isInbox, scope }),
  };

  const renderFooter = (): React.ReactNode => {
    if (list.isPending && list.isFetching) return <MRListSkeleton />;
    if (list.isError && !list.hasData) {
      return <ListLoadError error={list.error} what="merge requests" onRetry={list.refetch} />;
    }
    if (list.hasData && rows.length === 0 && !list.hasNextPage && !list.isPlaceholderData) {
      return (
        <EmptyList
          isFiltered={isFiltered || isSearching}
          scope={isInbox ? scope : null}
          onClearFilters={handleClearFilters}
        />
      );
    }
    return null;
  };

  return (
    <section
      aria-label="Merge Requests"
      className="border-border bg-bg-0 flex h-full shrink-0 flex-col overflow-hidden border-r"
      style={{ width: MR_LIST_WIDTH_PX }}
    >
      {isScopeSelected ? (
        <>
          <MRListToolbar
            isInbox={isInbox}
            state={state}
            onStateChange={setState}
            scope={scope}
            onScopeChange={setScope}
            readiness={readiness}
            onReadinessChange={setReadiness}
            search={search.value}
            onSearchChange={search.setValue}
            isSearchBusy={search.isPending || isServerSearchBusy}
            sort={sort}
            onSortChange={setSort}
          />

          {isInbox && scope === "all" && truncatedRepos.length > 0 && (
            <TruncatedReposNote repoPaths={truncatedRepos} onOpenRepo={handleOpenRepo} />
          )}

          {hasRefreshFailed && (
            <RefreshErrorNote
              what="the list"
              message={list.error?.message}
              onRetry={list.refetch}
            />
          )}

          <InfiniteVirtualList
            rows={rows}
            getRowKey={getRowKey}
            estimateRowSize={estimateRowSize}
            shouldMeasureRows
            renderRow={renderRow}
            ariaLabel={isInbox ? "Inbox merge requests" : "Merge requests"}
            resetKey={resetKey}
            pagination={pagination}
            isStale={list.isPlaceholderData}
            footer={renderFooter()}
            onAutoLoadPausedChange={setIsAutoLoadPaused}
          />

          {list.hasData && (
            <ListStatusBar
              loadedCount={loadedCount}
              {...(isFiltered ? { shownCount: rows.length } : {})}
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={list.isFetchingNextPage}
              isAutoLoadPaused={isAutoLoadPaused}
            />
          )}
        </>
      ) : (
        <EmptyState
          size="sm"
          icon={<Book size={ICON_SIZE.inline} />}
          title="No repository selected"
          description="Pick a repository, or the Inbox, to see its merge requests."
        />
      )}
    </section>
  );
};
