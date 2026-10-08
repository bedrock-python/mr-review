import type { DiffFile } from "@entities/mr";

export type FileTreeNode = {
  name: string;
  path: string;
  file: DiffFile | null;
  children: Map<string, FileTreeNode>;
};

/** One visible row of the file tree, in display order. */
export type FileTreeRow = {
  path: string;
  /** The last path segment in the tree; the whole path in the flat list. */
  name: string;
  /** 0 for top-level entries. */
  depth: number;
  file: DiffFile | null;
  isOpen: boolean;
  parentPath: string | null;
  /** Position among its siblings (1-based) and their count, for aria-posinset / setsize. */
  position: number;
  siblingCount: number;
};

export const buildFileTree = (files: readonly DiffFile[]): FileTreeNode => {
  const root: FileTreeNode = { name: "", path: "", file: null, children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    parts.forEach((part, index) => {
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, index + 1).join("/"),
          file: null,
          children: new Map(),
        };
        node.children.set(part, child);
      }
      node = child;
    });
    node.file = file;
  }
  return root;
};

/** Folders first, then files, each alphabetically. */
const sortedChildren = (node: FileTreeNode): FileTreeNode[] =>
  Array.from(node.children.values()).sort((a, b) => {
    const aIsDir = a.file === null;
    const bIsDir = b.file === null;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

export const collectDirPaths = (node: FileTreeNode): string[] =>
  sortedChildren(node)
    .filter((child) => child.file === null)
    .flatMap((child) => [child.path, ...collectDirPaths(child)]);

/** The rows a reader sees: every top-level entry, and the contents of each open folder. */
export const visibleTreeRows = (
  root: FileTreeNode,
  openDirs: ReadonlySet<string>
): FileTreeRow[] => {
  const rows: FileTreeRow[] = [];
  const walk = (node: FileTreeNode, depth: number, parentPath: string | null): void => {
    const children = sortedChildren(node);
    children.forEach((child, index) => {
      const isDir = child.file === null;
      const isOpen = isDir && openDirs.has(child.path);
      rows.push({
        path: child.path,
        name: child.name,
        depth,
        file: child.file,
        isOpen,
        parentPath,
        position: index + 1,
        siblingCount: children.length,
      });
      if (isOpen) walk(child, depth + 1, child.path);
    });
  };
  walk(root, 0, null);
  return rows;
};

/** The flat list view: one row per file, named by its whole path. */
export const flatFileRows = (files: readonly DiffFile[]): FileTreeRow[] =>
  files.map((file, index) => ({
    path: file.path,
    name: file.path,
    depth: 0,
    file,
    isOpen: false,
    parentPath: null,
    position: index + 1,
    siblingCount: files.length,
  }));

export const matchesFileQuery = (file: DiffFile, query: string): boolean =>
  file.path.toLowerCase().includes(query.toLowerCase());
