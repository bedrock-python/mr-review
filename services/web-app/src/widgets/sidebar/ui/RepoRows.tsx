import { memo } from "react";
import { ROW_FOCUS_ATTR } from "@shared/lib";
import { REPO_ROW_HEIGHT } from "../lib/repoTree";
import type { Repo } from "@entities/mr";

const INDENT_STEP_PX = 12;
const INDENT_BASE_PX = 10;
const rowFocusProps = { [ROW_FOCUS_ATTR]: "" };

const getIndent = (depth: number): number => depth * INDENT_STEP_PX + INDENT_BASE_PX;

const RepoIcon = (): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M3 3h18v18H3z" />
    <path d="M9 3v18M9 9h12" />
  </svg>
);

const StarIcon = ({ isFilled }: { isFilled: boolean }): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill={isFilled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.5"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export type RepoRowProps = {
  repo: Repo;
  depth: number;
  isSelected: boolean;
  isFavourite: boolean;
  onSelect: (repoPath: string) => void;
  onToggleFavourite: (repoPath: string) => void;
};

const RepoRowComponent = ({
  repo,
  depth,
  isSelected,
  isFavourite,
  onSelect,
  onToggleFavourite,
}: RepoRowProps): React.ReactElement => (
  <div
    className={isSelected ? "row-btn active" : "row-btn"}
    style={{
      height: REPO_ROW_HEIGHT.repo,
      paddingLeft: getIndent(depth),
      paddingRight: 4,
      display: "flex",
      alignItems: "center",
      gap: 6,
      width: "100%",
    }}
  >
    <button
      type="button"
      {...rowFocusProps}
      onClick={() => {
        onSelect(repo.path);
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
      aria-label={
        isFavourite ? `Remove ${repo.path} from favourites` : `Add ${repo.path} to favourites`
      }
      onClick={(event) => {
        event.stopPropagation();
        onToggleFavourite(repo.path);
      }}
      data-active={isFavourite ? "true" : undefined}
      className="fav-star"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "2px 4px",
        color: isFavourite ? "var(--c-warn)" : "var(--fg-3)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
      }}
    >
      <StarIcon isFilled={isFavourite} />
    </button>
  </div>
);

export const RepoRow = memo(RepoRowComponent);

export type NamespaceRowProps = {
  name: string;
  fullPath: string;
  depth: number;
  isOpen: boolean;
  onToggle: (fullPath: string) => void;
};

const NamespaceRowComponent = ({
  name,
  fullPath,
  depth,
  isOpen,
  onToggle,
}: NamespaceRowProps): React.ReactElement => (
  <button
    type="button"
    {...rowFocusProps}
    onClick={() => {
      onToggle(fullPath);
    }}
    aria-expanded={isOpen}
    title={fullPath}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      width: "100%",
      height: REPO_ROW_HEIGHT.namespace,
      padding: `0 10px 0 ${String(getIndent(depth))}px`,
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
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {name}
    </span>
  </button>
);

export const NamespaceRow = memo(NamespaceRowComponent);

export const SectionLabelRow = ({ label }: { label: string }): React.ReactElement => (
  <div
    style={{
      height: REPO_ROW_HEIGHT.section,
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      fontSize: 10,
      fontWeight: 600,
      color: "var(--fg-2)",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
    }}
  >
    {label}
  </div>
);

export const DividerRow = (): React.ReactElement => (
  <div
    aria-hidden="true"
    style={{ height: REPO_ROW_HEIGHT.divider, display: "flex", alignItems: "center" }}
  >
    <div style={{ height: 1, width: "100%", background: "var(--border)" }} />
  </div>
);
