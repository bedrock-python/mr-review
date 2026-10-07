import { applyCommentPatch } from "./commentSync";
import type { CommentFieldPatch, CommentPatches } from "./commentSync";
import type { Comment } from "@entities/review";

const PATCHABLE_KEYS = ["status", "body", "severity", "resolved", "file", "line"] as const;
type PatchableKey = (typeof PATCHABLE_KEYS)[number];

export type PatchPlan = {
  /** Only the fields that actually change, per comment. */
  forward: Map<string, CommentFieldPatch>;
  /** The values those fields have now — re-applying them is the undo. */
  inverse: Map<string, CommentFieldPatch>;
};

const pick = (comment: Comment, keys: readonly PatchableKey[]): CommentFieldPatch =>
  Object.fromEntries(keys.map((key) => [key, comment[key]]));

export const planPatch = (comments: readonly Comment[], changes: CommentPatches): PatchPlan => {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const plan: PatchPlan = { forward: new Map(), inverse: new Map() };
  changes.forEach((patch, id) => {
    const before = byId.get(id);
    if (before === undefined) return;
    const after = applyCommentPatch(before, patch);
    const changed = PATCHABLE_KEYS.filter((key) => before[key] !== after[key]);
    if (changed.length === 0) return;
    plan.forward.set(id, pick(after, changed));
    plan.inverse.set(id, pick(before, changed));
  });
  return plan;
};
