import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";

import {
  AIProviderTypeSchema,
  CreateAIProviderSchema,
  aiProviderApi,
  useCreateAIProvider,
} from "@entities/ai-provider";
import type { CreateAIProvider } from "@entities/ai-provider";
import { Button, Field, ICON_SIZE, Input, Select } from "@shared/ui";

import {
  BASE_URL_HINT,
  BASE_URL_PLACEHOLDER,
  PROVIDER_TYPE_LABELS,
  claudeBaseUrlWarning,
  toPreviewRequest,
} from "../../lib/providerEndpoint";
import { TIMEOUT_LIMITS } from "../../lib/timeoutLimits";
import { FieldRow, InlineForm } from "../InlineForm";
import { addRowStyle, fieldWithNoteStyle } from "../styles";
import { BaseUrlWarning } from "./BaseUrlWarning";
import { ModelsField, SslVerifyField } from "./ProviderFieldParts";

import type { z } from "zod";

type CreateAIProviderInput = z.input<typeof CreateAIProviderSchema>;

/** "Add provider" at the bottom of the providers list, opening the form in its place. */
export const AddProviderForm = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const createProvider = useCreateAIProvider();
  const form = useForm<CreateAIProviderInput, unknown, CreateAIProvider>({
    resolver: zodResolver(CreateAIProviderSchema),
    defaultValues: {
      name: "",
      type: "claude",
      api_key: "",
      base_url: "",
      models: [],
      timeout: 60,
      ssl_verify: true,
    },
  });
  const { errors } = form.formState;

  const providerType = useWatch({ control: form.control, name: "type" });
  const apiKey = useWatch({ control: form.control, name: "api_key" });
  const baseUrl = useWatch({ control: form.control, name: "base_url" });
  const models = useWatch({ control: form.control, name: "models" }) ?? [];

  const handleFetchModels = (): Promise<string[]> =>
    aiProviderApi.previewModels(toPreviewRequest(form.getValues(), { type: providerType }));

  const handleSubmit = (data: CreateAIProvider): void => {
    createProvider.mutate(data, {
      onSuccess: () => {
        form.reset();
        setIsOpen(false);
      },
    });
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
          Add provider
        </Button>
      </div>
    );
  }

  return (
    <InlineForm
      title="New AI provider"
      submitLabel="Add provider"
      isPending={createProvider.isPending}
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
          <Input type="text" {...form.register("name")} placeholder="e.g. My Claude" />
        </Field>
        <Field label="Type">
          <Select
            {...form.register("type", {
              // A base URL belongs to the type it was typed for: never carry it to another.
              onChange: () => {
                form.setValue("base_url", "");
              },
            })}
          >
            {AIProviderTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {PROVIDER_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>

      <Field
        label="API key"
        hint="Stored on the server, never exposed to the browser."
        error={errors.api_key?.message}
      >
        <Input
          type="password"
          isMono
          {...form.register("api_key")}
          placeholder={providerType === "claude" ? "sk-ant-api03-…" : "sk-…"}
        />
      </Field>

      <div style={fieldWithNoteStyle}>
        <Field label="Base URL" hint={BASE_URL_HINT[providerType]}>
          <Input
            type="url"
            isMono
            {...form.register("base_url")}
            placeholder={BASE_URL_PLACEHOLDER[providerType]}
          />
        </Field>
        <BaseUrlWarning message={claudeBaseUrlWarning(providerType, baseUrl ?? "")} />
      </div>

      <FieldRow weights={[1, 2]}>
        <Field label="Timeout (s)" error={errors.timeout?.message}>
          <Input
            type="number"
            {...form.register("timeout", { valueAsNumber: true })}
            min={TIMEOUT_LIMITS.min}
            max={TIMEOUT_LIMITS.max}
          />
        </Field>
        <SslVerifyField {...form.register("ssl_verify")} />
      </FieldRow>

      <ModelsField
        models={models}
        onChange={(next) => {
          form.setValue("models", next, { shouldDirty: true });
        }}
        onFetchModels={handleFetchModels}
        fetchBlockedReason={apiKey ? null : "Enter the API key to fetch models"}
      />
    </InlineForm>
  );
};
