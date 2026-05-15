import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@chromatic-com/storybook",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@": path.resolve(__dirname, "../src"),
        "@app": path.resolve(__dirname, "../src/app"),
        "@pages": path.resolve(__dirname, "../src/pages"),
        "@widgets": path.resolve(__dirname, "../src/widgets"),
        "@features": path.resolve(__dirname, "../src/features"),
        "@entities": path.resolve(__dirname, "../src/entities"),
        "@shared": path.resolve(__dirname, "../src/shared"),
      };
    }
    return config;
  },
};

export default config;
