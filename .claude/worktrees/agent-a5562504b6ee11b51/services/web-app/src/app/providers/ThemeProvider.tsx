import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";

export type Theme = "ink" | "paper" | "phosphor";

export type ThemeStore = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "ink" as Theme,
      setTheme: (theme) => set({ theme }),
    }),
    { name: "mr-review-theme" },
  ),
);

export type ThemeProviderProps = {
  children: React.ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps): React.ReactElement => {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
};
