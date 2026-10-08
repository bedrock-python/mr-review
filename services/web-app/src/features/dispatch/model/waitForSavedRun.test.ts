import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRIEF_CONFIG, reviewKeys } from "@entities/review";
import { waitForSavedRun } from "./waitForSavedRun";
import type * as ReviewApiModule from "@entities/review/api/reviewApi";
import type { Review } from "@entities/review";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@entities/review/api/reviewApi", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewApiModule>();
  return { ...actual, reviewApi: { ...actual.reviewApi, ...api } };
});

const reviewAt = (stage: Review["iterations"][number]["stage"]): Review => ({
  id: REVIEW_ID,
  host_id: "44444444-4444-4444-8444-444444444444",
  repo_path: "group/project",
  mr_iid: 7,
  iterations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      number: 1,
      stage,
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
});

describe("waitForSavedRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads until no iteration is dispatching and leaves that review in the cache", async () => {
    api.get
      .mockResolvedValueOnce(reviewAt("dispatch"))
      .mockResolvedValueOnce(reviewAt("dispatch"))
      .mockResolvedValue(reviewAt("polish"));
    // Fake timers would otherwise garbage-collect the unobserved query before it is checked.
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

    const waiting = waitForSavedRun(qc, REVIEW_ID);
    await vi.runAllTimersAsync();
    await waiting;

    expect(api.get).toHaveBeenCalledTimes(3);
    expect(qc.getQueryData<Review>(reviewKeys.detail(REVIEW_ID))?.iterations[0]?.stage).toBe(
      "polish"
    );
  });

  it("gives up after a bounded number of reads", async () => {
    api.get.mockResolvedValue(reviewAt("dispatch"));
    const qc = new QueryClient();

    const waiting = waitForSavedRun(qc, REVIEW_ID);
    await vi.runAllTimersAsync();
    await waiting;

    expect(api.get).toHaveBeenCalledTimes(10);
  });

  it("stops at the first failed read", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await waitForSavedRun(qc, REVIEW_ID);

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
