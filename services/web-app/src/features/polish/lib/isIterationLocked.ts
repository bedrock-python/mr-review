import type { Iteration } from "@entities/review";

/** A posted iteration is frozen: the server refuses to add or delete its comments. */
export const isIterationLocked = (iteration: Iteration): boolean =>
  iteration.completed_at !== null || iteration.stage === "post";
