import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";

import { HOST_COLORS, HostTypeSchema, useCreateHost } from "@entities/host";
import type { HostColorId } from "@entities/host";
import { Button, Field, ICON_SIZE, Input, Select } from "@shared/ui";

import { CreateHostFormSchema, HOST_TYPE_LABELS } from "../../lib/hostForm";
import { TIMEOUT_LIMITS } from "../../lib/timeoutLimits";
import { getTokenLink } from "../../lib/tokenLink";
import { FieldRow, InlineForm } from "../InlineForm";
import { addRowStyle } from "../styles";
import { ColourField, TokenLinkAnchor } from "./HostFieldParts";

import type { CreateHostFormValues } from "../../lib/hostForm";

const EMPTY_HOST: CreateHostFormValues = {
  name: "",
  type: "gitlab",
  base_url: "",
  token: "",
  colorId: HOST_COLORS[0].id,
  timeout: 30,
};

/** "Add host" at the bottom of the hosts list, opening the form in its place. */
export const AddHostForm = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const createHost = useCreateHost();
  const form = useForm<CreateHostFormValues>({
    resolver: zodResolver(CreateHostFormSchema),
    defaultValues: EMPTY_HOST,
  });
  const { errors } = form.formState;
  const hostType = useWatch({ control: form.control, name: "type" });
  const baseUrl = useWatch({ control: form.control, name: "base_url" });

  const handleSubmit = ({ colorId, ...data }: CreateHostFormValues): void => {
    createHost.mutate(
      { ...data, color: colorId },
      {
        onSuccess: () => {
          form.reset(EMPTY_HOST);
          setIsOpen(false);
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <div style={addRowStyle}>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Add host
        </Button>
      </div>
    );
  }

  return (
    <InlineForm
      title="New host"
      submitLabel="Add host"
      isPending={createHost.isPending}
      onSubmit={(e) => {
        void form.handleSubmit(handleSubmit)(e);
      }}
      onCancel={() => {
        setIsOpen(false);
        form.reset();
      }}
    >
      <FieldRow weights={[2, 1]}>
        <Field label="Name" error={errors.name?.message}>
          <Input type="text" {...form.register("name")} placeholder="e.g. My GitLab" />
        </Field>
        <Field label="Type">
          <Select {...form.register("type")}>
            {HostTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {HOST_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>

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
        hint="Stored on the server, never exposed to the browser."
        error={errors.token?.message}
        labelAside={<TokenLinkAnchor link={getTokenLink(hostType, baseUrl)} />}
      >
        <Input
          type="password"
          isMono
          {...form.register("token")}
          placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
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
