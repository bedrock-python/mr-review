import { memo, useId, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, FileText, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Eyebrow,
  ICON_SIZE,
  SectionHeader,
  Spinner,
  Toolbar,
  ToolbarSpacer,
} from "@shared/ui";
import { PromptBreakdown } from "./PromptBreakdown";
import type { PromptPreviewState } from "../model";

// A preview that no longer matches the brief, or one being rebuilt, is shown dimmed.
const DIMMED_OPACITY = 0.6;

const icon = (Icon: typeof Copy): React.ReactNode => (
  <Icon size={ICON_SIZE.inline} aria-hidden="true" />
);

/**
 * The prompt as literal text. It is plain text, not Markdown — a diff full of ``` and # would not
 * survive a Markdown renderer — and memoised, so editing the brief does not re-render megabytes.
 */
const PromptText = memo(function PromptText({ text }: { text: string }): React.ReactElement {
  return (
    <pre
      aria-label="Prompt text"
      className="text-fg-1 m-0 font-mono break-words whitespace-pre-wrap"
      style={{ fontSize: "var(--fs-meta)", lineHeight: "var(--lh-body)" }}
    >
      {text}
    </pre>
  );
});

export type CopyState =
  { status: "idle" } | { status: "copied" } | { status: "failed"; message: string };

export type PromptPreviewPanelProps = {
  state: PromptPreviewState;
  copy: CopyState;
  onCopy: () => void;
};

export const PromptPreviewPanel = ({
  state,
  copy,
  onCopy,
}: PromptPreviewPanelProps): React.ReactElement => {
  const id = useId();
  const { preview, isRequested, isFetching, error, isStale, refresh } = state;
  const [showBreakdown, setShowBreakdown] = useState(true);
  const isCopied = copy.status === "copied";

  let body: React.ReactNode = null;
  if (preview) {
    body = (
      <div
        className="flex flex-col"
        style={{ gap: "var(--space-4)", opacity: isStale || isFetching ? DIMMED_OPACITY : 1 }}
      >
        <Card padding="sm">
          <SectionHeader
            as="h3"
            title="Breakdown"
            description={
              <span className="font-mono" title="Estimated at 4 characters per token">
                ≈ {preview.estimated_tokens.toLocaleString()} tokens (est.)
              </span>
            }
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon={icon(showBreakdown ? ChevronUp : ChevronDown)}
                aria-expanded={showBreakdown}
                aria-controls={`${id}-breakdown`}
                onClick={() => {
                  setShowBreakdown((shown) => !shown);
                }}
              >
                {showBreakdown ? "Hide breakdown" : "Show breakdown"}
              </Button>
            }
          />
          {showBreakdown && (
            <div id={`${id}-breakdown`} style={{ marginTop: "var(--space-3)" }}>
              <PromptBreakdown preview={preview} />
            </div>
          )}
        </Card>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <SectionHeader as="h3" title="Prompt" />
          <PromptText text={preview.prompt} />
        </div>
      </div>
    );
  } else if (isFetching) {
    body = (
      <EmptyState
        className="flex-1"
        icon={<Spinner size="sm" isDecorative />}
        title="Building the prompt…"
      />
    );
  } else if (!error) {
    body = (
      <EmptyState
        className="flex-1"
        role="none"
        icon={<FileText size={ICON_SIZE.button} />}
        title="See the prompt before you send it"
        description="Build the exact prompt the model will get: what each part takes, and what the budget cuts."
        actions={
          <Button icon={icon(FileText)} onClick={refresh}>
            Preview prompt
          </Button>
        }
      />
    );
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="bg-bg-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Toolbar size="sm">
        <Eyebrow as="h2" id={`${id}-title`} className="whitespace-nowrap">
          Prompt preview
        </Eyebrow>
        {isFetching && <Spinner size="sm" label="Building the prompt" />}
        {isStale && !isFetching && (
          <span role="status">
            <Badge tone="warn">Out of date</Badge>
          </span>
        )}
        <ToolbarSpacer />
        {isRequested && (
          <Button
            variant={isStale ? "secondary" : "ghost"}
            size="sm"
            icon={icon(RefreshCw)}
            onClick={refresh}
            disabled={isFetching}
          >
            Refresh
          </Button>
        )}
        {preview && (
          <Button variant="ghost" size="sm" icon={icon(isCopied ? Check : Copy)} onClick={onCopy}>
            {isCopied ? "Copied!" : "Copy"}
          </Button>
        )}
      </Toolbar>
      <div className="flex-1 overflow-y-auto" style={{ padding: "var(--space-4)" }}>
        <div className="flex min-h-full flex-col" style={{ gap: "var(--space-3)" }}>
          {copy.status === "failed" && (
            <Callout tone="danger" size="sm">
              {copy.message}
            </Callout>
          )}
          {error && (
            <Callout tone="danger" size="sm">
              {`Could not build the prompt: ${error.message}`}
            </Callout>
          )}
          {body}
        </div>
      </div>
    </section>
  );
};
