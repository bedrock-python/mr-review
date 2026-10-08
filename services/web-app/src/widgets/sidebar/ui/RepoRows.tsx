import { memo } from "react";
import { Book, ChevronRight, Star } from "lucide-react";
import { ROW_FOCUS_ATTR, cn } from "@shared/lib";
import { ICON_SIZE } from "@shared/ui";
import { REPO_ROW_HEIGHT } from "../lib/repoTree";
import { sidebarRowClassName } from "./sidebarRow";
import type { Repo } from "@entities/mr";

const INDENT_STEP_PX = 12;
const INDENT_BASE_PX = 10;
const rowFocusProps = { [ROW_FOCUS_ATTR]: "" };

const getIndent = (depth: number): number => depth * INDENT_STEP_PX + INDENT_BASE_PX;

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
    className={sidebarRowClassName(isSelected)}
    style={{
      height: REPO_ROW_HEIGHT.repo,
      paddingLeft: getIndent(depth),
      paddingRight: "var(--space-1)",
      gap: "var(--space-1)",
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
      className="flex min-w-0 flex-1 items-center gap-(--space-2) text-left"
    >
      <Book size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-2 shrink-0" />
      <span className="flex-1 truncate text-(length:--fs-control) font-medium">{repo.name}</span>
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
      className={cn(
        "flex size-(--control-sm) shrink-0 items-center justify-center rounded-(--radius-1)",
        // A favourite always shows its star; the others on row hover, and on keyboard focus
        // too, or Tab would land on nothing.
        isFavourite
          ? "text-(--c-major)"
          : "text-fg-3 hover:text-fg-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      )}
    >
      <Star
        size={ICON_SIZE.inline}
        aria-hidden="true"
        fill={isFavourite ? "currentColor" : "none"}
      />
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
    className="ui-eyebrow hover:text-fg-1 flex w-full items-center gap-(--space-1) text-left"
    style={{
      height: REPO_ROW_HEIGHT.namespace,
      padding: `0 ${String(INDENT_BASE_PX)}px 0 ${String(getIndent(depth))}px`,
    }}
  >
    <ChevronRight
      size={ICON_SIZE.inline}
      aria-hidden="true"
      className={cn("shrink-0 transition-transform duration-(--dur-base)", isOpen && "rotate-90")}
    />
    <span className="truncate">{name}</span>
  </button>
);

export const NamespaceRow = memo(NamespaceRowComponent);

export const SectionLabelRow = ({ label }: { label: string }): React.ReactElement => (
  <div
    className="ui-eyebrow flex items-center"
    style={{ height: REPO_ROW_HEIGHT.section, padding: `0 ${String(INDENT_BASE_PX)}px` }}
  >
    {label}
  </div>
);

export const DividerRow = (): React.ReactElement => (
  <div aria-hidden="true" className="flex items-center" style={{ height: REPO_ROW_HEIGHT.divider }}>
    <div className="bg-border h-px w-full" />
  </div>
);
