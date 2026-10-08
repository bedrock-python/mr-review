import { memo, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@shared/lib";
import { SEVERITY_ORDER, SEV_COLOR, countBySeverity } from "../../lib";
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
      className="hover:bg-bg-hover flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left"
    >
      <ChevronRight
        size={13}
        aria-hidden="true"
        className={cn("text-fg-2 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
      />
      <span className="text-fg-0 truncate font-mono text-[11.5px]">{group.label}</span>
      <span className="chip">{total}</span>
      {SEVERITY_ORDER.map((severity) =>
        counts[severity] > 0 ? (
          <span
            key={severity}
            title={`${String(counts[severity])} ${severity}`}
            className="flex items-center gap-1 font-mono text-[10px]"
            style={{ color: SEV_COLOR[severity] }}
          >
            <span className="dot" style={{ background: SEV_COLOR[severity] }} />
            {counts[severity]}
          </span>
        ) : null
      )}
      {dismissed > 0 && (
        <span className="text-fg-2 font-mono text-[10px]">{dismissed} dismissed</span>
      )}
    </button>
  );
};

export const GroupHeader = memo(GroupHeaderBase);
