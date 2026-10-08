import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ColorPicker, CreateHostSchema, HOST_COLORS, useCreateHost } from "@entities/host";
import { Button, Dialog, Field, Input, Select } from "@shared/ui";
import type { HostColorId } from "@entities/host";

const AddHostFormSchema = CreateHostSchema.extend({
  colorId: z.string(),
  timeout: z.number().int().min(1, "Must be at least 1").max(600, "Max 600s"),
});
type AddHostFormValues = z.infer<typeof AddHostFormSchema>;

// The form has no timeout input; without a value the schema rejects every submit.
const DEFAULT_HOST_TIMEOUT_S = 30;

const EMPTY_FORM: AddHostFormValues = {
  name: "",
  type: "gitlab",
  base_url: "",
  token: "",
  colorId: HOST_COLORS[0].id,
  timeout: DEFAULT_HOST_TIMEOUT_S,
};

const HOST_TYPES = [
  { value: "gitlab", label: "GitLab" },
  { value: "github", label: "GitHub" },
  { value: "gitea", label: "Gitea" },
  { value: "forgejo", label: "Forgejo" },
  { value: "bitbucket", label: "Bitbucket" },
] as const;

export type AddHostDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/** A new Git host: its kind, where it is, the token to read it with, and a colour. */
export const AddHostDialog = ({ isOpen, onClose }: AddHostDialogProps): React.ReactElement => {
  const createHost = useCreateHost();
  const formId = useId();
  const colorLabelId = useId();
  const form = useForm<AddHostFormValues>({
    resolver: zodResolver(AddHostFormSchema),
    defaultValues: EMPTY_FORM,
  });
  const { errors } = form.formState;

  const handleClose = (): void => {
    form.reset(EMPTY_FORM);
    onClose();
  };

  const handleSubmit = ({ colorId, ...data }: AddHostFormValues): void => {
    createHost.mutate({ ...data, color: colorId }, { onSuccess: handleClose });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      title="Add host"
      description="Connect a GitLab, GitHub, Gitea, Forgejo or Bitbucket instance to review its merge requests."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={form.formState.isSubmitting || createHost.isPending}
          >
            Add host
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-(--space-4)"
      >
        <Field label="Name" error={errors.name?.message}>
          <Input {...form.register("name")} placeholder="e.g. Work GitLab" autoComplete="off" />
        </Field>
        <Field label="Type">
          <Select {...form.register("type")}>
            {HOST_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base URL" error={errors.base_url?.message}>
          <Input
            {...form.register("base_url")}
            type="url"
            isMono
            placeholder="e.g. https://gitlab.example.com"
          />
        </Field>
        <Field
          label="Access Token"
          hint="Read access to repositories and merge requests; write access to post comments."
          error={errors.token?.message}
        >
          <Input
            {...form.register("token")}
            type="password"
            isMono
            placeholder="e.g. glpat-…"
            autoComplete="off"
          />
        </Field>
        <div role="group" aria-labelledby={colorLabelId} className="flex flex-col gap-(--space-2)">
          <span id={colorLabelId} className="ui-eyebrow">
            Color
          </span>
          <Controller
            name="colorId"
            control={form.control}
            render={({ field }) => (
              <ColorPicker value={field.value as HostColorId} onChange={field.onChange} />
            )}
          />
        </div>
      </form>
    </Dialog>
  );
};
