import { z } from "zod";

export const HostTypeSchema = z.enum(["gitlab", "github", "gitea", "forgejo", "bitbucket"]);

export const HostSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: HostTypeSchema,
  base_url: z.string().url(),
  created_at: z.string().datetime({ offset: true }),
});

export const CreateHostSchema = z.object({
  name: z.string().min(1, "Name required"),
  type: HostTypeSchema,
  base_url: z.string().url("Must be a valid URL"),
  token: z.string().min(1, "Token required"),
});

export const UpdateHostSchema = z.object({
  name: z.string().min(1, "Name required").optional(),
  base_url: z.string().url("Must be a valid URL").optional(),
  token: z.string().min(1, "Token required").optional(),
});

export type HostType = z.infer<typeof HostTypeSchema>;
export type Host = z.infer<typeof HostSchema>;
export type CreateHost = z.infer<typeof CreateHostSchema>;
export type UpdateHost = z.infer<typeof UpdateHostSchema>;
