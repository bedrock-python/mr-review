import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@app/store";
import { DEFAULT_BRIEF_CONFIG, reviewApi } from "@entities/review";
import { createTestQueryClient, getAt } from "@shared/lib/test-utils";
import { IterationHistoryPanel } from "./IterationHistoryPanel";
import type { Iteration, Review } from "@entities/review";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";

const iteration = (n: number, overrides: Partial<Iteration> = {}): Iteration => ({
  id: `${String(n).repeat(8)}-0000-4000-8000-000000000000`,
  number: n,
  stage: "polish",
  comments: [],
  ai_provider_id: null,
  model: null,
  brief_config: DEFAULT_BRIEF_CONFIG,
  created_at: "2026-05-16T10:00:00+00:00",
  completed_at: null,
  ...overrides,
});

const REVIEW: Review = {
  id: REVIEW_ID,
  host_id: "22222222-2222-4222-8222-222222222222",
  repo_path: "group/repo",
  mr_iid: 12,
  // 1 was left unposted, 2 was posted, 3 is the round in progress.
  iterations: [
    iteration(1),
    iteration(2, { stage: "post", completed_at: "2026-05-16T11:00:00+00:00" }),
    iteration(3, { stage: "brief" }),
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
};

const renderPanel = (onSelect = vi.fn()) => {
  window.history.replaceState(null, "", `/h/group%2Frepo/mrs/12?review=${REVIEW_ID}`);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <BrowserRouter>
        <IterationHistoryPanel activeIterationId={iteration(2).id} onIterationSelect={onSelect} />
      </BrowserRouter>
    </QueryClientProvider>
  );
  return onSelect;
};

describe("IterationHistoryPanel", () => {
  beforeEach(() => {
    useAppStore.setState({ iterationHistoryOpen: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({ iterationHistoryOpen: false });
  });

  it("says it is loading rather than that there are no iterations", async () => {
    vi.spyOn(reviewApi, "get").mockReturnValue(new Promise(() => undefined));
    renderPanel();

    const dialog = await screen.findByRole("dialog", { name: "Iterations" });

    expect(within(dialog).getByText("Loading iterations…")).toBeInTheDocument();
    expect(within(dialog).queryByText("No iterations yet")).not.toBeInTheDocument();
  });

  it("shows only the latest open iteration as in progress", async () => {
    vi.spyOn(reviewApi, "get").mockResolvedValue(REVIEW);
    renderPanel();

    const dialog = await screen.findByRole("dialog", { name: "Iterations" });
    await within(dialog).findAllByRole("button", { name: /Started/ });

    expect(within(dialog).getAllByText("in progress")).toHaveLength(1);
    expect(within(dialog).getByText("not posted")).toBeInTheDocument();
  });

  it("marks the iteration on screen and opens the one picked", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(REVIEW);
    const onSelect = renderPanel();
    const dialog = await screen.findByRole("dialog", { name: "Iterations" });
    const cards = await within(dialog).findAllByRole("button", { name: /Started/ });

    // Newest first: 3, 2, 1.
    expect(cards[1]).toHaveAttribute("aria-current", "true");
    await user.click(getAt(cards, 2));

    expect(onSelect).toHaveBeenCalledWith(iteration(1).id, "polish");
    expect(useAppStore.getState().iterationHistoryOpen).toBe(false);
  });

  it("is absent from the page while closed", () => {
    useAppStore.setState({ iterationHistoryOpen: false });
    vi.spyOn(reviewApi, "get").mockResolvedValue(REVIEW);
    renderPanel();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
