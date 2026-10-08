import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Callout, Card, Field, Input, Textarea } from "@shared/ui";

import {
  MAX_PRESET_DESCRIPTION_CHARS,
  MAX_PRESET_INSTRUCTIONS_CHARS,
  MAX_PRESET_NAME_CHARS,
  ReviewPresetFormSchema,
} from "../model/reviewPreset.schema";
import type { ReviewPresetForm } from "../model/reviewPreset.schema";

const INSTRUCTIONS_ROWS = 5;

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

/** A preset's name, description and instructions, in a card with Save and Cancel. */
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewPresetForm>({
    resolver: zodResolver(ReviewPresetFormSchema),
    defaultValues: initial,
  });

  return (
    <Card padding="md">
      <form
        aria-label={title}
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="flex flex-col"
        style={{ gap: "var(--space-4)" }}
      >
        <p
          className="text-fg-0 m-0"
          style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-semibold)" }}
        >
          {title}
        </p>
        <Field label="Name" error={errors.name?.message}>
          <Input maxLength={MAX_PRESET_NAME_CHARS} {...register("name")} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Input
            maxLength={MAX_PRESET_DESCRIPTION_CHARS}
            placeholder="e.g. Exported names and their docs only"
            {...register("description")}
          />
        </Field>
        <Field
          label="Instructions"
          hint="Opens the prompt in place of the built-in preset's instructions. Leave empty to keep them."
          error={errors.instructions?.message}
        >
          <Textarea
            rows={INSTRUCTIONS_ROWS}
            maxLength={MAX_PRESET_INSTRUCTIONS_CHARS}
            {...register("instructions")}
          />
        </Field>
        {children}
        {error && (
          <Callout tone="danger" size="sm">
            {error}
          </Callout>
        )}
        <div className="flex justify-end" style={{ gap: "var(--space-2)" }}>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
};
