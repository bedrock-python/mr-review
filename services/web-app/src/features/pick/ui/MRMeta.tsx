import { cn } from "@shared/lib";
import { Markdown } from "@shared/ui";
import type { MR, PipelineStatus } from "@entities/mr";

export type MRMetaProps = {
  mr: MR;
  totalFiles: number;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${String(diffDays)} days ago`;
  const months = Math.floor(diffDays / 30);
  return `${String(months)} month${months > 1 ? "s" : ""} ago`;
};

type StatusBadgeProps = {
  status: MR["status"];
};

const STATUS_STYLES: Record<MR["status"], string> = {
  opened: "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30",
  merged: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
  closed: "bg-[var(--text-muted)]/20 text-[var(--text-muted)] border border-[var(--border)]",
};

const StatusBadge = ({ status }: StatusBadgeProps): React.ReactElement => (
  <span
    className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase",
      STATUS_STYLES[status]
    )}
  >
    {status}
  </span>
);

type PipelineBadgeProps = {
  pipeline: PipelineStatus | null;
};

const PIPELINE_DOT_STYLES: Record<PipelineStatus, string> = {
  passed: "text-green-400",
  failed: "text-red-400",
  running: "text-yellow-400 animate-pulse",
  none: "text-[var(--text-muted)]",
};

const PipelineBadge = ({ pipeline }: PipelineBadgeProps): React.ReactElement => {
  if (!pipeline || pipeline === "none") {
    return <span className="font-mono text-xs text-[var(--text-muted)]">no pipeline</span>;
  }
  return (
    <span
      className={cn("flex items-center gap-1.5 font-mono text-xs", PIPELINE_DOT_STYLES[pipeline])}
    >
      <span className="text-base leading-none">●</span>
      {pipeline}
    </span>
  );
};

type SectionProps = {
  children: React.ReactNode;
};

const Section = ({ children }: SectionProps): React.ReactElement => (
  <div className="border-b border-[var(--border)] px-4 py-3">{children}</div>
);

type LabelProps = {
  children: React.ReactNode;
};

const Label = ({ children }: LabelProps): React.ReactElement => (
  <p className="mb-1 font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
    {children}
  </p>
);

export const MRMeta = ({ mr, totalFiles }: MRMetaProps): React.ReactElement => {
  return (
    <div className="text-sm">
      {/* Header: iid + status badges */}
      <Section>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-muted)]">!{mr.iid}</span>
          <StatusBadge status={mr.status} />
          {mr.draft && (
            <span className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--text-muted)]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              DRAFT
            </span>
          )}
        </div>
      </Section>

      {/* Title */}
      <Section>
        <p className="text-base leading-snug font-semibold text-[var(--text)]">{mr.title}</p>
      </Section>

      {/* Branches */}
      <Section>
        <Label>Branches</Label>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-[var(--text)]">
          <span className="max-w-[100px] truncate" title={mr.source_branch}>
            {mr.source_branch}
          </span>
          <span className="flex-shrink-0 text-[var(--text-muted)]">→</span>
          <span className="max-w-[100px] truncate" title={mr.target_branch}>
            {mr.target_branch}
          </span>
        </div>
      </Section>

      {/* Author + date */}
      <Section>
        <Label>Author</Label>
        <p className="font-mono text-xs text-[var(--text)]">
          @{mr.author}
          <span className="ml-2 text-[var(--text-muted)]">• {formatDate(mr.created_at)}</span>
        </p>
      </Section>

      {/* Pipeline */}
      <Section>
        <Label>Pipeline</Label>
        <PipelineBadge pipeline={mr.pipeline} />
      </Section>

      {/* Stats */}
      <Section>
        <Label>Changes</Label>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="text-green-400">+{mr.additions}</span>
          <span className="text-red-400">-{mr.deletions}</span>
          <span className="text-[var(--text-muted)]">{totalFiles} files</span>
        </div>
      </Section>

      {/* Description */}
      {mr.description && mr.description.trim().length > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
              Description
            </span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <Markdown>{mr.description}</Markdown>
        </div>
      )}
    </div>
  );
};
