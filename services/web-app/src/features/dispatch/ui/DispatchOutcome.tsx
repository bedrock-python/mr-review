import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { FileText, RefreshCw, Wrench } from "lucide-react";
import { useStore } from "zustand";

import { rawResponseQueryOptions, useRawResponse } from "@entities/review";
import { Button, Callout, ICON_SIZE, Spinner } from "@shared/ui";

import { pluralize } from "../model/runOutcome";
import { ImportReport } from "./ImportReport";
import { JsonErrorDetail } from "./JsonErrorDetail";

import type { DispatchResult, ImportResponseResult } from "@entities/review";
import type { UseMutationResult } from "@tanstack/react-query";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchSessionState } from "../model/dispatchSession";
import type { RunOutcomeSummary } from "../model/runOutcome";

const RAW_VIEW_MAX_HEIGHT_PX = 360;

const RAW_VIEW_STYLE: React.CSSProperties = {
  margin: 0,
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-control)",
  padding: "var(--space-2) var(--space-3)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-1)",
  maxHeight: RAW_VIEW_MAX_HEIGHT_PX,
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const STATUS_LINE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  margin: 0,
  fontSize: "var(--fs-control)",
  color: "var(--fg-2)",
};

/* ── Raw response viewer ────────────────────────────────────── */
type RawResponseViewerProps = {
  reviewId: string;
  iterationId: string;
};

const RawResponseViewer = ({
  reviewId,
  iterationId,
}: RawResponseViewerProps): React.ReactElement => {
  const rawResponse = useRawResponse(reviewId, iterationId);

  if (rawResponse.isPending) {
    return (
      <p style={STATUS_LINE_STYLE}>
        <Spinner size="sm" isDecorative />
        Loading raw output…
      </p>
    );
  }
  if (rawResponse.isError) {
    return (
      <p style={{ ...STATUS_LINE_STYLE, color: "var(--c-danger-fg)" }}>
        Couldn't load the raw output: {rawResponse.error.message}
      </p>
    );
  }
  if (rawResponse.data === null) {
    return <p style={STATUS_LINE_STYLE}>No raw output was stored for this run.</p>;
  }
  return (
    <pre aria-label="Stored raw model output" style={RAW_VIEW_STYLE}>
      {rawResponse.data}
    </pre>
  );
};

const column = (gap: string): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap,
});

/* ── A run whose answer was not used ────────────────────────── */
type UnusedRunNoticeProps = {
  result: DispatchResult;
  store: StoreApi<DispatchSessionState>;
  onEditInManual: (rawText: string) => void;
};

const unusedReason = (result: DispatchResult): string => {
  if (result.json_error !== null) return "The model output couldn't be read as review comments.";
  return "The model output was cut off before it was complete — raise max tokens or narrow the context.";
};

const UnusedRunNotice = ({
  result,
  store,
  onEditInManual,
}: UnusedRunNoticeProps): React.ReactElement => {
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const output = useStore(store, (s) => s.text);
  const kept = result.comments;
  const keptLine =
    kept > 0
      ? `Your ${pluralize(kept, "previous comment")} ${kept === 1 ? "is" : "are"} unchanged.`
      : "The iteration has no comments yet.";

  return (
    <Callout
      tone="warn"
      role="alert"
      title="Nothing from this run was saved"
      actions={
        <>
          <Button
            size="sm"
            icon={<FileText size={ICON_SIZE.inline} aria-hidden="true" />}
            aria-expanded={isOutputOpen}
            onClick={() => {
              setIsOutputOpen((open) => !open);
            }}
          >
            {isOutputOpen ? "Hide this run's output" : "View this run's output"}
          </Button>
          <Button
            size="sm"
            icon={<Wrench size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={() => {
              onEditInManual(store.getState().text);
            }}
          >
            Fix in Copy &amp; paste mode
          </Button>
        </>
      }
    >
      {unusedReason(result)} {keptLine} To use this output anyway, fix it in{" "}
      <strong>Copy &amp; paste</strong> mode and import it.
      {result.json_error !== null && <JsonErrorDetail message={result.json_error} />}
      {isOutputOpen && (
        <pre
          aria-label="This run's model output"
          style={{ ...RAW_VIEW_STYLE, marginTop: "var(--space-2)" }}
        >
          {output}
        </pre>
      )}
    </Callout>
  );
};

/* ── Outcome ────────────────────────────────────────────────── */
export type DispatchOutcomeProps = {
  reviewId: string;
  /** What the server saved; null until the run is done. */
  result: DispatchResult | null;
  summary: RunOutcomeSummary | null;
  /** Parses the stored output again; its report replaces the invalid-JSON notice. */
  reparse: UseMutationResult<ImportResponseResult, Error, string>;
  /** The run's streamed output: the previews parsed from it and the raw text. */
  store: StoreApi<DispatchSessionState>;
  onEditInManual: (rawText: string) => void;
  /**
   * The run's output panel. It stays in one place from the first token to the end, so the
   * list keeps its scroll and its rows don't animate in again when the run finishes.
   */
  panel: React.ReactNode;
};

/**
 * A run's output panel with what the finished run produced around it: clear notices first when
 * the model output was cut off, was not valid JSON or was not used at all, the raw output below.
 */
export const DispatchOutcome = ({
  reviewId,
  result,
  summary,
  reparse,
  store,
  onEditInManual,
  panel,
}: DispatchOutcomeProps): React.ReactElement => {
  const qc = useQueryClient();
  const [isRawOpen, setIsRawOpen] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  // A new run starts with the raw output folded and the editor not opening.
  const [shownResult, setShownResult] = useState(result);
  if (shownResult !== result) {
    setShownResult(result);
    setIsRawOpen(false);
    setIsOpeningEditor(false);
  }

  let notices: React.ReactNode = null;
  let details: React.ReactNode = null;
  if (result !== null && summary !== null) {
    if (result.kept_previous) {
      notices = <UnusedRunNotice result={result} store={store} onEditInManual={onEditInManual} />;
    } else {
      const handleEditInManual = async (): Promise<void> => {
        setIsOpeningEditor(true);
        let rawText: string | null = null;
        try {
          rawText = await qc.fetchQuery(rawResponseQueryOptions(reviewId, result.iteration_id));
        } catch {
          // The streamed copy holds the same output; the failed fetch is already reported.
        }
        onEditInManual(rawText ?? store.getState().text);
      };
      const rawToggle = (
        <RawToggle
          isOpen={isRawOpen}
          isProminent={summary.isJsonNoticeShown}
          onToggle={() => {
            setIsRawOpen((open) => !open);
          }}
        />
      );
      const rawViewer = isRawOpen && (
        <RawResponseViewer reviewId={reviewId} iterationId={result.iteration_id} />
      );
      notices = (
        <SavedRunNotices
          result={result}
          summary={summary}
          reparse={reparse}
          rawToggle={rawToggle}
          rawViewer={rawViewer}
          isOpeningEditor={isOpeningEditor}
          onEditInManual={() => {
            void handleEditInManual();
          }}
        />
      );
      if (!summary.isJsonNoticeShown) {
        details = (
          <div style={column("var(--space-2)")}>
            <div>{rawToggle}</div>
            {rawViewer}
          </div>
        );
      }
    }
  }

  // Fixed slots: the panel keeps its place whatever appears around it.
  return (
    <div style={column("var(--space-4)")}>
      {notices}
      {panel}
      {details}
    </div>
  );
};

const RawToggle = ({
  isOpen,
  isProminent,
  onToggle,
}: {
  isOpen: boolean;
  isProminent: boolean;
  onToggle: () => void;
}): React.ReactElement => (
  <Button
    size="sm"
    variant={isProminent ? "secondary" : "ghost"}
    icon={<FileText size={ICON_SIZE.inline} aria-hidden="true" />}
    aria-expanded={isOpen}
    onClick={onToggle}
  >
    {isOpen ? "Hide raw output" : "View raw output"}
  </Button>
);

type SavedRunNoticesProps = {
  result: DispatchResult;
  summary: RunOutcomeSummary;
  reparse: UseMutationResult<ImportResponseResult, Error, string>;
  rawToggle: React.ReactNode;
  rawViewer: React.ReactNode;
  isOpeningEditor: boolean;
  onEditInManual: () => void;
};

/** A saved run's notices: cut off, not valid JSON, or the report of a re-parse. */
const SavedRunNotices = ({
  result,
  summary,
  reparse,
  rawToggle,
  rawViewer,
  isOpeningEditor,
  onEditInManual,
}: SavedRunNoticesProps): React.ReactElement | null => {
  const reparsed = reparse.data;
  if (!result.truncated && !summary.isJsonNoticeShown && !reparsed) return null;

  return (
    <>
      {result.truncated && (
        <Callout tone="warn" role="alert" title="The model output was cut off">
          Some comments may be missing. Raise max output tokens or narrow the context, then run
          again.
        </Callout>
      )}

      {summary.isJsonNoticeShown && result.json_error !== null && (
        <Callout
          tone="warn"
          role="alert"
          title="The model output wasn't valid JSON"
          actions={
            <>
              {rawToggle}
              <Button
                size="sm"
                icon={<RefreshCw size={ICON_SIZE.inline} aria-hidden="true" />}
                isLoading={reparse.isPending}
                title="Parse the stored output again, e.g. after a parser update"
                onClick={() => {
                  reparse.mutate(result.iteration_id);
                }}
              >
                Re-parse
              </Button>
              <Button
                size="sm"
                icon={<Wrench size={ICON_SIZE.inline} aria-hidden="true" />}
                isLoading={isOpeningEditor}
                onClick={onEditInManual}
              >
                Fix in Copy &amp; paste mode
              </Button>
            </>
          }
        >
          It was saved as one general comment with the raw text, so nothing is lost. To get
          individual comments, fix the JSON in <strong>Copy &amp; paste</strong> mode and import it
          again.
          <JsonErrorDetail message={result.json_error} />
          {reparse.isError && (
            <p
              style={{
                ...STATUS_LINE_STYLE,
                marginTop: "var(--space-2)",
                color: "var(--c-danger-fg)",
              }}
            >
              Re-parse failed: {reparse.error.message}
            </p>
          )}
          {rawViewer && <div style={{ marginTop: "var(--space-2)" }}>{rawViewer}</div>}
        </Callout>
      )}

      {reparsed && <ImportReport result={reparsed} onEdit={onEditInManual} />}
    </>
  );
};
