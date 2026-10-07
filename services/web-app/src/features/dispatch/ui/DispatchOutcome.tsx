import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";

import { rawResponseQueryOptions, useRawResponse } from "@entities/review";

import type { DispatchResult } from "@entities/review";
import type { StoreApi } from "zustand/vanilla";
import type { DispatchSessionState } from "../model/dispatchSession";

const RAW_VIEW_MAX_HEIGHT_PX = 360;

const pluralize = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count !== 1 ? "s" : ""}`;

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
      <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "8px 0" }}>
        Loading raw output…
      </div>
    );
  }
  if (rawResponse.isError) {
    return (
      <div style={{ fontSize: 12, color: "var(--c-critical)", padding: "8px 0" }}>
        Couldn't load the raw output: {rawResponse.error.message}
      </div>
    );
  }
  if (rawResponse.data === null) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "8px 0" }}>
        No raw output was stored for this run.
      </div>
    );
  }
  return (
    <pre
      aria-label="Stored raw model output"
      style={{
        margin: 0,
        background: "var(--bg-0)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--fg-1)",
        maxHeight: RAW_VIEW_MAX_HEIGHT_PX,
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {rawResponse.data}
    </pre>
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
 * What a finished run produced: the saved count, a clear notice when the model
 * output was not valid JSON, and access to the stored raw output.
 */
export const DispatchOutcome = ({
  reviewId,
  result,
  store,
  onEditInManual,
  onContinue,
}: DispatchOutcomeProps): React.ReactElement => {
  const qc = useQueryClient();
  const parsedCount = useStore(store, (s) => s.comments.length);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const hasJsonError = result.json_error !== null;

  const handleToggleRaw = (): void => {
    setIsRawOpen((open) => !open);
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
      style={{ fontSize: 11, padding: "4px 10px" }}
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
      {hasJsonError && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid color-mix(in oklch, var(--c-major) 40%, transparent)",
            background: "color-mix(in oklch, var(--c-major) 8%, var(--bg-2))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-major)" }}>
            The model output wasn't valid JSON
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5 }}>
            {parsedCount === 0
              ? "It was saved as one general comment with the raw text, so nothing is lost."
              : `${pluralize(parsedCount, "comment")} could still be read from it; the rest is only in the raw output.`}{" "}
            To get individual comments, fix the JSON in <strong>Copy &amp; paste</strong> mode and
            import it again.
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              padding: "6px 8px",
              borderRadius: 4,
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
              style={{ fontSize: 11, padding: "4px 10px" }}
              disabled={isOpeningEditor}
              onClick={() => {
                void handleEditInManual();
              }}
            >
              {isOpeningEditor ? "Opening…" : "Fix in Copy & paste mode"}
            </button>
          </div>
          {rawViewer}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
          {pluralize(result.comments, "comment")} saved
        </span>
        {result.errors > 0 && (
          <span style={{ fontSize: 12, color: "var(--c-major)" }}>
            · {pluralize(result.errors, "item")} couldn't be parsed
          </span>
        )}
        {!hasJsonError && rawToggle}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={onContinue}>
          Polish comments →
        </button>
      </div>
      {!hasJsonError && rawViewer}
    </div>
  );
};
