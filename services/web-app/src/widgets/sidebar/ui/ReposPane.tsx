import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepos } from "@entities/mr";
import { useNav } from "@app/navigation";
import { useHosts, useToggleFavouriteRepo } from "@entities/host";
import { Skeleton } from "@shared/ui";
import { getVcsErrorMessage } from "@shared/lib";
import { useCheckUpdate, updateKeys } from "@features/check-update";
import { AddRepoByUrlModal } from "@features/add-repo-by-url";
import type { Repo } from "@entities/mr";

const MIN_QUERY_LENGTH = 2;

type TreeNode =
  | { kind: "namespace"; name: string; fullPath: string; children: TreeNode[] }
  | { kind: "repo"; repo: Repo };

const ReposSkeleton = (): React.ReactElement => (
  <div style={{ padding: "4px 0" }}>
    {Array.from({ length: 6 }, (_, i) => (
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

const VersionBadge = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: updateInfo, isFetching } = useCheckUpdate();

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleForceCheck = (): void => {
    void queryClient.invalidateQueries({ queryKey: updateKeys.all });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
        }}
        title="Version info"
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--fg-3)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          borderRadius: 3,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--fg-1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--fg-3)";
        }}
      >
        v{__APP_VERSION__}
        {updateInfo?.isAnyUpdateAvailable && (
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--accent)",
              marginLeft: 4,
              verticalAlign: "middle",
            }}
          />
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 220,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 10 }}>Version info</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--fg-3)" }}>Backend</span>
              <span
                className="mono"
                style={{
                  color: updateInfo?.backend.isUpdateAvailable ? "var(--accent)" : "var(--fg-0)",
                }}
              >
                v{updateInfo?.backend.current ?? __APP_VERSION__}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--fg-3)" }}>Frontend</span>
              <span
                className="mono"
                style={{
                  color: updateInfo?.frontend?.isUpdateAvailable ? "var(--accent)" : "var(--fg-0)",
                }}
              >
                v{updateInfo?.frontend?.current ?? __APP_VERSION__}
              </span>
            </div>

            {updateInfo?.isAnyUpdateAvailable && (
              <div
                style={{
                  fontSize: 11,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 6,
                  marginTop: 2,
                  color: "var(--fg-3)",
                }}
              >
                Update available — see banner above
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleForceCheck}
            disabled={isFetching}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              cursor: isFetching ? "default" : "pointer",
              color: isFetching ? "var(--fg-3)" : "var(--fg-0)",
              fontSize: 11,
              fontWeight: 500,
              padding: "5px 0",
              transition: "color 0.15s",
            }}
          >
            {isFetching ? "Checking…" : "Check for updates"}
          </button>
        </div>
      )}
    </div>
  );
};

const SearchIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const InboxIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const RepoIcon = (): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    style={{ flexShrink: 0 }}
  >
    <path d="M3 3h18v18H3z" />
    <path d="M9 3v18M9 9h12" />
  </svg>
);

function buildTree(repos: Repo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nsMap = new Map<string, TreeNode & { kind: "namespace" }>();

  for (const repo of repos) {
    const parts = repo.path.split("/");
    if (parts.length === 1) {
      root.push({ kind: "repo", repo });
      continue;
    }
    const namespaceParts = parts.slice(0, -1);
    let siblings = root;
    let accPath = "";
    for (const part of namespaceParts) {
      accPath = accPath ? `${accPath}/${part}` : part;
      let ns = nsMap.get(accPath);
      if (!ns) {
        ns = { kind: "namespace", name: part, fullPath: accPath, children: [] };
        nsMap.set(accPath, ns);
        siblings.push(ns);
      }
      siblings = ns.children;
    }
    siblings.push({ kind: "repo", repo });
  }
  return root;
}

type NamespaceRowProps = {
  node: TreeNode & { kind: "namespace" };
  depth: number;
  selectedRepoPath: string | null;
  selectedHostId: string | null;
  favouriteRepos: Set<string>;
  onSelect: (hostId: string, repoPath: string) => void;
  onToggleFavourite: (hostId: string, repoPath: string) => void;
};

const NamespaceRow = ({
  node,
  depth,
  selectedRepoPath,
  selectedHostId,
  favouriteRepos,
  onSelect,
  onToggleFavourite,
}: NamespaceRowProps): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(true);
  const indent = depth * 12 + 10;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: `4px 10px 4px ${String(indent)}px`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-2)",
          fontSize: 11,
          fontWeight: 600,
          textAlign: "left",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>
      </button>
      {isOpen && (
        <div>
          {node.children.map((child) =>
            child.kind === "namespace" ? (
              <NamespaceRow
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                selectedRepoPath={selectedRepoPath}
                selectedHostId={selectedHostId}
                favouriteRepos={favouriteRepos}
                onSelect={onSelect}
                onToggleFavourite={onToggleFavourite}
              />
            ) : (
              <RepoRow
                key={child.repo.id}
                repo={child.repo}
                depth={depth + 1}
                isSelected={selectedRepoPath === child.repo.path}
                isFavourite={favouriteRepos.has(child.repo.path)}
                selectedHostId={selectedHostId}
                onSelect={onSelect}
                onToggleFavourite={onToggleFavourite}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

const StarIcon = ({ filled }: { filled: boolean }): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.5"
    style={{ flexShrink: 0 }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

type RepoRowProps = {
  repo: Repo;
  depth: number;
  isSelected: boolean;
  isFavourite: boolean;
  selectedHostId: string | null;
  onSelect: (hostId: string, repoPath: string) => void;
  onToggleFavourite: (hostId: string, repoPath: string) => void;
};

const RepoRow = ({
  repo,
  depth,
  isSelected,
  isFavourite,
  selectedHostId,
  onSelect,
  onToggleFavourite,
}: RepoRowProps): React.ReactElement => {
  const indent = depth * 12 + 10;
  return (
    <div
      className={`row-btn${isSelected ? "active" : ""}`}
      style={{
        paddingLeft: indent,
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        paddingRight: 4,
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (selectedHostId) onSelect(selectedHostId, repo.path);
        }}
        aria-pressed={isSelected}
        title={repo.path}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          minWidth: 0,
          padding: 0,
          color: "inherit",
        }}
      >
        <RepoIcon />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            textAlign: "left",
          }}
        >
          {repo.name}
        </span>
      </button>
      <button
        type="button"
        title={isFavourite ? "Remove from favourites" : "Add to favourites"}
        onClick={(e) => {
          e.stopPropagation();
          if (selectedHostId) onToggleFavourite(selectedHostId, repo.path);
        }}
        data-active={isFavourite ? "true" : undefined}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          color: isFavourite ? "var(--c-warn, #e6a817)" : "var(--fg-3)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
        className="fav-star"
      >
        <StarIcon filled={isFavourite} />
      </button>
    </div>
  );
};

export const ReposPane = (): React.ReactElement => {
  const [search, setSearch] = useState("");
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const { selectedHostId, selectedRepoPath, isInbox, setRepo, setInbox } = useNav();
  const { data: hosts } = useHosts();
  const { mutate: toggleFavourite } = useToggleFavouriteRepo();

  const activeQuery = search.length >= MIN_QUERY_LENGTH ? search : undefined;
  const {
    data: repos,
    isLoading,
    isError,
    error: reposError,
  } = useRepos(selectedHostId, activeQuery);

  const selectedHost = hosts?.find((h) => h.id === selectedHostId);

  const favouriteRepos = useMemo(
    () => new Set(selectedHost?.favourite_repos ?? []),
    [selectedHost?.favourite_repos]
  );

  const favouriteRepoObjects = useMemo(
    () => (repos ?? []).filter((r) => favouriteRepos.has(r.path)),
    [repos, favouriteRepos]
  );

  const tree = useMemo(() => buildTree(repos ?? []), [repos]);

  const handleSelect = useCallback(
    (hostId: string, repoPath: string) => {
      setRepo(hostId, repoPath);
    },
    [setRepo]
  );

  const handleToggleFavourite = useCallback(
    (hostId: string, repoPath: string) => {
      toggleFavourite({ hostId, repoPath });
    },
    [toggleFavourite]
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const isTyping = search.length > 0 && search.length < MIN_QUERY_LENGTH;
  const hasNoResults =
    selectedHostId &&
    !isLoading &&
    !isError &&
    activeQuery !== undefined &&
    (repos ?? []).length === 0;

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
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)", lineHeight: 1.3 }}>
            {selectedHost?.name ?? "No host selected"}
          </div>
          {selectedHost && (
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--fg-3)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedHost.base_url}
            </div>
          )}
        </div>

        {/* Search + add-by-url */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 8px",
              minWidth: 0,
            }}
          >
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <input
              type="search"
              placeholder="Search repos…"
              value={search}
              onChange={handleSearchChange}
              aria-label="Search repositories"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--fg-0)",
                minWidth: 0,
              }}
            />
            {isLoading && activeQuery !== undefined && (
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: "1.5px solid var(--fg-3)",
                  borderTopColor: "transparent",
                  animation: "spin 0.6s linear infinite",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
          <button
            type="button"
            title="Add repository by URL"
            aria-label="Add repository by URL"
            disabled={!selectedHostId}
            onClick={() => {
              setIsAddRepoOpen(true);
            }}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: selectedHostId ? "pointer" : "not-allowed",
              color: selectedHostId ? "var(--fg-0)" : "var(--fg-3)",
              opacity: selectedHostId ? 1 : 0.5,
              padding: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Inbox row — shown only when not searching */}
      {selectedHostId && !isLoading && activeQuery === undefined && (
        <div style={{ padding: "8px 0 4px" }}>
          <div className={`row-btn${isInbox ? "active" : ""}`} style={{ paddingLeft: 10 }}>
            <button
              type="button"
              onClick={() => {
                setInbox(selectedHostId);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                padding: 0,
              }}
            >
              <span style={{ color: "var(--fg-2)", display: "flex" }}>
                <InboxIcon />
              </span>
              <span style={{ fontSize: 12 }}>Inbox</span>
            </button>
          </div>
        </div>
      )}

      {/* Repo list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 10px" }}>
        {!selectedHostId && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 16px",
            }}
          >
            Select a host to browse repositories
          </div>
        )}

        {selectedHostId && isTyping && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 60,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 16px",
            }}
          >
            Type {String(MIN_QUERY_LENGTH - search.length)} more character
            {MIN_QUERY_LENGTH - search.length !== 1 ? "s" : ""} to search
          </div>
        )}

        {selectedHostId && isLoading && <ReposSkeleton />}

        {selectedHostId && isError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 16px",
            }}
          >
            {getVcsErrorMessage(reposError)} repositories
          </div>
        )}

        {hasNoResults && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 16px",
            }}
          >
            No repositories found
          </div>
        )}

        {!isTyping && !isLoading && !isError && favouriteRepoObjects.length > 0 && (
          <div
            style={{ borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 4 }}
          >
            <div
              style={{
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--fg-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Favourites
            </div>
            {favouriteRepoObjects.map((repo) => (
              <RepoRow
                key={`fav-${repo.id}`}
                repo={repo}
                depth={0}
                isSelected={selectedRepoPath === repo.path}
                isFavourite={true}
                selectedHostId={selectedHostId}
                onSelect={handleSelect}
                onToggleFavourite={handleToggleFavourite}
              />
            ))}
          </div>
        )}

        {!isTyping &&
          !isLoading &&
          !isError &&
          tree.length > 0 &&
          tree.map((node) =>
            node.kind === "namespace" ? (
              <NamespaceRow
                key={node.fullPath}
                node={node}
                depth={0}
                selectedRepoPath={selectedRepoPath}
                selectedHostId={selectedHostId}
                favouriteRepos={favouriteRepos}
                onSelect={handleSelect}
                onToggleFavourite={handleToggleFavourite}
              />
            ) : (
              <RepoRow
                key={node.repo.id}
                repo={node.repo}
                depth={0}
                isSelected={selectedRepoPath === node.repo.path}
                isFavourite={favouriteRepos.has(node.repo.path)}
                selectedHostId={selectedHostId}
                onSelect={handleSelect}
                onToggleFavourite={handleToggleFavourite}
              />
            )
          )}
      </div>

      {/* Footer */}
      <div
        style={{
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
            color: "var(--fg-3)",
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
