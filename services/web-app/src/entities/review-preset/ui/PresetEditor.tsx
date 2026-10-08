import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  MAX_PRESET_DESCRIPTION_CHARS,
  MAX_PRESET_INSTRUCTIONS_CHARS,
  MAX_PRESET_NAME_CHARS,
  ReviewPresetFormSchema,
} from "../model/reviewPreset.schema";
import type { ReviewPresetForm } from "../model/reviewPreset.schema";

export type PresetEditorProps = {
  initial: ReviewPresetForm;
  title: string;
  submitLabel: string;
  isSaving: boolean;
  /** A server error to show above the buttons, e.g. a name that is already taken. */
  error: string | null;
  onSubmit: (values: ReviewPresetForm) => void;
  onCancel: () => void;
  /** Extra controls rendered under the fields, e.g. "store the current brief settings". */
  children?: React.ReactNode;
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--c-critical-fg)",
  marginTop: 4,
};

export const PresetEditor = ({
  initial,
  title,
  submitLabel,
  isSaving,
  error,
  onSubmit,
  onCancel,
  children,
}: PresetEditorProps): React.ReactElement => {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewPresetForm>({
    resolver: zodResolver(ReviewPresetFormSchema),
    defaultValues: initial,
  });

  return (
    <form
      aria-label={title}
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
      className="card"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)" }}>{title}</div>
      <div>
        <label className="field-label" htmlFor={`${id}-name`}>
          Name
        </label>
        <input
          id={`${id}-name`}
          className="field"
          maxLength={MAX_PRESET_NAME_CHARS}
          aria-invalid={errors.name ? true : undefined}
          {...register("name")}
        />
        {errors.name && <div style={errorStyle}>{errors.name.message}</div>}
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-description`}>
          Description
        </label>
        <input
          id={`${id}-description`}
          className="field"
          maxLength={MAX_PRESET_DESCRIPTION_CHARS}
          placeholder="What this preset is for"
          {...register("description")}
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-instructions`}>
          Instructions
        </label>
        <textarea
          id={`${id}-instructions`}
          className="field"
          rows={5}
          maxLength={MAX_PRESET_INSTRUCTIONS_CHARS}
          aria-describedby={`${id}-instructions-hint`}
          style={{ fontFamily: "var(--font-sans)" }}
          {...register("instructions")}
        />
        <div
          id={`${id}-instructions-hint`}
          style={{ fontSize: 11, color: "var(--fg-2)", marginTop: 4 }}
        >
          Opens the prompt in place of the built-in preset&apos;s instructions. Leave empty to keep
          them.
        </div>
        {errors.instructions && <div style={errorStyle}>{errors.instructions.message}</div>}
      </div>
      {children}
      {error && (
        <div role="alert" style={{ ...errorStyle, marginTop: 0 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={isSaving}>
          {isSaving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
};
