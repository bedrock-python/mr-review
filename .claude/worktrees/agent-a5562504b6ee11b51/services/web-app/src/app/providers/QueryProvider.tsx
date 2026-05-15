import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export type QueryProviderProps = {
  children: React.ReactNode;
};

export const QueryProvider = ({ children }: QueryProviderProps): React.ReactElement => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (
                error !== null &&
                typeof error === "object" &&
                "response" in error &&
                error.response !== null &&
                typeof error.response === "object" &&
                "status" in error.response &&
                typeof error.response.status === "number" &&
                error.response.status < 500
              ) {
                return false;
              }
              return failureCount < 3;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
