import { useState } from "react";
import {
  PresetEditor,
  useCreateReviewPreset,
  useUpdateReviewPreset,
} from "@entities/review-preset";
import { Checkbox } from "@shared/ui";
import { presetOverridesFrom } from "../lib";
import type { BriefConfig } from "@entities/review";
import type { ReviewPreset, ReviewPresetForm } from "@entities/review-preset";

export type SavePresetFormProps = {
  config: BriefConfig;
  /** The saved preset being edited, or null to save a new one. */
  editing: ReviewPreset | null;
  /** A new preset starts from the instructions in use. */
  defaultInstructions: string;
  onSaved: (preset: ReviewPreset) => void;
  onCancel: () => void;
};

/** Saves the brief's intent as a preset, or edits a saved one, from inside the Brief. */
export const SavePresetForm = ({
  config,
  editing,
  defaultInstructions,
  onSaved,
  onCancel,
}: SavePresetFormProps): React.ReactElement => {
  const createPreset = useCreateReviewPreset();
  const updatePreset = useUpdateReviewPreset();
  // A new preset stores the brief's settings by default; an edit keeps the stored ones.
  const [storeSettings, setStoreSettings] = useState(editing === null);
  const mutation = editing ? updatePreset : createPreset;

  const handleSubmit = (values: ReviewPresetForm): void => {
    const overrides = storeSettings ? { brief_config: presetOverridesFrom(config) } : {};
    if (editing) {
      updatePreset.mutate(
        { id: editing.id, data: { ...values, ...overrides } },
        { onSuccess: onSaved }
      );
      return;
    }
    createPreset.mutate({ ...values, ...overrides }, { onSuccess: onSaved });
  };

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <PresetEditor
        title={editing ? `Edit preset ${editing.name}` : "Save as preset"}
        submitLabel={editing ? "Save changes" : "Save preset"}
        initial={
          editing
            ? {
                name: editing.name,
                description: editing.description,
                instructions: editing.instructions,
              }
            : { name: "", description: "", instructions: defaultInstructions }
        }
        isSaving={mutation.isPending}
        error={mutation.error?.message ?? null}
        onSubmit={handleSubmit}
        onCancel={onCancel}
      >
        <Checkbox
          checked={storeSettings}
          onCheckedChange={setStoreSettings}
          label={
            editing
              ? "Replace its stored settings with this brief's"
              : "Also store this brief's settings"
          }
          description="Focus areas, output, context, filters and the advanced options; applied whenever the preset is picked."
        />
      </PresetEditor>
    </div>
  );
};
