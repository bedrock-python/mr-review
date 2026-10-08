import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { Query, QueryMeta } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { toast } from "sonner";
import { ApiError, queryRetryDelay, shouldRetryQuery } from "@shared/api";

const STALE_TIME_MS = 5 * 60 * 1000;
const GC_TIME_MS = 15 * 60 * 1000;
const PERSIST_MAX_AGE_MS = 15 * 60 * 1000;
const PERSIST_THROTTLE_MS = 1000;

export const QUERY_CACHE_STORAGE_KEY = "mr-review-query-cache";

/**
 * The only queries written to localStorage: small, slow to change, and free of code or
 * review content. Diffs, prompts, context and reviews stay in memory — serialising them
 * blocked the main thread, filled the ~5 MB quota (after which nothing was saved and other
 * writes threw), and left private source code on disk.
 */
export const PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "hosts",
  "ai-providers",
  "update-check",
]);

export const shouldPersistQuery = (query: Pick<Query, "queryKey" | "state">): boolean => {
  const root = query.queryKey[0];
  return (
    query.state.status === "success" && typeof root === "string" && PERSISTED_QUERY_ROOTS.has(root)
  );
};

/**
 * Whether a failed query gets the global error toast. A query that shows its own error
 * state where its data would be — the repository and merge request lists, the merge request
 * header, the hosts and AI providers — opts out with `meta: { silent: true }`, or with
 * `silentStatuses` for the statuses it handles itself (a 404 the page turns into a
 * redirect). A toast on top would say the same thing twice.
 */
export const shouldToastQueryError = (error: unknown, meta: QueryMeta | undefined): boolean => {
  if (meta?.silent === true) return false;
  const silentStatuses = meta?.silentStatuses;
  if (error instanceof ApiError && Array.isArray(silentStatuses)) {
    return !silentStatuses.includes(error.status);
  }
  return true;
};

export const createAppQueryClient = (): QueryClient =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!shouldToastQueryError(error, query.meta)) return;
        toast.error(error instanceof Error ? error.message : "Unknown error");
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
    },
  });

const getLocalStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Blocked storage (private mode, site data disabled) throws on access.
    return undefined;
  }
};

/**
 * Restores and keeps saving the allowlisted queries. `buster` is the app version: a cache
 * written by another version (or the old whole-cache format) is discarded on load.
 * Resolves once the restore is done and changes are being saved.
 */
export const setupQueryPersistence = async (
  queryClient: QueryClient,
  buster: string,
  storage: Storage | undefined = getLocalStorage()
): Promise<void> => {
  if (!storage) return;
  const persister = createSyncStoragePersister({
    storage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: PERSIST_THROTTLE_MS,
  });
  const [, restored] = persistQueryClient({
    queryClient,
    persister,
    buster,
    maxAge: PERSIST_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersistQuery,
      shouldDehydrateMutation: () => false,
    },
  });
  await restored;
};
