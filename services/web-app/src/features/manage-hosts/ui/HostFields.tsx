import { Controller, useWatch } from "react-hook-form";
import { ExternalLink } from "lucide-react";
import { ColorPicker, HOST_TYPE_LABELS, HostTypeSchema, getTokenLink } from "@entities/host";
import { Field, ICON_SIZE, Input, Select } from "@shared/ui";
import { HOST_TIMEOUT_LIMITS } from "../model/hostForm";
import type { HostColorId, TokenLink } from "@entities/host";
import type { UseFormReturn } from "react-hook-form";
import type { HostFormValues } from "../model/hostForm";

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

/** Two fields side by side, top-aligned so a hint or an error under one does not move the other. */
const FIELD_ROW = "grid items-start gap-(--space-3)";

export type HostFieldsProps = {
  form: UseFormReturn<HostFormValues>;
  /** create: the type is chosen and a token is required; edit: the type is fixed. */
  mode: "create" | "edit";
};

/**
 * A Git host's fields — name, type, base URL, access token (with where to create one),
 * timeout and colour — the same in the sidebar's Add host dialog and in Settings.
 */
export const HostFields = ({ form, mode }: HostFieldsProps): React.ReactElement => {
  const { errors } = form.formState;
  const hostType = useWatch({ control: form.control, name: "type" });
  const baseUrl = useWatch({ control: form.control, name: "base_url" });
  const isCreate = mode === "create";

  return (
    <>
      <div className={FIELD_ROW} style={{ gridTemplateColumns: isCreate ? "2fr 1fr" : "1fr" }}>
        <Field label="Name" error={errors.name?.message}>
          <Input {...form.register("name")} placeholder="e.g. My GitLab" autoComplete="off" />
        </Field>
        {isCreate && (
          <Field label="Type">
            <Select {...form.register("type")}>
              {HostTypeSchema.options.map((type) => (
                <option key={type} value={type}>
                  {HOST_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
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
        hint={
          isCreate
            ? "Stored on the server, never exposed to the browser."
            : "Leave blank to keep the existing token."
        }
        error={errors.token?.message}
        labelAside={<TokenLinkAnchor link={getTokenLink(hostType, baseUrl)} />}
      >
        <Input
          {...form.register("token")}
          type="password"
          isMono
          placeholder={isCreate ? "glpat-xxxxxxxxxxxxxxxxxxxx" : "New token (optional)"}
          autoComplete="off"
        />
      </Field>
      <div className={FIELD_ROW} style={{ gridTemplateColumns: "1fr 2fr" }}>
        <Field label="Timeout (s)" error={errors.timeout?.message}>
          <Input
            type="number"
            {...form.register("timeout", { valueAsNumber: true })}
            min={HOST_TIMEOUT_LIMITS.min}
            max={HOST_TIMEOUT_LIMITS.max}
          />
        </Field>
        <Field label="Colour" isGroup>
          <div className="flex min-h-(--control-md) items-center">
            <Controller
              name="colorId"
              control={form.control}
              render={({ field }) => (
                <ColorPicker value={field.value as HostColorId} onChange={field.onChange} />
              )}
            />
          </div>
        </Field>
      </div>
    </>
  );
};
