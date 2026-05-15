import axios from "axios";
import { env } from "@shared/config";

export const httpClient = axios.create({
  baseURL: env.VITE_API_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

httpClient.interceptors.request.use((config) => {
  config.headers["X-Request-ID"] = crypto.randomUUID();
  return config;
});
