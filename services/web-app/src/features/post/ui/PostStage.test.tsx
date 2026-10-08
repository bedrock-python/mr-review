import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG } from "@entities/review";
import type { Comment, CommentPost, PostReviewResult, Review } from "@entities/review";
import { httpClient } from "@shared/api";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { PostStage } from "./PostStage";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ITERATION_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "33333333-3333-4333-8333-333333333333";
const POSTED_AT = "2026-10-08T10:00:00+00:00";
const REVIEW_URL = `/api/v1/reviews/${REVIEW_ID}`;
const POST_URL = `${REVIEW_URL}/post`;

vi.mock("@app/navigation", () => ({
  useNav: () => ({
    activeReviewId: "11111111-1111-4111-8111-111111111111",
    selectedHostId: "33333333-3333-4333-8333-333333333333",
    selectedRepoPath: "group/repo",
    selectedMRIid: 7,
    clearMR: () => undefined,
  }),
}));

vi.mock("@widgets/stage-bar", () => ({
  useStageBarStore: (select: (s: { activeIterationId: string }) => unknown) =>
    select({ activeIterationId: "22222222-2222-4222-8222-222222222222" }),
}));

vi.mock("@entities/mr", () => ({
  useMR: () => ({ data: { web_url: "https://gitlab.example.com/group/repo/-/merge_requests/7" } }),
}));

vi.mock("@entities/host", () => ({
  useHosts: () => ({
    data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Company GitLab" }],
  }),
}));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const makeComment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  file: "src/app.py",
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
  host_id: HOST_ID,
  repo_path: "group/repo",
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
      created_at: POSTED_AT,
      completed_at: completedAt,
    },
  ],
  created_at: POSTED_AT,
  updated_at: POSTED_AT,
});

const inline: CommentPost = {
  outcome: "inline",
  at: POSTED_AT,
  note_id: "1",
  url: null,
  reason: null,
  failure_kind: null,
};
const note: CommentPost = {
  outcome: "general_note",
  at: POSTED_AT,
  note_id: "2",
  url: null,
  reason: null,
  failure_kind: null,
};
const failed: CommentPost = {
  outcome: "failed",
  at: POSTED_AT,
  note_id: null,
  url: null,
  reason: "401 Unauthorized: Bad credentials",
  failure_kind: "rejected",
};
const ambiguous: CommentPost = {
  ...failed,
  reason: "ReadTimeout talking to the host; the host may have posted it anyway",
  failure_kind: "ambiguous",
};

const unposted = (): Comment[] => [
  makeComment(A),
  makeComment(B, { file: null, line: null, severity: "minor" }),
];

const allPosted = (): Review =>
  makeReview(
    [makeComment(A, { post: inline }), makeComment(B, { file: null, line: null, post: note })],
    POSTED_AT
  );

const answer = (review: Review, posted: number, failedCount = 0): PostReviewResult => ({
  posted,
  failed: failedCount,
  skipped: 0,
  held_back: 0,
  completed: failedCount === 0,
  results: [],
  review,
});

let http: MockAdapter;
let storedReview: Review;

const renderStage = (review: Review): void => {
  storedReview = review;
  renderWithQueryClient(
    <>
      <PostStage />
      <Toaster />
    </>
  );
};

const sentBody = (index = 0): Record<string, unknown> =>
  JSON.parse(String(http.history.post[index]?.data)) as Record<string, unknown>;

describe("PostStage", () => {
  beforeEach(() => {
    http = new MockAdapter(httpClient);
    http.onGet(REVIEW_URL).reply(() => [200, storedReview]);
    const store = new Map<string, string>();
    // Node's own localStorage global shadows jsdom's; give the test a working one.
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  afterEach(() => {
    http.restore();
    vi.unstubAllGlobals();
  });

  it("shows real target details and no placeholder values", async () => {
    renderStage(makeReview(unposted()));

    expect(await screen.findByText("Ready to post")).toBeInTheDocument();
    expect(screen.getByText("Company GitLab")).toBeInTheDocument();
    expect(screen.queryByText(/api token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/schema OK/i)).not.toBeInTheDocument();
    expect(screen.getByText("2 comments")).toBeInTheDocument();
  });

  it("previews the comments file by file, and the JSON payload on request", async () => {
    renderStage(makeReview(unposted()));

    const preview = await screen.findByRole("region", { name: "Preview" });
    const file = within(preview).getByRole("region", { name: "src/app.py" });
    expect(within(file).getByText(`body of ${A}`)).toBeInTheDocument();
    const notes = within(preview).getByRole("region", { name: "General notes" });
    expect(within(notes).getByText(`body of ${B}`)).toBeInTheDocument();

    await userEvent.click(within(preview).getByRole("button", { name: "View JSON" }));

    expect(within(preview).getByText(/"target": "group\/repo !7"/)).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole("button", { name: "View dry run" }));
    expect(within(preview).getByRole("region", { name: "src/app.py" })).toBeInTheDocument();
  });

  it("offers the way back to Polish instead of posting nothing", async () => {
    renderStage(makeReview([makeComment(A, { status: "dismissed" })]));

    const callout = (await screen.findByText("Nothing to post")).closest("[role=note]");
    expect(callout).not.toBeNull();
    expect(
      within(callout as HTMLElement).getByRole("button", { name: "Back to Polish" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^Post 0 comments/ })).toBeDisabled();
  });

  it("posts with the chosen options, waits long enough, and shows what landed", async () => {
    http.onPost(POST_URL).reply(200, answer(allPosted(), 2));
    renderStage(makeReview(unposted()));

    await userEvent.selectOptions(await screen.findByRole("combobox"), "tag");
    await userEvent.click(screen.getByRole("button", { name: /Post 2 comments/ }));

    expect(await screen.findByText("Posted to !7")).toBeInTheDocument();
    expect(sentBody()).toEqual({
      iteration_id: ITERATION_ID,
      fallback_to_general_note: true,
      severity_label: "tag",
      force: false,
      resend_ambiguous: false,
    });
    // The client used to give up after 30 s while the server kept posting.
    expect(http.history.post[0]?.timeout).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(screen.getByText(/^Posted at /)).toBeInTheDocument();
    expect(localStorage.getItem("mr-review:post:severity-label")).toBe("tag");
    expect(await screen.findByText("Posted 2 comments")).toBeInTheDocument();
  });

  it("after a reload shows a completed iteration as posted, with counts from the stored records", async () => {
    renderStage(allPosted());

    expect(await screen.findByText("Posted to !7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Post / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry failed/ })).not.toBeInTheDocument();
    const counts = screen.getByRole("list", { name: "Post counts" });
    const stat = (label: string): string | null =>
      within(counts).getByText(label).previousElementSibling?.textContent ?? null;
    expect([stat("Inline"), stat("General"), stat("Failed")]).toEqual(["1", "1", "0"]);
    expect(screen.getByRole("link", { name: /Open MR in browser/ })).toHaveAttribute(
      "href",
      "https://gitlab.example.com/group/repo/-/merge_requests/7"
    );
  });

  it("reports a partial post with the reason and retries only on request", async () => {
    const retried = makeReview(
      [makeComment(A, { post: inline }), makeComment(B, { post: { ...note, reason: "moved" } })],
      POSTED_AT
    );
    http.onPost(POST_URL).reply(200, answer(retried, 1));
    renderStage(makeReview([makeComment(A, { post: inline }), makeComment(B, { post: failed })]));

    expect(await screen.findByText("Partly posted to !7")).toBeInTheDocument();
    const failures = screen.getByRole("list", { name: "Failed comments" });
    expect(within(failures).getByText(failed.reason ?? "")).toBeInTheDocument();
    expect(http.history.post).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Retry failed (1)" }));

    expect(await screen.findByText("Posted to !7")).toBeInTheDocument();
    expect(http.history.post).toHaveLength(1);
    expect(sentBody()).toMatchObject({ resend_ambiguous: false });
  });

  it("marks comments that may already be on the MR and asks before sending them again", async () => {
    http.onPost(POST_URL).reply(200, answer(allPosted(), 1));
    renderStage(
      makeReview([makeComment(A, { post: inline }), makeComment(B, { post: ambiguous })])
    );

    const failures = await screen.findByRole("list", { name: "Failed comments" });
    expect(within(failures).getByText("May already be on the MR")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry failed (1)" }));
    const confirm = screen.getByRole("dialog", { name: "Send it again?" });
    expect(within(confirm).getByText(/may already be on the MR/)).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(http.history.post).toHaveLength(0);

    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(http.history.post).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Retry failed (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Post it again" }));

    expect(await screen.findByText("Posted to !7")).toBeInTheDocument();
    expect(sentBody()).toMatchObject({ resend_ambiguous: true });
  });

  it("shows the server's refusal instead of a success screen", async () => {
    http.onPost(POST_URL).reply(409, { detail: "Iteration 1 was already posted at 2026-10-08" });
    renderStage(makeReview(unposted()));

    await userEvent.click(await screen.findByRole("button", { name: /Post 2 comments/ }));

    expect(await screen.findByText("Failed to post comments")).toBeInTheDocument();
    expect(screen.getByText(/already posted/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Ready to post")).toBeInTheDocument();
    });
  });
});
