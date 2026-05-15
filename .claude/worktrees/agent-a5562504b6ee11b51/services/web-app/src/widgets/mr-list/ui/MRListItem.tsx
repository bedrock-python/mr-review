import { cn } from "@shared/lib";
import type { MR, PipelineStatus } from "@entities/mr";

export type MRListItemProps = {
  mr: MR;
  isSelected: boolean;
  onClick: () => void;
};

const PIPELINE_BADGE_STYLES: Record<NonNullable<PipelineStatus>, string> = {
  passed: "text-green-400",
  failed: "text-red-400",
  running: "text-yellow-400",
  none: "text-text-muted",
};

const PIPELINE_BADGE_LABELS: Record<NonNullable<PipelineStatus>, string> = {
  passed: "passed",
  failed: "failed",
  running: "running",
  none: "—",
};

const formatAge = (dateStr: string): string => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d";
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
};

export const MRListItem = ({ mr, isSelected, onClick }: MRListItemProps): React.ReactElement => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/50",
        "hover:bg-surface-2 transition-colors",
        isSelected && "bg-surface-2 border-l-2 border-l-[var(--accent)]",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-mono text-text-muted mt-0.5 flex-shrink-0">
          !{mr.iid}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm leading-snug line-clamp-2",
              isSelected ? "text-text font-medium" : "text-text-muted",
            )}
          >
            {mr.draft && (
              <span className="text-[10px] font-mono bg-surface-2 text-text-muted px-1 py-0.5 rounded mr-1.5">
                DRAFT
              </span>
            )}
            {mr.title}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5">
            <span className="text-[11px] text-text-muted truncate max-w-[100px]">
              {mr.author}
            </span>
            <span className="text-[11px] text-text-muted">
              {formatAge(mr.created_at)}
            </span>
            {mr.pipeline !== null && mr.pipeline !== "none" && (
              <span
                className={cn(
                  "text-[10px] font-mono",
                  PIPELINE_BADGE_STYLES[mr.pipeline],
                )}
              >
                {PIPELINE_BADGE_LABELS[mr.pipeline]}
              </span>
            )}
            <span className="text-[11px] text-text-muted ml-auto font-mono">
              +{mr.additions} -{mr.deletions}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};
