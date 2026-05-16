import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

type ThemeProviderProps = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="ink"
      themes={["ink", "paper", "phosphor"]}
    >
      {children}
    </NextThemesProvider>
  );
};
