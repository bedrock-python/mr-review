import { useMemo } from "react";
import { useInfiniteRepos } from "@entities/mr";
import { flattenPages } from "@shared/api";
import { buildRepoTree, flattenRepoRows, resolveFavouriteRepos } from "../lib/repoTree";
import type { InfiniteListResult, Repo, RepoPage } from "@entities/mr";
import type { RepoListRow } from "../lib/repoTree";

export type UseRepoListRowsParams = {
  hostId: string | null;
  /** Committed server search, `undefined` when not searching. */
  query: string | undefined;
  favouritePaths: readonly string[];
  collapsed: ReadonlySet<string>;
};

export type RepoListRowsResult = {
  reposQuery: InfiniteListResult<RepoPage>;
  /** Repositories loaded from the server so far (deduplicated). */
  repos: Repo[];
  rows: RepoListRow[];
};

const getRepoPath = (repo: Repo): string => repo.path;

/** Loads repositories page by page and lays them out as favourites + namespace tree. */
export const useRepoListRows = ({
  hostId,
  query,
  favouritePaths,
  collapsed,
}: UseRepoListRowsParams): RepoListRowsResult => {
  const reposQuery = useInfiniteRepos(hostId, query);
  const { data } = reposQuery;

  const repos = useMemo(() => flattenPages(data, getRepoPath), [data]);

  const favourites = useMemo((): Repo[] => {
    if (query === undefined) return resolveFavouriteRepos(favouritePaths, repos);
    // While searching, only pins that match the server-side search are relevant.
    const pinned = new Set(favouritePaths);
    return repos.filter((repo) => pinned.has(repo.path));
  }, [query, favouritePaths, repos]);

  const tree = useMemo(() => buildRepoTree(repos), [repos]);

  const rows = useMemo(
    () => flattenRepoRows({ favourites, tree, collapsed }),
    [favourites, tree, collapsed]
  );

  return { reposQuery, repos, rows };
};
