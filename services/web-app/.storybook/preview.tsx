import type { Preview } from "@storybook/react";
import { ThemeProvider } from "next-themes";
import "../src/app/styles/fonts";
import "../src/app/styles/index.css";

const THEMES = ["ink", "paper", "phosphor"] as const;

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: "App theme",
      toolbar: { title: "Theme", icon: "paintbrush", items: [...THEMES], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "ink" },
  decorators: [
    (Story, context) => (
      // Same attribute and themes as the app, so stories render with the real tokens.
      <ThemeProvider
        attribute="data-theme"
        themes={[...THEMES]}
        forcedTheme={String(context.globals.theme ?? "ink")}
      >
        <div style={{ padding: 16, background: "var(--bg-0)", color: "var(--fg-0)" }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
