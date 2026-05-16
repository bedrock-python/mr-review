import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { ApiError } from "@shared/api";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import { Toaster, toast } from "sonner";
import { ErrorBoundary } from "@shared/ui/error-boundary";
import i18n from "@shared/i18n/config";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof Error && error.message.includes("null")) return;
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (failureCount) => Math.min(1000 * 2 ** failureCount, 30000),
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "mr-review-query-cache",
  throttleTime: 1000,
});

void persistQueryClient({
  queryClient,
  persister,
  maxAge: 15 * 60 * 1000,
});

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
            <Toaster position="top-right" richColors closeButton />
          </I18nextProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};
