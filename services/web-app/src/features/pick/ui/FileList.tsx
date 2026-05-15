import { useState } from "react";
import type { DiffFile } from "@entities/mr";

export type FileListProps = {
  files: DiffFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

type TreeNode = {
  name: string;
  path: string;
  file?: DiffFile;
  children: Map<string, TreeNode>;
};

const buildTree = (files: DiffFile[]): TreeNode => {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? "";
      const nodePath = parts.slice(0, i + 1).join("/");
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: nodePath, children: new Map() });
      }
      const child = node.children.get(part);
      if (child) node = child;
    }
    node.file = file;
  }
  return root;
};

type FileNodeProps = {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
};

const ChevronIcon = ({ isOpen }: { isOpen: boolean }): React.ReactElement => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    style={{
      transition: "transform 0.1s",
      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
      flexShrink: 0,
    }}
  >
    <polyline points="3 2 7 5 3 8" />
  </svg>
);

const FileIcon = (): React.ReactElement => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="currentColor"
    style={{ flexShrink: 0, opacity: 0.5 }}
  >
    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5L9.5 0H4zm5.5 1.5L12.5 4.5H10a.5.5 0 0 1-.5-.5V1.5z" />
  </svg>
);

const DirIcon = ({ isOpen }: { isOpen: boolean }): React.ReactElement => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="currentColor"
    style={{ flexShrink: 0, opacity: 0.6 }}
  >
    {isOpen ? (
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z" />
    ) : (
      <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707z" />
    )}
  </svg>
);

const FileNode = ({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: FileNodeProps): React.ReactElement => {
  const isDir = !node.file;
  const isOpen = expandedDirs.has(node.path);
  const isActive = node.file?.path === selectedPath;
  const indent = depth * 12;

  const childEntries = Array.from(node.children.entries()).sort(([aKey, aNode], [bKey, bNode]) => {
    const aIsDir = !aNode.file;
    const bIsDir = !bNode.file;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return aKey.localeCompare(bKey);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            onToggleDir(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        title={node.path}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          paddingLeft: 8 + indent,
          paddingRight: 8,
          height: 26,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          whiteSpace: "nowrap",
          textAlign: "left",
          cursor: "pointer",
          color: isActive ? "var(--fg-0)" : "var(--fg-2)",
          background: isActive
            ? "color-mix(in oklch, var(--accent) 14%, transparent)"
            : "transparent",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "background 0.08s, color 0.08s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "var(--bg-2)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {isDir ? (
          <>
            <ChevronIcon isOpen={isOpen} />
            <DirIcon isOpen={isOpen} />
          </>
        ) : (
          <>
            <span style={{ width: 10, flexShrink: 0 }} />
            <FileIcon />
          </>
        )}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {node.name}
        </span>
        {node.file && (
          <span style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 4 }}>
            {node.file.additions > 0 && (
              <span style={{ color: "oklch(72% 0.18 145)", fontSize: 10 }}>
                +{node.file.additions}
              </span>
            )}
            {node.file.deletions > 0 && (
              <span style={{ color: "oklch(68% 0.20 25)", fontSize: 10 }}>
                -{node.file.deletions}
              </span>
            )}
          </span>
        )}
      </button>
      {isDir &&
        isOpen &&
        childEntries.map(([, child]) => (
          <FileNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        ))}
    </>
  );
};

const collectAllDirs = (node: TreeNode): string[] => {
  const dirs: string[] = [];
  for (const child of node.children.values()) {
    if (!child.file) {
      dirs.push(child.path);
      dirs.push(...collectAllDirs(child));
    }
  }
  return dirs;
};

const highlightMatch = (text: string, query: string): React.ReactElement => {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "color-mix(in oklch, var(--accent) 35%, transparent)",
          color: "inherit",
          borderRadius: 2,
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

const TreeViewIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2H8v1h3a1 1 0 0 1 1 1v1h1a1 1 0 0 1 0 2h-1v1a1 1 0 0 1-1 1H8v1h.5a1 1 0 0 1 0 2h-3a1 1 0 0 1 0-2H6v-1H3a1 1 0 0 1-1-1V9H1a1 1 0 0 1 0-2h1V6a1 1 0 0 1 1-1h3V4H7a1 1 0 0 1-1-1V2zM5 5H3v1h2V5zm0 4H3v1h2V9zm5 0v1h1V9h-1zM7 2H6v1h1V2z" />
  </svg>
);

const ListViewIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-1a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1H5zM2 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-1a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1H5zm-3 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-1a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1H5z"
    />
  </svg>
);

export const FileList = ({ files, selectedPath, onSelect }: FileListProps): React.ReactElement => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(collectAllDirs(buildTree(files)))
  );
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");

  const handleToggleDir = (path: string): void => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const trimmed = query.trim();
  const matchedFiles = trimmed
    ? files.filter((f) => f.path.toLowerCase().includes(trimmed.toLowerCase()))
    : files;
  const showFlat = viewMode === "list";
  const flatFiles = showFlat ? matchedFiles : null;
  const tree = buildTree(showFlat ? files : matchedFiles);
  // When searching in tree mode auto-expand all dirs that contain matches
  const effectiveExpandedDirs = trimmed && !showFlat ? new Set(collectAllDirs(tree)) : expandedDirs;

  const rootEntries = Array.from(tree.children.entries()).sort(([aKey, aNode], [bKey, bNode]) => {
    const aIsDir = !aNode.file;
    const bIsDir = !bNode.file;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return aKey.localeCompare(bKey);
  });

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0 10px",
          height: 34,
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span>
          Files{" "}
          {flatFiles && flatFiles.length !== files.length
            ? `${String(flatFiles.length)} / ${String(files.length)}`
            : files.length}
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {(["tree", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              title={mode === "tree" ? "Tree view" : "List view"}
              onClick={() => {
                setViewMode(mode);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 3,
                cursor: "pointer",
                color: viewMode === mode ? "var(--accent)" : "var(--fg-3)",
                background:
                  viewMode === mode
                    ? "color-mix(in oklch, var(--accent) 14%, transparent)"
                    : "transparent",
                transition: "background 0.08s, color 0.08s",
              }}
            >
              {mode === "tree" ? <TreeViewIcon /> : <ListViewIcon />}
            </button>
          ))}
        </div>
      </div>

      {/* Search input */}
      <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            style={{
              position: "absolute",
              left: 7,
              color: "var(--fg-3)",
              pointerEvents: "none",
              flexShrink: 0,
            }}
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Filter files…"
            style={{
              width: "100%",
              paddingLeft: 24,
              paddingRight: query ? 24 : 8,
              height: 26,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-1)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
              }}
              style={{
                position: "absolute",
                right: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--fg-3)",
                cursor: "pointer",
                opacity: 0.7,
              }}
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
              >
                <line x1="1" y1="1" x2="7" y2="7" />
                <line x1="7" y1="1" x2="1" y2="7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* File list / tree */}
      <div
        role="tree"
        aria-label="Changed files"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: 4, paddingBottom: 4 }}
      >
        {flatFiles ? (
          flatFiles.length === 0 ? (
            <div
              style={{
                padding: "12px 10px",
                fontSize: 11,
                color: "var(--fg-3)",
                fontFamily: "var(--font-mono)",
                textAlign: "center",
              }}
            >
              No matches
            </div>
          ) : (
            flatFiles.map((file) => {
              const isActive = file.path === selectedPath;
              return (
                <button
                  key={file.path}
                  type="button"
                  title={file.path}
                  onClick={() => {
                    onSelect(file.path);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    width: "100%",
                    paddingLeft: 8,
                    paddingRight: 8,
                    height: 26,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    textAlign: "left",
                    cursor: "pointer",
                    color: isActive ? "var(--fg-0)" : "var(--fg-2)",
                    background: isActive
                      ? "color-mix(in oklch, var(--accent) 14%, transparent)"
                      : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    transition: "background 0.08s, color 0.08s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--bg-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <FileIcon />
                  <span
                    style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
                  >
                    {trimmed ? highlightMatch(file.path, trimmed) : file.path}
                  </span>
                  <span style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 4 }}>
                    {file.additions > 0 && (
                      <span style={{ color: "oklch(72% 0.18 145)", fontSize: 10 }}>
                        +{file.additions}
                      </span>
                    )}
                    {file.deletions > 0 && (
                      <span style={{ color: "oklch(68% 0.20 25)", fontSize: 10 }}>
                        -{file.deletions}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )
        ) : (
          rootEntries.map(([, child]) => (
            <FileNode
              key={child.path}
              node={child}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirs={effectiveExpandedDirs}
              onToggleDir={handleToggleDir}
            />
          ))
        )}
      </div>
    </div>
  );
};
