import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_BUSY_REPO, MOCK_HOST_ID, getMockMRs, mrHandlers } from "@shared/api/mocks";
import { MAX_BARREN_AUTO_PAGES } from "@shared/lib";
import {
  getAt,
  getVirtualScrollContainer,
  mockVirtualLayout,
  renderWithQueryClient,
  scrollToEnd,
  INTEGRATION_TEST_TIMEOUT_MS,
} from "@shared/lib/test-utils";
import { MRList } from "./MRList";

// Debounce + MSW round trip + virtualizer measurement can exceed Testing Library's
// 1 s default when the machine is busy (e.g. parallel CI jobs).
configure({ asyncUtilTimeout: 5000 });

type NavState = {
  selectedHostId: string | null;
  selectedRepoPath: string | null;
  selectedMRIid: number | null;
  isInbox: boolean;
};

const nav = vi.hoisted(() => {
  const state: NavState = {
    selectedHostId: "00000000-0000-4000-8000-000000000001",
    selectedRepoPath: "platform/api-1",
    selectedMRIid: null,
    isInbox: false,
  };
  return { state, setMR: vi.fn(), setRepo: vi.fn() };
});

vi.mock("@app/navigation", () => ({
  useNav: () => ({ ...nav.state, setMR: nav.setMR, setRepo: nav.setRepo }),
}));

const server = setupServer(...mrHandlers);
const requests: URL[] = [];

const listRequests = (): URL[] =>
  requests.filter((url) => url.pathname.endsWith("/mrs") || url.pathname.endsWith("/inbox"));

const lastListRequest = (): URL | undefined => listRequests().at(-1);

const rowButtons = (): HTMLElement[] => within(screen.getByRole("list")).getAllByRole("button");

const renderedTitles = (): string[] =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent ?? "");

const OPEN_FIRST_PAGE = getMockMRs(MOCK_BUSY_REPO)
  .filter((mr) => mr.status === "opened")
  .slice(0, 30);

let restoreLayout: () => void = () => undefined;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url));
  });
});
beforeEach(() => {
  restoreLayout = mockVirtualLayout({ viewportHeight: 600, rowHeight: 90 });
  nav.state = {
    selectedHostId: MOCK_HOST_ID,
    selectedRepoPath: MOCK_BUSY_REPO,
    selectedMRIid: null,
    isInbox: false,
  };
  nav.setMR.mockClear();
});
afterEach(() => {
  restoreLayout();
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => {
  server.close();
});

const waitForStatus = async (text: string): Promise<void> => {
  expect(await screen.findByText(text)).toBeInTheDocument();
};

describe("MRList in a repository", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("offers the state, not the relationship, and requests open MRs", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    const state = screen.getByRole("radiogroup", { name: "State" });
    expect(within(state).getByRole("radio", { name: "Open" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.queryByRole("radiogroup", { name: "Relationship" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Assigned" })).not.toBeInTheDocument();
    expect(Object.fromEntries(lastListRequest()?.searchParams ?? [])).toEqual({
      state: "opened",
      page: "1",
      per_page: "30",
    });
  });

  it("maps the state to the server state", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(screen.getByRole("radio", { name: "Merged" }));

    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("state")).toBe("merged");
    });
    await waitFor(() => {
      expect(renderedTitles().length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("radio", { name: "Merged" })).toHaveAttribute("aria-checked", "true");
  });

  it("sends the search as a debounced server-side q", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search merge requests" }), "cache");

    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("q")).toBe("cache");
    });
    const searches = listRequests()
      .map((url) => url.searchParams.get("q"))
      .filter((q) => q !== null);
    expect(searches).toEqual(["cache"]);
  });

  it("sorts the loaded MRs by title on the client", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "title");

    const expected = OPEN_FIRST_PAGE.map((mr) => mr.title).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );
    const titles = renderedTitles();
    expect(titles.length).toBeGreaterThan(3);
    expect(titles).toEqual(expected.slice(0, titles.length));
    expect(listRequests()).toHaveLength(1);
  });

  it("filters drafts on the client, keeps loading while the list is short", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(screen.getByRole("button", { name: "Filter merge requests" }));
    const menu = screen.getByRole("dialog", { name: "Filter merge requests" });
    expect(within(menu).getByRole("radio", { name: "All merge requests" })).toHaveFocus();
    await userEvent.click(within(menu).getByRole("radio", { name: "Drafts only" }));

    // A handful of drafts leaves the end of the list on screen, so further pages
    // load automatically until the list fills up or the server runs out.
    const open = getMockMRs(MOCK_BUSY_REPO).filter((mr) => mr.status === "opened");
    const drafts = open.filter((mr) => mr.draft);
    await waitForStatus(`${String(drafts.length)} of ${String(open.length)} shown`);
    expect(renderedTitles()).toEqual(
      drafts.map((mr) => mr.title).slice(0, renderedTitles().length)
    );
    expect(listRequests().every((url) => url.searchParams.get("state") === "opened")).toBe(true);
  });

  it("applies the filter when the text of an option is clicked", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(screen.getByRole("button", { name: "Filter merge requests" }));
    const menu = screen.getByRole("dialog", { name: "Filter merge requests" });
    // Pressing on the label's text blurs the focused radio with nowhere to go: the menu must
    // stay open for the click to land.
    await userEvent.click(within(menu).getByText("Drafts only"));

    expect(within(menu).getByRole("radio", { name: "Drafts only" })).toBeChecked();
    const open = getMockMRs(MOCK_BUSY_REPO).filter((mr) => mr.status === "opened");
    const drafts = open.filter((mr) => mr.draft);
    await waitForStatus(`${String(drafts.length)} of ${String(open.length)} shown`);
  });

  it("closes the filter menu on a press outside it", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(screen.getByRole("button", { name: "Filter merge requests" }));
    expect(screen.getByRole("dialog", { name: "Filter merge requests" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("searchbox", { name: "Search merge requests" }));

    expect(screen.queryByRole("dialog", { name: "Filter merge requests" })).not.toBeInTheDocument();
  });

  it("closes the filter menu on Escape and goes back to its button", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");
    const button = screen.getByRole("button", { name: "Filter merge requests" });

    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Filter merge requests" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("says what failed, in the host's words, and retries", async () => {
    server.use(
      http.get(
        /\/api\/v1\/hosts\/[^/]+\/repos\/.+\/mrs$/,
        () => HttpResponse.json({ detail: "GitLab answered 502 Bad Gateway" }, { status: 502 }),
        { once: true }
      )
    );
    renderWithQueryClient(<MRList />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load merge requests");
    expect(alert).toHaveTextContent("GitLab answered 502 Bad Gateway");

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitForStatus("Showing 30 · more below");
  });

  it("offers to clear a search that matches nothing", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search merge requests" }),
      "zzz-no-such-title"
    );

    expect(await screen.findByText("No merge requests match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox", { name: "Search merge requests" })).toHaveValue("");
  });

  it("loads the next page when scrolled to the end", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    scrollToEnd(getVirtualScrollContainer(screen.getByRole("list")));

    await waitForStatus("Showing 60 · more below");
    expect(listRequests().map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("moves focus through the rows with the arrow keys", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");
    const first = getAt(rowButtons(), 0);
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowDown" });

    expect(getAt(rowButtons(), 1)).toHaveFocus();
  });

  it("opens the clicked MR", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(getAt(rowButtons(), 0));

    expect(nav.setMR).toHaveBeenCalledWith(MOCK_HOST_ID, MOCK_BUSY_REPO, OPEN_FIRST_PAGE[0]?.iid);
  });
});

describe("MRList in the inbox", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    nav.state = { ...nav.state, selectedRepoPath: null, isInbox: true };
  });

  it("maps the relationship to the server scope", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");
    expect(lastListRequest()?.searchParams.get("scope")).toBe("all");
    expect(screen.queryByRole("radiogroup", { name: "State" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Review requested" }));
    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("scope")).toBe("review_requested");
    });

    await userEvent.click(screen.getByRole("radio", { name: "Assigned" }));
    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("scope")).toBe("assigned");
    });
    expect(screen.getByRole("radio", { name: "Assigned" })).toHaveAttribute("aria-checked", "true");
  });

  it("stops walking repositories after a few empty pages and offers Load more", async () => {
    // The "All" inbox over many repositories without open MRs: every page is empty but
    // has_more. Auto-loading used to request page after page with nobody looking.
    const inboxPages = (): string[] =>
      requests
        .filter((url) => url.pathname.endsWith("/inbox"))
        .map((url) => url.searchParams.get("page") ?? "");
    server.use(
      http.get("*/api/v1/hosts/:hostId/inbox", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        return HttpResponse.json({
          items: [],
          page,
          per_page: 30,
          has_more: true,
          truncated_repos: [],
        });
      })
    );
    renderWithQueryClient(<MRList />);

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    expect(
      screen.getByText("No open merge requests in the last repositories checked")
    ).toBeInTheDocument();
    // The status line points at that row exactly while auto-loading is paused.
    await waitForStatus("Showing 0 · Load more below");
    expect(inboxPages()).toEqual(
      Array.from({ length: MAX_BARREN_AUTO_PAGES }, (_, index) => String(index + 1))
    );

    await userEvent.click(loadMore);
    await waitFor(() => {
      expect(inboxPages()).toHaveLength(MAX_BARREN_AUTO_PAGES + 1);
    });
  });

  it("shows MRs newest first across pages and names the repositories cut short", async () => {
    const inboxMR = (repoPath: string, iid: number, title: string, updatedAt: string) => ({
      ...getMockMRs(MOCK_BUSY_REPO)[0],
      repo_path: repoPath,
      iid,
      title,
      draft: false,
      updated_at: updatedAt,
    });
    server.use(
      http.get("*/api/v1/hosts/:hostId/inbox", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        return HttpResponse.json(
          page === 1
            ? {
                items: [inboxMR("g/old", 1, "Older one", "2026-01-01T00:00:00Z")],
                page,
                per_page: 30,
                has_more: true,
                truncated_repos: ["g/busy"],
              }
            : {
                items: [inboxMR("g/new", 2, "Newer one", "2026-02-01T00:00:00Z")],
                page,
                per_page: 30,
                has_more: false,
                truncated_repos: ["g/other", "g/busy"],
              }
        );
      })
    );
    renderWithQueryClient(<MRList />);

    await waitFor(() => {
      expect(renderedTitles()).toEqual(["Newer one", "Older one"]);
    });
    // Everything is loaded and shown: no status line to read.
    expect(screen.queryByText(/Showing|shown/)).not.toBeInTheDocument();

    const note = screen.getByText("2 repositories have more open MRs — open one to see them all");
    await userEvent.click(note);
    await userEvent.click(screen.getByRole("button", { name: "g/other" }));
    expect(nav.setRepo).toHaveBeenCalledWith(MOCK_HOST_ID, "g/other");
  });

  it("navigates to the MR's own repository", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("Showing 30 · more below");

    await userEvent.click(getAt(rowButtons(), 0));

    expect(nav.setMR).toHaveBeenCalledWith(MOCK_HOST_ID, expect.any(String), expect.any(Number));
    expect(listRequests().every((url) => url.searchParams.get("q") === null)).toBe(true);
  });
});
