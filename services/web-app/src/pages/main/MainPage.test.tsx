import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@app/store";
import { checkUpdateApi } from "@features/check-update/api";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import { httpClient } from "@shared/api";
import { INTEGRATION_TEST_TIMEOUT_MS, createTestQueryClient } from "@shared/lib/test-utils";
import { MainPage } from "./MainPage";
import type { Comment, Review } from "@entities/review";

// The Polish stage is its own lazily loaded chunk: under a busy machine (parallel test
// files) it takes longer than Testing Library's 1 s default to arrive.
const LAZY_STAGE_WAIT = { timeout: 5000 };

const HOST_ID = "33333333-3333-4333-8333-333333333333";
const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";
const REPO = "group/project";
const MR_URL = `/api/v1/hosts/${HOST_ID}/repos/${REPO}/mrs/7`;

// Comment ids are UUIDs on the wire; the schema rejects anything else.
const C1 = "c0000000-0000-4000-8000-000000000001";
const C2 = "c0000000-0000-4000-8000-000000000002";
const C3 = "c0000000-0000-4000-8000-000000000003";

const comment = (id: string): Comment => ({
  id,
  file: null,
  line: null,
  severity: "major",
  body: `body of ${id}`,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
});

const REVIEW: Review = {
  id: REVIEW_ID,
  host_id: HOST_ID,
  repo_path: REPO,
  mr_iid: 7,
  source: { kind: "mr", mr_iid: 7 },
  iterations: [
    {
      id: ITERATION_ID,
      number: 1,
      stage: "polish",
      comments: [comment(C1), comment(C2), comment(C3)],
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

const EMPTY_PAGE = { page: 1, per_page: 50, has_more: false, items: [] };

const focusedCommentId = (): string | null =>
  document.querySelector('article[aria-current="true"]')?.getAttribute("data-comment-id") ?? null;

describe("MainPage", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  const api = new MockAdapter(httpClient);

  beforeEach(() => {
    useAppStore.setState({ historyOpen: false, iterationHistoryOpen: false, addHostOpen: false });
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockResolvedValue(null);
    api.onGet("/api/v1/hosts").reply(200, [
      {
        id: HOST_ID,
        name: "Work",
        type: "gitlab",
        base_url: "https://gitlab.example.com",
        color: null,
        favourite_repos: [],
        timeout: 30,
        created_at: "2026-05-16T10:00:00+00:00",
      },
    ]);
    api.onGet(MR_URL).reply(200, {
      iid: 7,
      title: "Speed up the importer",
      description: "",
      author: "dev",
      source_branch: "feature",
      target_branch: "main",
      status: "opened",
      draft: false,
      pipeline: null,
      additions: 1,
      deletions: 0,
      file_count: 1,
      web_url: "",
      created_at: "2026-05-16T10:00:00+00:00",
      updated_at: "2026-05-16T10:00:00+00:00",
    });
    api.onGet(`/api/v1/reviews/${REVIEW_ID}`).reply(200, REVIEW);
    api.onGet(`/api/v1/reviews/${REVIEW_ID}/diff`).reply(200, "");
    api.onGet(new RegExp(`/api/v1/hosts/${HOST_ID}/repos`)).reply(200, EMPTY_PAGE);
    api.onAny().reply(404, { detail: "not part of this test" });
  });

  afterEach(() => {
    api.reset();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("lets Polish's keys work while the history panels are closed", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      `/${HOST_ID}/${encodeURIComponent(REPO)}/mrs/7?review=${REVIEW_ID}&stage=polish&it=${ITERATION_ID}`
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <MainPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(focusedCommentId()).toBe(C1);
    }, LAZY_STAGE_WAIT);
    // Closed panels are not in the page at all, so nothing claims to be an open dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();

    await user.keyboard("j");
    expect(focusedCommentId()).toBe(C2);
    await user.keyboard("j");
    expect(focusedCommentId()).toBe(C3);
    expect(api.history.get.some((request) => request.url === "/api/v1/reviews")).toBe(false);
  });

  it("shows and hides the navigator with [", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ navCollapsed: false });
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <MainPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("No merge request open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show navigator" })).not.toBeInTheDocument();

    // "[[" is how user-event types a literal "[".
    await user.keyboard("[[");

    expect(useAppStore.getState().navCollapsed).toBe(true);
    await user.click(screen.getByRole("button", { name: "Show navigator" }));
    expect(useAppStore.getState().navCollapsed).toBe(false);
  });

  it("offers to add a host when there is none yet", async () => {
    const user = userEvent.setup();
    api.onGet("/api/v1/hosts").reply(200, []);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <MainPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    const main = screen.getByRole("main");
    expect(await within(main).findByText("Connect a Git host")).toBeInTheDocument();
    await user.click(within(main).getByRole("button", { name: "Add host" }));

    expect(await screen.findByRole("dialog", { name: "Add host" })).toBeInTheDocument();
  });

  it("stands Polish's keys down while the iteration panel is open", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      `/${HOST_ID}/${encodeURIComponent(REPO)}/mrs/7?review=${REVIEW_ID}&stage=polish&it=${ITERATION_ID}`
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <MainPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(focusedCommentId()).toBe(C1);
    }, LAZY_STAGE_WAIT);

    useAppStore.setState({ iterationHistoryOpen: true });
    await screen.findByRole("dialog", { name: "Iterations" });
    await user.keyboard("j");

    expect(focusedCommentId()).toBe(C1);
  });
});
