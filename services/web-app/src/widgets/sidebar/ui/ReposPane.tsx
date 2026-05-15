import { useState } from "react";
import { useRepos } from "@entities/mr";
import { useNav } from "@app/navigation";
import { useHosts } from "@entities/host";
import { Skeleton } from "@shared/ui";

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

const SearchIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChevronDownIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
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

export const ReposPane = (): React.ReactElement => {
  const [search, setSearch] = useState("");
  const { selectedHostId, selectedRepoPath, setRepo } = useNav();
  const { data: hosts } = useHosts();
  const { data: repos, isLoading, isError } = useRepos(selectedHostId);

  const selectedHost = hosts?.find((h) => h.id === selectedHostId);

  const filteredRepos =
    repos?.filter(
      (repo) =>
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        repo.path.toLowerCase().includes(search.toLowerCase())
    ) ?? [];

  const totalOpenMRs = filteredRepos.length;

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
        height: "100vh",
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

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 8px",
          }}
        >
          <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Filter repos…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            aria-label="Filter repositories"
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
          <span className="kbd">⌘K</span>
        </div>
      </div>

      {/* Inbox row */}
      {selectedHostId && !isLoading && (
        <div style={{ padding: "8px 10px 4px" }}>
          <button type="button" className="row-btn" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--fg-2)" }}>
                <InboxIcon />
              </span>
              <span style={{ fontSize: 12 }}>Inbox</span>
            </span>
            {totalOpenMRs > 0 && (
              <span className="chip" style={{ fontSize: 10, padding: "1px 6px" }}>
                {totalOpenMRs}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Repo list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 10px" }}>
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
            Failed to load repositories
          </div>
        )}

        {selectedHostId && !isLoading && filteredRepos.length === 0 && !isError && (
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

        {filteredRepos.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px 4px",
                color: "var(--fg-3)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "default",
              }}
            >
              <ChevronDownIcon />
              Repositories
            </div>

            {filteredRepos.map((repo) => {
              const isSelected = selectedRepoPath === repo.path;
              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => {
                    if (selectedHostId) setRepo(selectedHostId, repo.path);
                  }}
                  aria-pressed={isSelected}
                  title={repo.path}
                  className={`row-btn${isSelected ? "active" : ""}`}
                  style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                    }}
                  >
                    {repo.name}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--fg-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                    }}
                  >
                    {repo.path}
                  </span>
                </button>
              );
            })}
          </>
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
        <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
          v0.1
        </span>
      </div>
    </aside>
  );
};
