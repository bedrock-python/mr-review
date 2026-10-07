import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_BUSY_REPO, MOCK_HOST_ID, getMockMRs, mrHandlers } from "@shared/api/mocks";
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
  return { state, setMR: vi.fn() };
});

vi.mock("@app/navigation", () => ({
  useNav: () => ({ ...nav.state, setMR: nav.setMR }),
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
  it("offers state chips, not relationship chips, and requests open MRs", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

    const state = screen.getByRole("group", { name: "State" });
    expect(within(state).getByRole("button", { name: "Open" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("group", { name: "Relationship" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assigned" })).not.toBeInTheDocument();
    expect(Object.fromEntries(lastListRequest()?.searchParams ?? [])).toEqual({
      state: "opened",
      page: "1",
      per_page: "30",
    });
  });

  it("maps the state chips to the server state", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

    await userEvent.click(screen.getByRole("button", { name: "Merged" }));

    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("state")).toBe("merged");
    });
    await waitFor(() => {
      expect(renderedTitles().length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: "Merged" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the search as a debounced server-side q", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

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
    await waitForStatus("30 loaded · more available");

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
    await waitForStatus("30 loaded · more available");

    await userEvent.click(screen.getByRole("button", { name: "Draft" }));

    // A handful of drafts leaves the end of the list on screen, so further pages
    // load automatically until the list fills up or the server runs out.
    const open = getMockMRs(MOCK_BUSY_REPO).filter((mr) => mr.status === "opened");
    const drafts = open.filter((mr) => mr.draft);
    await waitForStatus(
      `${String(drafts.length)} shown · ${String(open.length)} loaded · all loaded`
    );
    expect(renderedTitles()).toEqual(
      drafts.map((mr) => mr.title).slice(0, renderedTitles().length)
    );
    expect(listRequests().every((url) => url.searchParams.get("state") === "opened")).toBe(true);
  });

  it("loads the next page when scrolled to the end", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

    scrollToEnd(getVirtualScrollContainer(screen.getByRole("list")));

    await waitForStatus("60 loaded · more available");
    expect(listRequests().map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("moves focus through the rows with the arrow keys", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");
    const first = getAt(rowButtons(), 0);
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowDown" });

    expect(getAt(rowButtons(), 1)).toHaveFocus();
  });

  it("opens the clicked MR", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

    await userEvent.click(getAt(rowButtons(), 0));

    expect(nav.setMR).toHaveBeenCalledWith(MOCK_HOST_ID, MOCK_BUSY_REPO, OPEN_FIRST_PAGE[0]?.iid);
  });
});

describe("MRList in the inbox", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    nav.state = { ...nav.state, selectedRepoPath: null, isInbox: true };
  });

  it("maps relationship chips to the server scope", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");
    expect(lastListRequest()?.searchParams.get("scope")).toBe("all");
    expect(screen.queryByRole("group", { name: "State" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Review requested" }));
    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("scope")).toBe("review_requested");
    });

    await userEvent.click(screen.getByRole("button", { name: "Assigned" }));
    await waitFor(() => {
      expect(lastListRequest()?.searchParams.get("scope")).toBe("assigned");
    });
    expect(screen.getByRole("button", { name: "Assigned" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("navigates to the MR's own repository", async () => {
    renderWithQueryClient(<MRList />);
    await waitForStatus("30 loaded · more available");

    await userEvent.click(getAt(rowButtons(), 0));

    expect(nav.setMR).toHaveBeenCalledWith(MOCK_HOST_ID, expect.any(String), expect.any(Number));
    expect(listRequests().every((url) => url.searchParams.get("q") === null)).toBe(true);
  });
});
