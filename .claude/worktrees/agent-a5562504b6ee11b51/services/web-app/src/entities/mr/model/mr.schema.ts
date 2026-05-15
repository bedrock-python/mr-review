import { z } from "zod";

export const RepoSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const MRStatusSchema = z.enum(["opened", "merged", "closed"]);
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
  additions: z.number(),
  deletions: z.number(),
  file_count: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
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

export type Repo = z.infer<typeof RepoSchema>;
export type MRStatus = z.infer<typeof MRStatusSchema>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type MR = z.infer<typeof MRSchema>;
export type DiffLine = z.infer<typeof DiffLineSchema>;
export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type DiffFile = z.infer<typeof DiffFileSchema>;
