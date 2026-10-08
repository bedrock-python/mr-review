import { useCallback, useEffect, useState } from "react";

import { ClipboardPaste, RotateCcw, Settings, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import { useModelCapabilities } from "@entities/ai-provider";
import { useReparseIteration } from "@entities/review";
import { Button, buttonClassName, Callout, EmptyState, ICON_SIZE } from "@shared/ui";
import { useStageBarStore } from "@widgets/stage-bar";

import {
  buildDispatchRequest,
  loadProviderSettings,
  pickInitialProviderId,
  saveLastProviderId,
  saveProviderSettings,
} from "../model/dispatchSettings";
import { summarizeRunOutcome } from "../model/runOutcome";
import { useDispatchRun } from "../model/useDispatchRun";
import { DispatchForm } from "./DispatchForm";
import { DispatchOutcome } from "./DispatchOutcome";
import { DispatchStreamPanel } from "./DispatchStreamPanel";
import { RunFooter } from "./RunFooter";
import { StageBody } from "./StageLayout";

import type { AIProvider } from "@entities/ai-provider";
import type { ProviderDispatchSettings } from "../model/dispatchSettings";

export type AutoDispatchProps = {
  activeReviewId: string;
  providers: AIProvider[];
  /** Opens Copy & paste mode with `rawText` ready to fix and re-import. */
  onEditInManual: (rawText: string) => void;
  /** Opens Copy & paste mode as it is, to run the prompt elsewhere. */
  onUseManual: () => void;
  /** Told whether a generation is streaming, so the screen can keep it from being cut short. */
  onRunningChange: (isRunning: boolean) => void;
  existingCommentsCount: number;
};

/**
 * "Run in app": choose a provider, model and settings, then stream the review. Once a run
 * starts the form folds into the run's header line and the output takes its place.
 */
export const AutoDispatch = ({
  activeReviewId,
  providers,
  onEditInManual,
  onUseManual,
  onRunningChange,
  existingCommentsCount,
}: AutoDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);

  // `providers` has loaded by the time this mounts, so the saved choice can be restored.
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() =>
    pickInitialProviderId(providers)
  );
  // The model and generation settings last used with the selected provider.
  const [settings, setSettings] = useState<ProviderDispatchSettings>(() =>
    loadProviderSettings(providers.find((p) => p.id === selectedProviderId))
  );
  const [isFormOpen, setIsFormOpen] = useState(true);
  const { session, status, run, result, error, start, stop } = useDispatchRun(activeReviewId);
  const reparse = useReparseIteration(activeReviewId);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers[0];
  const selectedModel = settings.model;
  const { data: capabilities } = useModelCapabilities(selectedProviderId, selectedModel);

  useEffect(() => {
    if (selectedProviderId) saveLastProviderId(selectedProviderId);
  }, [selectedProviderId]);
  useEffect(() => {
    if (selectedProviderId) saveProviderSettings(selectedProviderId, settings);
  }, [selectedProviderId, settings]);

  useEffect(() => {
    onRunningChange(status === "streaming");
  }, [status, onRunningChange]);
  useEffect(
    () => () => {
      onRunningChange(false);
    },
    [onRunningChange]
  );

  const handleProviderChange = (id: string): void => {
    setSelectedProviderId(id);
    setSettings(loadProviderSettings(providers.find((x) => x.id === id)));
  };

  const handleSettingsChange = useCallback((patch: Partial<ProviderDispatchSettings>): void => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const handleDispatch = (): void => {
    if (!selectedProviderId) return;
    const provider = providers.find((p) => p.id === selectedProviderId);
    reparse.reset();
    setIsFormOpen(false);
    void start(
      buildDispatchRequest(selectedProviderId, settings, capabilities, activeIterationId),
      { providerName: provider?.name ?? "AI", model: selectedModel }
    );
  };

  const handleContinue = (): void => {
    setStage("polish");
  };

  if (providers.length === 0) {
    return (
      <StageBody>
        <EmptyState
          icon={<Settings size={ICON_SIZE.button} />}
          title="No AI providers configured"
          description="Add a provider in Settings, under AI providers, to generate reviews here — or use Copy & paste with any AI agent."
          actions={
            <>
              <Link to="/settings" className={buttonClassName({ variant: "secondary" })}>
                Open Settings
              </Link>
              <Button
                variant="ghost"
                icon={<ClipboardPaste size={ICON_SIZE.inline} aria-hidden="true" />}
                onClick={onUseManual}
              >
                Use Copy &amp; paste
              </Button>
            </>
          }
        />
      </StageBody>
    );
  }

  const isStreaming = status === "streaming";
  const outcome = status === "done" && result ? summarizeRunOutcome(result, reparse.data) : null;
  const isOutputUnsaved = result?.kept_previous === true;

  const panel =
    status !== "idle" && run ? (
      <DispatchStreamPanel
        store={session.store}
        status={status}
        run={run}
        isOutputUnsaved={status === "done" && isOutputUnsaved}
        needsAttention={outcome?.needsAttention ?? false}
        actions={
          !isStreaming && !isFormOpen ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<SlidersHorizontal size={ICON_SIZE.inline} aria-hidden="true" />}
              aria-label="Edit provider and settings"
              onClick={() => {
                setIsFormOpen(true);
              }}
            >
              Edit
            </Button>
          ) : undefined
        }
      />
    ) : null;

  return (
    <>
      <StageBody>
        {isFormOpen && (
          <DispatchForm
            providers={providers}
            selectedProviderId={selectedProviderId}
            onProviderChange={handleProviderChange}
            models={selectedProvider?.models ?? []}
            settings={settings}
            capabilities={capabilities}
            onSettingsChange={handleSettingsChange}
            isDisabled={isStreaming}
          />
        )}

        {status === "error" && error && (
          <Callout
            tone="danger"
            title="Generation failed"
            actions={
              <>
                <Button
                  size="sm"
                  icon={<RotateCcw size={ICON_SIZE.inline} aria-hidden="true" />}
                  onClick={handleDispatch}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ClipboardPaste size={ICON_SIZE.inline} aria-hidden="true" />}
                  onClick={onUseManual}
                >
                  Use Copy &amp; paste
                </Button>
              </>
            }
          >
            {error}
          </Callout>
        )}

        {panel && (
          <DispatchOutcome
            reviewId={activeReviewId}
            result={outcome ? result : null}
            summary={outcome}
            reparse={reparse}
            store={session.store}
            onEditInManual={onEditInManual}
            panel={panel}
          />
        )}
      </StageBody>

      <RunFooter
        status={status}
        providerName={selectedProvider?.name ?? "AI"}
        model={selectedModel}
        canGenerate={Boolean(selectedProviderId)}
        existingCommentsCount={existingCommentsCount}
        outcome={outcome}
        onGenerate={handleDispatch}
        onStop={stop}
        onPolish={handleContinue}
      />
    </>
  );
};
