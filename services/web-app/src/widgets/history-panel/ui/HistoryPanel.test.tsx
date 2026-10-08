import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@app/store";
import { hostApi } from "@entities/host";
import { DEFAULT_BRIEF_CONFIG, reviewApi } from "@entities/review";
import { INTEGRATION_TEST_TIMEOUT_MS, createTestQueryClient } from "@shared/lib/test-utils";
import { HistoryPanel } from "./HistoryPanel";
import type { Host } from "@entities/host";
import type { Review } from "@entities/review";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const HOST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MR_REVIEW = "11111111-1111-4111-8111-111111111111";
const BRANCH_REVIEW = "22222222-2222-4222-8222-222222222222";
const OTHER_REVIEW = "33333333-3333-4333-8333-333333333333";

const host = (id: string, name: string): Host => ({
  id,
  name,
  type: "gitlab",
  base_url: "https://gitlab.example.com",
  color: null,
  favourite_repos: [],
  timeout: 30,
  created_at: "2026-05-16T10:00:00+00:00",
});

const review = (overrides: Partial<Review>): Review => ({
  id: MR_REVIEW,
  host_id: HOST_A,
  repo_path: "group/service",
  mr_iid: 12,
  source: { kind: "mr", mr_iid: 12 },
  iterations: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      number: 1,
      stage: "polish",
      comments: [],
      ai_provider_id: null,
      model: null,
      brief_config: DEFAULT_BRIEF_CONFIG,
      created_at: "2026-05-16T10:00:00+00:00",
      completed_at: null,
    },
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
  ...overrides,
});

const REVIEWS: Review[] = [
  review({}),
  review({
    id: BRANCH_REVIEW,
    mr_iid: 0,
    repo_path: "group/library",
    source: { kind: "branch_diff", base_ref: "main", head_ref: "feature/x", title: "" },
    created_at: "2026-05-15T10:00:00+00:00",
  }),
  review({
    id: OTHER_REVIEW,
    host_id: HOST_B,
    repo_path: "team/api",
    mr_iid: 7,
    source: { kind: "mr", mr_iid: 7 },
  }),
];

const Trigger = (): React.ReactElement => {
  const toggleHistory = useAppStore((s) => s.toggleHistory);
  return (
    <button type="button" onClick={toggleHistory}>
      History
    </button>
  );
};

const renderPanel = (url = "/") => {
  window.history.replaceState(null, "", url);
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <BrowserRouter>
        <Trigger />
        <HistoryPanel />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const openPanel = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole("button", { name: "History" }));
  return screen.findByRole("dialog", { name: "Review history" });
};

describe("HistoryPanel", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    useAppStore.setState({ historyOpen: false });
    // Two hosts with the same name must still be two groups.
    vi.spyOn(hostApi, "list").mockResolvedValue([host(HOST_A, "Work"), host(HOST_B, "Work")]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("fetches the review list only while open, and again on every opening", async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();

    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(list).not.toHaveBeenCalled();

    await openPanel(user);
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(1);
    });
    await user.keyboard("{Escape}");
    await openPanel(user);
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it("is not in the page while closed, traps Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openPanel(user);
    expect(screen.getByRole("searchbox", { name: "Search reviews" })).toHaveFocus();
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "History" })).toHaveFocus();
  });

  it("labels a branch diff by its refs and opens it on its repository", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);

    const branch = await within(dialog).findByRole("button", { name: /^library.*main…feature\/x/ });
    expect(within(dialog).queryByText("!0")).not.toBeInTheDocument();
    await user.click(branch);

    expect(window.location.pathname).toBe(`/${HOST_A}/${encodeURIComponent("group/library")}`);
    expect(new URLSearchParams(window.location.search).get("review")).toBe(BRANCH_REVIEW);
  });

  it("opens a merge request review on its merge request", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);

    await user.click(await within(dialog).findByRole("button", { name: /^service.*!12/ }));

    expect(window.location.pathname).toBe(
      `/${HOST_A}/${encodeURIComponent("group/service")}/mrs/12`
    );
    expect(window.location.search).toBe(`?review=${MR_REVIEW}`);
  });

  it("finds reviews when the query has spaces around it", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    await user.type(within(dialog).getByRole("searchbox", { name: "Search reviews" }), " api ");

    expect(within(dialog).getByRole("button", { name: /^api.*!7/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^service.*!12/ })).not.toBeInTheDocument();
  });

  it("says when nothing matches and clears the filters on request", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    await user.type(within(dialog).getByRole("searchbox", { name: "Search reviews" }), "nothing");

    expect(within(dialog).getByText("No matching reviews")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Clear filters" }));
    expect(within(dialog).getByRole("searchbox", { name: "Search reviews" })).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: /^service.*!12/ })).toBeInTheDocument();
  });

  it("keeps hosts that share a name in separate groups", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    expect(within(dialog).getAllByRole("region", { name: "Work" })).toHaveLength(2);
  });

  it("marks the review that is open", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel(`/${HOST_B}/${encodeURIComponent("team/api")}/mrs/7?review=${OTHER_REVIEW}`);
    const dialog = await openPanel(user);

    const open = await within(dialog).findByRole("button", { name: /^api.*!7/ });
    expect(open).toHaveAttribute("aria-current", "page");
    expect(within(dialog).getByRole("button", { name: /^service.*!12/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("asks before deleting, from a button beside the row rather than inside it", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    const remove = vi.spyOn(reviewApi, "delete").mockResolvedValue();
    renderPanel();
    const dialog = await openPanel(user);
    const row = await within(dialog).findByRole("button", { name: /^service.*!12/ });
    const trash = within(dialog).getByRole("button", {
      name: "Delete review of group/service !12",
    });
    expect(row.contains(trash)).toBe(false);

    await user.click(trash);
    const confirm = within(dialog).getByRole("group", { name: "Confirm deletion" });
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));

    expect(remove).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: /^service.*!12/ })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete review of group/service !12" })
    ).toHaveFocus();
  });

  it("deletes after confirmation and leaves the page of the deleted review", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValueOnce(REVIEWS).mockResolvedValue(REVIEWS.slice(1));
    const remove = vi.spyOn(reviewApi, "delete").mockResolvedValue();
    renderPanel(
      `/${HOST_A}/${encodeURIComponent("group/service")}/mrs/12?review=${MR_REVIEW}&stage=polish`
    );
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete review of group/service !12" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(MR_REVIEW);
    });
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(
        within(dialog).queryByRole("button", { name: /^service.*!12/ })
      ).not.toBeInTheDocument();
    });
  });

  it("sends one DELETE however often Delete is pressed, then focuses the next row", async () => {
    const user = userEvent.setup();
    // The refetch after the delete never answers: the row must go without waiting for it.
    vi.spyOn(reviewApi, "list")
      .mockResolvedValueOnce(REVIEWS)
      .mockReturnValue(new Promise(() => undefined));
    let finishDelete: () => void = () => undefined;
    const remove = vi.spyOn(reviewApi, "delete").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve;
        })
    );
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete review of group/service !12" })
    );
    const confirmDelete = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(confirmDelete);
    await user.click(confirmDelete);
    expect(remove).toHaveBeenCalledTimes(1);

    finishDelete();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const again = within(dialog).queryByRole("button", { name: "Delete" });
    if (again) await user.click(again);

    // Rows show newest first, grouped by host: service, then library on the same host.
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: /^library/ })).toHaveFocus();
    });
    expect(within(dialog).queryByRole("button", { name: /^service.*!12/ })).not.toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("puts focus in the search box when the last review is deleted", async () => {
    const user = userEvent.setup();
    const last = REVIEWS.slice(2);
    vi.spyOn(reviewApi, "list").mockResolvedValueOnce(last).mockResolvedValue([]);
    vi.spyOn(reviewApi, "delete").mockResolvedValue();
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^api.*!7/ });

    await user.click(within(dialog).getByRole("button", { name: "Delete review of team/api !7" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("searchbox", { name: "Search reviews" })).toHaveFocus();
    });
  });

  it("closes on the first Esc while a row's trash button has the focus", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list").mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);
    await within(dialog).findByRole("button", { name: /^service.*!12/ });

    const trash = within(dialog).getByRole("button", {
      name: "Delete review of group/service !12",
    });
    // Tab to it, as a keyboard user would; a tooltip opened by that focus used to take the Esc.
    for (let presses = 0; presses < 20 && document.activeElement !== trash; presses += 1) {
      await user.tab();
    }
    expect(trash).toHaveFocus();
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("shows an error with a retry when the list cannot be loaded", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "list")
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(REVIEWS);
    renderPanel();
    const dialog = await openPanel(user);

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the review history");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(
      await within(dialog).findByRole("button", { name: /^service.*!12/ })
    ).toBeInTheDocument();
  });
});
