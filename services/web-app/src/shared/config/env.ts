import { z } from "zod";

declare global {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions */
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL: string;
      APP_ENV: string;
      OAUTH_CLIENT_ID?: string;
      VITE_USE_MOCKS?: string | boolean;
      BUILD_TIME: string;
      VERSION: string;
    };
  }
}

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .default(
      typeof window !== "undefined" && window.__APP_CONFIG__ != null
        ? window.__APP_CONFIG__.API_BASE_URL
        : "http://localhost:8000"
    )
    .describe("Backend API base URL"),
  VITE_APP_ENV: z
    .enum(["development", "staging", "production"])
    .default(
      (typeof window !== "undefined" && window.__APP_CONFIG__?.APP_ENV
        ? window.__APP_CONFIG__.APP_ENV
        : "development") as "development" | "staging" | "production"
    )
    .describe("Application environment"),
  VITE_OAUTH_CLIENT_ID: z
    .string()
    .default(
      typeof window !== "undefined" && window.__APP_CONFIG__?.OAUTH_CLIENT_ID
        ? window.__APP_CONFIG__.OAUTH_CLIENT_ID
        : "mr-review-web-app"
    )
    .describe("OAuth2 client id"),
  VITE_USE_MOCKS: z
    .preprocess((_val) => {
      if (typeof window !== "undefined" && window.__APP_CONFIG__ != null) {
        const v = window.__APP_CONFIG__.VITE_USE_MOCKS;
        if (v !== undefined && String(v) !== "") {
          return v === "true" || v === true;
        }
      }
      if (typeof _val === "string") {
        return _val === "true";
      }
      if (typeof _val === "boolean") {
        return _val;
      }
      return import.meta.env.DEV;
    }, z.boolean())
    .describe("Whether to use MSW mocks"),
  MODE: z.string().optional(),
  DEV: z.boolean().optional(),
  PROD: z.boolean().optional(),
});

const parseEnv = () => {
  try {
    return envSchema.parse(import.meta.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Environment validation failed:", error);
      throw new Error("Invalid environment configuration", { cause: error });
    }
    throw error;
  }
};

export const env = parseEnv();

export const isDevelopment = env.VITE_APP_ENV === "development";
export const isProduction = env.VITE_APP_ENV === "production";
export const isStaging = env.VITE_APP_ENV === "staging";
