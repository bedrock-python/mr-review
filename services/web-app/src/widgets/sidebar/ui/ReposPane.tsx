import { useMemo, useState } from "react";
import { useNav } from "@app/navigation";
import { MIN_REPO_QUERY_LENGTH } from "@entities/mr";
import { useHosts, useToggleFavouriteRepo } from "@entities/host";
import { ListMessage, ListStatusBar } from "@shared/ui";
import { useDebouncedSearch, useStableCallback } from "@shared/lib";
import { AddRepoByUrlModal } from "@features/add-repo-by-url";
import { useRepoListRows } from "../model/useRepoListRows";
import { InboxEntry } from "./InboxEntry";
import { RepoList } from "./RepoList";
import { ReposPaneHeader } from "./ReposPaneHeader";
import { VersionBadge } from "./VersionBadge";

const NO_FAVOURITES: readonly string[] = [];

/** Namespaces collapsed by the user; reset whenever another host is selected. */
type CollapsedNamespaces = { hostId: string | null; paths: ReadonlySet<string> };

export const ReposPane = (): React.ReactElement => {
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
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
  const remainingChars = MIN_REPO_QUERY_LENGTH - committedQuery.length;

  return (
    <aside
      aria-label="Repositories"
      style={{
        width: 268,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-1)",
        height: "100%",
        overflow: "hidden",
      }}
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

      {!selectedHostId && <ListMessage>Select a host to browse repositories</ListMessage>}

      {selectedHostId && isTyping && (
        <ListMessage>
          Type {String(remainingChars)} more character{remainingChars !== 1 ? "s" : ""} to search
        </ListMessage>
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
        />
      )}

      {isListVisible && reposQuery.data !== undefined && (
        <ListStatusBar
          loadedCount={repos.length}
          hasNextPage={reposQuery.hasNextPage}
          isFetchingNextPage={reposQuery.isFetchingNextPage}
        />
      )}

      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--border)",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--fg-2)",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: selectedHostId ? "var(--c-add)" : "var(--fg-3)",
              display: "inline-block",
            }}
          />
          {selectedHostId ? "connected" : "disconnected"}
        </span>
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
