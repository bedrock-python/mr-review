import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG, reviewKeys } from "@entities/review";
import type * as ReviewEntity from "@entities/review";
import type { Comment, NewCommentInput, Review, UpdateCommentInput } from "@entities/review";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@shared/lib/test-utils";
import { COALESCE_MS, applyCommentPatch, usePolishViewStore } from "../model";
import { PolishStage } from "./PolishStage";
import type { UserEvent } from "@testing-library/user-event";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
// The Markdown renderer is a lazy chunk: its first import takes seconds when suites run in
// parallel, well past findBy's 1 s default.
const MARKDOWN_LOAD_TIMEOUT_MS = 10_000;
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";

const DIFF = [
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -8,5 +8,6 @@",
  " line8",
  " line9",
  "-old10",
  "+new10",
  "+new11",
  " line12",
  " line13",
].join("\n");

const fake = vi.hoisted(() => ({
  review: undefined as Review | undefined,
  failNextUpdate: false,
  setStage: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("@app/navigation", () => ({
  useNav: () => ({ activeReviewId: "11111111-1111-4111-8111-111111111111" }),
}));

vi.mock("@widgets/stage-bar", () => ({
  useStageBarStore: () => ({
    setStage: fake.setStage,
    activeIterationId: "22222222-2222-4222-8222-222222222222",
  }),
}));

vi.mock("@entities/review", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewEntity>();
  return {
    ...actual,
    useReviewDiff: () => ({ data: DIFF, isLoading: false }),
    reviewApi: {
      ...actual.reviewApi,
      update: fake.update,
      addComment: fake.addComment,
      deleteComment: fake.deleteComment,
    },
  };
});

// ── fake server: the same merge rules as the backend ─────────────────────────

const serverComments = (): Comment[] => fake.review?.iterations[0]?.comments ?? [];

const setServerComments = (comments: Comment[]): Review => {
  if (fake.review === undefined) throw new Error("no review");
  const [iteration] = fake.review.iterations;
  if (iteration === undefined) throw new Error("no iteration");
  fake.review = { ...fake.review, iterations: [{ ...iteration, comments }] };
  return structuredClone(fake.review);
};

let createdCount = 0;

const installFakeServer = (): void => {
  fake.update.mockImplementation(
    (_reviewId: string, data: { iteration_comments?: UpdateCommentInput[] }) => {
      if (fake.failNextUpdate) {
        fake.failNextUpdate = false;
        return Promise.reject(new Error("disk full"));
      }
      const patches = new Map((data.iteration_comments ?? []).map((p) => [p.id, p]));
      return Promise.resolve(
        setServerComments(
          serverComments().map((c) => {
            const patch = patches.get(c.id);
            if (patch === undefined) return c;
            const { id: _id, ...fields } = patch;
            return applyCommentPatch(c, fields);
          })
        )
      );
    }
  );
  fake.addComment.mockImplementation(
    (_reviewId: string, _iterationId: string, input: NewCommentInput) => {
      createdCount += 1;
      const created = makeComment(`new-${String(createdCount)}`, { ...input, status: "kept" });
      return Promise.resolve(setServerComments([...serverComments(), created]));
    }
  );
  fake.deleteComment.mockImplementation(
    (_reviewId: string, _iterationId: string, commentId: string) =>
      Promise.resolve(setServerComments(serverComments().filter((c) => c.id !== commentId)))
  );
};

// ── fixtures ─────────────────────────────────────────────────────────────────

const makeComment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  file: "src/app.ts",
  line: 10,
  severity: "major",
  body: `body of ${id}`,
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  ...overrides,
});

const makeReview = (comments: Comment[], completedAt: string | null = null): Review => ({
  id: REVIEW_ID,
  host_id: "33333333-3333-4333-8333-333333333333",
  repo_path: "group/project",
  mr_iid: 7,
  iterations: [
    {
      id: ITERATION_ID,
      number: 1,
      stage: completedAt === null ? "polish" : "post",
      comments,
      ai_provider_id: null,
      model: null,
      brief_config: DEFAULT_BRIEF_CONFIG,
      created_at: "2026-05-16T10:00:00+00:00",
      completed_at: completedAt,
    },
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

type RenderedStage = { queryClient: QueryClient; unmountStage: () => void };

const renderStage = (review: Review): RenderedStage => {
  fake.review = structuredClone(review);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(reviewKeys.detail(REVIEW_ID), structuredClone(review));
  const stage = render(<PolishStage />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  // The toaster outlives the stage, as in the app: toasts fired while leaving stay visible.
  render(<Toaster />);
  return { queryClient, unmountStage: stage.unmount };
};

const cards = (): HTMLElement[] => screen.queryAllByRole("article");
const card = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-comment-id="${id}"]`);
  if (element === null) throw new Error(`card ${id} not rendered`);
  return element;
};
const focusedId = (): string | null =>
  document.querySelector('article[aria-current="true"]')?.getAttribute("data-comment-id") ?? null;
const isDismissed = (id: string): boolean => within(card(id)).queryByText("dismissed") !== null;
const cardOrder = (): (string | null)[] => cards().map((c) => c.getAttribute("data-comment-id"));
const waitPastCoalescing = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, COALESCE_MS + 100));
const lastUpdatePayload = (): unknown => fake.update.mock.lastCall?.[1];
const severityChip = (name: RegExp): HTMLElement =>
  within(screen.getByRole("group", { name: "Filter by severity" })).getByRole("button", { name });
/** Opens the Bulk menu and picks an item by its accessible name. */
const chooseBulkAction = async (user: UserEvent, name: string): Promise<void> => {
  await user.click(screen.getByRole("button", { name: "Bulk actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
};

beforeAll(() => {
  // jsdom has no pointer capture; sonner calls it when a toast button is pressed.
  for (const method of ["setPointerCapture", "releasePointerCapture"] as const) {
    if (!(method in Element.prototype)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: () => undefined,
      });
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.failNextUpdate = false;
  createdCount = 0;
  installFakeServer();
  usePolishViewStore.setState({ viewMode: "list", isGroupedByFile: false });
});

// ── keyboard triage ──────────────────────────────────────────────────────────

describe("PolishStage list — keyboard triage", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  const threeComments = (): Review =>
    makeReview([
      makeComment("c1", { severity: "critical" }),
      makeComment("c2", { severity: "major" }),
      makeComment("c3", { severity: "minor" }),
    ]);

  it("focuses the first comment and moves with j/k and the arrow keys", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    expect(focusedId()).toBe("c1");
    await user.keyboard("j");
    expect(focusedId()).toBe("c2");
    await user.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("c3");
    await user.keyboard("j");
    expect(focusedId()).toBe("c3");
    await user.keyboard("k");
    expect(focusedId()).toBe("c2");
    await user.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("c1");
  });

  it("dismisses and keeps with d/a, moves on, and sends one coalesced PATCH", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.keyboard("dd");

    expect(isDismissed("c1")).toBe(true);
    expect(isDismissed("c2")).toBe(true);
    expect(focusedId()).toBe("c3");
    await waitFor(() => {
      expect(fake.update).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdatePayload()).toEqual({
      iteration_id: ITERATION_ID,
      iteration_comments: [
        { id: "c1", status: "dismissed" },
        { id: "c2", status: "dismissed" },
      ],
    });

    await user.keyboard("kka");
    expect(isDismissed("c1")).toBe(false);
    await waitFor(() => {
      expect(fake.update).toHaveBeenCalledTimes(2);
    });
    expect(lastUpdatePayload()).toEqual({
      iteration_id: ITERATION_ID,
      iteration_comments: [{ id: "c1", status: "kept" }],
    });
  });

  it("sets the severity with 1–4", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.keyboard("j4");

    expect(card("c2")).toHaveAccessibleName("suggestion comment on src/app.ts:10");
    await waitFor(() => {
      expect(fake.update).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdatePayload()).toEqual({
      iteration_id: ITERATION_ID,
      iteration_comments: [{ id: "c2", severity: "suggestion" }],
    });
  });

  it("ignores triage keys while typing in the search box", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.type(screen.getByRole("searchbox", { name: "Search comments" }), "d");
    await waitPastCoalescing();

    expect(isDismissed("c1")).toBe(false);
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("opens the shortcut cheat-sheet with ?", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.keyboard("?");

    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Dismiss and move on")).toBeInTheDocument();
  });

  it("u undoes the last change", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.keyboard("d");
    expect(isDismissed("c1")).toBe(true);
    await user.keyboard("u");

    expect(isDismissed("c1")).toBe(false);
    await waitPastCoalescing();
    await waitFor(() => {
      expect(serverComments().find((c) => c.id === "c1")?.status).toBe("kept");
    });
  });

  it("the toast that confirms an undo offers no Undo of its own", async () => {
    const user = userEvent.setup();
    renderStage(threeComments());

    await user.keyboard("d");
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    await user.keyboard("u");

    expect(await screen.findByText("Undone: Comment dismissed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});

// ── editing ──────────────────────────────────────────────────────────────────

describe("PolishStage list — editing", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  const twoComments = (): Review =>
    makeReview([makeComment("c1", { severity: "critical" }), makeComment("c2")]);

  const bodyField = (): HTMLTextAreaElement =>
    screen.getByRole("textbox", { name: "Comment body" });

  it("e opens the inline editor and ⌘↵ saves only what changed", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    expect(bodyField()).toHaveValue("body of c1");
    expect(bodyField()).toHaveFocus();
    await user.clear(bodyField());
    await user.type(bodyField(), "rewritten");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(screen.queryByRole("textbox", { name: "Comment body" })).not.toBeInTheDocument();
    expect(within(card("c1")).getByText("rewritten")).toBeInTheDocument();
    await waitFor(() => {
      expect(fake.update).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdatePayload()).toEqual({
      iteration_id: ITERATION_ID,
      iteration_comments: [{ id: "c1", body: "rewritten" }],
    });
  });

  it("Esc closes an unchanged editor at once", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Comment body" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Esc then Discard drops the draft and keeps the original text", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.type(bodyField(), " plus a draft");
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("textbox", { name: "Comment body" })).not.toBeInTheDocument();
    expect(within(card("c1")).getByText("body of c1")).toBeInTheDocument();
    await waitPastCoalescing();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("previews markdown in the Preview tab", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.clear(bodyField());
    await user.type(bodyField(), "use **strict** mode");
    await user.click(screen.getByRole("tab", { name: "Preview" }));

    const preview = screen.getByRole("tabpanel", { name: "Preview" });
    const strong = await within(preview).findByText(
      "strict",
      {},
      { timeout: MARKDOWN_LOAD_TIMEOUT_MS }
    );
    expect(strong.tagName).toBe("STRONG");
  });

  it("asks before leaving a card with unsaved changes", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.type(bodyField(), " edited");
    await user.click(card("c2"));

    const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(bodyField()).toHaveValue("body of c1 edited");
    expect(focusedId()).toBe("c1");

    await user.click(card("c2"));
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("textbox", { name: "Comment body" })).not.toBeInTheDocument();
    expect(focusedId()).toBe("c2");
    await waitPastCoalescing();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("saves from the unsaved-changes dialog before moving on", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.type(bodyField(), " edited");
    await user.click(card("c2"));
    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(focusedId()).toBe("c2");
    await waitFor(() => {
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [{ id: "c1", body: "body of c1 edited" }],
      });
    });
  });

  it("re-anchors a comment and warns when the line is outside the diff", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    const lineInput = screen.getByRole("textbox", { name: "Line number" });
    await user.clear(lineInput);
    await user.type(lineInput, "40");
    expect(
      screen.getByText("Line 40 is not part of the diff — it will be posted as a general note.")
    ).toBeInTheDocument();

    await user.clear(lineInput);
    await user.type(lineInput, "11");
    expect(screen.queryByText(/is not part of the diff/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [{ id: "c1", line: 11 }],
      });
    });
  });

  it("turns an anchored comment into a general one", async () => {
    const user = userEvent.setup();
    renderStage(twoComments());

    await user.keyboard("e");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Anchor file" }),
      "General comment (no line)"
    );
    expect(screen.queryByRole("textbox", { name: "Line number" })).not.toBeInTheDocument();
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(card("c1")).toHaveAccessibleName("critical comment on general");
    await waitFor(() => {
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [{ id: "c1", file: null, line: null }],
      });
    });
  });
});

// ── code context ─────────────────────────────────────────────────────────────

describe("PolishStage list — code context", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("shows the diff lines around an anchored comment", async () => {
    const user = userEvent.setup();
    renderStage(makeReview([makeComment("c1", { line: 10 })]));

    await user.click(within(card("c1")).getByRole("button", { name: "Show code" }));

    const snippet = screen.getByRole("table", { name: "Code around src/app.ts:10" });
    const rows = within(snippet).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "88 line8",
      "99 line9",
      "10−old10",
      "10+new10",
      "11+new11",
      "1112 line12",
      "1213 line13",
    ]);
    expect(rows[3]).toHaveAttribute("aria-current", "true");

    await user.keyboard("c");
    expect(screen.queryByRole("table", { name: /Code around/ })).not.toBeInTheDocument();
  });

  it("flags comments the diff does not show", () => {
    renderStage(
      makeReview([
        makeComment("inside", { line: 9 }),
        makeComment("outside", { line: 40 }),
        makeComment("elsewhere", { file: "src/other.ts", line: 3 }),
      ])
    );

    expect(within(card("inside")).queryByText("not in diff")).not.toBeInTheDocument();
    expect(within(card("outside")).getByText("not in diff")).toBeInTheDocument();
    expect(within(card("elsewhere")).getByText("not in diff")).toBeInTheDocument();
  });
});

// ── filters and grouping ─────────────────────────────────────────────────────

describe(
  "PolishStage list — filters and grouping",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const mixed = (): Review =>
      makeReview([
        makeComment("b-minor", { file: "src/b.ts", line: 5, severity: "minor" }),
        makeComment("a-major", { file: "src/a.ts", line: 30, severity: "major" }),
        makeComment("general", {
          file: null,
          line: null,
          severity: "suggestion",
          status: "dismissed",
        }),
        makeComment("a-critical", {
          file: "src/a.ts",
          line: 2,
          severity: "critical",
          body: "needle",
        }),
        makeComment("a-major-early", { file: "src/a.ts", line: 4, severity: "major" }),
      ]);

    it("sorts the flat list by severity, then file and line", () => {
      renderStage(mixed());

      expect(cardOrder()).toEqual(["a-critical", "a-major-early", "a-major", "b-minor", "general"]);
    });

    it("filters by severity, status, file and text", async () => {
      const user = userEvent.setup();
      renderStage(mixed());

      await user.click(severityChip(/major/i));
      expect(cardOrder()).toEqual(["a-major-early", "a-major"]);
      await user.click(severityChip(/major/i));

      await user.click(screen.getByRole("radio", { name: "Dismissed" }));
      expect(cardOrder()).toEqual(["general"]);
      await user.click(screen.getByRole("radio", { name: "All" }));

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Filter by file" }),
        "src/b.ts (1)"
      );
      expect(cardOrder()).toEqual(["b-minor"]);
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Filter by file" }),
        "All files"
      );

      await user.type(screen.getByRole("searchbox", { name: "Search comments" }), "needle");
      expect(cardOrder()).toEqual(["a-critical"]);
      expect(screen.getByText("1 of 5 shown")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(cards()).toHaveLength(5);
    });

    it("groups by file into collapsible groups with counts", async () => {
      const user = userEvent.setup();
      renderStage(mixed());

      await user.click(screen.getByRole("button", { name: "Group by file" }));

      const groupA = screen.getByRole("button", { name: "src/a.ts, 3 comments" });
      expect(screen.getByRole("button", { name: "General notes, 1 comment" })).toBeInTheDocument();
      expect(cardOrder()).toEqual(["general", "a-critical", "a-major-early", "a-major", "b-minor"]);

      await user.click(groupA);
      expect(groupA).toHaveAttribute("aria-expanded", "false");
      expect(cardOrder()).toEqual(["general", "b-minor"]);
    });

    it("navigates only through the comments on screen", async () => {
      const user = userEvent.setup();
      renderStage(mixed());

      await user.click(screen.getByRole("radio", { name: "Kept" }));
      expect(focusedId()).toBe("a-critical");
      await user.keyboard("jjjj");

      expect(focusedId()).toBe("b-minor");
    });
  }
);

// ── bulk actions, undo, rollback ─────────────────────────────────────────────

describe(
  "PolishStage list — bulk actions and persistence",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const four = (): Review =>
      makeReview([
        makeComment("m1", { severity: "major" }),
        makeComment("m2", { severity: "major", line: 11 }),
        makeComment("s1", { severity: "suggestion" }),
        makeComment("n1", { severity: "minor" }),
      ]);

    it("dismisses the filtered comments in one PATCH and undoes it from the toast", async () => {
      const user = userEvent.setup();
      renderStage(four());

      await user.click(severityChip(/major/i));
      await chooseBulkAction(user, "Dismiss shown comments");

      expect(isDismissed("m1")).toBe(true);
      expect(isDismissed("m2")).toBe(true);
      await waitFor(() => {
        expect(fake.update).toHaveBeenCalledTimes(1);
      });
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [
          { id: "m1", status: "dismissed" },
          { id: "m2", status: "dismissed" },
        ],
      });

      await user.click(await screen.findByRole("button", { name: "Undo" }));

      expect(isDismissed("m1")).toBe(false);
      expect(isDismissed("m2")).toBe(false);
      await waitFor(() => {
        expect(fake.update).toHaveBeenCalledTimes(2);
      });
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [
          { id: "m1", status: "kept" },
          { id: "m2", status: "kept" },
        ],
      });
    });

    it("sets the severity of every shown comment at once", async () => {
      const user = userEvent.setup();
      renderStage(four());

      await chooseBulkAction(user, "Set all comments to critical");

      await waitFor(() => {
        expect(fake.update).toHaveBeenCalledTimes(1);
      });
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [
          { id: "m1", severity: "critical" },
          { id: "m2", severity: "critical" },
          { id: "s1", severity: "critical" },
          { id: "n1", severity: "critical" },
        ],
      });
    });

    it("rolls back an optimistic change the server refuses", async () => {
      const user = userEvent.setup();
      fake.failNextUpdate = true;
      renderStage(four());

      await user.keyboard("d");
      expect(isDismissed("m1")).toBe(true);

      expect(await screen.findByText("Failed to save comments")).toBeInTheDocument();
      expect(isDismissed("m1")).toBe(false);
    });

    it("sends pending edits before moving on to Post", async () => {
      const user = userEvent.setup();
      renderStage(four());

      await user.keyboard("d");
      await user.click(screen.getByRole("button", { name: "Continue to post" }));

      await waitFor(() => {
        expect(fake.setStage).toHaveBeenCalledWith("post");
      });
      expect(fake.update).toHaveBeenCalledTimes(1);
      expect(fake.update.mock.invocationCallOrder[0]).toBeLessThan(
        fake.setStage.mock.invocationCallOrder[0] ?? 0
      );
    });
  }
);

// ── add and delete ───────────────────────────────────────────────────────────

describe("PolishStage list — adding and deleting", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("adds an anchored comment from the n shortcut", async () => {
    const user = userEvent.setup();
    renderStage(makeReview([makeComment("c1")]));

    await user.keyboard("n");
    const editor = screen.getByRole("group", { name: "New comment" });
    await user.type(within(editor).getByRole("textbox", { name: "Comment body" }), "Missing test");
    await user.selectOptions(
      within(editor).getByRole("combobox", { name: "Anchor file" }),
      "src/app.ts"
    );
    await user.type(within(editor).getByRole("textbox", { name: "Line number" }), "11");
    await user.click(within(editor).getByRole("radio", { name: /major/i }));
    await user.click(within(editor).getByRole("button", { name: "Add comment" }));

    await waitFor(() => {
      expect(cards()).toHaveLength(2);
    });
    expect(fake.addComment).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID, {
      file: "src/app.ts",
      line: 11,
      severity: "major",
      body: "Missing test",
    });
    expect(screen.queryByRole("group", { name: "New comment" })).not.toBeInTheDocument();
    expect(focusedId()).toBe("new-1");
  });

  it("keeps the new-comment form open until the body has text", async () => {
    const user = userEvent.setup();
    renderStage(makeReview([makeComment("c1")]));

    await user.click(screen.getByRole("button", { name: "New comment" }));
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(screen.getByText("The comment needs some text.")).toBeInTheDocument();
    expect(fake.addComment).not.toHaveBeenCalled();
  });

  it("deletes a comment and brings it back with Undo", async () => {
    const user = userEvent.setup();
    renderStage(
      makeReview([makeComment("c1"), makeComment("c2", { status: "dismissed", body: "gone" })])
    );

    await user.click(within(card("c2")).getByRole("button", { name: "Delete comment" }));

    expect(cards()).toHaveLength(1);
    await waitFor(() => {
      expect(fake.deleteComment).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID, "c2");
    });

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(cards()).toHaveLength(2);
    });
    expect(fake.addComment).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID, {
      file: "src/app.ts",
      line: 10,
      severity: "major",
      body: "gone",
    });
    // The restored copy gets its dismissed status back as well.
    await waitFor(() => {
      expect(serverComments().find((c) => c.body === "gone")?.status).toBe("dismissed");
    });
  });

  it("disables adding and deleting on a posted iteration", () => {
    renderStage(makeReview([makeComment("c1")], "2026-05-17T10:00:00+00:00"));

    expect(screen.getByRole("button", { name: "New comment" })).toBeDisabled();
    expect(within(card("c1")).getByRole("button", { name: "Delete comment" })).toBeDisabled();
    expect(screen.getByText(/This iteration was already posted/)).toBeInTheDocument();
  });

  it("offers to write the first comment when the model produced none", async () => {
    const user = userEvent.setup();
    renderStage(makeReview([]));

    await user.click(screen.getByRole("button", { name: "Write a comment yourself" }));

    expect(screen.getByRole("group", { name: "New comment" })).toBeInTheDocument();
  });
});

// ── long lists ───────────────────────────────────────────────────────────────

describe("PolishStage list — long lists", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("virtualises the list past 80 comments", () => {
    // jsdom lays nothing out; give the scroll area and the rows a height to window over.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    renderStage(makeReview(Array.from({ length: 120 }, (_, i) => makeComment(`c${String(i)}`))));

    expect(cards().length).toBeGreaterThan(0);
    expect(cards().length).toBeLessThan(120);
  });
});

// ── pinned view (diff + editor) ──────────────────────────────────────────────

describe(
  "PolishStage pinned view — comment navigation",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const editorTextarea = (): HTMLTextAreaElement =>
      screen.getByRole("textbox", { name: "Edit comment body" });

    const renderPinned = (comments: Comment[]): void => {
      usePolishViewStore.setState({ viewMode: "pinned" });
      renderStage(makeReview(comments));
    };

    const threeComments = (): Comment[] => [
      makeComment("c1"),
      makeComment("c2"),
      makeComment("c3"),
    ];

    it("loads the next comment into the editor", async () => {
      const user = userEvent.setup();
      renderPinned(threeComments());

      expect(editorTextarea()).toHaveValue("body of c1");

      await user.click(screen.getByRole("button", { name: "Next comment" }));

      expect(editorTextarea()).toHaveValue("body of c2");
      expect(screen.getByText("2/3")).toBeInTheDocument();
    });

    it("drops edits of the previous comment instead of carrying them over", async () => {
      const user = userEvent.setup();
      renderPinned(threeComments());

      await user.clear(editorTextarea());
      await user.type(editorTextarea(), "unsaved draft");
      await user.click(screen.getByRole("button", { name: "Next comment" }));

      expect(editorTextarea()).toHaveValue("body of c2");
    });

    it("returns to the previous comment", async () => {
      const user = userEvent.setup();
      renderPinned(threeComments());

      await user.click(screen.getByRole("button", { name: "Next comment" }));
      await user.click(screen.getByRole("button", { name: "Previous comment" }));

      expect(editorTextarea()).toHaveValue("body of c1");
      expect(screen.getByText("1/3")).toBeInTheDocument();
    });

    it("disables the arrows at both ends of the sequence", async () => {
      const user = userEvent.setup();
      renderPinned(threeComments());

      expect(screen.getByRole("button", { name: "Previous comment" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next comment" })).not.toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Next comment" }));
      await user.click(screen.getByRole("button", { name: "Next comment" }));

      expect(screen.getByRole("button", { name: "Next comment" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Previous comment" })).not.toBeDisabled();
    });

    it("keeps dismissed comments in the sequence", async () => {
      const user = userEvent.setup();
      renderPinned([
        makeComment("c1", { status: "dismissed" }),
        makeComment("c2"),
        makeComment("c3"),
      ]);

      expect(screen.getByText("1/3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous comment" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Next comment" }));

      expect(editorTextarea()).toHaveValue("body of c2");
      expect(screen.getByText("2/3")).toBeInTheDocument();
    });

    it("saves the editor through the same coalesced PATCH", async () => {
      const user = userEvent.setup();
      renderPinned(threeComments());

      await user.clear(editorTextarea());
      await user.type(editorTextarea(), "pinned edit");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(lastUpdatePayload()).toEqual({
          iteration_id: ITERATION_ID,
          iteration_comments: [{ id: "c1", body: "pinned edit" }],
        });
      });
    });
  }
);

// ── regressions from review of #124 ──────────────────────────────────────────

describe(
  "PolishStage list — editing next to other changes",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const bodyField = (): HTMLTextAreaElement =>
      screen.getByRole("textbox", { name: "Comment body" });

    it("saving an edit sends only what the user changed, not a stale severity", async () => {
      const user = userEvent.setup();
      renderStage(
        makeReview([
          makeComment("c1", { severity: "major" }),
          makeComment("c2", { severity: "major" }),
        ])
      );

      await user.keyboard("e");
      await chooseBulkAction(user, "Set all comments to minor");
      await waitFor(() => {
        expect(serverComments().map((c) => c.severity)).toEqual(["minor", "minor"]);
      });
      await user.type(bodyField(), " more");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(lastUpdatePayload()).toEqual({
          iteration_id: ITERATION_ID,
          iteration_comments: [{ id: "c1", body: "body of c1 more" }],
        });
      });
      expect(serverComments().map((c) => c.severity)).toEqual(["minor", "minor"]);
    });

    it("an untouched editor is not dirty after a bulk change", async () => {
      const user = userEvent.setup();
      renderStage(
        makeReview([
          makeComment("c1", { severity: "major" }),
          makeComment("c2", { severity: "major" }),
        ])
      );

      await user.keyboard("e");
      await chooseBulkAction(user, "Set all comments to minor");
      await user.click(card("c2"));

      expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
      expect(focusedId()).toBe("c2");
    });

    it("saves a file-level comment that has no line", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1", { file: "src/app.ts", line: null })]));

      await user.keyboard("e");
      await user.type(bodyField(), " fixed typo");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(lastUpdatePayload()).toEqual({
          iteration_id: ITERATION_ID,
          iteration_comments: [{ id: "c1", body: "body of c1 fixed typo" }],
        });
      });
    });

    it("adds a file-level comment when the line is left empty", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("n");
      await user.type(bodyField(), "About the whole file");
      await user.selectOptions(screen.getByRole("combobox", { name: "Anchor file" }), "src/app.ts");
      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(fake.addComment).toHaveBeenCalledWith(REVIEW_ID, ITERATION_ID, {
          file: "src/app.ts",
          line: null,
          severity: "minor",
          body: "About the whole file",
        });
      });
    });

    it("creates one comment however often save is pressed while it is being added", async () => {
      const user = userEvent.setup();
      const releases: (() => void)[] = [];
      fake.addComment.mockImplementation(
        (_reviewId: string, _iterationId: string, input: NewCommentInput) =>
          new Promise((resolve) => {
            releases.push(() => {
              createdCount += 1;
              const created = makeComment(`new-${String(createdCount)}`, input);
              resolve(setServerComments([...serverComments(), created]));
            });
          })
      );
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("n");
      await user.type(bodyField(), "hello");
      await user.keyboard("{Meta>}{Enter}{/Meta}");
      await user.keyboard("{Meta>}{Enter}{/Meta}");
      await user.click(screen.getByRole("button", { name: "Adding…" }));
      act(() => {
        releases.forEach((release) => {
          release();
        });
      });

      await waitFor(() => {
        expect(cards()).toHaveLength(2);
      });
      expect(fake.addComment).toHaveBeenCalledTimes(1);
    });

    it("Esc on a changed draft asks before throwing it away", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("e");
      await user.type(bodyField(), " lots of text");
      await user.keyboard("{Escape}");

      const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
      await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
      expect(bodyField()).toHaveValue("body of c1 lots of text");
    });

    it("Esc that only ends an IME composition leaves the editor alone", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("e");
      fireEvent.keyDown(bodyField(), { key: "Escape", isComposing: true });

      expect(bodyField()).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the new-comment draft when the last comment is deleted", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("n");
      await user.type(bodyField(), "a long draft");
      await user.click(within(card("c1")).getByRole("button", { name: "Delete comment" }));

      expect(cards()).toHaveLength(0);
      expect(bodyField()).toHaveValue("a long draft");
    });
  }
);

describe(
  "PolishStage list — leaving with unsaved work",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    const unload = (): boolean => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it("warns before the page unloads with a changed draft", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      expect(unload()).toBe(false);
      await user.keyboard("e");
      expect(unload()).toBe(false);
      await user.type(screen.getByRole("textbox", { name: "Comment body" }), " draft");
      expect(unload()).toBe(true);
    });

    it("warns before the page unloads while changes are still being saved", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("d");
      expect(unload()).toBe(true);
      await waitFor(() => {
        expect(fake.update).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(unload()).toBe(false);
      });
    });

    it("saves a changed draft when the stage goes away under it", async () => {
      const user = userEvent.setup();
      const { unmountStage } = renderStage(makeReview([makeComment("c1")]));

      await user.keyboard("e");
      await user.type(screen.getByRole("textbox", { name: "Comment body" }), " kept anyway");
      unmountStage();

      await waitFor(() => {
        expect(lastUpdatePayload()).toEqual({
          iteration_id: ITERATION_ID,
          iteration_comments: [{ id: "c1", body: "body of c1 kept anyway" }],
        });
      });
      expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    });
  }
);

describe(
  "PolishStage list — keys, bulk scope and undo",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    it("ignores triage keys while another dialog is open", async () => {
      const user = userEvent.setup();
      renderStage(makeReview([makeComment("c1")]));
      render(
        <div role="dialog" aria-modal="true" aria-label="Elsewhere">
          <button type="button">Inside</button>
        </div>
      );

      screen.getByRole("button", { name: "Inside" }).focus();
      await user.keyboard("d");
      await waitPastCoalescing();

      expect(isDismissed("c1")).toBe(false);
      expect(fake.update).not.toHaveBeenCalled();
    });

    it("/ opens search by the typed character, whatever key produces it", () => {
      renderStage(makeReview([makeComment("c1")]));

      // German layout: "/" is Shift+7.
      fireEvent.keyDown(document.body, { key: "/", code: "Digit7", shiftKey: true });

      expect(screen.getByRole("searchbox", { name: "Search comments" })).toHaveFocus();
    });

    it("bulk actions skip comments hidden in collapsed groups", async () => {
      const user = userEvent.setup();
      renderStage(
        makeReview([
          makeComment("a1", { file: "src/a.ts" }),
          makeComment("a2", { file: "src/a.ts", line: 11 }),
          makeComment("b1", { file: "src/b.ts" }),
        ])
      );

      await user.click(screen.getByRole("button", { name: "Group by file" }));
      await user.click(screen.getByRole("button", { name: "src/a.ts, 2 comments" }));
      expect(screen.getByText("1 of 3 shown")).toBeInTheDocument();
      await chooseBulkAction(user, "Dismiss shown comments");

      await waitFor(() => {
        expect(lastUpdatePayload()).toEqual({
          iteration_id: ITERATION_ID,
          iteration_comments: [{ id: "b1", status: "dismissed" }],
        });
      });
    });

    it("undo after restoring a deleted comment applies to the restored copy", async () => {
      const user = userEvent.setup();
      renderStage(
        makeReview([
          makeComment("c1", { severity: "major" }),
          makeComment("c2", { severity: "minor" }),
        ])
      );

      await user.keyboard("1");
      await waitPastCoalescing();
      await user.click(within(card("c1")).getByRole("button", { name: "Delete comment" }));
      await waitPastCoalescing();
      await user.keyboard("u");
      await waitFor(() => {
        expect(serverComments().map((c) => c.id)).toEqual(["c2", "new-1"]);
      });
      await user.keyboard("u");

      await waitFor(() => {
        expect(serverComments().find((c) => c.id === "new-1")?.severity).toBe("major");
      });
    });
  }
);

describe(
  "PolishStage list — virtualised list behaviour",
  { timeout: INTEGRATION_TEST_TIMEOUT_MS },
  () => {
    afterEach(() => {
      vi.restoreAllMocks();
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    });

    const tallLayout = (): void => {
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    };
    const many = (): Review =>
      makeReview(Array.from({ length: 120 }, (_, i) => makeComment(`c${String(i)}`)));

    it("does not scroll back to the focused card when the data changes", async () => {
      tallLayout();
      const scrollTo = vi.fn();
      Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        value: scrollTo,
      });
      const user = userEvent.setup();
      const { queryClient } = renderStage(many());

      await user.keyboard("jjj");
      await waitPastCoalescing();
      scrollTo.mockClear();
      // Another comment changes — e.g. a save elsewhere coming back from the server.
      act(() => {
        queryClient.setQueryData<Review>(reviewKeys.detail(REVIEW_ID), (review) =>
          review === undefined
            ? review
            : makeReview(
                (review.iterations[0]?.comments ?? []).map((c) =>
                  c.id === "c100" ? { ...c, body: "changed elsewhere" } : c
                )
              )
        );
      });
      await waitPastCoalescing();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("keeps the card being edited mounted when it scrolls out of view", async () => {
      tallLayout();
      const user = userEvent.setup();
      renderStage(many());

      await user.keyboard("e");
      await user.type(screen.getByRole("textbox", { name: "Comment body" }), " draft");
      const list = screen.getByLabelText("Comments");
      act(() => {
        list.scrollTop = 600 * 60;
        fireEvent.scroll(list);
      });

      expect(screen.getByRole("textbox", { name: "Comment body" })).toHaveValue("body of c0 draft");
    });
  }
);

describe("PolishStage pinned view — blank bodies", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("does not let an empty body be saved", async () => {
    const user = userEvent.setup();
    usePolishViewStore.setState({ viewMode: "pinned" });
    renderStage(makeReview([makeComment("c1")]));

    await user.clear(screen.getByRole("textbox", { name: "Edit comment body" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

// ── toolbar: menus, segmented controls, narrow layout ────────────────────────

describe("PolishStage list — toolbar", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const two = (): Review =>
    makeReview([
      makeComment("c1", { severity: "major" }),
      makeComment("c2", { severity: "minor" }),
    ]);

  it("1–4 in the open Bulk menu set the severity of every shown comment", async () => {
    const user = userEvent.setup();
    renderStage(two());

    await user.click(screen.getByRole("button", { name: "Bulk actions" }));
    await screen.findByRole("menu", { name: "Bulk actions" });
    await user.keyboard("4");

    await waitFor(() => {
      expect(lastUpdatePayload()).toEqual({
        iteration_id: ITERATION_ID,
        iteration_comments: [
          { id: "c1", severity: "suggestion" },
          { id: "c2", severity: "suggestion" },
        ],
      });
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the triage keys away from the comments while the Bulk menu is open", async () => {
    const user = userEvent.setup();
    renderStage(two());

    await user.click(screen.getByRole("button", { name: "Bulk actions" }));
    await screen.findByRole("menu", { name: "Bulk actions" });
    await user.keyboard("dj");
    await waitPastCoalescing();

    expect(isDismissed("c1")).toBe(false);
    expect(focusedId()).toBe("c1");
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("leaves the arrow keys to a segmented control and the letters to the list", async () => {
    const user = userEvent.setup();
    renderStage(two());

    screen.getByRole("radio", { name: "All" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Kept" })).toBeChecked();
    expect(focusedId()).toBe("c1");
    await user.keyboard("j");
    expect(focusedId()).toBe("c2");
  });

  it("moves status, file and grouping into Filters when the row is narrow", async () => {
    const user = userEvent.setup();
    // jsdom lays nothing out: report every box at two lines of controls, so the row wraps in
    // each layout and the toolbar settles on its tightest one.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 900, 72)
    );
    renderStage(
      makeReview([
        makeComment("a1", { file: "src/a.ts" }),
        makeComment("b1", { file: "src/b.ts", status: "dismissed" }),
      ])
    );

    expect(screen.queryByRole("combobox", { name: "Filter by file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Dismissed" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New comment" })).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const panel = await screen.findByRole("dialog", { name: "Filters" });
    await user.click(within(panel).getByRole("radio", { name: "Dismissed" }));
    expect(cardOrder()).toEqual(["b1"]);
    await user.click(within(panel).getByRole("switch", { name: "Group by file" }));

    expect(screen.getByRole("button", { name: "src/b.ts, 1 comment" })).toBeInTheDocument();
    expect(usePolishViewStore.getState().isGroupedByFile).toBe(true);
  });

  it("offers to clear the filters when nothing matches", async () => {
    const user = userEvent.setup();
    renderStage(two());

    await user.type(screen.getByRole("searchbox", { name: "Search comments" }), "nothing like it");
    const empty = screen.getByText("No comments match these filters").closest('[role="status"]');
    if (!(empty instanceof HTMLElement)) throw new Error("no empty state");
    await user.click(within(empty).getByRole("button", { name: "Clear filters" }));

    expect(cards()).toHaveLength(2);
    expect(screen.getByRole("searchbox", { name: "Search comments" })).toHaveValue("");
  });
});
