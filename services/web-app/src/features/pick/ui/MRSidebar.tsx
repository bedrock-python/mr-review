import { useId } from "react";
import { ArrowRight } from "lucide-react";
import { Button, ICON_SIZE, Markdown, SectionHeader, StatusBadge } from "@shared/ui";
import { PICK_LAYOUT } from "./PICK_LAYOUT";
import { mrStateStatus, pipelineStatus } from "@entities/mr";
import type { MR, MRDiffStats } from "@entities/mr";

const DT_CLASS = "text-fg-2";

export type MRSidebarProps = {
  mr: MR;
  /** Totals to show; `null` hides them (unknown until the diff loads). */
  diffStats: MRDiffStats | null;
  fileCount: number | null;
  onCompose: () => void;
  isComposing: boolean;
};

/** The MR's description and state, and the way on to the Brief. */
export const MRSidebar = ({
  mr,
  diffStats,
  fileCount,
  onCompose,
  isComposing,
}: MRSidebarProps): React.ReactElement => {
  const id = useId();
  const state = mrStateStatus(mr.status);
  const pipeline = pipelineStatus(mr.pipeline);
  const hasDescription = mr.description.trim().length > 0;

  return (
    <aside
      aria-label="Merge request"
      className="border-border bg-bg-1 flex flex-col overflow-hidden border-l"
      style={{ width: PICK_LAYOUT.sidebarWidthPx, flexShrink: 0 }}
    >
      <div className="flex-1 overflow-y-auto">
        {hasDescription && (
          <section
            aria-labelledby={`${id}-description`}
            className="border-border border-b"
            style={{ padding: "var(--space-4)" }}
          >
            <SectionHeader
              as="h2"
              id={`${id}-description`}
              title="Description"
              style={{ marginBottom: "var(--space-2)" }}
            />
            <Markdown>{mr.description}</Markdown>
          </section>
        )}
        <section aria-labelledby={`${id}-details`} style={{ padding: "var(--space-4)" }}>
          <SectionHeader as="h2" id={`${id}-details`} title="Details" />
          <dl
            className="m-0 grid items-center"
            style={{
              gridTemplateColumns: "auto 1fr",
              gap: "var(--space-2) var(--space-4)",
              marginTop: "var(--space-3)",
              fontSize: "var(--fs-control)",
            }}
          >
            <dt className={DT_CLASS}>State</dt>
            <dd className="m-0 flex flex-wrap" style={{ gap: "var(--space-1)" }}>
              <StatusBadge status={state.status} label={state.label} />
              {mr.draft && <StatusBadge status="neutral" label="Draft" />}
            </dd>
            {pipeline && (
              <>
                <dt className={DT_CLASS}>Pipeline</dt>
                <dd className="m-0">
                  <StatusBadge
                    status={pipeline.status}
                    label={pipeline.label}
                    isLive={pipeline.isLive}
                  />
                </dd>
              </>
            )}
            {diffStats && (
              <>
                <dt className={DT_CLASS}>Changes</dt>
                <dd
                  className="m-0 flex flex-wrap items-baseline font-mono"
                  style={{ gap: "var(--space-2)", fontSize: "var(--fs-meta)" }}
                >
                  <span className="text-c-add-fg">+{diffStats.additions}</span>
                  <span className="text-c-del-fg">-{diffStats.deletions}</span>
                  {fileCount !== null && (
                    <span className="text-fg-2">
                      {`${String(fileCount)} file${fileCount === 1 ? "" : "s"}`}
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <div
        className="border-border flex shrink-0 flex-col border-t"
        style={{ gap: "var(--space-3)", padding: "var(--space-4)" }}
      >
        <p className="text-fg-2 m-0" style={{ fontSize: "var(--fs-control)" }}>
          Next, choose what the review looks for and preview the prompt.
        </p>
        <Button
          variant="primary"
          size="lg"
          isFullWidth
          isLoading={isComposing}
          iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={onCompose}
        >
          Compose prompt
        </Button>
      </div>
    </aside>
  );
};
