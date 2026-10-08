import { useRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNav } from "@app/navigation";
import { DEFAULT_BRIEF_CONFIG, reviewApi, reviewKeys } from "@entities/review";
import { ApiError } from "@shared/api";
import { createTestQueryClient } from "@shared/lib/test-utils";
import { useStageBarStore } from "../model/useStageBarStore";
import { StageBar } from "./StageBar";
import type { QueryClient } from "@tanstack/react-query";
import type { Iteration, Review } from "@entities/review";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError, warning: vi.fn() } }));

const HOST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const IT_1 = "22222222-2222-4222-8222-222222222222";
const IT_2 = "33333333-3333-4333-8333-333333333333";
const REVIEW_B = "44444444-4444-4444-8444-444444444444";
const IT_B = "55555555-5555-4555-8555-555555555555";
const MR_PATH = `/${HOST_A}/${encodeURIComponent("group/repo")}/mrs/12`;

const iteration = (overrides: Partial<Iteration>): Iteration => ({
  id: IT_1,
  number: 1,
  stage: "polish",
  comments: [],
  ai_provider_id: null,
  model: null,
  brief_config: DEFAULT_BRIEF_CONFIG,
  created_at: "2026-05-16T10:00:00+00:00",
  completed_at: null,
  ...overrides,
});

const review = (iterations: Iteration[]): Review => ({
  id: REVIEW_ID,
  host_id: HOST_A,
  repo_path: "group/repo",
  mr_iid: 12,
  iterations,
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

/** Shows the URL-backed stage state and offers the navigations the app performs. */
const Probe = (): React.ReactElement => {
  const { activeStage, activeIterationId, setStage } = useStageBarStore();
  const { setMR, openReview } = useNav();
  const { pathname, search } = useLocation();
  const captured = useRef<((stage: "post") => void) | null>(null);
  return (
    <div>
      <output data-testid="stage">{activeStage}</output>
      <output data-testid="iteration">{activeIterationId ?? "none"}</output>
      <output data-testid="location">{pathname + search}</output>
      <button
        type="button"
        onClick={() => {
          setMR(HOST_B, "other/repo", 12);
        }}
      >
        open other repo !12
      </button>
      <button
        type="button"
        onClick={() => {
          // Another review on the same path, as two branch diffs of one repository are.
          openReview({ hostId: HOST_A, repoPath: "group/repo", mrIid: 12, reviewId: REVIEW_B });
        }}
      >
        open review B on the same page
      </button>
      <button
        type="button"
        onClick={() => {
          captured.current = setStage;
        }}
      >
        start a slow save
      </button>
      <button
        type="button"
        onClick={() => {
          // The save finishing: it moves on to Post with the handler of the page it started on.
          captured.current?.("post");
        }}
      >
        finish the slow save
      </button>
    </div>
  );
};

const renderAt = (url: string, client: QueryClient = createTestQueryClient()) => {
  window.history.replaceState(null, "", url);
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <StageBar />
        <Probe />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const stage = (): string | null => screen.getByTestId("stage").textContent;
const iterationId = (): string | null => screen.getByTestId("iteration").textContent;
const search = (): URLSearchParams => new URLSearchParams(window.location.search);
const tab = (name: string): HTMLElement => screen.getByRole("tab", { name: new RegExp(name) });

describe("StageBar — stage and iteration in the URL", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("opens a review link at the stage and iteration the review reached", async () => {
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    const historyLength = window.history.length;

    renderAt(`${MR_PATH}?review=${REVIEW_ID}`);

    await waitFor(() => {
      expect(stage()).toBe("polish");
    });
    expect(iterationId()).toBe(IT_1);
    expect(search().get("stage")).toBe("polish");
    expect(search().get("it")).toBe(IT_1);
    // A redirect, not a step Back has to undo.
    expect(window.history.length).toBe(historyLength);
  });

  it("lands on the review's stage when the review is already cached", async () => {
    const client = createTestQueryClient();
    client.setQueryData(reviewKeys.detail(REVIEW_ID), review([iteration({ stage: "post" })]));
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "post" })]));

    renderAt(`${MR_PATH}?review=${REVIEW_ID}`, client);

    await waitFor(() => {
      expect(stage()).toBe("post");
    });
    expect(iterationId()).toBe(IT_1);
  });

  it("stays on Pick when the Pick tab is chosen with a review open", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(tab("Pick"));

    expect(stage()).toBe("pick");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stage()).toBe("pick");
    expect(search().get("review")).toBe(REVIEW_ID);
  });

  it("goes back to the previous stage on Back, review included", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(tab("Dispatch"));
    expect(stage()).toBe("dispatch");

    act(() => {
      window.history.back();
    });

    await waitFor(() => {
      expect(stage()).toBe("polish");
    });
    expect(search().get("review")).toBe(REVIEW_ID);
    expect(iterationId()).toBe(IT_1);
  });

  it("starts the next merge request at Pick without the previous one's iteration", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(screen.getByRole("button", { name: "open other repo !12" }));

    expect(stage()).toBe("pick");
    expect(iterationId()).toBe("none");
    expect(window.location.search).toBe("");
  });

  it("drops a stage change that arrives after the user opened another merge request", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(screen.getByRole("button", { name: "start a slow save" }));
    await user.click(screen.getByRole("button", { name: "open other repo !12" }));
    await user.click(screen.getByRole("button", { name: "finish the slow save" }));

    expect(window.location.pathname).toContain(HOST_B);
    expect(window.location.search).toBe("");
    expect(stage()).toBe("pick");
  });

  it("starts a new iteration when Brief is opened on a posted review", async () => {
    const user = userEvent.setup();
    const posted = iteration({
      stage: "post",
      completed_at: "2026-05-16T11:00:00+00:00",
      brief_config: { ...DEFAULT_BRIEF_CONFIG, preset: "security" },
    });
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([posted]));
    const createIteration = vi
      .spyOn(reviewApi, "createIteration")
      .mockResolvedValue(review([posted, iteration({ id: IT_2, number: 2, stage: "brief" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=post&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Post/, selected: true });

    await user.click(tab("Brief"));

    await waitFor(() => {
      expect(stage()).toBe("brief");
    });
    expect(iterationId()).toBe(IT_2);
    expect(createIteration).toHaveBeenCalledWith(REVIEW_ID, posted.brief_config);
  });

  it("starts a new iteration from Brief when the review was posted after it was cached", async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    // What this tab saw before the post; the server has moved on since.
    client.setQueryData(reviewKeys.detail(REVIEW_ID), review([iteration({ stage: "polish" })]));
    const posted = iteration({ stage: "post", completed_at: "2026-05-16T11:00:00+00:00" });
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([posted]));
    const createIteration = vi
      .spyOn(reviewApi, "createIteration")
      .mockResolvedValue(review([posted, iteration({ id: IT_2, number: 2, stage: "brief" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`, client);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(tab("Brief"));

    await waitFor(() => {
      expect(iterationId()).toBe(IT_2);
    });
    expect(stage()).toBe("brief");
    expect(createIteration).toHaveBeenCalledTimes(1);
  });

  it("starts a new iteration from Brief after only some comments were posted", async () => {
    const user = userEvent.setup();
    const partlyPosted = iteration({ stage: "post", completed_at: null });
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([partlyPosted]));
    const createIteration = vi
      .spyOn(reviewApi, "createIteration")
      .mockResolvedValue(
        review([partlyPosted, iteration({ id: IT_2, number: 2, stage: "brief" })])
      );
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=post&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Post/, selected: true });

    await user.click(tab("Brief"));

    await waitFor(() => {
      expect(iterationId()).toBe(IT_2);
    });
    expect(createIteration).toHaveBeenCalledTimes(1);
  });

  it("stays put when the server keeps the posted iteration as the latest", async () => {
    const user = userEvent.setup();
    const partlyPosted = iteration({ stage: "post", completed_at: null });
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([partlyPosted]));
    vi.spyOn(reviewApi, "createIteration").mockResolvedValue(review([partlyPosted]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=post&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Post/, selected: true });

    await user.click(tab("Brief"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Could not start a new iteration", expect.anything());
    });
    expect(stage()).toBe("post");
  });

  it("drops a stage change that arrives after another review opened on the same page", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockImplementation((id: string) =>
      Promise.resolve(
        id === REVIEW_B
          ? { ...review([iteration({ id: IT_B, stage: "brief" })]), id: REVIEW_B }
          : review([iteration({ stage: "polish" })])
      )
    );
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(screen.getByRole("button", { name: "start a slow save" }));
    await user.click(screen.getByRole("button", { name: "open review B on the same page" }));
    await waitFor(() => {
      expect(iterationId()).toBe(IT_B);
    });
    await user.click(screen.getByRole("button", { name: "finish the slow save" }));

    expect(search().get("review")).toBe(REVIEW_B);
    expect(stage()).toBe("brief");
  });

  it("continues the open iteration from Brief instead of starting another", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    const createIteration = vi.spyOn(reviewApi, "createIteration");
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    await screen.findByRole("tab", { name: /Polish/, selected: true });

    await user.click(tab("Brief"));

    expect(stage()).toBe("brief");
    expect(iterationId()).toBe(IT_1);
    expect(createIteration).not.toHaveBeenCalled();
  });

  it("creates the review and its first iteration from Brief on a fresh merge request", async () => {
    const user = userEvent.setup();
    const fresh = review([iteration({ stage: "brief" })]);
    vi.spyOn(reviewApi, "create").mockResolvedValue(review([]));
    vi.spyOn(reviewApi, "createIteration").mockResolvedValue(fresh);
    vi.spyOn(reviewApi, "get").mockResolvedValue(fresh);
    renderAt(MR_PATH);

    await user.click(tab("Brief"));

    await waitFor(() => {
      expect(stage()).toBe("brief");
    });
    expect(search().get("review")).toBe(REVIEW_ID);
    expect(iterationId()).toBe(IT_1);
  });

  it("shows Brief of a posted iteration as its posted stage", async () => {
    const posted = iteration({ stage: "post", completed_at: "2026-05-16T11:00:00+00:00" });
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([posted]));

    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=brief&it=${IT_1}`);

    await waitFor(() => {
      expect(stage()).toBe("post");
    });
  });

  it("takes a deleted review out of the URL and says so once", async () => {
    vi.spyOn(reviewApi, "get").mockRejectedValue(new ApiError("Review not found", 404));

    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(stage()).toBe("pick");
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("never draws the open stage as locked, even ahead of the server's stage", async () => {
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "brief" })]));

    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=dispatch&it=${IT_1}`);

    const dispatch = await screen.findByRole("tab", { name: /Dispatch/, selected: true });
    expect(dispatch).toHaveAttribute("aria-disabled", "false");
    expect(dispatch.style.opacity).toBe("1");
    expect(tab("Polish")).toHaveAttribute("aria-disabled", "true");
  });

  it("moves focus between stages with the arrow keys", async () => {
    const user = userEvent.setup();
    vi.spyOn(reviewApi, "get").mockResolvedValue(review([iteration({ stage: "polish" })]));
    renderAt(`${MR_PATH}?review=${REVIEW_ID}&stage=polish&it=${IT_1}`);
    const polish = await screen.findByRole("tab", { name: /Polish/, selected: true });

    polish.focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Post")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Pick")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tab("Post")).toHaveFocus();
    expect(tab("Pick")).toHaveAttribute("tabindex", "-1");
    expect(polish).toHaveAttribute("tabindex", "0");
  });
});
