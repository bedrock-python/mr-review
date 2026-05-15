export const env = {
  VITE_API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
} as const;
