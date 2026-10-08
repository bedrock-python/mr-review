import { useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, FileUp, TriangleAlert, Upload } from "lucide-react";

import { reviewApi, reviewKeys } from "@entities/review";
import { Button, Callout, ICON_SIZE, Textarea } from "@shared/ui";
import { useStageBarStore } from "@widgets/stage-bar";

import { pluralize } from "../model/runOutcome";
import { ImportReport } from "./ImportReport";
import { StepCard } from "./StepCard";

import type { ImportResponseResult } from "@entities/review";

type ImportStatus = "idle" | "loading" | "done" | "error";

const RESPONSE_ROWS = 8;

export type ResponseImportProps = {
  step: number;
  reviewId: string;
  existingCommentsCount: number;
  /** Pre-fills the response, e.g. model output that wasn't valid JSON. */
  initialResponseText: string | null;
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
  reviewId,
  existingCommentsCount,
  initialResponseText,
}: ResponseImportProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const qc = useQueryClient();
  const [isEditorOpen, setIsEditorOpen] = useState(initialResponseText !== null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [jsonText, setJsonText] = useState(initialResponseText ?? "");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importResult, setImportResult] = useState<ImportResponseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasJson = jsonText.trim().length > 0;

  const loadText = (text: string): void => {
    setJsonText(text);
    setIsEditorOpen(true);
    setImportStatus("idle");
    setImportResult(null);
    setImportError(null);
  };

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

  const handleImport = (): void => {
    if (!hasJson || importStatus === "loading") return;
    setImportStatus("loading");
    setImportResult(null);
    setImportError(null);
    void reviewApi
      .importResponse(reviewId, jsonText, activeIterationId)
      .then((result) => {
        setImportResult(result);
        setImportStatus("done");
        void qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : "Import failed");
        setImportStatus("error");
      });
  };

  const handleClear = (): void => {
    setJsonText("");
    setIsEditorOpen(false);
    setImportStatus("idle");
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
                setIsEditorOpen(true);
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
            <Button onClick={handleClear}>Clear</Button>
            <Button
              variant="primary"
              onClick={handleImport}
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
          onEdit={() => {
            setImportStatus("idle");
            setImportResult(null);
          }}
          onContinue={() => {
            setStage("polish");
          }}
        />
      )}
    </StepCard>
  );
};
