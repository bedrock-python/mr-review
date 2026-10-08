import axios from "axios";
import { env } from "@shared/config";

/** Budget for an ordinary API call: reads, small writes. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/**
 * Budget for calls whose server side does real work on the VCS host: building a prompt
 * from full files, assembling context, fetching a large diff, posting every comment.
 */
export const LONG_REQUEST_TIMEOUT_MS = 180_000;

export const httpClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

httpClient.interceptors.request.use((config) => {
  config.headers["X-Request-ID"] = crypto.randomUUID();
  return config;
});

/** `http`: the server answered with an error status; otherwise no answer arrived. */
export type ApiErrorKind = "http" | "timeout" | "network";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kind: ApiErrorKind = "http",
    /** Lower-case HTTP method of the failed request, when known. */
    public readonly method: string | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TIMEOUT_CODES = new Set(["ECONNABORTED", "ETIMEDOUT"]);

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const responseData = error.response?.data as { detail?: unknown } | undefined;
      const rawDetail: unknown = responseData?.detail;
      const detail = rawDetail as string | Record<string, unknown> | undefined;
      const message = detail
        ? typeof detail === "string"
          ? detail
          : JSON.stringify(detail)
        : error.message;
      let kind: ApiErrorKind = "http";
      if (!error.response) kind = TIMEOUT_CODES.has(error.code ?? "") ? "timeout" : "network";
      const method = error.config?.method?.toLowerCase() ?? null;
      return Promise.reject(new ApiError(message, status, kind, method));
    }
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
);
