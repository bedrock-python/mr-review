import { getReviewSource, isIterationPosted } from "@entities/review";
import type { Iteration, Review, ReviewStage } from "@entities/review";

/** Id of the region the stage tabs control; the page gives it to the active stage. */
export const STAGE_PANEL_ID = "review-stage-panel";
export const stageTabId = (stage: ReviewStage): string => `review-stage-tab-${stage}`;

export type StageDefinition = { id: ReviewStage; label: string; short: number };

export const STAGES: readonly StageDefinition[] = [
  { id: "pick", label: "Pick", short: 1 },
  { id: "brief", label: "Brief", short: 2 },
  { id: "dispatch", label: "Dispatch", short: 3 },
  { id: "polish", label: "Polish", short: 4 },
  { id: "post", label: "Post", short: 5 },
];

export const STAGE_ORDER: Record<ReviewStage, number> = {
  pick: 0,
  brief: 1,
  dispatch: 2,
  polish: 3,
  post: 4,
};

// A branch diff has no merge request: nothing to pick it from, nowhere to post it to.
const BRANCH_DIFF_STAGE_FALLBACK: Partial<Record<ReviewStage, ReviewStage>> = {
  pick: "brief",
  post: "polish",
};

export const isBranchDiffReview = (review: Review | undefined): boolean =>
  review !== undefined && getReviewSource(review).kind === "branch_diff";

export const isStageAvailable = (stage: ReviewStage, review: Review | undefined): boolean =>
  !isBranchDiffReview(review) || BRANCH_DIFF_STAGE_FALLBACK[stage] === undefined;

/** The iteration the URL names, else the latest one. */
export const resolveIteration = (
  review: Review | undefined,
  iterationId: string | null
): Iteration | null =>
  review?.iterations.find((it) => it.id === iterationId) ?? review?.iterations.at(-1) ?? null;

export type StageTarget = { stage: ReviewStage; iterationId: string | null };

/**
 * The stage and iteration a review should be shown at, given what the URL names.
 *
 * - No stage (a link from History, an old bookmark): resume where the review is.
 * - No or an unknown iteration: the latest one.
 * - Brief of a posted iteration: that iteration is frozen, so its posted stage instead;
 *   a new round is started from the stage bar, which creates the iteration.
 *
 * Applying it to its own result changes nothing, so the URL settles after one redirect.
 */
export const normaliseStageTarget = (
  review: Review,
  stage: ReviewStage | null,
  iterationId: string | null
): StageTarget => {
  const latest = review.iterations.at(-1) ?? null;
  let iteration = review.iterations.find((it) => it.id === iterationId) ?? null;
  let next: ReviewStage;
  if (stage === null) {
    iteration = latest;
    next = latest?.stage ?? "pick";
  } else {
    next = stage;
    if (iteration === null && (next !== "pick" || iterationId !== null)) iteration = latest;
  }
  if (next === "brief" && iteration !== null && isIterationPosted(iteration)) {
    next = iteration.stage;
  }
  if (isBranchDiffReview(review)) next = BRANCH_DIFF_STAGE_FALLBACK[next] ?? next;
  return { stage: next, iterationId: iteration?.id ?? null };
};
