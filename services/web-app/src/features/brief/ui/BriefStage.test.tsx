import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import { ApiError } from "@shared/api";
import { COPY_BLOCKED_MESSAGE } from "@shared/lib";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@shared/lib/test-utils";
import { BriefStage } from "./BriefStage";
import type * as ReviewApiModule from "@entities/review/api/reviewApi";
import type * as ReviewPresetApiModule from "@entities/review-preset/api/reviewPresetApi";
import type { BriefConfig, PromptPreview, Review } from "@entities/review";
import type { ReviewPreset } from "@entities/review-preset";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";
const PRESET_ID = "33333333-3333-4333-8333-333333333333";
const SAVE_WAIT = { timeout: 3_000 };

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  getDiff: vi.fn(),
  getPromptPreview: vi.fn(),
  getExcludedFiles: vi.fn(),
}));

const presetApi = vi.hoisted(() => ({
  list: vi.fn(),
  listBuiltin: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const stage = vi.hoisted(() => ({ setStage: vi.fn() }));

vi.mock("@entities/review/api/reviewApi", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewApiModule>();
  return { ...actual, reviewApi: { ...actual.reviewApi, ...api } };
});

vi.mock("@entities/review-preset/api/reviewPresetApi", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewPresetApiModule>();
  return { ...actual, reviewPresetApi: { ...actual.reviewPresetApi, ...presetApi } };
});

vi.mock("@app/navigation", () => ({
  useNav: () => ({ activeReviewId: REVIEW_ID }),
}));

vi.mock("@widgets/stage-bar", () => ({
  useStageBarStore: <T,>(selector: (state: { setStage: typeof stage.setStage }) => T): T =>
    selector({ setStage: stage.setStage }),
}));

const reviewWith = (brief: BriefConfig): Review => ({
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
      brief_config: brief,
      created_at: "2026-05-16T10:00:00+00:00",
      completed_at: null,
    },
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

// Literal text a Markdown renderer would turn into a heading and a code block.
const PROMPT = "# Code Review Task\n\nReview this.\n\n## Diff\n\n```diff\n+1 | x = 1\n```";

const PREVIEW: PromptPreview = {
  prompt: PROMPT,
  total_chars: PROMPT.length,
  estimated_tokens: Math.ceil(PROMPT.length / 4),
  budget_chars: 600_000,
  sections: [
    {
      key: "instructions",
      label: "Instructions",
      chars: 30,
      source_chars: 30,
      items: 1,
      included: 1,
      truncated: [],
      omitted: [],
      skipped: [],
    },
    {
      key: "full_files",
      label: "Full files",
      chars: 20,
      source_chars: 900,
      items: 3,
      included: 1,
      truncated: ["src/a.py"],
      omitted: ["src/b.py", "src/c.py"],
      skipped: [],
    },
  ],
  files_total: 2,
  excluded_files: [{ path: "uv.lock", reason: "*.lock" }],
  preset_name: null,
  preset_missing: false,
};

const SAVED_PRESET: ReviewPreset = {
  id: PRESET_ID,
  name: "Public API",
  description: "Exported names only",
  instructions: "Review only the public API.",
  brief_config: { min_severity: "major", focus_areas: ["Documentation"] },
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
};

const lastSavedBrief = (): BriefConfig => {
  const calls = api.update.mock.calls as [string, { brief_config: BriefConfig }][];
  const last = calls.at(-1);
  if (!last) throw new Error("The brief was never saved");
  return last[1].brief_config;
};

const renderStage = (brief: BriefConfig = DEFAULT_BRIEF_CONFIG): void => {
  api.get.mockResolvedValue(reviewWith(brief));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BriefStage />
    </QueryClientProvider>
  );
};

const openPreview = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(await screen.findByRole("button", { name: "Preview prompt" }));
  return screen.findByLabelText("Prompt text");
};

beforeEach(() => {
  vi.clearAllMocks();
  api.update.mockImplementation((_id: string, data: { brief_config: BriefConfig }) =>
    Promise.resolve(reviewWith(data.brief_config))
  );
  api.getDiff.mockResolvedValue("");
  api.getPromptPreview.mockResolvedValue(PREVIEW);
  api.getExcludedFiles.mockResolvedValue({
    total: 2,
    excluded: [{ path: "uv.lock", reason: "*.lock" }],
  });
  presetApi.list.mockResolvedValue([]);
  presetApi.listBuiltin.mockResolvedValue([
    {
      id: "thorough",
      name: "Thorough",
      description: "",
      instructions: "Perform a thorough code review.",
    },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BriefStage — editing", () => {
  it(
    "keeps a newline typed into Context Files and saves one path per line",
    async () => {
      const user = userEvent.setup();
      renderStage();
      const field = await screen.findByLabelText("Context Files");

      await user.type(field, "docs/{Enter}README.md");

      expect(field).toHaveValue("docs/\nREADME.md");
      await waitFor(() => {
        expect(lastSavedBrief().context_files).toEqual(["docs/", "README.md"]);
      }, SAVE_WAIT);
    },
    INTEGRATION_TEST_TIMEOUT_MS
  );

  it("tidies blank lines and spaces in Context Files when the field loses focus", async () => {
    const user = userEvent.setup();
    renderStage();
    const field = await screen.findByLabelText("Context Files");

    await user.type(field, "  docs/  {Enter}{Enter}README.md");
    expect(field).toHaveValue("  docs/  \n\nREADME.md");
    await user.tab();

    expect(field).toHaveValue("docs/\nREADME.md");
  });

  it("labels its fields and reports toggle state to assistive technology", async () => {
    const user = userEvent.setup();
    renderStage();

    expect(await screen.findByLabelText("Custom Instructions")).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByRole("button", { name: /THOROUGH/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SECURITY/, pressed: false })).toBeInTheDocument();
    const pill = screen.getByRole("button", { name: "Include project context files" });
    expect(pill).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /SECURITY/ }));
    await user.click(pill);

    expect(screen.getByRole("button", { name: /SECURITY/, pressed: true })).toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("Context Files")).not.toBeInstanceOf(HTMLTextAreaElement);
  });

  it(
    "saves the output options",
    async () => {
      const user = userEvent.setup();
      renderStage();

      await user.type(await screen.findByLabelText("Comment language"), "Russian");
      await user.click(screen.getByRole("button", { name: "Major and up" }));
      await user.type(screen.getByLabelText("Maximum comments"), "12");
      await user.click(screen.getByRole("button", { name: "Error handling" }));

      await waitFor(() => {
        const saved = lastSavedBrief();
        expect(saved.output_language).toBe("Russian");
        expect(saved.min_severity).toBe("major");
        expect(saved.max_comments).toBe(12);
        expect(saved.focus_areas).toEqual(["Error handling"]);
      }, SAVE_WAIT);
    },
    INTEGRATION_TEST_TIMEOUT_MS
  );
});

describe("BriefStage — prompt preview", () => {
  it("shows the prompt as literal text, not rendered Markdown", async () => {
    const user = userEvent.setup();
    renderStage();

    const pre = await openPreview(user);

    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe(PROMPT);
    expect(screen.queryByRole("heading", { name: "Code Review Task" })).not.toBeInTheDocument();
  });

  it("marks the preview out of date while typing instead of rebuilding or re-rendering it", async () => {
    const user = userEvent.setup();
    renderStage();
    const pre = await openPreview(user);

    await user.type(screen.getByLabelText("Custom Instructions"), "Check the cache");

    expect(screen.getByText("Out of date")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt text")).toBe(pre);
    expect(api.getPromptPreview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(api.getPromptPreview).toHaveBeenCalledTimes(2);
    });
    const [, requested] = api.getPromptPreview.mock.calls[1] as [string, BriefConfig];
    expect(requested.custom_instructions).toBe("Check the cache");
    await waitFor(() => {
      expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
    });
  });

  it("breaks the prompt down and says what the budget left out", async () => {
    const user = userEvent.setup();
    renderStage();
    await openPreview(user);

    const table = screen.getByRole("table", { name: "What the prompt is made of" });
    const fullFiles = within(table).getByRole("row", { name: /Full files/ });
    expect(fullFiles).toHaveTextContent("1 of 3 · 1 cut short · 2 left out");
    expect(screen.getByText(/did not fit the prompt budget/)).toBeInTheDocument();
    expect(screen.getByText("1 of 2 changed files excluded by path filters.")).toBeInTheDocument();
    expect(screen.getByText(/tokens \(est\.\)/)).toBeInTheDocument();
  });
});

describe("BriefStage — copy", () => {
  const setClipboard = (clipboard: Partial<Clipboard> | undefined, secure: boolean): void => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
  };

  afterEach(() => {
    setClipboard(undefined, false);
  });

  // user-event installs its own clipboard stub in setup(), so the page's clipboard is set after it.
  it("copies on a plain-http origin without the Clipboard API", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    const user = userEvent.setup();
    setClipboard(undefined, false);
    renderStage();
    await openPreview(user);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("says so when the browser blocks every way to copy", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) }, true);
    renderStage();
    await openPreview(user);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY_BLOCKED_MESSAGE);
  });
});

describe("BriefStage — dispatch", () => {
  it("saves the brief, then moves on to Dispatch", async () => {
    const user = userEvent.setup();
    renderStage();

    await user.click(await screen.findByRole("button", { name: /Dispatch/ }));

    await waitFor(() => {
      expect(stage.setStage).toHaveBeenCalledWith("dispatch");
    });
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("stays on the Brief and shows why when the brief cannot be saved", async () => {
    api.update.mockRejectedValue(new ApiError("Review is locked", 409));
    const user = userEvent.setup();
    renderStage();

    await user.click(await screen.findByRole("button", { name: /Dispatch/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The brief could not be saved, so the review was not dispatched: Review is locked"
    );
    expect(stage.setStage).not.toHaveBeenCalled();
  });
});

describe("BriefStage — saved presets", () => {
  it(
    "applies a saved preset's settings and marks it selected",
    async () => {
      presetApi.list.mockResolvedValue([SAVED_PRESET]);
      const user = userEvent.setup();
      renderStage();

      await user.click(await screen.findByRole("button", { name: /PUBLIC API/ }));

      expect(screen.getByRole("button", { name: /PUBLIC API/, pressed: true })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /THOROUGH/, pressed: false })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Major and up", pressed: true })
      ).toBeInTheDocument();
      await waitFor(() => {
        const saved = lastSavedBrief();
        expect(saved.custom_preset_id).toBe(PRESET_ID);
        expect(saved.focus_areas).toEqual(["Documentation"]);
      }, SAVE_WAIT);
    },
    INTEGRATION_TEST_TIMEOUT_MS
  );

  it(
    "saves the current brief as a preset and selects it",
    async () => {
      presetApi.create.mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({ ...SAVED_PRESET, ...input, id: PRESET_ID })
      );
      const user = userEvent.setup();
      renderStage({ ...DEFAULT_BRIEF_CONFIG, output_language: "German" });

      await user.click(await screen.findByRole("button", { name: "Save as preset…" }));
      const form = screen.getByRole("form", { name: "Save as preset" });
      await waitFor(() => {
        expect(within(form).getByLabelText("Instructions")).toHaveValue(
          "Perform a thorough code review."
        );
      });
      await user.type(within(form).getByLabelText("Name"), "German review");
      await user.click(within(form).getByRole("button", { name: "Save preset" }));

      await waitFor(() => {
        expect(presetApi.create).toHaveBeenCalledTimes(1);
      });
      const [input] = presetApi.create.mock.calls[0] as [Record<string, unknown>];
      expect(input.name).toBe("German review");
      expect(input.brief_config).toMatchObject({ output_language: "German" });
      expect(input.brief_config).not.toHaveProperty("custom_preset_id");
      await waitFor(() => {
        expect(lastSavedBrief().custom_preset_id).toBe(PRESET_ID);
      }, SAVE_WAIT);
    },
    INTEGRATION_TEST_TIMEOUT_MS
  );

  it("warns when the brief's saved preset was deleted", async () => {
    renderStage({ ...DEFAULT_BRIEF_CONFIG, custom_preset_id: PRESET_ID, preset: "security" });

    expect(
      await screen.findByText(/was deleted; the built-in SECURITY preset/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SECURITY/, pressed: true })).toBeInTheDocument();
  });
});

describe("BriefStage — advanced", () => {
  it(
    "shows how many files the path filters exclude and lets one be reviewed anyway",
    async () => {
      const user = userEvent.setup();
      renderStage();

      const toggle = await screen.findByRole("button", { name: /Advanced/ });
      await waitFor(() => {
        expect(toggle).toHaveTextContent("1 of 2 changed files excluded");
      });
      await user.click(toggle);
      await user.click(screen.getByRole("button", { name: "Review uv.lock anyway" }));

      await waitFor(() => {
        expect(lastSavedBrief().exclude_paths).toEqual(["!/uv.lock"]);
      }, SAVE_WAIT);
      expect(screen.getByLabelText("Exclude")).toHaveValue("!/uv.lock");
    },
    INTEGRATION_TEST_TIMEOUT_MS
  );

  it("clamps the prompt budget to the allowed range", async () => {
    const user = userEvent.setup();
    renderStage();
    await user.click(await screen.findByRole("button", { name: /Advanced/ }));
    const budget = screen.getByLabelText("Prompt budget (characters)");

    await user.clear(budget);
    await user.type(budget, "5000");
    act(() => {
      fireEvent.blur(budget);
    });

    expect(budget).toHaveValue(20_000);
  });
});
