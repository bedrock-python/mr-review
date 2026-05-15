import { useState } from "react";
import { cn } from "@shared/lib";
import { Spinner } from "@shared/ui";
import { useRepos } from "@entities/mr";
import { useAppStore } from "@app/providers";

export const ReposPane = (): React.ReactElement => {
  const [search, setSearch] = useState("");
  const { selectedHostId, selectedRepoPath, setRepo } = useAppStore();

  const { data: repos, isLoading, isError } = useRepos(selectedHostId);

  const filteredRepos = repos?.filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.path.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  return (
    <aside
      aria-label="Repositories"
      className="flex flex-col w-[268px] h-screen bg-surface border-r border-border flex-shrink-0"
    >
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Repositories
        </h2>
        <input
          type="search"
          placeholder="Filter repos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter repositories"
          className={cn(
            "w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border",
            "text-sm text-text placeholder:text-text-muted",
            "focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
          )}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedHostId && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            Select a host to browse repositories
          </div>
        )}

        {selectedHostId && isLoading && (
          <div className="flex justify-center pt-8">
            <Spinner size="md" />
          </div>
        )}

        {selectedHostId && isError && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            Failed to load repositories
          </div>
        )}

        {selectedHostId && !isLoading && filteredRepos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            No repositories found
          </div>
        )}

        {filteredRepos.map((repo) => {
          const isSelected = selectedRepoPath === repo.path;
          return (
            <button
              key={repo.id}
              type="button"
              onClick={() => setRepo(repo.path)}
              aria-pressed={isSelected}
              title={repo.path}
              className={cn(
                "w-full text-left px-4 py-2.5 border-b border-border/50",
                "hover:bg-surface-2 transition-colors group",
                isSelected && "bg-surface-2 border-l-2 border-l-[var(--accent)]",
              )}
            >
              <p
                className={cn(
                  "text-sm font-medium truncate",
                  isSelected ? "text-text" : "text-text-muted group-hover:text-text",
                )}
              >
                {repo.name}
              </p>
              <p className="text-[11px] text-text-muted truncate font-mono mt-0.5">
                {repo.path}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
