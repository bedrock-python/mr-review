import { getRepoNameFromPath } from "@entities/mr";
import type { Repo } from "@entities/mr";

export type RepoTreeNode =
  | { kind: "namespace"; name: string; fullPath: string; children: RepoTreeNode[] }
  | { kind: "repo"; repo: Repo };

/** One line of the virtualized repositories list. */
export type RepoListRow =
  | { kind: "section"; key: string; label: string }
  | { kind: "divider"; key: string }
  | {
      kind: "namespace";
      key: string;
      name: string;
      fullPath: string;
      depth: number;
      isOpen: boolean;
    }
  | { kind: "repo"; key: string; repo: Repo; depth: number };

/** Fixed row heights; the list relies on them for virtualization and scroll anchoring. */
export const REPO_ROW_HEIGHT: Record<RepoListRow["kind"], number> = {
  section: 24,
  divider: 9,
  namespace: 26,
  repo: 30,
};

export const getRepoRowKey = (row: RepoListRow): string => row.key;

export const getRepoRowHeight = (row: RepoListRow): number => REPO_ROW_HEIGHT[row.kind];

/** Section labels and dividers are decoration: keyboard navigation steps over them. */
export const isRepoRowFocusable = (row: RepoListRow): boolean =>
  row.kind === "repo" || row.kind === "namespace";

/** Groups repositories by namespace, keeping first-seen order at every level. */
export const buildRepoTree = (repos: readonly Repo[]): RepoTreeNode[] => {
  const root: RepoTreeNode[] = [];
  const namespaces = new Map<string, RepoTreeNode & { kind: "namespace" }>();

  for (const repo of repos) {
    const parts = repo.path.split("/");
    if (parts.length === 1) {
      root.push({ kind: "repo", repo });
      continue;
    }
    let siblings = root;
    let accPath = "";
    for (const part of parts.slice(0, -1)) {
      accPath = accPath ? `${accPath}/${part}` : part;
      let namespace = namespaces.get(accPath);
      if (!namespace) {
        namespace = { kind: "namespace", name: part, fullPath: accPath, children: [] };
        namespaces.set(accPath, namespace);
        siblings.push(namespace);
      }
      siblings = namespace.children;
    }
    siblings.push({ kind: "repo", repo });
  }
  return root;
};

/**
 * Favourites as repositories: loaded entries when available, otherwise a stub
 * built from the pinned path, so pins on pages that are not loaded yet still
 * show up (and stay clickable) at the top of the list.
 */
export const resolveFavouriteRepos = (
  favouritePaths: readonly string[],
  loadedRepos: readonly Repo[]
): Repo[] => {
  const byPath = new Map(loadedRepos.map((repo) => [repo.path, repo]));
  return favouritePaths.map(
    (path) =>
      byPath.get(path) ?? {
        id: `favourite:${path}`,
        path,
        name: getRepoNameFromPath(path),
        description: null,
      }
  );
};

export type FlattenRepoRowsParams = {
  favourites: readonly Repo[];
  tree: readonly RepoTreeNode[];
  /** Full paths of collapsed namespaces. */
  collapsed: ReadonlySet<string>;
};

/** Flattens the favourites section and the namespace tree into visible rows. */
export const flattenRepoRows = ({
  favourites,
  tree,
  collapsed,
}: FlattenRepoRowsParams): RepoListRow[] => {
  const rows: RepoListRow[] = [];

  if (favourites.length > 0) {
    rows.push({ kind: "section", key: "section:favourites", label: "Favourites" });
    for (const repo of favourites) {
      rows.push({ kind: "repo", key: `favourite:${repo.path}`, repo, depth: 0 });
    }
    rows.push({ kind: "divider", key: "divider:favourites" });
  }

  const visit = (nodes: readonly RepoTreeNode[], depth: number): void => {
    for (const node of nodes) {
      if (node.kind === "repo") {
        rows.push({ kind: "repo", key: `repo:${node.repo.path}`, repo: node.repo, depth });
        continue;
      }
      const isOpen = !collapsed.has(node.fullPath);
      rows.push({
        kind: "namespace",
        key: `namespace:${node.fullPath}`,
        name: node.name,
        fullPath: node.fullPath,
        depth,
        isOpen,
      });
      if (isOpen) visit(node.children, depth + 1);
    }
  };
  visit(tree, 0);

  return rows;
};
