import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import { ApiError } from "@shared/api";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@shared/lib/test-utils";
import { DispatchStage } from "./DispatchStage";
import type * as ReviewApiModule from "@entities/review/api/reviewApi";
import type * as AIProviderEntity from "@entities/ai-provider";
import type { AIProvider, ModelCapabilities } from "@entities/ai-provider";
import type {
  DispatchRequest,
  DispatchStreamEvent,
  ImportResponseResult,
  Review,
} from "@entities/review";

// A run is several render passes and awaited events; leave room when suites run in parallel.
configure({ asyncUtilTimeout: 5000 });

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  getPrompt: vi.fn(),
  getDiff: vi.fn(),
  getContext: vi.fn(),
  dispatchStream: vi.fn(),
  getRawResponse: vi.fn(),
  importResponse: vi.fn(),
  reparseIteration: vi.fn(),
}));

const stage = vi.hoisted(() => ({ setStage: vi.fn() }));

const providersQuery = vi.hoisted(() => ({
  data: undefined as AIProvider[] | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

// Capabilities per model id; a model missing here has none loaded (every control is offered).
const capabilitiesByModel = vi.hoisted(() => new Map<string, ModelCapabilities>());

vi.mock("@entities/review/api/reviewApi", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewApiModule>();
  return { ...actual, reviewApi: { ...actual.reviewApi, ...api } };
});

vi.mock("@app/navigation", () => ({
  useNav: () => ({ activeReviewId: REVIEW_ID }),
}));

vi.mock("@widgets/stage-bar", () => ({
  useStageBarStore: <T,>(
    selector: (state: { setStage: typeof stage.setStage; activeIterationId: string }) => T
  ): T => selector({ setStage: stage.setStage, activeIterationId: ITERATION_ID }),
}));

const PROVIDER: AIProvider = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Claude",
  type: "claude",
  base_url: "",
  models: ["claude-model"],
  ssl_verify: true,
  timeout: 60,
  created_at: "2026-05-16T10:00:00+00:00",
};

const OTHER_PROVIDER: AIProvider = {
  ...PROVIDER,
  id: "55555555-5555-4555-8555-555555555555",
  name: "OpenAI",
  type: "openai",
  models: ["gpt-a", "gpt-b"],
};

vi.mock("@entities/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof AIProviderEntity>();
  return {
    ...actual,
    useAIProviders: () => ({ ...providersQuery }),
    useModelCapabilities: (_providerId: string, model: string) => ({
      data: capabilitiesByModel.get(model),
    }),
  };
});

const ALWAYS_THINKING: ModelCapabilities = {
  provider_type: "claude",
  model: "claude-model",
  known_model: true,
  thinking: "always",
  reasoning_modes: ["effort"],
  effort_levels: ["low", "medium", "high", "xhigh", "max"],
  default_effort: "medium",
  min_reasoning_budget: null,
  temperature: false,
  max_temperature: 1,
  max_output_tokens: 128_000,
  default_max_output_tokens: 32_000,
  structured_output: true,
  structured_output_default: true,
};

const BUDGET_THINKING: ModelCapabilities = {
  ...ALWAYS_THINKING,
  model: "claude-legacy",
  thinking: "optional",
  reasoning_modes: ["budget"],
  effort_levels: [],
  default_effort: null,
  min_reasoning_budget: 1024,
  temperature: true,
  max_output_tokens: 64_000,
};

const dispatchedRequest = (call = 0): DispatchRequest =>
  api.dispatchStream.mock.calls[call]?.[1] as DispatchRequest;

const REVIEW: Review = {
  id: REVIEW_ID,
  host_id: "44444444-4444-4444-8444-444444444444",
  repo_path: "group/project",
  mr_iid: 7,
  iterations: [
    {
      id: ITERATION_ID,
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

const RESULT = {
  iteration_id: ITERATION_ID,
  comments: 1,
  errors: 0,
  json_error: null,
  truncated: false,
  kept_previous: false,
};

/**
 * Stands in for `reviewApi.dispatchStream`: the test decides when each event
 * arrives. Like the real stream it ends after `done` or `error` and rejects with
 * an AbortError once the request is aborted.
 */
const createDispatchChannel = (): { emit: (...events: DispatchStreamEvent[]) => void } => {
  const queue: DispatchStreamEvent[] = [];
  let wake: (() => void) | null = null;

  api.dispatchStream.mockImplementation(async function* (
    _reviewId: string,
    _providerId: string,
    signal?: AbortSignal
  ): AsyncGenerator<DispatchStreamEvent, void, undefined> {
    for (;;) {
      const next = queue.shift();
      if (next) {
        yield next;
        if (next.type === "done" || next.type === "error") return;
        continue;
      }
      await new Promise<void>((resolve, reject) => {
        wake = resolve;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }
  });

  return {
    emit: (...events) => {
      queue.push(...events);
      wake?.();
      wake = null;
    },
  };
};

// Node 25+ ships its own `localStorage` global, unusable without --localstorage-file,
// which shadows jsdom's; restoring the saved provider and model needs a working one.
const createMemoryStorage = (overrides: Partial<Storage> = {}): Storage => {
  const items = new Map<string, string>();
  return {
    get length(): number {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => Array.from(items.keys())[index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
    ...overrides,
  };
};

const resetMocks = (): void => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMemoryStorage());
  capabilitiesByModel.clear();
  api.get.mockResolvedValue(REVIEW);
  api.getPrompt.mockResolvedValue("prompt");
  api.getDiff.mockResolvedValue("");
  api.getContext.mockResolvedValue("");
  providersQuery.data = [PROVIDER];
  providersQuery.isPending = false;
  providersQuery.isError = false;
  providersQuery.error = null;
};

const renderStage = (): { rerender: () => void; unmount: () => void } => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (): React.ReactElement => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DispatchStage />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const { rerender, unmount } = render(tree());
  return {
    rerender: () => {
      rerender(tree());
    },
    unmount,
  };
};

const startDispatch = async (
  user: ReturnType<typeof userEvent.setup>
): Promise<ReturnType<typeof createDispatchChannel>> => {
  const channel = createDispatchChannel();
  await user.click(await screen.findByRole("button", { name: /Generate review/ }));
  await screen.findByRole("button", { name: "Stop" });
  return channel;
};

describe("DispatchStage — run in app", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the raw output and comment previews while streaming", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "chunk", text: '[{"file": "a.py", ' });
    expect(await screen.findByLabelText("Raw model output")).toHaveTextContent('[{"file": "a.py",');

    channel.emit({
      type: "comment",
      comment: { index: 0, file: "a.py", line: 3, severity: "major", body: "Handle {} input" },
    });
    const list = await screen.findByRole("list", { name: "Generated comments" });
    expect(within(list).getByText("Handle {} input")).toBeInTheDocument();
    expect(within(list).getByText("a.py:3")).toBeInTheDocument();
    expect(screen.getByText("1 comment…")).toBeInTheDocument();
  });

  it("finishes on done with a single review refetch", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    expect(api.get).toHaveBeenCalledTimes(1);

    channel.emit(
      { type: "chunk", text: "[...]" },
      {
        type: "comment",
        comment: { index: 0, file: null, line: null, severity: "minor", body: "Looks fine" },
      },
      { type: "done", result: RESULT }
    );

    expect(await screen.findByText("1 comment saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Generation output" });
    expect(within(panel).getByText("Done")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Polish 1 comment" }));
    expect(stage.setStage).toHaveBeenCalledWith("polish");
    expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
  });

  it("shows the error message and refetches the review the server kept", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "chunk", text: "[{" }, { type: "error", message: "Rate limit exceeded" });

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Rate limit exceeded");
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(
      screen.queryByText("No comments were parsed from the response.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/saved$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Polish/ })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    // The busy button the run was started from is now its Run again, and keeps the focus.
    const footer = screen.getByRole("region", { name: "Generation actions" });
    const runAgain = within(footer).getByRole("button", { name: "Run again" });
    expect(runAgain).toHaveFocus();

    createDispatchChannel();
    await user.click(within(notice).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(api.dispatchStream).toHaveBeenCalledTimes(2);
    // Retry left with its notice; the focus went to the footer's busy button.
    expect(runAgain).toHaveFocus();
    expect(runAgain).toHaveAttribute("aria-busy", "true");
  });

  it("offers Copy & paste when the run fails", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "error", message: "Rate limit exceeded" });
    const notice = await screen.findByRole("alert");
    await user.click(within(notice).getByRole("button", { name: "Use Copy & paste" }));

    expect(screen.getByRole("radio", { name: "Copy & paste" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(await screen.findByRole("button", { name: "Browse file" })).toBeInTheDocument();
  });

  it("aborts the run when the stage unmounts", async () => {
    const user = userEvent.setup();
    const { unmount } = renderStage();
    const channel = await startDispatch(user);
    channel.emit({ type: "chunk", text: "[{" });
    const signal = api.dispatchStream.mock.calls[0]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("waits for the providers, then restores the saved provider and model", async () => {
    localStorage.setItem("mr-review:dispatch:last-provider", OTHER_PROVIDER.id);
    localStorage.setItem(
      "mr-review:dispatch:settings",
      JSON.stringify({ [OTHER_PROVIDER.id]: { model: "gpt-b" } })
    );
    providersQuery.data = undefined;
    providersQuery.isPending = true;
    const user = userEvent.setup();
    const { rerender } = renderStage();

    expect(await screen.findByRole("status", { name: "Loading AI providers" })).toBeInTheDocument();
    expect(screen.queryByText("No AI providers configured")).not.toBeInTheDocument();

    providersQuery.data = [PROVIDER, OTHER_PROVIDER];
    providersQuery.isPending = false;
    rerender();

    const generate = screen.getByRole("button", { name: /Generate review gpt-b/ });
    createDispatchChannel();
    await user.click(generate);
    expect(api.dispatchStream).toHaveBeenCalledWith(
      REVIEW_ID,
      {
        aiProviderId: OTHER_PROVIDER.id,
        model: "gpt-b",
        temperature: null,
        reasoningEffort: null,
        reasoningBudget: null,
        maxOutputTokens: null,
        structuredOutput: null,
        systemPrompt: null,
        iterationId: ITERATION_ID,
      },
      expect.any(AbortSignal)
    );
  });

  it("keeps working when storage is unavailable or full", async () => {
    vi.stubGlobal(
      "localStorage",
      createMemoryStorage({
        getItem: () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
        setItem: () => {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        },
      })
    );
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "done", result: RESULT });

    expect(await screen.findByText("1 comment saved")).toBeInTheDocument();
  });

  it("warns when the model output was truncated", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "done", result: { ...RESULT, truncated: true } });

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("The model output was cut off");
    expect(notice).toHaveTextContent(
      "Some comments may be missing. Raise max output tokens or narrow the context"
    );
    // Saved, but not cleanly: the run reads as needing a look, not as a plain success.
    const panel = screen.getByRole("region", { name: "Generation output" });
    expect(within(panel).getByText("Done").closest("[data-tone]")).toHaveAttribute(
      "data-tone",
      "warn"
    );
  });

  it("re-parses the stored output from the JSON error notice", async () => {
    api.reparseIteration.mockResolvedValue({ imported: 3, errors: [], json_error: null });
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    channel.emit({ type: "done", result: { ...RESULT, json_error: "Expecting value" } });
    const notice = await screen.findByRole("alert");
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    await user.click(within(notice).getByRole("button", { name: "Re-parse" }));

    expect(await screen.findByRole("status")).toHaveTextContent("3 comments imported");
    expect(screen.getByText("3 comments saved")).toBeInTheDocument();
    expect(screen.queryByText("The model output wasn't valid JSON")).not.toBeInTheDocument();
    expect(api.reparseIteration).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("stops cleanly when the user aborts", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    channel.emit({ type: "chunk", text: "[{" });

    // Stop sits on the run's own line, not in the footer where Generate and Run again are.
    const panel = screen.getByRole("region", { name: "Generation output" });
    const footer = screen.getByRole("region", { name: "Generation actions" });
    expect(within(footer).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    // Stop went away; the focus is on the footer's Run again instead of the page.
    expect(within(footer).getByRole("button", { name: "Run again" })).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it("explains invalid JSON and offers the raw output and the manual editor", async () => {
    api.getRawResponse.mockResolvedValue("Sure! Here are my comments: [{oops");
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit(
      { type: "chunk", text: "Sure! Here are my comments: [{oops" },
      {
        type: "done",
        result: { ...RESULT, json_error: "Expecting property name: line 1 column 31 (char 30)" },
      }
    );

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("The model output wasn't valid JSON");
    expect(notice).toHaveTextContent("saved as one general comment");
    expect(notice).toHaveTextContent("Expecting property name: line 1 column 31");

    await user.click(within(notice).getByRole("button", { name: "View raw output" }));
    expect(await screen.findByLabelText("Stored raw model output")).toHaveTextContent(
      "Sure! Here are my comments: [{oops"
    );
    expect(api.getRawResponse).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID);

    await user.click(within(notice).getByRole("button", { name: "Fix in Copy & paste mode" }));
    expect(await screen.findByPlaceholderText("Paste AI response JSON here…")).toHaveValue(
      "Sure! Here are my comments: [{oops"
    );
  });
});

const savedComment = (
  id: string,
  body: string
): Review["iterations"][number]["comments"][number] => ({
  id,
  file: "a.py",
  line: 3,
  severity: "minor",
  body,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
});

const reviewAt = (
  stage: Review["iterations"][number]["stage"],
  comments: Review["iterations"][number]["comments"] = []
): Review => ({
  ...REVIEW,
  iterations: REVIEW.iterations.map((it) => ({ ...it, stage, comments })),
});

describe("DispatchStage — after a run", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps fetching the review after Stop until the server has written the run", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    channel.emit({ type: "chunk", text: "[{" });
    // The server saves only once it notices the stream ended, so the first reads still
    // show the iteration as dispatching.
    api.get
      .mockResolvedValueOnce(reviewAt("dispatch"))
      .mockResolvedValueOnce(reviewAt("dispatch"))
      .mockResolvedValue(
        reviewAt("polish", [savedComment("66666666-6666-4666-8666-666666666666", "Kept")])
      );

    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(
      () => {
        expect(api.get).toHaveBeenCalledTimes(4);
      },
      { timeout: 3000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it("does not let the mode switch end a running generation", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    const copyAndPaste = screen.getByRole("radio", { name: "Copy & paste" });
    expect(copyAndPaste).toHaveAttribute("aria-disabled", "true");
    expect(copyAndPaste).toHaveAttribute("title", "Stop the generation to switch modes");
    await user.click(copyAndPaste);
    expect(screen.getByRole("radio", { name: "Run in app" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    channel.emit({ type: "done", result: RESULT });
    await screen.findByText("1 comment saved");
    expect(copyAndPaste).not.toHaveAttribute("aria-disabled");
  });

  it("keeps the focus on the next step and never turns Run again into Stop", async () => {
    const user = userEvent.setup();
    renderStage();
    const generate = await screen.findByRole("button", { name: /Generate review/ });
    const channel = createDispatchChannel();

    await user.click(generate);
    expect(generate).toHaveFocus();
    expect(generate).toHaveAttribute("aria-busy", "true");
    channel.emit({ type: "done", result: RESULT });
    const polish = await screen.findByRole("button", { name: "Polish 1 comment" });
    expect(polish).toBe(generate);
    expect(polish).toHaveFocus();

    // Two quick clicks on Run again start one run and leave it running.
    const runAgain = screen.getByRole("button", { name: "Run again" });
    createDispatchChannel();
    await user.dblClick(runAgain);
    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(stop).not.toBe(runAgain);
    const footer = screen.getByRole("region", { name: "Generation actions" });
    expect(within(footer).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(api.dispatchStream).toHaveBeenCalledTimes(2);
    const signal = api.dispatchStream.mock.calls[1]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    // Run again went away; the focus moved to the footer's busy button.
    expect(polish).toHaveFocus();
    expect(polish).toHaveAttribute("aria-busy", "true");
  });

  it("warns again after a failure or a stop that the next run replaces the comments", async () => {
    api.get.mockResolvedValue(
      reviewAt("polish", [savedComment("66666666-6666-4666-8666-666666666666", "Old")])
    );
    const user = userEvent.setup();
    renderStage();
    const footer = await screen.findByRole("region", { name: "Generation actions" });
    const warning = /1 existing comment will be replaced — a failed run keeps them/;
    expect(await within(footer).findByText(warning)).toBeInTheDocument();

    const channel = await startDispatch(user);
    expect(within(footer).queryByText(warning)).not.toBeInTheDocument();
    channel.emit({ type: "error", message: "Rate limit exceeded" });
    await screen.findByRole("alert");
    expect(within(footer).getByText(warning)).toBeInTheDocument();

    createDispatchChannel();
    await user.click(within(footer).getByRole("button", { name: "Run again" }));
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    await screen.findByText("Stopped");
    expect(within(footer).getByText(warning)).toBeInTheDocument();
  });

  it("folds the form into the run's header line and opens it again on Edit", async () => {
    const user = userEvent.setup();
    renderStage();
    expect(await screen.findByRole("radiogroup", { name: "Provider" })).toBeInTheDocument();
    const channel = await startDispatch(user);

    expect(screen.queryByRole("radiogroup", { name: "Provider" })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Generation output" });
    expect(within(panel).getByText("claude-model")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();

    channel.emit({ type: "done", result: RESULT });
    await user.click(await within(panel).findByRole("button", { name: /Edit/ }));
    const providers = screen.getByRole("radiogroup", { name: "Provider" });
    expect(within(panel).queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    // Edit went away; the focus followed into the form, onto the chosen provider.
    expect(within(providers).getByRole("radio", { name: /^Claude/ })).toHaveFocus();
  });

  it("lists the saved comments once done, not the previews streamed before", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    channel.emit(
      {
        type: "comment",
        comment: { index: 0, file: null, line: null, severity: "minor", body: "Draft" },
      },
      {
        type: "comment",
        comment: { index: 1, file: "a.py", line: 3, severity: "minor", body: "Real" },
      }
    );
    await screen.findByText("Draft");
    api.get.mockResolvedValue(
      reviewAt("polish", [savedComment("66666666-6666-4666-8666-666666666666", "Real")])
    );

    channel.emit({ type: "done", result: RESULT });

    await screen.findByText("1 comment saved");
    const list = screen.getByRole("list", { name: "Generated comments" });
    expect(within(list).getByText("Real")).toBeInTheDocument();
    expect(within(list).queryByText("Draft")).not.toBeInTheDocument();
  });

  it("says the unreadable fallback was saved whatever the previews counted", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit(
      {
        type: "comment",
        comment: { index: 0, file: null, line: null, severity: "minor", body: "Draft" },
      },
      { type: "done", result: { ...RESULT, json_error: "Expecting value" } }
    );

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("saved as one general comment");
    expect(notice).not.toHaveTextContent("could still be read");
  });

  it("explains that an unused answer left the previous comments alone", async () => {
    api.get.mockResolvedValue(
      reviewAt("polish", [
        savedComment("66666666-6666-4666-8666-666666666666", "Old one"),
        savedComment("77777777-7777-4777-8777-777777777777", "Old two"),
      ])
    );
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit(
      { type: "chunk", text: "Sorry, I can't review this." },
      {
        type: "done",
        result: {
          ...RESULT,
          comments: 2,
          json_error: "Invalid JSON: Expecting value",
          kept_previous: true,
        },
      }
    );

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Nothing from this run was saved");
    expect(notice).toHaveTextContent("Your 2 previous comments are unchanged");
    expect(within(notice).queryByRole("button", { name: "Re-parse" })).not.toBeInTheDocument();
    expect(screen.getByText("2 comments kept from before")).toBeInTheDocument();
    // Nothing new to polish: running again leads, the kept comments stay one click away.
    expect(screen.getByRole("button", { name: "Run again" })).toHaveClass("ui-btn--primary");
    expect(screen.getByRole("button", { name: "Polish 2 comments" })).toHaveClass(
      "ui-btn--secondary"
    );

    await user.click(within(notice).getByRole("button", { name: "View this run's output" }));
    expect(await screen.findByLabelText("This run's model output")).toHaveTextContent(
      "Sorry, I can't review this."
    );
    expect(api.getRawResponse).not.toHaveBeenCalled();

    await user.click(within(notice).getByRole("button", { name: "Fix in Copy & paste mode" }));
    expect(await screen.findByPlaceholderText("Paste AI response JSON here…")).toHaveValue(
      "Sorry, I can't review this."
    );
  });
});

describe("DispatchStage — generation settings", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const generate = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    createDispatchChannel();
    await user.click(screen.getByRole("button", { name: /Generate review/ }));
    await screen.findByRole("button", { name: "Stop" });
  };

  it("shows an unset temperature as the model's default rather than 0.7", async () => {
    renderStage();

    expect(await screen.findByTestId("temperature-value")).toHaveTextContent("Default");
    expect(screen.queryByText("0.7 — Default")).not.toBeInTheDocument();
  });

  it("offers the model's effort levels and no temperature when it always reasons", async () => {
    capabilitiesByModel.set("claude-model", ALWAYS_THINKING);
    const user = userEvent.setup();
    renderStage();

    expect(await screen.findByText(/not accepted by this model/)).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Temperature" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Reasoning" })).not.toBeInTheDocument();
    const efforts = screen.getByRole("radiogroup", { name: "Reasoning effort" });
    expect(within(efforts).getByRole("radio", { name: "Default (medium)" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await user.click(within(efforts).getByRole("radio", { name: "xhigh" }));
    await generate(user);

    expect(dispatchedRequest()).toMatchObject({
      model: "claude-model",
      reasoningEffort: "xhigh",
      reasoningBudget: null,
      temperature: null,
    });
  });

  it("sends a thinking budget on a budget model and no temperature while reasoning is on", async () => {
    capabilitiesByModel.set("claude-legacy", BUDGET_THINKING);
    providersQuery.data = [{ ...PROVIDER, models: ["claude-legacy"] }];
    const user = userEvent.setup();
    renderStage();

    fireEvent.change(await screen.findByRole("slider", { name: "Temperature" }), {
      target: { value: "0.4" },
    });
    await user.click(screen.getByRole("switch", { name: "Reasoning" }));
    expect(screen.getByRole("switch", { name: "Reasoning" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Temperature" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Thinking budget" })).toHaveAttribute("max", "59904");
    await generate(user);

    expect(dispatchedRequest()).toMatchObject({
      reasoningBudget: 8192,
      reasoningEffort: null,
      temperature: null,
    });
  });

  it("shows the chosen model in the picker and searches once something is typed", async () => {
    providersQuery.data = [OTHER_PROVIDER];
    const user = userEvent.setup();
    renderStage();

    const picker = await screen.findByRole("combobox", { name: "Model" });
    expect(picker).toHaveValue("gpt-a");
    await user.click(picker);
    const list = screen.getByRole("listbox", { name: "Models" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["gpt-a", "gpt-b"]);
    expect(within(list).getByRole("option", { name: "gpt-a" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.keyboard("b");
    expect(picker).toHaveValue("b");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["Use “b”", "gpt-b"]);

    await user.keyboard("{Escape}");
    expect(picker).toHaveValue("gpt-a");
    expect(screen.queryByRole("listbox", { name: "Models" })).not.toBeInTheDocument();

    await user.click(picker);
    await user.click(screen.getByRole("option", { name: "gpt-b" }));
    expect(picker).toHaveValue("gpt-b");
    expect(screen.queryByRole("listbox", { name: "Models" })).not.toBeInTheDocument();
  });

  it("moves through the models with the arrow keys as a combobox", async () => {
    providersQuery.data = [OTHER_PROVIDER];
    const user = userEvent.setup();
    renderStage();

    const picker = await screen.findByRole("combobox", { name: "Model" });
    expect(picker).toHaveAttribute("aria-expanded", "false");
    await user.click(picker);
    expect(picker).toHaveAttribute("aria-expanded", "true");
    expect(picker).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    const list = screen.getByRole("listbox", { name: "Models" });
    expect(picker).toHaveAttribute("aria-controls", list.id);
    const first = within(list).getByRole("option", { name: "gpt-a" });
    expect(picker).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}");
    const second = within(list).getByRole("option", { name: "gpt-b" });
    expect(picker).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{ArrowDown}");
    expect(picker).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowUp}{Enter}");

    expect(picker).toHaveValue("gpt-b");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(picker).toHaveFocus();

    // Closed, an arrow opens the list on the chosen model.
    await user.keyboard("{ArrowDown}");
    expect(picker).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "gpt-b" }).id
    );
  });

  it("keeps a typed model id when the field is left without Enter", async () => {
    const user = userEvent.setup();
    renderStage();

    const picker = await screen.findByRole("combobox", { name: "Model" });
    await user.click(picker);
    await user.keyboard("my-custom-model");
    await generate(user);

    expect(dispatchedRequest().model).toBe("my-custom-model");
  });

  it("takes a model id typed into the picker", async () => {
    const user = userEvent.setup();
    renderStage();

    await user.click(await screen.findByRole("combobox", { name: "Model" }));
    await user.paste("my-gateway-model");
    await user.keyboard("{Enter}");
    await generate(user);

    expect(dispatchedRequest().model).toBe("my-gateway-model");
  });

  it("says the provider list failed instead of claiming none are configured", async () => {
    providersQuery.data = undefined;
    providersQuery.isError = true;
    providersQuery.error = new Error("Backend unavailable");
    const user = userEvent.setup();
    renderStage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load AI providers");
    expect(alert).toHaveTextContent("Backend unavailable");
    expect(screen.queryByText("No AI providers configured")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(providersQuery.refetch).toHaveBeenCalled();
  });

  it("sends the advanced settings", async () => {
    capabilitiesByModel.set("claude-model", ALWAYS_THINKING);
    const user = userEvent.setup();
    renderStage();

    await user.click(await screen.findByRole("button", { name: /Advanced/ }));
    await user.click(screen.getByRole("spinbutton", { name: "Max output tokens" }));
    await user.paste("20000");
    await user.click(screen.getByRole("switch", { name: /Structured output/ }));
    await user.click(screen.getByRole("textbox", { name: "System prompt" }));
    await user.paste("Only security issues.");
    await generate(user);

    expect(dispatchedRequest()).toMatchObject({
      maxOutputTokens: 20_000,
      structuredOutput: false,
      systemPrompt: "Only security issues.",
    });
  });

  it("remembers the settings of each provider separately", async () => {
    providersQuery.data = [PROVIDER, OTHER_PROVIDER];
    const user = userEvent.setup();
    renderStage();

    fireEvent.change(await screen.findByRole("slider", { name: "Temperature" }), {
      target: { value: "0.3" },
    });
    await user.click(screen.getByRole("radio", { name: /OpenAI/ }));
    expect(screen.getByTestId("temperature-value")).toHaveTextContent("Default");
    expect(screen.getByTestId("selected-model")).toHaveValue("gpt-a");

    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("claude-model");
    expect(screen.getByTestId("temperature-value")).toHaveTextContent("0.3");
    const saved = JSON.parse(localStorage.getItem("mr-review:dispatch:settings") ?? "{}") as Record<
      string,
      { temperature: number | null }
    >;
    expect(saved[PROVIDER.id]?.temperature).toBe(0.3);
  });
});

describe("DispatchStage — copy & paste import", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const importResponse = async (
    user: ReturnType<typeof userEvent.setup>,
    result: ImportResponseResult
  ): Promise<void> => {
    api.importResponse.mockResolvedValue(result);
    renderStage();
    await user.click(await screen.findByRole("radio", { name: "Copy & paste" }));
    await user.click(screen.getByRole("button", { name: "Paste text" }));
    await user.click(screen.getByPlaceholderText("Paste AI response JSON here…"));
    await user.paste('[{"severity": "minor", "body": "ok"}, {}]');
    await user.click(screen.getByRole("button", { name: "Import comments" }));
  };

  it("lists every skipped item with its reason", async () => {
    const user = userEvent.setup();
    await importResponse(user, {
      imported: 1,
      errors: [{ index: 1, reason: "body: Field required", raw: "{}" }],
      json_error: null,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 comment imported, 1 item skipped"
    );
    const skipped = screen.getByRole("region", { name: "Skipped items" });
    expect(within(skipped).getByText("item #2")).toBeInTheDocument();
    expect(within(skipped).getByText("body: Field required")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Polish 1 comment" }));
    expect(stage.setStage).toHaveBeenCalledWith("polish");
  });

  it("explains a JSON error and lets the user fix the response", async () => {
    const user = userEvent.setup();
    await importResponse(user, {
      imported: 1,
      errors: [],
      json_error: "Expecting ',' delimiter: line 1 column 40 (char 39)",
    });

    const report = await screen.findByRole("alert");
    expect(report).toHaveTextContent("The response isn't valid JSON");
    expect(report).toHaveTextContent("saved as one general comment");
    expect(report).toHaveTextContent("Expecting ',' delimiter: line 1 column 40");

    await user.click(screen.getByRole("button", { name: "Edit & re-import" }));
    expect(screen.getByPlaceholderText("Paste AI response JSON here…")).toHaveValue(
      '[{"severity": "minor", "body": "ok"}, {}]'
    );
  });

  it("keeps the pasted response and its report when the mode switch goes there and back", async () => {
    const pasted = '[{"severity": "minor", "body": "ok"}, {}]';
    api.importResponse.mockResolvedValue({
      imported: 1,
      errors: [{ index: 1, reason: "body: Field required", raw: "{}" }],
      json_error: null,
    });
    const user = userEvent.setup();
    renderStage();
    const switchThereAndBack = async (): Promise<void> => {
      await user.click(screen.getByRole("radio", { name: "Copy & paste" }));
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("radio", { name: "Run in app" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      await user.keyboard("{ArrowLeft}");
    };

    await user.click(await screen.findByRole("radio", { name: "Copy & paste" }));
    await user.click(screen.getByRole("button", { name: "Paste text" }));
    await user.click(screen.getByPlaceholderText("Paste AI response JSON here…"));
    await user.paste(pasted);
    await switchThereAndBack();
    expect(screen.getByPlaceholderText("Paste AI response JSON here…")).toHaveValue(pasted);

    await user.click(screen.getByRole("button", { name: "Import comments" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 comment imported, 1 item skipped"
    );
    await switchThereAndBack();
    expect(screen.getByRole("alert")).toHaveTextContent("1 comment imported, 1 item skipped");
    await user.click(screen.getByRole("button", { name: "Edit & re-import" }));
    expect(screen.getByPlaceholderText("Paste AI response JSON here…")).toHaveValue(pasted);
    expect(api.importResponse).toHaveBeenCalledTimes(1);
  });
});

describe(
  "DispatchStage — every changed file excluded",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const EXCLUDED =
      "All 2 changed files are excluded by the path filters, so there is nothing to review.";

    beforeEach(resetMocks);
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("says why there is no prompt to copy", async () => {
      api.getPrompt.mockRejectedValue(new ApiError(EXCLUDED, 422));
      const user = userEvent.setup();
      renderStage();

      await user.click(await screen.findByRole("radio", { name: "Copy & paste" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        `The prompt could not be built: ${EXCLUDED}`
      );
    });

    it("shows the server's refusal when a run is started", async () => {
      api.dispatchStream.mockImplementation(async function* (): AsyncGenerator<
        DispatchStreamEvent,
        void,
        undefined
      > {
        await Promise.reject(new Error(EXCLUDED));
        yield* [];
      });
      const user = userEvent.setup();
      renderStage();

      await user.click(await screen.findByRole("button", { name: /Generate review/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(EXCLUDED);
    });
  }
);
