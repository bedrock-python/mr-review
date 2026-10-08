import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FileQuestion } from "lucide-react";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { copyText } from "@shared/lib";
import { EmptyState, Field, ICON_SIZE, StageLoading, Textarea } from "@shared/ui";
import { useDiffSize } from "@entities/review";
import { isEverythingExcluded } from "../lib";
import { useBriefDraft, useExcludedFiles, usePromptPreview } from "../model";
import { AdvancedSection } from "./AdvancedSection";
import { BriefFooter } from "./BriefFooter";
import { ContextSection } from "./ContextSection";
import { FocusAreasField } from "./FocusAreasField";
import { IntentSection } from "./IntentSection";
import { OutputSection } from "./OutputSection";
import { PromptPreviewPanel } from "./PromptPreviewPanel";
import type { CopyState } from "./PromptPreviewPanel";

const COPIED_RESET_MS = 2000;
const INSTRUCTIONS_ROWS = 4;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const BriefStage = (): React.ReactElement => {
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
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const includeFieldRef = useRef<HTMLTextAreaElement>(null);
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

  // Opens Advanced and puts the cursor in the include patterns, the usual culprit.
  const handleEditFilters = (): void => {
    flushSync(() => {
      setIsAdvancedOpen(true);
    });
    // Focusing scrolls the field into view.
    includeFieldRef.current?.focus();
  };

  if (!activeReviewId) {
    return (
      <EmptyState
        isFill
        icon={<FileQuestion size={ICON_SIZE.button} />}
        title="No review in progress"
        description="Go back to Pick and start a review."
      />
    );
  }

  if (isLoading) {
    return <StageLoading label="Loading review…" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)" }}
      >
        <div
          className="border-border overflow-y-auto border-r"
          style={{ padding: "var(--space-5)" }}
        >
          <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
            <IntentSection config={config} onChange={update} />
            <FocusAreasField
              value={config.focus_areas}
              onChange={(focus_areas) => {
                update({ focus_areas });
              }}
            />
            <OutputSection config={config} onChange={update} />
            <ContextSection config={config} diffSize={diffSize} onChange={update} />
            <Field label="Custom instructions" hint="Added after the preset's instructions.">
              <Textarea
                rows={INSTRUCTIONS_ROWS}
                value={config.custom_instructions}
                placeholder="e.g. Focus on performance bottlenecks in the data layer"
                onChange={(event) => {
                  update({ custom_instructions: event.target.value });
                }}
              />
            </Field>
            <AdvancedSection
              config={config}
              excluded={excludedFiles.data}
              isCheckingExcluded={excludedFiles.isFetching}
              onChange={update}
              isOpen={isAdvancedOpen}
              onOpenChange={setIsAdvancedOpen}
              includeFieldRef={includeFieldRef}
            />
          </div>
        </div>
        <PromptPreviewPanel state={preview} copy={copy} onCopy={handleCopy} />
      </div>
      <BriefFooter
        config={config}
        diffSize={diffSize}
        preview={preview}
        excluded={excludedFiles.data}
        saveError={saveError}
        isSaving={isSaving}
        nothingToReview={nothingToReview}
        onDispatch={handleDispatch}
        onEditFilters={handleEditFilters}
      />
    </div>
  );
};
