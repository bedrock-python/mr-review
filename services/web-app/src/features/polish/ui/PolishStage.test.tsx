import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import type * as ReviewEntity from "@entities/review";
import type { Comment, Review } from "@entities/review";
import { PolishStage } from "./PolishStage";

const mocks = vi.hoisted(() => ({ review: undefined as Review | undefined }));

vi.mock("@app/navigation", () => ({
  useNav: () => ({ activeReviewId: "11111111-1111-4111-8111-111111111111" }),
}));

vi.mock("@widgets/stage-bar", () => ({
  useStageBarStore: () => ({
    setStage: () => undefined,
    activeIterationId: "22222222-2222-4222-8222-222222222222",
  }),
}));

vi.mock("@entities/review", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewEntity>();
  return {
    ...actual,
    useReview: () => ({ data: mocks.review, isLoading: false }),
    reviewApi: { ...actual.reviewApi, getDiff: () => Promise.resolve("") },
  };
});

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

const makeReview = (comments: Comment[]): Review => ({
  id: "11111111-1111-4111-8111-111111111111",
  host_id: "33333333-3333-4333-8333-333333333333",
  repo_path: "group/project",
  mr_iid: 7,
  iterations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      number: 1,
      stage: "polish",
      comments,
      ai_provider_id: null,
      model: null,
      brief_config: DEFAULT_BRIEF_CONFIG,
      created_at: "2026-05-16T10:00:00+00:00",
      completed_at: null,
    },
  ],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

const renderStage = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PolishStage />
    </QueryClientProvider>
  );
};

const editorTextarea = (): HTMLTextAreaElement =>
  screen.getByRole("textbox", { name: "Edit comment body" });

describe("PolishStage comment navigation", () => {
  beforeEach(() => {
    mocks.review = makeReview([makeComment("c1"), makeComment("c2"), makeComment("c3")]);
  });

  it("loads the next comment into the editor", async () => {
    const user = userEvent.setup();
    renderStage();

    expect(editorTextarea()).toHaveValue("body of c1");

    await user.click(screen.getByRole("button", { name: "Next comment" }));

    expect(editorTextarea()).toHaveValue("body of c2");
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("drops edits of the previous comment instead of carrying them over", async () => {
    const user = userEvent.setup();
    renderStage();

    await user.clear(editorTextarea());
    await user.type(editorTextarea(), "unsaved draft");
    await user.click(screen.getByRole("button", { name: "Next comment" }));

    expect(editorTextarea()).toHaveValue("body of c2");
  });

  it("returns to the previous comment", async () => {
    const user = userEvent.setup();
    renderStage();

    await user.click(screen.getByRole("button", { name: "Next comment" }));
    await user.click(screen.getByRole("button", { name: "Previous comment" }));

    expect(editorTextarea()).toHaveValue("body of c1");
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("disables the arrows at both ends of the sequence", async () => {
    const user = userEvent.setup();
    renderStage();

    expect(screen.getByRole("button", { name: "Previous comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next comment" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next comment" }));
    await user.click(screen.getByRole("button", { name: "Next comment" }));

    expect(screen.getByRole("button", { name: "Next comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous comment" })).not.toBeDisabled();
  });

  it("keeps dismissed comments in the sequence", async () => {
    mocks.review = makeReview([
      makeComment("c1", { status: "dismissed" }),
      makeComment("c2"),
      makeComment("c3"),
    ]);
    const user = userEvent.setup();
    renderStage();

    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous comment" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next comment" }));

    expect(editorTextarea()).toHaveValue("body of c2");
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });
});
