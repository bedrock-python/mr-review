import { memo, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { SeverityCounts } from "@entities/review";
import { cn } from "@shared/lib";
import { CountBadge, ICON_SIZE } from "@shared/ui";
import { countBySeverity } from "../../lib";
import type { CommentGroup } from "../../lib";

type GroupHeaderProps = {
  group: CommentGroup;
  isCollapsed: boolean;
  onToggle: (key: string) => void;
};

const GroupHeaderBase = ({
  group,
  isCollapsed,
  onToggle,
}: GroupHeaderProps): React.ReactElement => {
  const counts = useMemo(() => countBySeverity(group.comments), [group.comments]);
  const dismissed = group.comments.filter((c) => c.status === "dismissed").length;
  const total = group.comments.length;

  return (
    <button
      type="button"
      aria-expanded={!isCollapsed}
      aria-label={`${group.label}, ${String(total)} ${total === 1 ? "comment" : "comments"}`}
      onClick={() => {
        onToggle(group.key);
      }}
      className={cn(
        "flex min-h-(--control-md) w-full items-center gap-2 px-1.5 text-left",
        "hover:bg-bg-hover rounded-(--radius-control) transition-colors",
        "focus-visible:-outline-offset-2"
      )}
    >
      <ChevronRight
        size={ICON_SIZE.inline}
        aria-hidden="true"
        className={cn("text-fg-2 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
      />
      <span className="text-fg-0 min-w-0 truncate font-mono text-(length:--fs-meta)">
        {group.label}
      </span>
      <CountBadge count={total} />
      <SeverityCounts counts={counts} isCompact />
      {dismissed > 0 && (
        <span className="text-fg-2 font-mono text-(length:--fs-meta)">{dismissed} dismissed</span>
      )}
    </button>
  );
};

export const GroupHeader = memo(GroupHeaderBase);
