import { useId, useState } from "react";
import { BookmarkPlus, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import {
  useBuiltinPresets,
  useDeleteReviewPreset,
  useReviewPresets,
} from "@entities/review-preset";
import { Button, Callout, Card, ICON_SIZE } from "@shared/ui";
import { BUILTIN_PRESET_CARDS, applyPreset } from "../lib";
import { BriefSection } from "./BriefSection";
import { PresetPicker } from "./PresetPicker";
import { SavePresetForm } from "./SavePresetForm";
import type { BriefConfig } from "@entities/review";
import type { ReviewPreset } from "@entities/review-preset";

export type IntentSectionProps = {
  config: BriefConfig;
  onChange: (patch: Partial<BriefConfig>) => void;
};

type EditorState = { mode: "create" } | { mode: "edit"; preset: ReviewPreset } | null;

const icon = (Icon: typeof Eye): React.ReactNode => (
  <Icon size={ICON_SIZE.inline} aria-hidden="true" />
);

export const IntentSection = ({ config, onChange }: IntentSectionProps): React.ReactElement => {
  const id = useId();
  const { data: presets } = useReviewPresets();
  const { data: builtins } = useBuiltinPresets();
  const deletePreset = useDeleteReviewPreset();
  const [editor, setEditor] = useState<EditorState>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const selectedCustom = presets?.find((p) => p.id === config.custom_preset_id);
  const isMissing = config.custom_preset_id !== null && presets !== undefined && !selectedCustom;
  const builtinSelected = config.custom_preset_id === null || isMissing ? config.preset : null;
  const builtinText = builtins?.find((b) => b.id === config.preset)?.instructions ?? "";
  // A saved preset without instructions keeps the built-in preset's, as the prompt does.
  const customText = selectedCustom?.instructions.trim() ?? "";
  const shownInstructions = customText !== "" ? customText : builtinText;
  const builtinLabel = BUILTIN_PRESET_CARDS.find((card) => card.id === config.preset)?.label ?? "";
  const isConfirmingDelete =
    confirmingDeleteId !== null && confirmingDeleteId === selectedCustom?.id;

  const handleDelete = (preset: ReviewPreset): void => {
    if (confirmingDeleteId !== preset.id) {
      setConfirmingDeleteId(preset.id);
      return;
    }
    setConfirmingDeleteId(null);
    deletePreset.mutate(preset.id, {
      onSuccess: () => {
        if (config.custom_preset_id === preset.id) onChange({ custom_preset_id: null });
      },
    });
  };

  return (
    <BriefSection
      title="Review intent"
      description="What the review looks for: a built-in preset, or one you saved."
    >
      <PresetPicker
        presets={presets}
        builtinSelected={builtinSelected}
        savedSelectedId={selectedCustom?.id ?? null}
        onSelectBuiltin={(preset) => {
          setConfirmingDeleteId(null);
          onChange({ preset, custom_preset_id: null });
        }}
        onSelectSaved={(preset) => {
          setConfirmingDeleteId(null);
          onChange(applyPreset(config, preset.id, preset.brief_config));
        }}
      />
      {isMissing && (
        <Callout tone="warn" size="sm" role="status" style={{ marginTop: "var(--space-3)" }}>
          {`The saved preset this brief used was deleted; the built-in ${builtinLabel} preset is used instead.`}
        </Callout>
      )}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: "var(--space-1)", marginTop: "var(--space-2)" }}
      >
        <Button
          variant="ghost"
          size="sm"
          icon={icon(showInstructions ? EyeOff : Eye)}
          aria-expanded={showInstructions}
          aria-controls={`${id}-instructions`}
          onClick={() => {
            setShowInstructions((shown) => !shown);
          }}
        >
          {showInstructions ? "Hide instructions" : "View instructions"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={icon(BookmarkPlus)}
          onClick={() => {
            setEditor({ mode: "create" });
          }}
        >
          Save as preset…
        </Button>
        {selectedCustom && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={icon(Pencil)}
              aria-label={`Edit preset ${selectedCustom.name}`}
              onClick={() => {
                setEditor({ mode: "edit", preset: selectedCustom });
              }}
            >
              Edit preset
            </Button>
            <Button
              variant={isConfirmingDelete ? "danger" : "ghost"}
              size="sm"
              icon={icon(Trash2)}
              isLoading={deletePreset.isPending}
              aria-label={
                isConfirmingDelete
                  ? `Confirm deleting preset ${selectedCustom.name}`
                  : `Delete preset ${selectedCustom.name}`
              }
              onClick={() => {
                handleDelete(selectedCustom);
              }}
            >
              {isConfirmingDelete ? "Confirm" : "Delete preset"}
            </Button>
          </>
        )}
      </div>
      {showInstructions && (
        <Card surface="sunken" padding="sm" style={{ marginTop: "var(--space-2)" }}>
          <pre
            id={`${id}-instructions`}
            aria-label="Preset instructions"
            className="text-fg-1 m-0 font-mono whitespace-pre-wrap"
            style={{ fontSize: "var(--fs-meta)", lineHeight: "var(--lh-body)" }}
          >
            {shownInstructions || "Loading…"}
          </pre>
        </Card>
      )}
      {editor && (
        <SavePresetForm
          key={editor.mode === "edit" ? editor.preset.id : "new"}
          config={config}
          editing={editor.mode === "edit" ? editor.preset : null}
          defaultInstructions={shownInstructions}
          onSaved={(preset) => {
            if (editor.mode === "create") onChange({ custom_preset_id: preset.id });
            setEditor(null);
          }}
          onCancel={() => {
            setEditor(null);
          }}
        />
      )}
    </BriefSection>
  );
};
