import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { copyText } from "@shared/lib";
import { useDiffSize } from "@entities/review";
import { isEverythingExcluded } from "../lib";
import { useBriefDraft, useExcludedFiles, usePromptPreview } from "../model";
import { AdvancedSection } from "./AdvancedSection";
import { ContextFilesField } from "./ContextFilesField";
import { ContextSection } from "./ContextSection";
import { FocusAreasField } from "./FocusAreasField";
import { IntentSection } from "./IntentSection";
import { OutputSection } from "./OutputSection";
import { PromptPreviewPanel } from "./PromptPreviewPanel";
import type { CopyState } from "./PromptPreviewPanel";
import { SECTION_STYLE, noticeStyle } from "./styles";

const COPIED_RESET_MS = 2000;

const CenteredMessage = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 10,
      color: "var(--fg-3)",
      fontSize: 13,
    }}
  >
    {children}
  </div>
);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const BriefStage = (): React.ReactElement => {
  const id = useId();
  const { activeReviewId } = useNav();
  const setStage = useStageBarStore((s) => s.setStage);
  const { isLoading, config, update, flush } = useBriefDraft(activeReviewId);
  const diffSize = useDiffSize(activeReviewId);
  const excludedFiles = useExcludedFiles(activeReviewId, config);
  const nothingToReview = isEverythingExcluded(excludedFiles.data);
  const preview = usePromptPreview(activeReviewId, config);
  const [copy, setCopy] = useState<CopyState>({ status: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    []
  );

  const promptText = preview.preview?.prompt;
  const handleCopy = useCallback((): void => {
    if (!promptText) return;
    copyText(promptText).then(
      () => {
        setCopy({ status: "copied" });
        if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          setCopy({ status: "idle" });
        }, COPIED_RESET_MS);
      },
      (error: unknown) => {
        setCopy({ status: "failed", message: errorMessage(error) });
      }
    );
  }, [promptText]);

  // Dispatch runs on the saved brief, so it waits for the save and stays here if it fails.
  const handleDispatch = useCallback((): void => {
    setIsSaving(true);
    setSaveError(null);
    flush().then(
      () => {
        setIsSaving(false);
        setStage("dispatch");
      },
      (error: unknown) => {
        setIsSaving(false);
        setSaveError(
          `The brief could not be saved, so the review was not dispatched: ${errorMessage(error)}`
        );
      }
    );
  }, [flush, setStage]);

  if (!activeReviewId) {
    return (
      <CenteredMessage>
        No active review session. Go back to Pick and start a review.
      </CenteredMessage>
    );
  }

  if (isLoading) {
    return (
      <CenteredMessage>
        <div
          aria-hidden="true"
          className="animate-spin"
          style={{
            width: 16,
            height: 16,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
          }}
        />
        <span>Loading review…</span>
      </CenteredMessage>
    );
  }

  const footer = (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        flexShrink: 0,
      }}
    >
      {saveError && (
        <div role="alert" style={{ ...noticeStyle("var(--c-critical)"), flex: 1 }}>
          {saveError}
        </div>
      )}
      {!saveError && nothingToReview && (
        <div role="alert" style={{ ...noticeStyle("var(--c-critical)"), flex: 1 }}>
          {`All ${String(excludedFiles.data?.total ?? 0)} changed files are excluded by the path filters, so there is nothing to review. Loosen the include or exclude patterns under Advanced.`}
        </div>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={handleDispatch}
        disabled={isSaving || nothingToReview}
        style={{ gap: 8 }}
      >
        {isSaving ? "Saving…" : "Dispatch"}
        <span style={{ fontSize: 11, opacity: 0.7 }} aria-hidden="true">
          →
        </span>
      </button>
    </div>
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.05fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          overflowY: "auto",
          padding: "20px 20px 80px",
          borderRight: "1px solid var(--border)",
        }}
      >
        <IntentSection config={config} onChange={update} />
        <FocusAreasField
          value={config.focus_areas}
          onChange={(focus_areas) => {
            update({ focus_areas });
          }}
        />
        <OutputSection config={config} onChange={update} />
        <ContextSection config={config} diffSize={diffSize} onChange={update} />
        <section style={SECTION_STYLE}>
          <label className="field-label" htmlFor={`${id}-instructions`}>
            Custom Instructions
          </label>
          <textarea
            id={`${id}-instructions`}
            className="field"
            value={config.custom_instructions}
            onChange={(event) => {
              update({ custom_instructions: event.target.value });
            }}
            placeholder="Focus on performance bottlenecks in the data layer…"
            rows={4}
            style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}
          />
        </section>
        <ContextFilesField
          isEnabled={config.include_context}
          paths={config.context_files}
          onToggle={(include_context) => {
            update({ include_context });
          }}
          onChange={(context_files) => {
            update({ context_files });
          }}
        />
        <AdvancedSection
          config={config}
          excluded={excludedFiles.data}
          isCheckingExcluded={excludedFiles.isFetching}
          onChange={update}
        />
      </div>
      <PromptPreviewPanel state={preview} copy={copy} onCopy={handleCopy} footer={footer} />
    </div>
  );
};
