import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mrKeys } from "@entities/mr";
import { MOCK_BUSY_REPO, MOCK_HOST_ID, getMockMRs, mrHandlers } from "@shared/api/mocks";
import {
  createTestQueryClient,
  renderWithQueryClient,
  INTEGRATION_TEST_TIMEOUT_MS,
} from "@shared/lib/test-utils";
import { MRHeader } from "./MRHeader";
import type * as ReviewEntity from "@entities/review";
import type { MR } from "@entities/mr";

// Sync chains several MSW round trips, which can exceed Testing Library's 1 s
// default when the machine is busy (e.g. parallel CI jobs).
configure({ asyncUtilTimeout: 5000 });

const MR_IID = 95;

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@app/navigation", () => ({
  useNav: () => ({
    selectedHostId: "00000000-0000-4000-8000-000000000001",
    selectedRepoPath: "platform/api-1",
    selectedMRIid: 95,
    activeReviewId: null,
  }),
}));

vi.mock("@entities/review", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewEntity>();
  return { ...actual, useReview: () => ({ data: undefined }) };
});

const findMockMR = (iid: number): MR => {
  const mr = getMockMRs(MOCK_BUSY_REPO).find((item) => item.iid === iid);
  if (!mr) throw new Error(`No mock MR !${String(iid)}`);
  return mr;
};

const MOCK_MR = findMockMR(MR_IID);
const DETAIL_URL = /\/repos\/platform\/api-1\/mrs\/95$/;
const CACHE_URL = /\/hosts\/[^/]+\/cache\/invalidate$/;

const requests: { method: string; url: URL }[] = [];
const server = setupServer(
  http.get("*/api/v1/hosts", () =>
    HttpResponse.json([
      {
        id: MOCK_HOST_ID,
        name: "GitLab (mock)",
        type: "gitlab",
        base_url: "https://gitlab.example.com",
        created_at: "2024-01-01T00:00:00Z",
      },
    ])
  ),
  http.post(CACHE_URL, () => new HttpResponse(null, { status: 204 })),
  ...mrHandlers
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    requests.push({ method: request.method, url: new URL(request.url) });
  });
});
beforeEach(() => {
  mocks.toastSuccess.mockClear();
  mocks.toastError.mockClear();
});
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => {
  server.close();
});

const detailRequests = (): number =>
  requests.filter(
    ({ method, url }) => method === "GET" && url.pathname.endsWith("/repos/platform/api-1/mrs/95")
  ).length;

describe("MRHeader", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("names the repository from its path without requesting the repository list", async () => {
    renderWithQueryClient(<MRHeader />);

    expect(await screen.findByRole("heading", { name: MOCK_MR.title })).toBeInTheDocument();
    expect(screen.getByText("api-1")).toHaveAttribute("title", MOCK_BUSY_REPO);
    expect(requests.some(({ url }) => url.pathname.endsWith("/repos"))).toBe(false);
  });

  it("uses the repository name the sidebar already cached", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(mrKeys.repoList(MOCK_HOST_ID, { q: "", perPage: 50 }), {
      pages: [
        {
          items: [{ id: "1", path: MOCK_BUSY_REPO, name: "API One", description: null }],
          page: 1,
          per_page: 50,
          has_more: false,
        },
      ],
      pageParams: [1],
    });

    renderWithQueryClient(<MRHeader />, queryClient);

    expect(await screen.findByText("API One")).toBeInTheDocument();
  });

  it("shows a skeleton while the MR loads", async () => {
    renderWithQueryClient(<MRHeader />);

    expect(screen.getByRole("status", { name: "Loading merge request" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: MOCK_MR.title })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading merge request" })).not.toBeInTheDocument();
  });

  it("shows a compact error row that retries the MR", async () => {
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json({ detail: "upstream" }, { status: 502 }), {
        once: true,
      })
    );
    renderWithQueryClient(<MRHeader />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load merge request !95");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: MOCK_MR.title })).toBeInTheDocument();
  });

  it("Sync drops the backend cache, refetches, and only then reports success", async () => {
    renderWithQueryClient(<MRHeader />);
    await screen.findByRole("heading", { name: MOCK_MR.title });
    expect(detailRequests()).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: /sync/i }));

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("MR synced");
    });
    const cacheIndex = requests.findIndex(({ url }) => CACHE_URL.test(url.pathname));
    const refetchIndex = requests
      .map(({ url }) => url.pathname.endsWith("/repos/platform/api-1/mrs/95"))
      .lastIndexOf(true);
    expect(requests[cacheIndex]?.method).toBe("POST");
    expect(requests[cacheIndex]?.url.searchParams.get("repo_path")).toBe(MOCK_BUSY_REPO);
    expect(refetchIndex).toBeGreaterThan(cacheIndex);
    expect(detailRequests()).toBe(2);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("Sync reports a failure when the refetch fails", async () => {
    renderWithQueryClient(<MRHeader />);
    await screen.findByRole("heading", { name: MOCK_MR.title });
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json({ detail: "upstream" }, { status: 502 }))
    );

    await userEvent.click(screen.getByRole("button", { name: /sync/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Sync failed", expect.anything());
    });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("hides the branch chip when the host reported no branches", async () => {
    server.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json({ ...MOCK_MR, source_branch: "", target_branch: "" })
      )
    );
    renderWithQueryClient(<MRHeader />);

    await screen.findByRole("heading", { name: MOCK_MR.title });
    expect(screen.queryByText("→")).not.toBeInTheDocument();
    expect(screen.queryByText(MOCK_MR.source_branch)).not.toBeInTheDocument();
  });
});
