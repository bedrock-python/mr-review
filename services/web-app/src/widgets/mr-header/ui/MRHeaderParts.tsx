import { toast } from "sonner";
import { ExternalLink, GitBranch, History, RefreshCw } from "lucide-react";
import { formatBranchRange, mrStateStatus, pipelineStatus } from "@entities/mr";
import { copyText, formatRelative } from "@shared/lib";
import {
  Button,
  CountBadge,
  ICON_SIZE,
  StatusBadge,
  StatusDot,
  Tooltip,
  buttonClassName,
} from "@shared/ui";
import { truncateMiddle } from "../lib/truncateMiddle";
import { MetaDivider } from "./MRHeaderStates";
import type { MR } from "@entities/mr";

/** Longest branch names shown whole; longer ones lose their middle. */
const SOURCE_BRANCH_MAX_CHARS = 36;
const TARGET_BRANCH_MAX_CHARS = 20;
const SHA_CHARS = 8;

export type MRHeaderActionsProps = {
  iterationCount: number;
  onShowHistory: () => void;
  isSyncing: boolean;
  onSync: () => void;
  mrUrl: string;
};

export const MRHeaderActions = ({
  iterationCount,
  onShowHistory,
  isSyncing,
  onSync,
  mrUrl,
}: MRHeaderActionsProps): React.ReactElement => (
  <div className="ml-auto flex shrink-0 items-center gap-(--space-1)">
    {iterationCount > 0 && (
      <Button
        variant="ghost"
        size="sm"
        icon={<History size={ICON_SIZE.inline} aria-hidden="true" />}
        iconRight={
          <CountBadge
            count={iterationCount}
            label={iterationCount === 1 ? "1 iteration" : `${String(iterationCount)} iterations`}
          />
        }
        onClick={onShowHistory}
      >
        History
      </Button>
    )}
    <Tooltip content="Drop cached host data and reload this merge request" side="bottom">
      <Button
        variant="ghost"
        size="sm"
        icon={<RefreshCw size={ICON_SIZE.inline} aria-hidden="true" />}
        isLoading={isSyncing}
        onClick={onSync}
      >
        Sync
      </Button>
    </Tooltip>
    {mrUrl ? (
      <a
        href={mrUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClassName({ variant: "ghost", size: "sm" })}
      >
        <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />
        Open
      </a>
    ) : (
      <Button
        variant="ghost"
        size="sm"
        icon={<ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />}
        disabled
      >
        Open
      </Button>
    )}
  </div>
);

const copySourceBranch = (branch: string): void => {
  copyText(branch).then(
    () => {
      toast.success("Branch name copied");
    },
    (error: unknown) => {
      toast.error("Could not copy", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  );
};

/** "source → target", cut in the middle when long; the full range on hover, a click copies. */
const BranchChip = ({ mr }: { mr: MR }): React.ReactElement | null => {
  const range = formatBranchRange(mr.source_branch, mr.target_branch);
  if (range === null) return null;
  const source = mr.source_branch.trim();
  const target = mr.target_branch.trim();
  return (
    <Tooltip content={source ? `${range} · click to copy the source branch` : range}>
      <button
        type="button"
        aria-label={source ? `Copy branch name ${source}` : range}
        onClick={() => {
          if (source) copySourceBranch(source);
        }}
        className="border-border bg-bg-2 text-fg-1 hover:bg-bg-hover hover:text-fg-0 flex h-(--control-sm) max-w-full min-w-0 items-center gap-(--space-1) rounded-(--radius-pill) border px-(--space-2) font-mono text-(length:--fs-meta) transition-colors duration-(--dur-fast)"
      >
        <GitBranch size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-2 shrink-0" />
        {source && (
          <span className="truncate">{truncateMiddle(source, SOURCE_BRANCH_MAX_CHARS)}</span>
        )}
        {target && (
          <>
            <span aria-hidden="true" className="text-fg-2">
              →
            </span>
            <span className="shrink-0">{truncateMiddle(target, TARGET_BRANCH_MAX_CHARS)}</span>
          </>
        )}
      </button>
    </Tooltip>
  );
};

/** Author · age · branches · sha · draft, in the header's meta row. */
export const MRHeaderMeta = ({ mr }: { mr: MR }): React.ReactElement => {
  const sha = (mr as MR & { sha?: string }).sha;
  // An open MR is the normal case and says nothing; merged or closed is worth a badge.
  const state = mrStateStatus(mr.status);
  const pipeline = pipelineStatus(mr.pipeline);
  return (
    // Takes what the row leaves (basis 0): the branch chip gets cut before the actions wrap.
    <div className="text-fg-2 flex min-w-0 flex-1 basis-0 items-center gap-(--space-2) text-(length:--fs-meta)">
      <MetaDivider />
      <span className="flex shrink-0 items-center gap-(--space-1)">
        <span
          aria-hidden="true"
          className="bg-bg-3 text-fg-1 flex size-(--space-4) items-center justify-center rounded-full font-mono text-(length:--fs-eyebrow)"
        >
          {mr.author.charAt(0).toUpperCase()}
        </span>
        <span className="text-fg-1">{mr.author}</span>
        <time dateTime={mr.created_at} title={new Date(mr.created_at).toLocaleString()}>
          {formatRelative(mr.created_at)}
        </time>
      </span>
      <BranchChip mr={mr} />
      {sha && <span className="shrink-0 font-mono">{sha.slice(0, SHA_CHARS)}</span>}
      {mr.status !== "opened" && <StatusBadge status={state.status} label={state.label} />}
      {mr.draft && <StatusBadge status="neutral" label="Draft" />}
      {pipeline !== null && (
        <StatusDot status={pipeline.status} label={pipeline.description} isLive={pipeline.isLive} />
      )}
    </div>
  );
};
