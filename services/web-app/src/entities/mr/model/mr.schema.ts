import { z } from "zod";
import { PageMetaSchema } from "@shared/api";

export const RepoSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const MRStatusSchema = z.enum(["opened", "merged", "closed"]);
/** `state` filter of the MR list endpoint; `all` disables the filter. */
export const MRStateFilterSchema = z.enum(["opened", "merged", "closed", "all"]);
/** `scope` of the inbox endpoint: which relationship to the current user to list. */
export const InboxScopeSchema = z.enum(["all", "authored", "assigned", "review_requested"]);
export const PipelineStatusSchema = z.enum(["passed", "failed", "running", "none"]);

export const MRSchema = z.object({
  iid: z.number(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  source_branch: z.string(),
  target_branch: z.string(),
  status: MRStatusSchema,
  draft: z.boolean(),
  pipeline: PipelineStatusSchema.nullable(),
  // null: the host does not report diff stats in list views (e.g. GitHub).
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
  file_count: z.number().nullable(),
  web_url: z.string().default(""),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const DiffLineSchema = z.object({
  type: z.enum(["context", "added", "removed"]),
  old_line: z.number().nullable(),
  new_line: z.number().nullable(),
  content: z.string(),
});

export const DiffHunkSchema = z.object({
  old_start: z.number(),
  new_start: z.number(),
  old_count: z.number(),
  new_count: z.number(),
  lines: z.array(DiffLineSchema),
});

export const DiffFileSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable(),
  additions: z.number(),
  deletions: z.number(),
  hunks: z.array(DiffHunkSchema),
});

export const InboxMRSchema = MRSchema.extend({
  repo_path: z.string(),
});

export const RepoPageSchema = PageMetaSchema.extend({ items: z.array(RepoSchema) });
export const MRPageSchema = PageMetaSchema.extend({ items: z.array(MRSchema) });
export const InboxMRPageSchema = PageMetaSchema.extend({ items: z.array(InboxMRSchema) });

export type Repo = z.infer<typeof RepoSchema>;
export type MRStatus = z.infer<typeof MRStatusSchema>;
export type MRStateFilter = z.infer<typeof MRStateFilterSchema>;
export type InboxScope = z.infer<typeof InboxScopeSchema>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type MR = z.infer<typeof MRSchema>;
export type DiffLine = z.infer<typeof DiffLineSchema>;
export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type InboxMR = z.infer<typeof InboxMRSchema>;
export type DiffFile = z.infer<typeof DiffFileSchema>;
export type RepoPage = z.infer<typeof RepoPageSchema>;
export type MRPage = z.infer<typeof MRPageSchema>;
export type InboxMRPage = z.infer<typeof InboxMRPageSchema>;
