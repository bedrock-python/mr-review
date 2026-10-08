import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";

import { rawResponseQueryOptions, useRawResponse, useReparseIteration } from "@entities/review";

import { ImportReport } from "./ImportReport";

import type { DispatchResult } from "@entities/review";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchSessionState } from "../model/dispatchSession";

const RAW_VIEW_MAX_HEIGHT_PX = 360;

const pluralize = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count !== 1 ? "s" : ""}`;

const NOTICE_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "var(--radius-3)",
  border: "1px solid color-mix(in oklch, var(--c-major) 40%, transparent)",
  background: "color-mix(in oklch, var(--c-major) 8%, var(--bg-2))",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const NOTICE_TITLE_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--c-major-fg)",
};

const NOTICE_BUTTON_STYLE: React.CSSProperties = { fontSize: 11, padding: "4px 10px" };

const RAW_VIEW_STYLE: React.CSSProperties = {
  margin: 0,
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-2)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-1)",
  maxHeight: RAW_VIEW_MAX_HEIGHT_PX,
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
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
      <div style={{ fontSize: 12, color: "var(--fg-2)", padding: "8px 0" }}>
        Loading raw output…
      </div>
    );
  }
  if (rawResponse.isError) {
    return (
      <div style={{ fontSize: 12, color: "var(--c-critical-fg)", padding: "8px 0" }}>
        Couldn't load the raw output: {rawResponse.error.message}
      </div>
    );
  }
  if (rawResponse.data === null) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-2)", padding: "8px 0" }}>
        No raw output was stored for this run.
      </div>
    );
  }
  return (
    <pre aria-label="Stored raw model output" style={RAW_VIEW_STYLE}>
      {rawResponse.data}
    </pre>
  );
};

/* ── A run whose answer was not used ────────────────────────── */
type UnusedRunOutcomeProps = {
  result: DispatchResult;
  store: StoreApi<DispatchSessionState>;
  onEditInManual: (rawText: string) => void;
  onContinue: () => void;
};

const unusedReason = (result: DispatchResult): string => {
  if (result.json_error !== null) return "The model output couldn't be read as review comments.";
  return "The model output was cut off before it was complete — raise max tokens or narrow the context.";
};

const UnusedRunOutcome = ({
  result,
  store,
  onEditInManual,
  onContinue,
}: UnusedRunOutcomeProps): React.ReactElement => {
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const output = useStore(store, (s) => s.text);
  const kept = result.comments;
  const keptLine =
    kept > 0
      ? `Your ${pluralize(kept, "previous comment")} ${kept === 1 ? "is" : "are"} unchanged.`
      : "The iteration has no comments yet.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="alert" style={NOTICE_STYLE}>
        <div style={NOTICE_TITLE_STYLE}>Nothing from this run was saved</div>
        <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5 }}>
          {unusedReason(result)} {keptLine} To use this output anyway, fix it in{" "}
          <strong>Copy &amp; paste</strong> mode and import it.
        </div>
        {result.json_error !== null && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              padding: "6px 8px",
              borderRadius: "var(--radius-1)",
              background: "var(--bg-1)",
              wordBreak: "break-word",
            }}
          >
            {result.json_error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            style={NOTICE_BUTTON_STYLE}
            aria-expanded={isOutputOpen}
            onClick={() => {
              setIsOutputOpen((open) => !open);
            }}
          >
            {isOutputOpen ? "Hide this run's output" : "View this run's output"}
          </button>
          <button
            type="button"
            className="btn"
            style={NOTICE_BUTTON_STYLE}
            onClick={() => {
              onEditInManual(store.getState().text);
            }}
          >
            Fix in Copy &amp; paste mode
          </button>
        </div>
        {isOutputOpen && (
          <pre aria-label="This run's model output" style={RAW_VIEW_STYLE}>
            {output}
          </pre>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--fg-2)" }}>
          {kept > 0 ? `${pluralize(kept, "comment")} kept from before` : "No comments saved"}
        </span>
        <div style={{ flex: 1 }} />
        {kept > 0 && (
          <button type="button" className="btn primary" onClick={onContinue}>
            Polish comments →
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Outcome ────────────────────────────────────────────────── */
export type DispatchOutcomeProps = {
  reviewId: string;
  result: DispatchResult;
  /** The run's streamed output: the previews parsed from it and the raw text. */
  store: StoreApi<DispatchSessionState>;
  onEditInManual: (rawText: string) => void;
  onContinue: () => void;
};

/**
 * What a finished run produced: the saved count, clear notices when the model
 * output was cut off, was not valid JSON or was not used at all, and access to
 * the output itself.
 */
export const DispatchOutcome = (props: DispatchOutcomeProps): React.ReactElement =>
  props.result.kept_previous ? <UnusedRunOutcome {...props} /> : <SavedRunOutcome {...props} />;

const SavedRunOutcome = ({
  reviewId,
  result,
  store,
  onEditInManual,
  onContinue,
}: DispatchOutcomeProps): React.ReactElement => {
  const qc = useQueryClient();
  const reparse = useReparseIteration(reviewId);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  // A re-parse that read the output replaces the iteration's comments, so its report
  // supersedes the run's; one that still could not read it leaves the comments alone.
  const reparsed = reparse.data;
  const hasReparseReplaced =
    reparsed !== undefined && (reparsed.json_error === null || reparsed.imported > 0);
  const isJsonNoticeShown = result.json_error !== null && reparsed === undefined;
  const savedCount = reparsed && hasReparseReplaced ? reparsed.imported : result.comments;
  const skippedCount = reparsed && hasReparseReplaced ? reparsed.errors.length : result.errors;

  const handleToggleRaw = (): void => {
    setIsRawOpen((open) => !open);
  };

  const handleReparse = (): void => {
    reparse.mutate(result.iteration_id);
  };

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
    <button
      type="button"
      className="btn"
      style={NOTICE_BUTTON_STYLE}
      aria-expanded={isRawOpen}
      onClick={handleToggleRaw}
    >
      {isRawOpen ? "Hide raw output" : "View raw output"}
    </button>
  );
  const rawViewer = isRawOpen && (
    <RawResponseViewer reviewId={reviewId} iterationId={result.iteration_id} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {result.truncated && (
        <div role="alert" style={NOTICE_STYLE}>
          <div style={NOTICE_TITLE_STYLE}>
            Model output was truncated — some comments may be missing; raise max tokens or narrow
            the context
          </div>
        </div>
      )}

      {isJsonNoticeShown && (
        <div role="alert" style={NOTICE_STYLE}>
          <div style={NOTICE_TITLE_STYLE}>The model output wasn't valid JSON</div>
          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5 }}>
            It was saved as one general comment with the raw text, so nothing is lost. To get
            individual comments, fix the JSON in <strong>Copy &amp; paste</strong> mode and import
            it again.
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              padding: "6px 8px",
              borderRadius: "var(--radius-1)",
              background: "var(--bg-1)",
              wordBreak: "break-word",
            }}
          >
            {result.json_error}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rawToggle}
            <button
              type="button"
              className="btn"
              style={NOTICE_BUTTON_STYLE}
              disabled={reparse.isPending}
              title="Parse the stored output again, e.g. after a parser update"
              onClick={handleReparse}
            >
              {reparse.isPending ? "Re-parsing…" : "Re-parse"}
            </button>
            <button
              type="button"
              className="btn"
              style={NOTICE_BUTTON_STYLE}
              disabled={isOpeningEditor}
              onClick={() => {
                void handleEditInManual();
              }}
            >
              {isOpeningEditor ? "Opening…" : "Fix in Copy & paste mode"}
            </button>
          </div>
          {reparse.isError && (
            <div style={{ fontSize: 12, color: "var(--c-critical-fg)" }}>
              Re-parse failed: {reparse.error.message}
            </div>
          )}
          {rawViewer}
        </div>
      )}

      {reparsed && (
        <ImportReport
          result={reparsed}
          onEdit={() => {
            void handleEditInManual();
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--fg-2)" }}>
          {pluralize(savedCount, "comment")} saved
        </span>
        {skippedCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--c-major-fg)" }}>
            · {pluralize(skippedCount, "item")} couldn't be parsed
          </span>
        )}
        {!isJsonNoticeShown && rawToggle}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={onContinue}>
          Polish comments →
        </button>
      </div>
      {!isJsonNoticeShown && rawViewer}
    </div>
  );
};
