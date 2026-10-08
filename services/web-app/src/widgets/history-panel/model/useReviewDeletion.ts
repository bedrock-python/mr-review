import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reviewKeys, useDeleteReview } from "@entities/review";
import type { Review } from "@entities/review";

const SEARCH = Symbol("search");

export type ReviewDeletion = {
  /** From the confirmed Delete until the row is gone; a failed delete clears it. */
  isDeleting: (reviewId: string) => boolean;
  deleteReview: (review: Review) => void;
  /** The ref callback for a row's open button: focus lands there after a neighbour goes. */
  openButtonRef: (reviewId: string) => (button: HTMLButtonElement | null) => void;
};

export type UseReviewDeletionParams = {
  /** Review ids in the order the rows are shown. */
  shownIds: readonly string[];
  searchRef: React.RefObject<HTMLInputElement | null>;
  onDeleted: (review: Review) => void;
};

/**
 * Deletes a review from the history list. The row says "deleting" until it is gone from the
 * list, so a second click cannot send a second DELETE; then focus moves to the next row, else
 * the previous one, else the search box, instead of falling to the drawer.
 */
export const useReviewDeletion = ({
  shownIds,
  searchRef,
  onDeleted,
}: UseReviewDeletionParams): ReviewDeletion => {
  const queryClient = useQueryClient();
  const mutation = useDeleteReview();
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());
  // Where focus goes once the deleted row has left the list.
  const focusTarget = useRef<string | typeof SEARCH | null>(null);
  const openButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const button = target === SEARCH ? undefined : openButtons.current.get(target);
    (button ?? searchRef.current)?.focus();
  }, [shownIds, searchRef]);

  const deleteReview = (review: Review): void => {
    if (deletingIds.has(review.id)) return;
    const index = shownIds.indexOf(review.id);
    const neighbour = shownIds[index + 1] ?? (index > 0 ? shownIds[index - 1] : undefined);
    setDeletingIds((ids) => new Set(ids).add(review.id));
    mutation.mutate(review.id, {
      onSuccess: () => {
        focusTarget.current = neighbour ?? SEARCH;
        // Off the list now, not after the refetch: the row must not come back clickable.
        queryClient.setQueryData<Review[]>(reviewKeys.lists(), (list) =>
          list?.filter((r) => r.id !== review.id)
        );
        onDeleted(review);
      },
      onError: () => {
        setDeletingIds((ids) => {
          const next = new Set(ids);
          next.delete(review.id);
          return next;
        });
      },
    });
  };

  return {
    isDeleting: (reviewId) => deletingIds.has(reviewId),
    deleteReview,
    openButtonRef: (reviewId) => (button) => {
      if (button) openButtons.current.set(reviewId, button);
      else openButtons.current.delete(reviewId);
    },
  };
};
