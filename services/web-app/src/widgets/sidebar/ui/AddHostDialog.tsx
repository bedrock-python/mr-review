import { useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import { z } from "zod";
import { ColorPicker, CreateHostSchema, HOST_COLORS, useCreateHost } from "@entities/host";
import { Button, Dialog, Field, ICON_SIZE, Input, Select } from "@shared/ui";
import { getTokenLink } from "../lib/tokenLink";
import type { HostColorId } from "@entities/host";
import type { TokenLink } from "../lib/tokenLink";

/** The bounds the server accepts for a host's request timeout, in seconds. */
const TIMEOUT_LIMITS = { min: 1, max: 600 } as const;
const DEFAULT_HOST_TIMEOUT_S = 30;

const AddHostFormSchema = CreateHostSchema.extend({
  colorId: z.string(),
  timeout: z
    .number()
    .int()
    .min(TIMEOUT_LIMITS.min, "Must be at least 1")
    .max(TIMEOUT_LIMITS.max, "Max 600s"),
});
type AddHostFormValues = z.infer<typeof AddHostFormSchema>;

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

/** "Create a token on gitlab.example.com ↗": where the host issues the token asked for. */
const TokenLinkAnchor = ({ link }: { link: TokenLink | null }): React.ReactElement | null =>
  link ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-fg inline-flex items-center gap-(--space-1) text-(length:--fs-meta) font-medium no-underline hover:underline"
    >
      {link.label}
      <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />
    </a>
  ) : null;

export type AddHostDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * A new Git host: its kind, where it is, the token to read it with, a timeout and a colour.
 * The same fields and words as Settings' host form.
 */
export const AddHostDialog = ({ isOpen, onClose }: AddHostDialogProps): React.ReactElement => {
  const createHost = useCreateHost();
  const formId = useId();
  const colorLabelId = useId();
  const form = useForm<AddHostFormValues>({
    resolver: zodResolver(AddHostFormSchema),
    defaultValues: EMPTY_FORM,
  });
  const { errors } = form.formState;
  const hostType = useWatch({ control: form.control, name: "type" });
  const baseUrl = useWatch({ control: form.control, name: "base_url" });

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
          <Input {...form.register("name")} placeholder="e.g. My GitLab" autoComplete="off" />
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
          label="Access token"
          hint="Stored on the server, never exposed to the browser."
          error={errors.token?.message}
          labelAside={<TokenLinkAnchor link={getTokenLink(hostType, baseUrl)} />}
        >
          <Input
            {...form.register("token")}
            type="password"
            isMono
            placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-[1fr_2fr] items-start gap-(--space-4)">
          <Field label="Timeout (s)" error={errors.timeout?.message}>
            <Input
              type="number"
              {...form.register("timeout", { valueAsNumber: true })}
              min={TIMEOUT_LIMITS.min}
              max={TIMEOUT_LIMITS.max}
            />
          </Field>
          <div
            role="group"
            aria-labelledby={colorLabelId}
            className="flex flex-col gap-(--space-2)"
          >
            <span id={colorLabelId} className="ui-eyebrow">
              Colour
            </span>
            <Controller
              name="colorId"
              control={form.control}
              render={({ field }) => (
                <ColorPicker value={field.value as HostColorId} onChange={field.onChange} />
              )}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
};
