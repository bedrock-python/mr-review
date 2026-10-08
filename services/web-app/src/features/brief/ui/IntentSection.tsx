import { useId, useState } from "react";
import {
  PresetEditor,
  useBuiltinPresets,
  useCreateReviewPreset,
  useDeleteReviewPreset,
  useReviewPresets,
  useUpdateReviewPreset,
} from "@entities/review-preset";
import type { ReviewPreset, ReviewPresetForm } from "@entities/review-preset";
import type { BriefConfig } from "@entities/review";
import { BUILTIN_PRESET_CARDS, applyPreset, presetOverridesFrom } from "../lib";
import { BuiltinPresetGrid, SavedPresetList } from "./PresetCards";
import {
  CHECKBOX_STYLE,
  HINT_STYLE,
  SECTION_STYLE,
  SECTION_TITLE_STYLE,
  noticeStyle,
} from "./styles";

export type IntentSectionProps = {
  config: BriefConfig;
  onChange: (patch: Partial<BriefConfig>) => void;
};

type EditorState = { mode: "create" } | { mode: "edit"; preset: ReviewPreset } | null;

export const IntentSection = ({ config, onChange }: IntentSectionProps): React.ReactElement => {
  const id = useId();
  const { data: presets } = useReviewPresets();
  const { data: builtins } = useBuiltinPresets();
  const createPreset = useCreateReviewPreset();
  const updatePreset = useUpdateReviewPreset();
  const deletePreset = useDeleteReviewPreset();
  const [editor, setEditor] = useState<EditorState>(null);
  const [storeSettings, setStoreSettings] = useState(true);
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

  const openEditor = (next: EditorState): void => {
    createPreset.reset();
    updatePreset.reset();
    setStoreSettings(next?.mode === "create");
    setEditor(next);
  };

  const handleSubmit = (values: ReviewPresetForm): void => {
    const overrides = storeSettings ? { brief_config: presetOverridesFrom(config) } : {};
    if (editor?.mode === "edit") {
      updatePreset.mutate(
        { id: editor.preset.id, data: { ...values, ...overrides } },
        {
          onSuccess: () => {
            setEditor(null);
          },
        }
      );
      return;
    }
    createPreset.mutate(
      { ...values, ...overrides },
      {
        onSuccess: (preset) => {
          onChange({ custom_preset_id: preset.id });
          setEditor(null);
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

  const isSaving = createPreset.isPending || updatePreset.isPending;
  const saveError =
    (editor?.mode === "edit" ? updatePreset.error : createPreset.error)?.message ?? null;

  return (
    <section style={SECTION_STYLE} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={SECTION_TITLE_STYLE}>
        Review Intent
      </h2>
      <BuiltinPresetGrid
        selected={builtinSelected}
        onSelect={(preset) => {
          onChange({ preset, custom_preset_id: null });
        }}
      />
      {presets && presets.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...HINT_STYLE, marginBottom: 6 }}>Saved presets</div>
          <SavedPresetList
            presets={presets}
            selectedId={selectedCustom?.id ?? null}
            confirmingDeleteId={confirmingDeleteId}
            onSelect={(preset) => {
              onChange(applyPreset(config, preset.id, preset.brief_config));
            }}
            onEdit={(preset) => {
              openEditor({ mode: "edit", preset });
            }}
            onDelete={handleDelete}
          />
        </div>
      )}
      {isMissing && (
        <div role="status" style={{ ...noticeStyle("var(--c-major)"), marginTop: 8 }}>
          {`The saved preset this brief used was deleted; the built-in ${builtinLabel} preset is used instead.`}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "4px 8px", fontSize: 11 }}
          aria-expanded={showInstructions}
          aria-controls={`${id}-instructions`}
          onClick={() => {
            setShowInstructions((shown) => !shown);
          }}
        >
          {showInstructions ? "Hide instructions" : "View instructions"}
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => {
            openEditor({ mode: "create" });
          }}
        >
          Save as preset…
        </button>
      </div>
      {showInstructions && (
        <pre
          id={`${id}-instructions`}
          aria-label="Preset instructions"
          style={{
            margin: "8px 0 0",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontSize: 11,
            color: "var(--fg-1)",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono)",
          }}
        >
          {shownInstructions || "Loading…"}
        </pre>
      )}
      {editor && (
        <div style={{ marginTop: 10 }}>
          <PresetEditor
            key={editor.mode === "edit" ? editor.preset.id : "new"}
            title={editor.mode === "edit" ? `Edit preset ${editor.preset.name}` : "Save as preset"}
            submitLabel={editor.mode === "edit" ? "Save changes" : "Save preset"}
            initial={
              editor.mode === "edit"
                ? {
                    name: editor.preset.name,
                    description: editor.preset.description,
                    instructions: editor.preset.instructions,
                  }
                : { name: "", description: "", instructions: shownInstructions }
            }
            isSaving={isSaving}
            error={saveError}
            onSubmit={handleSubmit}
            onCancel={() => {
              setEditor(null);
            }}
          >
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", ...HINT_STYLE }}>
              <input
                type="checkbox"
                checked={storeSettings}
                onChange={(event) => {
                  setStoreSettings(event.target.checked);
                }}
                style={{ ...CHECKBOX_STYLE, marginTop: 2 }}
              />
              {editor.mode === "edit"
                ? "Replace its stored settings with this brief's (focus areas, output, context, filters)"
                : "Also store this brief's settings (focus areas, output, context, filters)"}
            </label>
          </PresetEditor>
        </div>
      )}
    </section>
  );
};
