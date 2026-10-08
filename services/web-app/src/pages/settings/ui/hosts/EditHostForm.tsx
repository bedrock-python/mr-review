import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useUpdateHost } from "@entities/host";
import type { Host, HostColorId, UpdateHost } from "@entities/host";
import { Badge, Field, Input } from "@shared/ui";

import { HOST_TYPE_LABELS, UpdateHostFormSchema } from "../../lib/hostForm";
import { TIMEOUT_LIMITS } from "../../lib/timeoutLimits";
import { getTokenLink } from "../../lib/tokenLink";
import { FieldRow, InlineForm } from "../InlineForm";
import { ColourField, TokenLinkAnchor } from "./HostFieldParts";

import type { UpdateHostFormValues } from "../../lib/hostForm";

type EditHostFormProps = {
  host: Host;
  colorId: HostColorId;
  onDone: () => void;
};

/** Edits a host in place of its row; only the fields that changed are sent. */
export const EditHostForm = ({ host, colorId, onDone }: EditHostFormProps): React.ReactElement => {
  const updateHost = useUpdateHost();
  const form = useForm<UpdateHostFormValues>({
    resolver: zodResolver(UpdateHostFormSchema),
    defaultValues: {
      name: host.name,
      base_url: host.base_url,
      token: "",
      colorId,
      timeout: host.timeout,
    },
  });
  const { errors } = form.formState;
  const baseUrl = useWatch({ control: form.control, name: "base_url" });

  const handleSave = ({ colorId: color, ...data }: UpdateHostFormValues): void => {
    const payload: UpdateHost = {};
    if (data.name !== host.name) payload.name = data.name;
    if (data.base_url !== host.base_url) payload.base_url = data.base_url;
    if (data.token) payload.token = data.token;
    payload.color = color;
    if (data.timeout !== undefined && data.timeout !== host.timeout) payload.timeout = data.timeout;

    updateHost.mutate({ id: host.id, data: payload }, { onSuccess: onDone });
  };

  return (
    <InlineForm
      title="Edit host"
      label={`Edit host ${host.name}`}
      aside={<Badge>{HOST_TYPE_LABELS[host.type]}</Badge>}
      submitLabel="Save"
      isPending={updateHost.isPending}
      onSubmit={(e) => {
        void form.handleSubmit(handleSave)(e);
      }}
      onCancel={onDone}
    >
      <Field label="Name" error={errors.name?.message}>
        <Input type="text" {...form.register("name")} placeholder="e.g. My GitLab" />
      </Field>

      <Field label="Base URL" error={errors.base_url?.message}>
        <Input
          type="url"
          isMono
          {...form.register("base_url")}
          placeholder="e.g. https://gitlab.example.com"
        />
      </Field>

      <Field
        label="Access token"
        hint="Leave blank to keep the existing token."
        error={errors.token?.message}
        labelAside={<TokenLinkAnchor link={getTokenLink(host.type, baseUrl ?? host.base_url)} />}
      >
        <Input
          type="password"
          isMono
          {...form.register("token")}
          placeholder="New token (optional)"
        />
      </Field>

      <FieldRow weights={[1, 2]}>
        <Field label="Timeout (s)" error={errors.timeout?.message}>
          <Input
            type="number"
            {...form.register("timeout", { valueAsNumber: true })}
            min={TIMEOUT_LIMITS.min}
            max={TIMEOUT_LIMITS.max}
          />
        </Field>
        <Controller
          name="colorId"
          control={form.control}
          render={({ field }) => (
            <ColourField value={field.value as HostColorId} onChange={field.onChange} />
          )}
        />
      </FieldRow>
    </InlineForm>
  );
};
