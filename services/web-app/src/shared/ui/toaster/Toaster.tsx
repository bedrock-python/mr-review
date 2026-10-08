import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";
import { toasterThemeFor } from "./toasterThemeFor";

export type ToasterProps = {
  position?: "top-right" | "bottom-right" | "top-center" | "bottom-center";
};

/**
 * The app's toasts: sonner, in the active theme and styled with the tokens (bg-2, border,
 * a severity bar by type). No rich colours — the bar and the icon carry the type.
 */
export const Toaster = ({ position = "top-right" }: ToasterProps): React.ReactElement => {
  const { forcedTheme, resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position={position}
      theme={toasterThemeFor(forcedTheme ?? resolvedTheme)}
      closeButton
      toastOptions={{ className: "ui-toast" }}
    />
  );
};
