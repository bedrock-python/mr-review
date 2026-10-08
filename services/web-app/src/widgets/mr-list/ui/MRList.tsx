import { useCallback, useState } from "react";
import { useNav } from "@app/navigation";
import { InfiniteVirtualList, ListMessage, ListStatusBar, Skeleton } from "@shared/ui";
import { getVcsErrorMessage, useDebouncedSearch, useStableCallback } from "@shared/lib";
import {
  DEFAULT_READINESS,
  DEFAULT_SCOPE,
  DEFAULT_SORT,
  DEFAULT_STATE,
  isClientFiltered,
} from "../lib/mrListView";
import { useMRListRows } from "../model/useMRListRows";
import { InboxMRListItem } from "./InboxMRListItem";
import { MRListItem } from "./MRListItem";
import { MRListToolbar } from "./MRListToolbar";
import type { InboxMR, InboxScope, MR, MRStateFilter } from "@entities/mr";
import type { ListPagination } from "@shared/ui";
import type { MRSortKey, ReadinessFilter } from "../lib/mrListView";
import type { MRListRow } from "../model/useMRListRows";

const SKELETON_ROWS = 5;
const ESTIMATED_REPO_ROW_PX = 86;
const ESTIMATED_INBOX_ROW_PX = 106;

const MRListSkeleton = (): React.ReactElement => (
  <div role="status" aria-label="Loading merge requests" style={{ padding: "6px 0" }}>
    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
      <div
        key={i}
        style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Skeleton style={{ width: 36, height: 14, borderRadius: 999 }} />
          <Skeleton
            style={{ width: `${String(60 + (i % 3) * 20)}px`, height: 14, borderRadius: 4 }}
          />
        </div>
        <Skeleton style={{ width: "85%", height: 13, borderRadius: 4 }} />
        <Skeleton style={{ width: "50%", height: 11, borderRadius: 4 }} />
      </div>
    ))}
  </div>
);

type PausedMessageParams = { isFiltered: boolean; isInbox: boolean; scope: InboxScope };

/** Why auto-loading stopped: several pages in a row added nothing to the list. */
const getPausedMessage = ({ isFiltered, isInbox, scope }: PausedMessageParams): string => {
  if (isFiltered) return "No matches in the pages loaded so far";
  if (isInbox && scope === "all") return "No open merge requests in the last repositories checked";
  return "Nothing new in the last pages loaded";
};

const getRowKey = (row: MRListRow): string => row.key;
const estimateRowSize = (row: MRListRow): number =>
  row.kind === "inbox" ? ESTIMATED_INBOX_ROW_PX : ESTIMATED_REPO_ROW_PX;

export const MRList = (): React.ReactElement => {
  const [state, setState] = useState<MRStateFilter>(DEFAULT_STATE);
  const [scope, setScope] = useState<InboxScope>(DEFAULT_SCOPE);
  const [readiness, setReadiness] = useState<ReadinessFilter>(DEFAULT_READINESS);
  const [sort, setSort] = useState<MRSortKey>(DEFAULT_SORT);
  const search = useDebouncedSearch();
  const { selectedHostId, selectedRepoPath, selectedMRIid, isInbox, setMR } = useNav();

  const { rows, loadedCount, list } = useMRListRows({
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
  const listScope = isInbox ? `inbox:${scope}` : `repo:${selectedRepoPath ?? ""}:${state}`;
  const resetKey = [selectedHostId, listScope, search.debouncedValue, readiness, sort].join("\n");
  const isServerSearchBusy =
    !isInbox && search.debouncedValue !== "" && list.isFetching && !list.isFetchingNextPage;

  const pagination: ListPagination = {
    pageCount: list.pageCount,
    loadedCount,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    isIdle: !list.isFetching && !list.isPlaceholderData,
    fetchNextPage: list.fetchNextPage,
    errorMessage: `${getVcsErrorMessage(list.error)} more merge requests`,
    pausedMessage: getPausedMessage({ isFiltered, isInbox, scope }),
  };

  const renderFooter = (): React.ReactNode => {
    if (list.isPending && list.isFetching) return <MRListSkeleton />;
    if (list.isError && !list.hasData) {
      return (
        <ListMessage isError actionLabel="Retry" onAction={list.refetch}>
          {getVcsErrorMessage(list.error)} merge requests
        </ListMessage>
      );
    }
    if (list.hasData && rows.length === 0 && !list.hasNextPage && !list.isPlaceholderData) {
      return <ListMessage>No merge requests found</ListMessage>;
    }
    return null;
  };

  return (
    <section
      aria-label="Merge Requests"
      style={{
        width: 360,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-0)",
        height: "100%",
        overflow: "hidden",
      }}
    >
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

      {isScopeSelected ? (
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
        />
      ) : (
        <ListMessage>Select a repository to see merge requests</ListMessage>
      )}

      {isScopeSelected && list.hasData && (
        <ListStatusBar
          loadedCount={loadedCount}
          {...(isFiltered ? { shownCount: rows.length } : {})}
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
        />
      )}
    </section>
  );
};
