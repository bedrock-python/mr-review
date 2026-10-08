import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@shared/api";
import { createQueryClientWrapper, createTestQueryClient } from "@shared/lib/test-utils";
import { reviewApi } from "../api/reviewApi";
import { DEFAULT_BRIEF_CONFIG } from "./review.schema";
import {
  useCreateIteration,
  useCreateReview,
  useReview,
  useReviews,
  useUpdateReview,
} from "./useReviews";
import type { Review } from "./review.schema";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError, warning: vi.fn() } }));

const REVIEW: Review = {
  id: "11111111-1111-4111-8111-111111111111",
  host_id: "22222222-2222-4222-8222-222222222222",
  repo_path: "group/repo",
  mr_iid: 12,
  iterations: [],
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
};

const ITERATION = {
  id: "33333333-3333-4333-8333-333333333333",
  number: 1,
  stage: "brief" as const,
  comments: [],
  ai_provider_id: null,
  model: null,
  brief_config: DEFAULT_BRIEF_CONFIG,
  created_at: "2026-05-16T10:00:00+00:00",
  completed_at: null,
};

/** Renders the history list and a mutation hook against one query client. */
const renderWithList = <T,>(useMutationHook: () => T) => {
  const wrapper = createQueryClientWrapper(createTestQueryClient());
  return renderHook(() => ({ list: useReviews(), mutation: useMutationHook() }), { wrapper });
};

describe("review mutations keep the history list current", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastError.mockClear();
  });

  it("refetches the list after a review is created", async () => {
    const list = vi.spyOn(reviewApi, "list").mockResolvedValueOnce([]).mockResolvedValue([REVIEW]);
    vi.spyOn(reviewApi, "create").mockResolvedValue(REVIEW);
    const { result } = renderWithList(useCreateReview);
    await waitFor(() => {
      expect(result.current.list.data).toEqual([]);
    });

    await act(() =>
      result.current.mutation.mutateAsync({
        host_id: REVIEW.host_id,
        repo_path: "group/repo",
        mr_iid: 12,
      })
    );

    await waitFor(() => {
      expect(result.current.list.data).toEqual([REVIEW]);
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("refetches the list after an iteration is started", async () => {
    const withIteration = { ...REVIEW, iterations: [ITERATION] };
    vi.spyOn(reviewApi, "list").mockResolvedValueOnce([REVIEW]).mockResolvedValue([withIteration]);
    vi.spyOn(reviewApi, "createIteration").mockResolvedValue(withIteration);
    const { result } = renderWithList(useCreateIteration);
    await waitFor(() => {
      expect(result.current.list.data).toEqual([REVIEW]);
    });

    await act(() => result.current.mutation.mutateAsync({ reviewId: REVIEW.id }));

    await waitFor(() => {
      expect(result.current.list.data?.[0]?.iterations).toHaveLength(1);
    });
  });

  it("refetches the list after a review is updated", async () => {
    const updated = { ...REVIEW, iterations: [{ ...ITERATION, stage: "polish" as const }] };
    vi.spyOn(reviewApi, "list").mockResolvedValueOnce([REVIEW]).mockResolvedValue([updated]);
    vi.spyOn(reviewApi, "update").mockResolvedValue(updated);
    const { result } = renderWithList(() => useUpdateReview(REVIEW.id));
    await waitFor(() => {
      expect(result.current.list.data).toEqual([REVIEW]);
    });

    await act(() => result.current.mutation.mutateAsync({ iteration_id: ITERATION.id }));

    await waitFor(() => {
      expect(result.current.list.data?.[0]?.iterations[0]?.stage).toBe("polish");
    });
  });

  it("explains a brief refused because the iteration was posted", async () => {
    vi.spyOn(reviewApi, "list").mockResolvedValue([REVIEW]);
    vi.spyOn(reviewApi, "update").mockRejectedValue(new ApiError("already posted", 409));
    const { result } = renderWithList(() => useUpdateReview(REVIEW.id));

    await act(async () => {
      await result.current.mutation
        .mutateAsync({ brief_config: DEFAULT_BRIEF_CONFIG })
        .catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith(
      "This iteration was already posted",
      expect.objectContaining({ description: expect.stringContaining("new round") as unknown })
    );
  });
});

describe("a review fetch in flight while the review changes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not put the copy it fetched over the newer one a mutation stored", async () => {
    const withIteration = { ...REVIEW, iterations: [ITERATION] };
    let answerSlowFetch: (review: Review) => void = () => undefined;
    vi.spyOn(reviewApi, "get")
      .mockResolvedValueOnce(REVIEW)
      .mockImplementationOnce(
        () =>
          new Promise<Review>((resolve) => {
            answerSlowFetch = resolve;
          })
      );
    vi.spyOn(reviewApi, "createIteration").mockResolvedValue(withIteration);
    const wrapper = createQueryClientWrapper(createTestQueryClient());
    const { result } = renderHook(
      () => ({ review: useReview(REVIEW.id), mutation: useCreateIteration() }),
      { wrapper }
    );
    await waitFor(() => {
      expect(result.current.review.data).toEqual(REVIEW);
    });

    // A refetch leaves before the iteration is created and answers after it.
    void result.current.review.refetch();
    await act(() => result.current.mutation.mutateAsync({ reviewId: REVIEW.id }));
    await act(async () => {
      answerSlowFetch(REVIEW);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.review.data?.iterations).toHaveLength(1);
  });
});
