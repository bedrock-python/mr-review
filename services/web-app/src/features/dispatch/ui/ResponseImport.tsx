import { useRef, useState } from "react";

import { ClipboardPaste, FileUp, TriangleAlert, Upload } from "lucide-react";

import { Button, Callout, ICON_SIZE, Textarea } from "@shared/ui";
import { useStageBarStore } from "@widgets/stage-bar";

import { pluralize } from "../model/runOutcome";
import { ImportReport } from "./ImportReport";
import { StepCard } from "./StepCard";

import type { ResponseDraft } from "../model/useResponseDraft";

const RESPONSE_ROWS = 8;

export type ResponseImportProps = {
  step: number;
  existingCommentsCount: number;
  /** The pasted response and its import, kept by the stage across mode switches. */
  draft: ResponseDraft;
};

const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-meta)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-2)",
  textAlign: "right",
};

/** The last step of Copy & paste: drop, browse or paste the AI's answer and import it. */
export const ResponseImport = ({
  step,
  existingCommentsCount,
  draft,
}: ResponseImportProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    text: jsonText,
    isEditorOpen,
    status: importStatus,
    result: importResult,
    error: importError,
    load: loadText,
  } = draft;

  const hasJson = jsonText.trim().length > 0;

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void file.text().then(loadText);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(loadText);
  };

  const isEditorShown = (hasJson || isEditorOpen) && importStatus !== "done";

  return (
    <StepCard
      step={step}
      title="Import the response"
      aside={
        hasJson && importStatus === "idle" ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-meta)",
              color: "var(--fg-2)",
            }}
          >
            {jsonText.length.toLocaleString()} chars
          </span>
        ) : undefined
      }
    >
      {!isEditorShown && importStatus !== "done" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => {
            setIsDragOver(false);
          }}
          onDrop={handleDrop}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-6) var(--space-4)",
            border: `1px dashed ${isDragOver ? "var(--accent-fg)" : "var(--border-control)"}`,
            borderRadius: "var(--radius-card)",
            background: isDragOver ? "var(--accent-tint)" : "var(--bg-0)",
            textAlign: "center",
            transition: "background var(--dur-fast), border-color var(--dur-fast)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "var(--control-lg)",
              height: "var(--control-lg)",
              borderRadius: "var(--radius-pill)",
              background: "var(--bg-2)",
              color: isDragOver ? "var(--accent-fg)" : "var(--fg-2)",
            }}
          >
            <Upload size={ICON_SIZE.button} />
          </span>
          <p
            style={{
              margin: 0,
              fontSize: "var(--fs-body)",
              color: "var(--fg-0)",
              fontWeight: "var(--fw-medium)",
            }}
          >
            {isDragOver ? "Drop to load the response" : "Drop the AI response here"}
          </p>
          <p style={{ ...helperStyle, textAlign: "center" }}>
            A .json or .txt file, or the answer pasted as text
          </p>
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
            <Button
              variant="ghost"
              size="sm"
              icon={<FileUp size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              Browse file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ClipboardPaste size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={() => {
                draft.openEditor();
                // The textarea mounts on this render; focus it once it is there.
                requestAnimationFrame(() => {
                  textareaRef.current?.focus();
                });
              }}
            >
              Paste text
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </div>
      )}

      {isEditorShown && (
        <>
          <Textarea
            ref={textareaRef}
            isMono
            aria-label="AI response"
            spellCheck={false}
            value={jsonText}
            onChange={(e) => {
              loadText(e.target.value);
            }}
            placeholder="Paste AI response JSON here…"
            rows={RESPONSE_ROWS}
          />
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <Button onClick={draft.clear}>Clear</Button>
            <Button
              variant="primary"
              onClick={draft.submit}
              disabled={!hasJson}
              isLoading={importStatus === "loading"}
            >
              Import comments
            </Button>
          </div>
          {existingCommentsCount > 0 && importStatus === "idle" && (
            <p style={helperStyle}>
              <TriangleAlert
                size={ICON_SIZE.inline}
                aria-hidden="true"
                color="var(--c-warn-fg)"
                style={{
                  display: "inline-block",
                  verticalAlign: "-2px",
                  marginRight: "var(--space-1)",
                }}
              />
              {`${pluralize(existingCommentsCount, "existing comment")} will be replaced on import`}
            </p>
          )}
        </>
      )}

      {importStatus === "error" && importError && <Callout tone="danger">{importError}</Callout>}

      {importStatus === "done" && importResult && (
        <ImportReport
          result={importResult}
          onEdit={draft.edit}
          onContinue={() => {
            setStage("polish");
          }}
        />
      )}
    </StepCard>
  );
};
