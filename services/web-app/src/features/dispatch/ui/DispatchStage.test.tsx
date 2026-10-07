import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import { DispatchStage } from "./DispatchStage";
import type * as ReviewApiModule from "@entities/review/api/reviewApi";
import type { AIProvider } from "@entities/ai-provider";
import type { DispatchStreamEvent, ImportResponseResult, Review } from "@entities/review";

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
}));

const stage = vi.hoisted(() => ({ setStage: vi.fn() }));

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

vi.mock("@entities/ai-provider", () => ({
  useAIProviders: () => ({ data: [PROVIDER] }),
}));

const REVIEW: Review = {
  id: REVIEW_ID,
  host_id: "44444444-4444-4444-8444-444444444444",
  repo_path: "group/project",
  mr_iid: 7,
  iterations: [
    {
      id: ITERATION_ID,
      number: 1,
      stage: "dispatch",
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

const RESULT = { iteration_id: ITERATION_ID, comments: 1, errors: 0, json_error: null };

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
// which shadows jsdom's; the provider and model pickers need a working one.
const createMemoryStorage = (): Storage => {
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
  };
};

const resetMocks = (): void => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMemoryStorage());
  api.get.mockResolvedValue(REVIEW);
  api.getPrompt.mockResolvedValue("prompt");
  api.getDiff.mockResolvedValue("");
  api.getContext.mockResolvedValue("");
};

const renderStage = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DispatchStage />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const startDispatch = async (
  user: ReturnType<typeof userEvent.setup>
): Promise<ReturnType<typeof createDispatchChannel>> => {
  const channel = createDispatchChannel();
  await user.click(await screen.findByRole("button", { name: /Generate with Claude/ }));
  await screen.findByRole("button", { name: "Stop" });
  return channel;
};

describe("DispatchStage — run in app", () => {
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
    expect(screen.getByText("Claude · done")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Polish comments →" }));
    expect(stage.setStage).toHaveBeenCalledWith("polish");
  });

  it("shows the error message and refetches the partially saved review", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);

    channel.emit({ type: "chunk", text: "[{" }, { type: "error", message: "Rate limit exceeded" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limit exceeded");
    expect(screen.getByText("Claude · failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run again with Claude/ })).toBeEnabled();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it("stops cleanly when the user aborts", async () => {
    const user = userEvent.setup();
    renderStage();
    const channel = await startDispatch(user);
    channel.emit({ type: "chunk", text: "[{" });

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Claude · stopped")).toBeInTheDocument();
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

describe("DispatchStage — copy & paste import", () => {
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
    await user.click(await screen.findByRole("button", { name: "Copy & paste" }));
    await user.click(screen.getByRole("button", { name: "paste text" }));
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
});
