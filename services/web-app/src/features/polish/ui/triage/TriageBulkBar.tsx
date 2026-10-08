import { Check, Keyboard, Plus, X } from "lucide-react";
import { cn } from "@shared/lib";
import { SEVERITY_ORDER, SEV_COLOR } from "../../lib";
import type { CommentSeverity } from "@entities/review";

type TriageBulkBarProps = {
  shownCount: number;
  totalCount: number;
  isFiltered: boolean;
  onKeepAll: () => void;
  onDismissAll: () => void;
  onSetSeverity: (severity: CommentSeverity) => void;
  onAdd: () => void;
  isLocked: boolean;
  onShowShortcuts: () => void;
};

export const TriageBulkBar = ({
  shownCount,
  totalCount,
  isFiltered,
  onKeepAll,
  onDismissAll,
  onSetSeverity,
  onAdd,
  isLocked,
  onShowShortcuts,
}: TriageBulkBarProps): React.ReactElement => {
  const scope = isFiltered ? "shown" : "all";
  const isEmpty = shownCount === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-fg-2 mr-1 font-mono text-[11px]" aria-live="polite">
        {isFiltered
          ? `${String(shownCount)} of ${String(totalCount)} shown`
          : `${String(totalCount)} comments`}
      </span>
      <button
        type="button"
        className="btn ghost px-2.5 py-1 text-[11.5px]"
        disabled={isEmpty}
        aria-label={`Keep ${scope} comments`}
        onClick={onKeepAll}
      >
        <Check size={12} aria-hidden="true" />
        Keep {scope}
      </button>
      <button
        type="button"
        className="btn ghost px-2.5 py-1 text-[11.5px]"
        disabled={isEmpty}
        aria-label={`Dismiss ${scope} comments`}
        onClick={onDismissAll}
      >
        <X size={12} aria-hidden="true" />
        Dismiss {scope}
      </button>
      <div className="flex items-center gap-1" role="group" aria-label={`Set severity of ${scope}`}>
        <span className="text-fg-2 font-mono text-[10px] tracking-[0.06em] uppercase">set</span>
        {SEVERITY_ORDER.map((severity) => (
          <button
            key={severity}
            type="button"
            disabled={isEmpty}
            title={`Set ${scope} comments to ${severity}`}
            aria-label={`Set ${scope} comments to ${severity}`}
            onClick={() => {
              onSetSeverity(severity);
            }}
            className={cn(
              "hover:bg-bg-hover flex h-6 w-6 items-center justify-center rounded-md",
              "disabled:cursor-default disabled:opacity-35"
            )}
          >
            <span className="dot" style={{ background: SEV_COLOR[severity] }} />
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="btn px-2.5 py-1 text-[11.5px]"
          disabled={isLocked}
          title={isLocked ? "This iteration was posted; it can't take new comments" : "New (n)"}
          onClick={onAdd}
        >
          <Plus size={12} aria-hidden="true" />
          New comment
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={onShowShortcuts}
        >
          <Keyboard size={14} />
        </button>
      </div>
    </div>
  );
};
