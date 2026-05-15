import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";

export { useThemeStore } from "./ThemeProvider";
export type { Theme } from "./ThemeProvider";
export { useAppStore } from "./AppStore";
export type { AppState } from "./AppStore";
export { useAIConfigStore } from "./AIConfigStore";
export type { AIConfigState } from "./AIConfigStore";

export type ProvidersProps = {
  children: React.ReactNode;
};

export const Providers = ({ children }: ProvidersProps): React.ReactElement => {
  return (
    <QueryProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryProvider>
  );
};
