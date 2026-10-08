import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiError } from "@shared/api";
import {
  QUERY_CACHE_STORAGE_KEY,
  createAppQueryClient,
  setupQueryPersistence,
  shouldToastQueryError,
} from "./queryClient";

/** In-memory `Storage`: the test runner's own localStorage global shadows jsdom's. */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

type PersistedCache = {
  buster: string;
  clientState: { queries: { queryKey: unknown[] }[] };
};

const readPersisted = (storage: Storage): PersistedCache | null => {
  const raw = storage.getItem(QUERY_CACHE_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as PersistedCache);
};

const PERSIST_WAIT = { timeout: 3000 };

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("setupQueryPersistence", () => {
  it("writes hosts, providers and the update check, and nothing with code or reviews", async () => {
    const storage = new MemoryStorage();
    const client = createAppQueryClient();
    await setupQueryPersistence(client, "1.2.3", storage);

    client.setQueryData(["hosts", "list"], [{ id: "h1" }]);
    client.setQueryData(["ai-providers", "list"], [{ id: "p1" }]);
    client.setQueryData(["update-check", "v2"], null);
    client.setQueryData(["reviews", "list"], [{ id: "r1" }]);
    client.setQueryData(["reviews", "detail", "r1"], { id: "r1" });
    client.setQueryData(["review-diff", "r1"], "diff --git a/secret.py b/secret.py");
    client.setQueryData(["review-prompt", "r1", null, {}], "prompt with the code");
    client.setQueryData(["mrs", "diff", "h1", "group/repo", 12], [{ path: "secret.py" }]);

    await waitFor(() => {
      expect(readPersisted(storage)?.clientState.queries).toHaveLength(3);
    }, PERSIST_WAIT);
    const persisted = readPersisted(storage);
    expect(persisted?.buster).toBe("1.2.3");
    expect(persisted?.clientState.queries.map((q) => q.queryKey[0]).sort()).toEqual([
      "ai-providers",
      "hosts",
      "update-check",
    ]);
    expect(storage.getItem(QUERY_CACHE_STORAGE_KEY)).not.toContain("secret.py");
  });

  it("drops a cache written by another version instead of restoring it", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      QUERY_CACHE_STORAGE_KEY,
      JSON.stringify({
        buster: "",
        timestamp: Date.now(),
        clientState: {
          mutations: [],
          queries: [
            {
              queryKey: ["review-diff", "r1"],
              queryHash: '["review-diff","r1"]',
              state: { data: "old diff", status: "success", dataUpdatedAt: Date.now() },
            },
          ],
        },
      })
    );
    const client = createAppQueryClient();

    await setupQueryPersistence(client, "1.2.3", storage);

    expect(storage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
    expect(client.getQueryData(["review-diff", "r1"])).toBeUndefined();
  });

  it("does nothing when storage is unavailable", async () => {
    const client = createAppQueryClient();

    await expect(setupQueryPersistence(client, "1.2.3", undefined)).resolves.toBeUndefined();
  });
});

describe("shouldToastQueryError", () => {
  it("toasts by default, including errors whose message mentions null", () => {
    expect(shouldToastQueryError(new Error("expected string, received null"), undefined)).toBe(
      true
    );
  });

  it("stays quiet for a query that shows its own error state", () => {
    expect(shouldToastQueryError(new Error("boom"), { silent: true })).toBe(false);
  });

  it("for a query silent only when empty, stays quiet until data is loaded", () => {
    const meta = { silent: "when-empty" };

    expect(shouldToastQueryError(new Error("boom"), meta, false)).toBe(false);
    expect(shouldToastQueryError(new Error("boom"), meta, true)).toBe(true);
    expect(shouldToastQueryError(new Error("boom"), { silent: true }, true)).toBe(false);
  });

  it("stays quiet only for the statuses a query handles itself", () => {
    const meta = { silentStatuses: [404] };

    expect(shouldToastQueryError(new ApiError("gone", 404), meta)).toBe(false);
    expect(shouldToastQueryError(new ApiError("broken", 500), meta)).toBe(true);
  });
});

describe("the global error toast", () => {
  it("skips a 'when-empty' query with nothing loaded, and toasts its failed refetch", async () => {
    const client = createAppQueryClient();
    const options = {
      queryKey: ["hosts", "list"],
      queryFn: (): Promise<string[]> => Promise.reject(new Error("Backend unavailable")),
      meta: { silent: "when-empty" },
      retry: false,
    };

    await client.fetchQuery(options).catch(() => undefined);
    expect(toast.error).not.toHaveBeenCalled();

    client.setQueryData(["hosts", "list"], ["h1"]);
    await client.fetchQuery({ ...options, staleTime: 0 }).catch(() => undefined);
    expect(toast.error).toHaveBeenCalledWith("Backend unavailable");
  });
});
