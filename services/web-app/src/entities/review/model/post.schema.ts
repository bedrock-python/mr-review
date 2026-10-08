import { z } from "zod";
import { CommentPostSchema, ReviewSchema } from "./review.schema";

/** How the severity heads each posted comment: "**Major** · …", "[major] …", or not at all. */
export const SeverityLabelSchema = z.enum(["bold", "tag", "off"]);

export const CommentPostResultSchema = z.object({
  comment_id: z.string().uuid(),
  post: CommentPostSchema,
});

/** Answer of POST /reviews/{id}/post. */
export const PostReviewResultSchema = z.object({
  // Comments this call put on the MR (inline or as general notes) and the ones it could not.
  posted: z.number(),
  failed: z.number(),
  // Kept comments already on the MR from an earlier post, not sent again.
  skipped: z.number(),
  // Kept comments whose last attempt was ambiguous, not sent again without resend_ambiguous.
  held_back: z.number().default(0),
  // Every kept comment is on the MR and the iteration is completed.
  completed: z.boolean(),
  results: z.array(CommentPostResultSchema).default([]),
  review: ReviewSchema,
});

export type SeverityLabel = z.infer<typeof SeverityLabelSchema>;
export type CommentPostResult = z.infer<typeof CommentPostResultSchema>;
export type PostReviewResult = z.infer<typeof PostReviewResultSchema>;
