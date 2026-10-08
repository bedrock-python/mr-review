import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_BUSY_REPO, MOCK_HOST_ID, mrHandlers } from "@shared/api/mocks";
import { createQueryClientWrapper, createTestQueryClient } from "@shared/lib/test-utils";
import {
  mrKeys,
  useCachedRepo,
  useInfiniteInboxMRs,
  useInfiniteMRs,
  useInfiniteRepos,
} from "./useMRs";
import type { MRStateFilter, Repo, RepoPage } from "./mr.schema";

const server = setupServer(...mrHandlers);
const requests: URL[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url));
  });
});
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => {
  server.close();
});

const repoPage = (items: Repo[]): RepoPage => ({ items, page: 1, per_page: 50, has_more: false });

describe("stale infinite lists", () => {
  it("restart from their first page instead of refetching every page loaded before", async () => {
    // Remounting a list after staleTime used to replay every loaded page (dozens of inbox
    // pages, each a fan-out over repositories upstream). It now starts over from page 1.
    const queryClient = createTestQueryClient();
    const filters = { state: "all" as const, q: "", perPage: 30 };
    const key = mrKeys.list(MOCK_HOST_ID, MOCK_BUSY_REPO, filters);
    const stalePage = (page: number) => ({ items: [], page, per_page: 30, has_more: true });
    queryClient.setQueryData(
      key,
      { pages: [1, 2, 3, 4].map(stalePage), pageParams: [1, 2, 3, 4] },
      { updatedAt: Date.now() - 60 * 60 * 1000 }
    );

    const { result } = renderHook(
      () => useInfiniteMRs(MOCK_HOST_ID, MOCK_BUSY_REPO, { state: "all" }),
      { wrapper: createQueryClientWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(requests.map((url) => url.searchParams.get("page"))).toEqual(["1"]);
    expect(result.current.data?.pages).toHaveLength(1);
  });

  it("keep every loaded page while still fresh", () => {
    const queryClient = createTestQueryClient();
    const filters = { state: "all" as const, q: "", perPage: 30 };
    const key = mrKeys.list(MOCK_HOST_ID, MOCK_BUSY_REPO, filters);
    const freshPage = (page: number) => ({ items: [], page, per_page: 30, has_more: true });
    queryClient.setQueryData(key, { pages: [1, 2, 3].map(freshPage), pageParams: [1, 2, 3] });

    const { result } = renderHook(
      () => useInfiniteMRs(MOCK_HOST_ID, MOCK_BUSY_REPO, { state: "all" }),
      { wrapper: createQueryClientWrapper(queryClient) }
    );

    expect(result.current.data?.pages).toHaveLength(3);
    expect(requests).toHaveLength(0);
  });
});

describe("useInfiniteMRs", () => {
  it("walks the pages until has_more is false", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useInfiniteMRs(MOCK_HOST_ID, MOCK_BUSY_REPO, { state: "all" }),
      { wrapper: createQueryClientWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(1);
    });
    expect(result.current.hasNextPage).toBe(true);

    for (let expectedPages = 2; expectedPages <= 4; expectedPages += 1) {
      await act(async () => {
        await result.current.fetchNextPage();
      });
      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(expectedPages);
      });
    }
    expect(result.current.hasNextPage).toBe(false);
    expect(requests.map((url) => url.searchParams.get("page"))).toEqual(["1", "2", "3", "4"]);
    expect(requests.every((url) => url.searchParams.get("per_page") === "30")).toBe(true);
  });

  it("keeps the previous list while a filter change loads, but not across repositories", async () => {
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ repoPath, state }: { repoPath: string; state: MRStateFilter }) =>
        useInfiniteMRs(MOCK_HOST_ID, repoPath, { state }),
      {
        wrapper: createQueryClientWrapper(queryClient),
        initialProps: { repoPath: MOCK_BUSY_REPO, state: "opened" },
      }
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ repoPath: MOCK_BUSY_REPO, state: "merged" });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.pages[0]?.items.length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(result.current.isPlaceholderData).toBe(false);
    });

    rerender({ repoPath: "web/auth-3", state: "merged" });
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("keys the query by every filter under the repository prefix", async () => {
    const queryClient = createTestQueryClient();
    renderHook(
      () => useInfiniteMRs(MOCK_HOST_ID, MOCK_BUSY_REPO, { state: "closed", query: " x " }),
      {
        wrapper: createQueryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]?.searchParams.get("q")).toBe("x");
    const [query] = queryClient
      .getQueryCache()
      .findAll({ queryKey: mrKeys.lists(MOCK_HOST_ID, MOCK_BUSY_REPO) });
    expect(query?.queryKey).toEqual([
      ...mrKeys.lists(MOCK_HOST_ID, MOCK_BUSY_REPO),
      "infinite",
      { state: "closed", q: "x", perPage: 30 },
    ]);
  });
});

describe("useInfiniteRepos", () => {
  it("does not search with fewer than two characters", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInfiniteRepos(MOCK_HOST_ID, "a"), {
      wrapper: createQueryClientWrapper(queryClient),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });

  it("is refetched by the add-repo-by-URL invalidation of [mrs, repos]", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInfiniteRepos(MOCK_HOST_ID), {
      wrapper: createQueryClientWrapper(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["mrs", "repos"] });
    });

    expect(requests.filter((url) => url.pathname.endsWith("/repos"))).toHaveLength(2);
  });
});

describe("useInfiniteInboxMRs", () => {
  it("requests the selected scope", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInfiniteInboxMRs(MOCK_HOST_ID, "authored"), {
      wrapper: createQueryClientWrapper(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests[0]?.searchParams.get("scope")).toBe("authored");
    expect(result.current.data?.pages[0]?.items.every((mr) => mr.author === "mock-user")).toBe(
      true
    );
  });

  it("surfaces a failed next page without dropping loaded items", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInfiniteInboxMRs(MOCK_HOST_ID, "all"), {
      wrapper: createQueryClientWrapper(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    server.use(http.get(/\/inbox$/, () => HttpResponse.json({ detail: "boom" }, { status: 502 })));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.isFetchNextPageError).toBe(true);
    });
    expect(result.current.data?.pages).toHaveLength(1);
  });
});

describe("useCachedRepo", () => {
  it("finds a repository in cached pages and ignores legacy cache shapes", () => {
    const queryClient = createTestQueryClient();
    const repo: Repo = { id: "9", path: "g/sub/repo", name: "Pretty Name", description: null };
    // Shape persisted by app versions before pagination (plain array).
    queryClient.setQueryData([...mrKeys.repos(MOCK_HOST_ID), ""], [repo]);
    const wrapper = createQueryClientWrapper(queryClient);

    const missing = renderHook(() => useCachedRepo(MOCK_HOST_ID, "g/sub/repo"), { wrapper });
    expect(missing.result.current).toBeUndefined();

    queryClient.setQueryData(mrKeys.repoList(MOCK_HOST_ID, { q: "", perPage: 50 }), {
      pages: [repoPage([repo])],
      pageParams: [1],
    });
    const found = renderHook(() => useCachedRepo(MOCK_HOST_ID, "g/sub/repo"), { wrapper });
    expect(found.result.current).toEqual(repo);
    expect(requests).toHaveLength(0);
  });
});
