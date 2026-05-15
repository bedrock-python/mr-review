import axios from "axios";
import { env } from "@shared/config";

export const httpClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

httpClient.interceptors.request.use((config) => {
  config.headers["X-Request-ID"] = crypto.randomUUID();
  return config;
});

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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
      return Promise.reject(new ApiError(message, status));
    }
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
);
