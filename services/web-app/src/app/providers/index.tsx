import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "@shared/ui/toaster";
import { ErrorBoundary } from "@shared/ui/error-boundary";
import i18n from "@shared/i18n/config";
import { createAppQueryClient, setupQueryPersistence } from "./queryClient";

const queryClient = createAppQueryClient();
void setupQueryPersistence(queryClient, __APP_VERSION__);

export type ProvidersProps = {
  children: React.ReactNode;
};

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="ink"
          themes={["ink", "paper", "phosphor"]}
        >
          <I18nextProvider i18n={i18n}>
            {children}
            <Toaster />
          </I18nextProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};
