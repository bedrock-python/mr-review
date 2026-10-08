import { act, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCK_BUSY_REPO,
  MOCK_EXTERNAL_PINNED_REPO,
  MOCK_FAVOURITE_REPOS,
  MOCK_HOST_ID,
  mrHandlers,
} from "@shared/api/mocks";
import {
  getAt,
  getVirtualScrollContainer,
  mockVirtualLayout,
  renderWithQueryClient,
  scrollToEnd,
  INTEGRATION_TEST_TIMEOUT_MS,
} from "@shared/lib/test-utils";
import { ReposPane } from "./ReposPane";

// Debounce + MSW round trip + virtualizer measurement can exceed Testing Library's
// 1 s default when the machine is busy (e.g. parallel CI jobs).
configure({ asyncUtilTimeout: 5000 });

const nav = vi.hoisted(() => ({
  state: {
    selectedHostId: "00000000-0000-4000-8000-000000000001",
    selectedRepoPath: null as string | null,
    isInbox: false,
  },
  setRepo: vi.fn(),
  setInbox: vi.fn(),
}));

vi.mock("@app/navigation", () => ({
  useNav: () => ({ ...nav.state, setRepo: nav.setRepo, setInbox: nav.setInbox }),
}));

// The version badge polls GitHub releases; irrelevant here.
vi.mock("./VersionBadge", () => ({ VersionBadge: () => null }));

const LATE_FAVOURITE = MOCK_FAVOURITE_REPOS[1] ?? "";
const REPOS_URL = /\/hosts\/[^/]+\/repos$/;

const server = setupServer(
  http.get("*/api/v1/hosts", () =>
    HttpResponse.json([
      {
        id: MOCK_HOST_ID,
        name: "GitLab (mock)",
        type: "gitlab",
        base_url: "https://gitlab.example.com",
        favourite_repos: MOCK_FAVOURITE_REPOS,
        created_at: "2024-01-01T00:00:00Z",
      },
    ])
  ),
  ...mrHandlers
);
const requests: URL[] = [];

const repoRequests = (): URL[] => requests.filter((url) => REPOS_URL.test(url.pathname));

const rowLabels = (): string[] =>
  within(screen.getByRole("list", { name: "Repository list" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

let restoreLayout: () => void = () => undefined;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url));
  });
});
beforeEach(() => {
  restoreLayout = mockVirtualLayout({ viewportHeight: 600, rowHeight: 30 });
  nav.state = { selectedHostId: MOCK_HOST_ID, selectedRepoPath: null, isInbox: false };
});
afterEach(() => {
  restoreLayout();
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => {
  server.close();
});

// Page 1 holds 50 listed repositories plus the externally pinned one.
const FIRST_PAGE_STATUS = "Showing 51 · more below";

/** Waits for the first page and for the host (favourites come from it). */
const waitForFirstPage = async (): Promise<void> => {
  expect(await screen.findByText(FIRST_PAGE_STATUS)).toBeInTheDocument();
  expect(await screen.findByText("Favourites")).toBeInTheDocument();
};

/** Index of the virtual row holding the focused element. */
const focusedRowIndex = (): string | undefined =>
  (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-index]")?.dataset
    .index;

const focusRowAt = (index: number): HTMLElement => {
  const list = screen.getByRole("list", { name: "Repository list" });
  const target = list.querySelector<HTMLElement>(
    `[data-index="${String(index)}"] [data-row-focus]`
  );
  if (!target) throw new Error(`row ${String(index)} has nothing to focus`);
  target.focus();
  return target;
};

describe("ReposPane", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("arrow keys step over the favourites label and divider", async () => {
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();
    // Rows: 0 "Favourites" label, 1-3 favourites, 4 divider, 5 first namespace…
    const lastFavourite = focusRowAt(3);

    fireEvent.keyDown(lastFavourite, { key: "ArrowDown" });
    await waitFor(() => {
      expect(focusedRowIndex()).toBe("5");
    });

    fireEvent.keyDown(document.activeElement ?? lastFavourite, { key: "ArrowUp" });
    await waitFor(() => {
      expect(focusedRowIndex()).toBe("3");
    });

    fireEvent.keyDown(document.activeElement ?? lastFavourite, { key: "Home" });
    await waitFor(() => {
      expect(focusedRowIndex()).toBe("1");
    });
  });

  it("keeps every favourite on top, including pins on pages not loaded yet", async () => {
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();

    expect(rowLabels().slice(0, 5)).toEqual([
      "Favourites",
      "api-1",
      LATE_FAVOURITE.split("/").at(-1),
      "vendored-lib",
      "",
    ]);
    // Listed in the favourites section and, being loaded, in its namespace too.
    expect(
      screen.getAllByRole("button", { name: `Remove ${MOCK_EXTERNAL_PINNED_REPO} from favourites` })
    ).toHaveLength(2);
    expect(Object.fromEntries(repoRequests()[0]?.searchParams ?? [])).toEqual({
      page: "1",
      per_page: "50",
    });
  });

  it("loads the next page when scrolled to the end", async () => {
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();

    scrollToEnd(getVirtualScrollContainer(screen.getByRole("list", { name: "Repository list" })));

    expect(await screen.findByText("Showing 101 · more below")).toBeInTheDocument();
    expect(repoRequests().map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("says nothing about loading once every repository is here", async () => {
    server.use(
      http.get(REPOS_URL, () =>
        HttpResponse.json({
          items: [{ id: "7", path: "solo/only-repo", name: "only-repo", description: null }],
          page: 1,
          per_page: 50,
          has_more: false,
        })
      )
    );
    renderWithQueryClient(<ReposPane />);

    await waitFor(() => {
      expect(rowLabels()).toContain("only-repo");
    });
    expect(screen.queryByText(/Showing|loaded/)).not.toBeInTheDocument();
  });

  it("shows a per-page error with a retry that resumes loading", async () => {
    server.use(
      http.get(REPOS_URL, ({ request }) =>
        new URL(request.url).searchParams.get("page") === "2"
          ? HttpResponse.json({ detail: "upstream" }, { status: 502 })
          : undefined
      )
    );
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();

    scrollToEnd(getVirtualScrollContainer(screen.getByRole("list", { name: "Repository list" })));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load more repositories: upstream"
    );
    expect(screen.getByText(FIRST_PAGE_STATUS)).toBeInTheDocument();

    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Showing 101 · more below")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the loaded list and says why a refresh failed, with a retry", async () => {
    const { queryClient } = renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();
    server.use(
      http.get(REPOS_URL, () =>
        HttpResponse.json({ detail: "GitLab answered 502 Bad Gateway" }, { status: 502 })
      )
    );

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["mrs", "repos"] });
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not refresh the repositories");
    expect(alert).toHaveTextContent("GitLab answered 502 Bad Gateway");
    expect(rowLabels()).toContain("api-1");

    server.resetHandlers();
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("says connected only once the host has answered", async () => {
    renderWithQueryClient(<ReposPane />);

    await waitForFirstPage();

    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("says the host cannot be reached when the repository list fails", async () => {
    server.use(
      http.get(REPOS_URL, () =>
        HttpResponse.json({ detail: "connection refused" }, { status: 400 })
      )
    );
    renderWithQueryClient(<ReposPane />);

    expect(await screen.findByText("can't reach host")).toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
  });

  it("searches on the server after a pause, never below two characters", async () => {
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();
    const search = screen.getByRole("searchbox", { name: "Search repositories" });

    await userEvent.type(search, "a");
    expect(await screen.findByText("Type 1 more character to search")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inbox" })).not.toBeInTheDocument();

    await userEvent.type(search, "pi");
    await waitFor(() => {
      expect(repoRequests().at(-1)?.searchParams.get("q")).toBe("api");
    });
    expect(repoRequests().map((url) => url.searchParams.get("q"))).toEqual([null, "api"]);
    await waitFor(() => {
      expect(rowLabels()).toContain("api-1");
    });
    expect(rowLabels()).not.toContain("gateway-2");
  });

  it("highlights the selected repository and collapses namespaces", async () => {
    nav.state = { ...nav.state, selectedRepoPath: MOCK_BUSY_REPO };
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();

    // Listed twice (favourites and its namespace) but highlighted once, in favourites.
    expect(screen.getAllByRole("button", { name: "api-1" })).toHaveLength(2);
    const selected = screen.getAllByRole("button", { name: "api-1", pressed: true });
    expect(selected).toHaveLength(1);
    // Nothing else in the pane is pressed: one row is marked as the open one.
    expect(screen.getAllByRole("button", { pressed: true })).toEqual(selected);

    const namespace = screen.getByRole("button", { name: "platform", expanded: true });
    await userEvent.click(namespace);

    expect(screen.getByRole("button", { name: "platform", expanded: false })).toBeInTheDocument();
    // Only the favourites entry of the selected repo remains visible.
    expect(screen.getAllByRole("button", { name: "api-1" })).toHaveLength(1);
  });

  it("opens a repository and marks the inbox entry when active", async () => {
    nav.state = { ...nav.state, isInbox: true };
    renderWithQueryClient(<ReposPane />);
    await waitForFirstPage();

    expect(screen.getByRole("button", { name: "Inbox", pressed: true })).toBeInTheDocument();

    await userEvent.click(getAt(screen.getAllByRole("button", { name: "api-1" }), 0));
    expect(nav.setRepo).toHaveBeenCalledWith(MOCK_HOST_ID, MOCK_BUSY_REPO);
  });
});
