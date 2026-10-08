import type { AIProviderType, PreviewModelsRequest } from "@entities/ai-provider";

export const PROVIDER_TYPE_LABELS: Record<AIProviderType, string> = {
  claude: "Claude",
  openai: "OpenAI",
  openai_compat: "OpenAI-compat",
};

export const BASE_URL_PLACEHOLDER: Record<AIProviderType, string> = {
  claude: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  openai_compat: "http://localhost:11434/v1",
};

export const BASE_URL_HINT: Record<AIProviderType, string> = {
  claude: "Leave blank for Anthropic; set it to go through a gateway such as LiteLLM or a proxy.",
  openai: "Leave blank for the default endpoint.",
  openai_compat: "Leave blank for the default endpoint.",
};

export const MODELS_HINT = "The first model is used when a dispatch names none.";

const ANTHROPIC_HOST = "api.anthropic.com";

export const normalizeEndpoint = (url: string): string => url.trim().replace(/\/+$/, "");

const hostOf = (url: string): string | null => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
};

/**
 * A Claude provider with a base URL sends every request there instead of to Anthropic. Before
 * base URLs were honoured for Claude, the add form could keep one from another provider type.
 */
export const claudeBaseUrlWarning = (type: AIProviderType, baseUrl: string): string | null => {
  const url = baseUrl.trim();
  if (type !== "claude" || !url || hostOf(url) === ANTHROPIC_HOST) return null;
  return `Requests go to ${url} instead of Anthropic. Clear Base URL unless this is a gateway such as LiteLLM.`;
};

export type ProviderFormValues = {
  api_key?: string | undefined;
  base_url?: string | undefined;
  ssl_verify?: boolean | undefined;
  timeout?: number | undefined;
};

/** The form's connection settings as they are now, saved or not, for listing the endpoint's models. */
export const toPreviewRequest = (
  values: ProviderFormValues,
  extra: Pick<PreviewModelsRequest, "provider_id" | "type">
): PreviewModelsRequest => ({
  ...extra,
  ...(values.api_key ? { api_key: values.api_key } : {}),
  base_url: values.base_url ?? "",
  ...(values.ssl_verify === undefined ? {} : { ssl_verify: values.ssl_verify }),
  ...(values.timeout !== undefined && Number.isFinite(values.timeout)
    ? { timeout: values.timeout }
    : {}),
});
