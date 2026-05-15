import { z } from "zod";

export const HostTypeSchema = z.enum(["gitlab", "github"]);

export const HostSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: HostTypeSchema,
  base_url: z.string().url(),
  token: z.string(),
  created_at: z.string().datetime(),
});

export const CreateHostSchema = z.object({
  name: z.string().min(1, "Name required"),
  type: HostTypeSchema,
  base_url: z.string().url("Must be a valid URL"),
  token: z.string().min(1, "Token required"),
});

export type HostType = z.infer<typeof HostTypeSchema>;
export type Host = z.infer<typeof HostSchema>;
export type CreateHost = z.infer<typeof CreateHostSchema>;
