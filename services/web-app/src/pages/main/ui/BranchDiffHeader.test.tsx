import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@app/store";
import { DEFAULT_BRIEF_CONFIG, reviewApi } from "@entities/review";
import { hostApi } from "@entities/host";
import { ApiError } from "@shared/api";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { BranchDiffHeader } from "./BranchDiffHeader";
import type { Review } from "@entities/review";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@app/navigation", () => ({
  useNav: () => ({
    selectedHostId: "00000000-0000-4000-8000-000000000001",
    selectedRepoPath: "group/service",
    activeReviewId: "11111111-1111-4111-8111-111111111111",
  }),
}));

const REVIEW: Review = {
  id: REVIEW_ID,
  host_id: "00000000-0000-4000-8000-000000000001",
  repo_path: "group/service",
  mr_iid: 0,
  source: { kind: "branch_diff", base_ref: "main", head_ref: "feature/x", title: "" },
  iterations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      number: 1,
      stage: "brief",
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
};

describe("BranchDiffHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers the navigator toggle while the review loads", async () => {
    vi.spyOn(hostApi, "list").mockResolvedValue([]);
    vi.spyOn(reviewApi, "get").mockReturnValue(new Promise(() => undefined));
    useAppStore.setState({ navCollapsed: true });
    const user = userEvent.setup();
    renderWithQueryClient(<BranchDiffHeader />);

    expect(screen.getByRole("status", { name: "Loading branch diff review" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show navigator" }));
    expect(useAppStore.getState().navCollapsed).toBe(false);
  });

  it("says why the review could not be loaded, keeping the toggle", async () => {
    vi.spyOn(hostApi, "list").mockResolvedValue([]);
    vi.spyOn(reviewApi, "get").mockRejectedValue(new ApiError("The data store is locked", 503));
    useAppStore.setState({ navCollapsed: true });
    renderWithQueryClient(<BranchDiffHeader />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load branch diff review");
    expect(alert).toHaveTextContent("The data store is locked");
    expect(screen.getByRole("button", { name: "Show navigator" })).toBeInTheDocument();
  });

  it("names the two refs once the review is here", async () => {
    vi.spyOn(hostApi, "list").mockResolvedValue([]);
    vi.spyOn(reviewApi, "get").mockResolvedValue(REVIEW);
    renderWithQueryClient(<BranchDiffHeader />);

    expect(await screen.findByRole("heading", { name: "feature/x into main" })).toBeInTheDocument();
    expect(screen.getByText("main … feature/x")).toBeInTheDocument();
  });
});
