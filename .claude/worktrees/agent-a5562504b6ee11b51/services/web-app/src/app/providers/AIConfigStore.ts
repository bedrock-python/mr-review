import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIConfig } from "@entities/review";

export type AIConfigState = {
  config: AIConfig;
  setConfig: (config: Partial<AIConfig>) => void;
};

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set) => ({
      config: {
        provider: "claude",
        api_key: "",
        model: "claude-sonnet-4-6",
        base_url: "",
      },
      setConfig: (partial) =>
        set((s) => ({ config: { ...s.config, ...partial } })),
    }),
    { name: "mr-review-ai-config" },
  ),
);
