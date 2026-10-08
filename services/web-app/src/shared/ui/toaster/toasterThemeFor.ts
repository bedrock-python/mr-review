/** Sonner's light/dark for an app theme: paper is the only light one. */
export const toasterThemeFor = (theme: string | undefined): "light" | "dark" =>
  theme === "paper" ? "light" : "dark";
