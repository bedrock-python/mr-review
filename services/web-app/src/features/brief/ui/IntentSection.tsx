import { useId, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Eye, EyeOff } from "lucide-react";
import {
  useBuiltinPresets,
  useDeleteReviewPreset,
  useReviewPresets,
} from "@entities/review-preset";
import { Button, Callout, Card, ICON_SIZE } from "@shared/ui";
import { BUILTIN_PRESET_CARDS, applyPreset, changedFields } from "../lib";
import { BriefSection } from "./BriefSection";
import { PresetPicker } from "./PresetPicker";
import { SavedPresetList } from "./SavedPresetList";
import { SavePresetForm } from "./SavePresetForm";
import type { BriefConfig } from "@entities/review";
import type { ReviewPreset } from "@entities/review-preset";

const PRESET_UNDO_TOAST_ID = "brief-preset-applied";

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

  // Applying a saved preset overwrites brief settings; Undo puts back what it changed.
  const handleToggleSaved = (preset: ReviewPreset): void => {
    setConfirmingDeleteId(null);
    if (preset.id === config.custom_preset_id) {
      onChange({ custom_preset_id: null });
      return;
    }
    const next = applyPreset(config, preset.id, preset.brief_config);
    const undo = changedFields(config, next);
    onChange(next);
    const overwritten = Object.keys(undo).filter((key) => key !== "custom_preset_id").length;
    if (overwritten === 0) return;
    toast(
      `Applied preset ${preset.name}: ${String(overwritten)} brief setting${overwritten === 1 ? "" : "s"} changed`,
      {
        id: PRESET_UNDO_TOAST_ID,
        action: {
          label: "Undo",
          onClick: () => {
            onChange(undo);
          },
        },
      }
    );
  };

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
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <PresetPicker
          selected={builtinSelected}
          onSelect={(preset) => {
            setConfirmingDeleteId(null);
            onChange({ preset, custom_preset_id: null });
          }}
        />
        {presets && presets.length > 0 && (
          <SavedPresetList
            presets={presets}
            selectedId={selectedCustom?.id ?? null}
            confirmingDeleteId={confirmingDeleteId}
            deletingId={deletePreset.isPending ? deletePreset.variables : null}
            onToggle={handleToggleSaved}
            onEdit={(preset) => {
              setConfirmingDeleteId(null);
              setEditor({ mode: "edit", preset });
            }}
            onDelete={handleDelete}
          />
        )}
      </div>
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
