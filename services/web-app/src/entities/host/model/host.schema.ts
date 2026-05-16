import { z } from "zod";

export const HostTypeSchema = z.enum(["gitlab", "github", "gitea", "forgejo", "bitbucket"]);

export const HostSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: HostTypeSchema,
  base_url: z.string().url(),
  color: z.string().nullable().optional(),
  favourite_repos: z.array(z.string()).default([]),
  timeout: z.number().int().positive().default(30),
  created_at: z.string().datetime({ offset: true }),
});

export const CreateHostSchema = z.object({
  name: z.string().min(1, "Name required"),
  type: HostTypeSchema,
  base_url: z.string().url("Must be a valid URL"),
  token: z.string().min(1, "Token required"),
  color: z.string().nullable().optional(),
  timeout: z.number().int().min(1, "Must be at least 1").max(600, "Max 600s").default(30),
});

export const UpdateHostSchema = z.object({
  name: z.string().min(1, "Name required").optional(),
  base_url: z.string().url("Must be a valid URL").optional(),
  token: z.string().min(1, "Token required").optional().or(z.literal("")),
  color: z.string().nullable().optional(),
  timeout: z.number().int().min(1, "Must be at least 1").max(600, "Max 600s").optional(),
});

export type HostType = z.infer<typeof HostTypeSchema>;
export type Host = z.infer<typeof HostSchema>;
export type CreateHost = z.infer<typeof CreateHostSchema>;
export type UpdateHost = z.infer<typeof UpdateHostSchema>;
