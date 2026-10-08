import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { UpdateAIProviderSchema, aiProviderApi, useUpdateAIProvider } from "@entities/ai-provider";
import type { AIProvider, UpdateAIProvider } from "@entities/ai-provider";
import { Badge, Field, Input } from "@shared/ui";

import {
  BASE_URL_HINT,
  BASE_URL_PLACEHOLDER,
  PROVIDER_TYPE_LABELS,
  claudeBaseUrlWarning,
  normalizeEndpoint,
  toPreviewRequest,
} from "../../lib/providerEndpoint";
import { TIMEOUT_LIMITS } from "../../lib/timeoutLimits";
import { FieldRow, InlineForm } from "../InlineForm";
import { fieldWithNoteStyle } from "../styles";
import { BaseUrlWarning } from "./BaseUrlWarning";
import { ModelsField, SslVerifyField } from "./ProviderFieldParts";

type EditProviderFormProps = {
  provider: AIProvider;
  onDone: () => void;
};

/** Edits a provider in place of its row; a blank API key keeps the saved one. */
export const EditProviderForm = ({
  provider,
  onDone,
}: EditProviderFormProps): React.ReactElement => {
  const updateProvider = useUpdateAIProvider();
  const form = useForm<UpdateAIProvider>({
    resolver: zodResolver(UpdateAIProviderSchema),
    defaultValues: {
      name: provider.name,
      api_key: "",
      base_url: provider.base_url,
      models: [...provider.models],
      ssl_verify: provider.ssl_verify,
      timeout: provider.timeout,
    },
  });
  const { errors } = form.formState;

  const models: string[] = useWatch({ control: form.control, name: "models" }) ?? provider.models;
  const baseUrl = useWatch({ control: form.control, name: "base_url" }) ?? provider.base_url;
  const apiKey = useWatch({ control: form.control, name: "api_key" }) ?? "";
  // The saved key only goes to the saved endpoint; the server refuses otherwise.
  const fetchBlockedReason =
    !apiKey && normalizeEndpoint(baseUrl) !== normalizeEndpoint(provider.base_url)
      ? "Enter the API key to fetch models from a changed base URL"
      : null;

  // Lists with the key and URL being edited, not the saved ones: a blank key keeps the saved key.
  const handleFetchModels = (): Promise<string[]> =>
    aiProviderApi.previewModels(
      toPreviewRequest(form.getValues(), { provider_id: provider.id, type: provider.type })
    );

  const handleSave = (data: UpdateAIProvider): void => {
    const payload: UpdateAIProvider = {};
    if (data.name !== provider.name) payload.name = data.name;
    if (data.api_key) payload.api_key = data.api_key;
    if (data.base_url !== provider.base_url) payload.base_url = data.base_url;
    payload.models = data.models;
    if (data.ssl_verify !== provider.ssl_verify) payload.ssl_verify = data.ssl_verify;
    if (data.timeout !== provider.timeout) payload.timeout = data.timeout;

    updateProvider.mutate({ id: provider.id, data: payload }, { onSuccess: onDone });
  };

  return (
    <InlineForm
      title="Edit provider"
      label={`Edit provider ${provider.name}`}
      aside={<Badge>{PROVIDER_TYPE_LABELS[provider.type]}</Badge>}
      submitLabel="Save"
      isPending={updateProvider.isPending}
      onSubmit={(e) => {
        void form.handleSubmit(handleSave)(e);
      }}
      onCancel={onDone}
    >
      <Field label="Name" error={errors.name?.message}>
        <Input type="text" {...form.register("name")} placeholder="e.g. My Claude" />
      </Field>

      <Field
        label="API key"
        hint="Leave blank to keep the existing key."
        error={errors.api_key?.message}
      >
        <Input
          type="password"
          isMono
          {...form.register("api_key")}
          placeholder="New API key (optional)"
        />
      </Field>

      <div style={fieldWithNoteStyle}>
        <Field label="Base URL" hint={BASE_URL_HINT[provider.type]}>
          <Input
            type="url"
            isMono
            {...form.register("base_url")}
            placeholder={BASE_URL_PLACEHOLDER[provider.type]}
          />
        </Field>
        <BaseUrlWarning message={claudeBaseUrlWarning(provider.type, baseUrl)} />
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
        fetchBlockedReason={fetchBlockedReason}
      />
    </InlineForm>
  );
};
