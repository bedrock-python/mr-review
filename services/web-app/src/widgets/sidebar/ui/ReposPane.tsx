import { useMemo, useState } from "react";
import { Server } from "lucide-react";
import { useNav } from "@app/navigation";
import { MIN_REPO_QUERY_LENGTH } from "@entities/mr";
import { useHosts, useToggleFavouriteRepo } from "@entities/host";
import { EmptyState, ICON_SIZE, ListStatusBar, RefreshErrorNote } from "@shared/ui";
import { useDebouncedSearch, useStableCallback } from "@shared/lib";
import { AddRepoByUrlModal } from "@features/add-repo-by-url";
import { useRepoListRows } from "../model/useRepoListRows";
import { hostConnectionOf } from "../lib/hostConnection";
import { HostStatus } from "./HostStatus";
import { InboxEntry } from "./InboxEntry";
import { RepoList } from "./RepoList";
import { ReposPaneHeader } from "./ReposPaneHeader";
import { VersionBadge } from "./VersionBadge";

/** Width of the pane; the navigator is this plus the merge request list. */
const REPOS_PANE_WIDTH_PX = 268;
const NO_FAVOURITES: readonly string[] = [];

/** Namespaces collapsed by the user; reset whenever another host is selected. */
type CollapsedNamespaces = { hostId: string | null; paths: ReadonlySet<string> };

/** Before a host is picked; with none at all, the workspace offers to add one. */
const NoHostSelected = (): React.ReactElement => {
  const { data: hosts } = useHosts();
  const hasNoHosts = hosts?.length === 0;
  return (
    <EmptyState
      size="sm"
      icon={<Server size={ICON_SIZE.inline} />}
      title={hasNoHosts ? "No hosts yet" : "No host selected"}
      description={
        hasNoHosts
          ? "Add a Git host with the + in the rail to browse its repositories."
          : "Pick a host in the rail on the left to browse its repositories."
      }
    />
  );
};

export const ReposPane = (): React.ReactElement => {
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const [isAutoLoadPaused, setIsAutoLoadPaused] = useState(false);
  const [collapsedState, setCollapsedState] = useState<CollapsedNamespaces>(() => ({
    hostId: null,
    paths: new Set(),
  }));
  const search = useDebouncedSearch();
  const { selectedHostId, selectedRepoPath, isInbox, setRepo, setInbox } = useNav();
  const { data: hosts } = useHosts();
  const { mutate: toggleFavourite } = useToggleFavouriteRepo();

  const selectedHost = hosts?.find((host) => host.id === selectedHostId);
  const favouritePaths = selectedHost?.favourite_repos ?? NO_FAVOURITES;
  const favouriteSet = useMemo(() => new Set(favouritePaths), [favouritePaths]);
  const collapsed = useMemo(
    () => (collapsedState.hostId === selectedHostId ? collapsedState.paths : new Set<string>()),
    [collapsedState, selectedHostId]
  );

  const committedQuery = search.debouncedValue;
  const isTyping = committedQuery.length > 0 && committedQuery.length < MIN_REPO_QUERY_LENGTH;
  const activeQuery = committedQuery.length >= MIN_REPO_QUERY_LENGTH ? committedQuery : undefined;

  const { reposQuery, repos, rows } = useRepoListRows({
    hostId: selectedHostId,
    query: activeQuery,
    favouritePaths,
    collapsed,
  });

  const handleSelectRepo = useStableCallback((repoPath: string): void => {
    if (selectedHostId) setRepo(selectedHostId, repoPath);
  });
  const handleToggleFavourite = useStableCallback((repoPath: string): void => {
    if (selectedHostId) toggleFavourite({ hostId: selectedHostId, repoPath });
  });
  const handleToggleNamespace = useStableCallback((fullPath: string): void => {
    setCollapsedState((previous) => {
      const paths = new Set(previous.hostId === selectedHostId ? previous.paths : []);
      if (paths.has(fullPath)) paths.delete(fullPath);
      else paths.add(fullPath);
      return { hostId: selectedHostId, paths };
    });
  });

  const isSearchBusy =
    search.isPending ||
    (activeQuery !== undefined && reposQuery.isFetching && !reposQuery.isFetchingNextPage);
  const isListVisible = selectedHostId !== null && !isTyping;
  // A refresh that failed over loaded repositories (a failed next page has its own row).
  const hasRefreshFailed =
    reposQuery.isError &&
    reposQuery.data !== undefined &&
    !reposQuery.isFetchNextPageError &&
    !reposQuery.isFetching;
  const remainingChars = MIN_REPO_QUERY_LENGTH - committedQuery.length;

  return (
    <aside
      aria-label="Repositories"
      className="border-border bg-bg-1 flex h-full shrink-0 flex-col overflow-hidden border-r"
      style={{ width: REPOS_PANE_WIDTH_PX }}
    >
      <ReposPaneHeader
        host={selectedHost}
        search={search.value}
        onSearchChange={search.setValue}
        isSearchBusy={isSearchBusy}
        canAddRepo={selectedHostId !== null}
        onAddRepo={() => {
          setIsAddRepoOpen(true);
        }}
      />

      {selectedHostId && committedQuery === "" && (
        <InboxEntry
          isActive={isInbox}
          onOpen={() => {
            setInbox(selectedHostId);
          }}
        />
      )}

      {!selectedHostId && <NoHostSelected />}

      {selectedHostId && isTyping && (
        <p
          role="status"
          className="text-fg-2 m-0 px-(--space-3) py-(--space-3) text-(length:--fs-meta)"
        >
          Type {String(remainingChars)} more character{remainingChars !== 1 ? "s" : ""} to search
        </p>
      )}

      {isListVisible && hasRefreshFailed && (
        <RefreshErrorNote
          what="the repositories"
          message={reposQuery.error.message}
          onRetry={() => {
            void reposQuery.refetch();
          }}
        />
      )}

      {isListVisible && (
        <RepoList
          rows={rows}
          loadedCount={repos.length}
          reposQuery={reposQuery}
          isSearching={activeQuery !== undefined}
          resetKey={`${selectedHostId}\n${activeQuery ?? ""}`}
          selectedRepoPath={selectedRepoPath}
          favouriteRepos={favouriteSet}
          onSelectRepo={handleSelectRepo}
          onToggleFavourite={handleToggleFavourite}
          onToggleNamespace={handleToggleNamespace}
          onAutoLoadPausedChange={setIsAutoLoadPaused}
        />
      )}

      {isListVisible && reposQuery.data !== undefined && (
        <ListStatusBar
          loadedCount={repos.length}
          hasNextPage={reposQuery.hasNextPage}
          isFetchingNextPage={reposQuery.isFetchingNextPage}
          isAutoLoadPaused={isAutoLoadPaused}
        />
      )}

      <div className="border-border mt-auto flex min-h-(--control-lg) shrink-0 items-center justify-between gap-(--space-2) border-t px-(--space-3)">
        {selectedHostId === null ? (
          <span />
        ) : (
          <HostStatus
            connection={hostConnectionOf(reposQuery)}
            errorMessage={reposQuery.error?.message}
          />
        )}
        <VersionBadge />
      </div>
      <AddRepoByUrlModal
        isOpen={isAddRepoOpen}
        hostId={selectedHostId}
        onClose={() => {
          setIsAddRepoOpen(false);
        }}
      />
    </aside>
  );
};
