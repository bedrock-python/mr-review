import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bookmark, BookmarkCheck, Pencil, Trash2 } from "lucide-react";
import { cn } from "@shared/lib";
import { Badge, Button, ICON_SIZE, buttonClassName } from "@shared/ui";
import type { ReviewPreset } from "@entities/review-preset";

const SETTINGS_PATH = "/settings";

const icon = (Icon: typeof Pencil): React.ReactNode => (
  <Icon size={ICON_SIZE.inline} aria-hidden="true" />
);

export type SavedPresetListProps = {
  presets: ReviewPreset[];
  selectedId: string | null;
  /** Click, Enter or Space on a preset: use it, or stop using the one in use. */
  onToggle: (preset: ReviewPreset) => void;
  onEdit: (preset: ReviewPreset) => void;
  /** Asks first (a ConfirmDialog), like every delete in the app. */
  onDelete: (preset: ReviewPreset) => void;
  /** The list, for the caller to find a row's neighbour (`data-preset-id`, `data-preset-edit`). */
  listRef?: React.Ref<HTMLDivElement>;
};

/**
 * The saved presets, one row each: a toggle button that applies the preset, then its Edit and
 * Delete. Applying one replaces brief settings, so it takes a deliberate press — not a radio
 * group, where the arrow keys would apply every preset they pass.
 */
export const SavedPresetList = ({
  presets,
  selectedId,
  onToggle,
  onEdit,
  onDelete,
  listRef,
}: SavedPresetListProps): React.ReactElement => {
  const id = useId();

  return (
    <div ref={listRef} className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      <div className="flex items-center justify-between" style={{ gap: "var(--space-2)" }}>
        <span id={`${id}-label`} className="text-fg-2" style={{ fontSize: "var(--fs-meta)" }}>
          Saved presets
        </span>
        <Link to={SETTINGS_PATH} className={buttonClassName({ variant: "ghost", size: "sm" })}>
          Manage in Settings
          {icon(ArrowUpRight)}
        </Link>
      </div>
      <ul
        aria-labelledby={`${id}-label`}
        className="m-0 flex list-none flex-col p-0"
        style={{ gap: "var(--space-2)" }}
      >
        {presets.map((preset) => {
          const isSelected = preset.id === selectedId;
          return (
            <li
              key={preset.id}
              data-preset-id={preset.id}
              className={cn(
                "bg-bg-1 flex items-center border transition-colors",
                isSelected ? "border-accent-fg" : "border-border hover:border-border-strong"
              )}
              style={{
                gap: "var(--space-1)",
                paddingRight: "var(--space-2)",
                borderRadius: "var(--radius-card)",
                boxShadow: isSelected ? "inset 0 0 0 1px var(--accent-fg)" : undefined,
                transitionDuration: "var(--dur-fast)",
              }}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onToggle(preset);
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-start text-left -outline-offset-2"
                style={{
                  gap: "var(--space-2)",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-card)",
                }}
              >
                <span className={isSelected ? "text-accent-fg" : "text-fg-2"}>
                  {icon(isSelected ? BookmarkCheck : Bookmark)}
                </span>
                <span className="flex min-w-0 flex-col" style={{ gap: "var(--space-1)" }}>
                  <span
                    className="text-fg-0"
                    style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-semibold)" }}
                  >
                    {preset.name}
                  </span>
                  <span className="text-fg-2 truncate" style={{ fontSize: "var(--fs-meta)" }}>
                    {preset.description || "No description"}
                  </span>
                </span>
              </button>
              {isSelected && <Badge tone="accent">In use</Badge>}
              <Button
                variant="ghost"
                size="sm"
                icon={icon(Pencil)}
                data-preset-edit=""
                aria-label={`Edit preset ${preset.name}`}
                onClick={() => {
                  onEdit(preset);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                tone="danger"
                size="sm"
                icon={icon(Trash2)}
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => {
                  onDelete(preset);
                }}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
