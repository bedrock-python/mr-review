import { z } from "zod";

import { CreateHostSchema, UpdateHostSchema } from "@entities/host";
import type { HostType } from "@entities/host";

export const UpdateHostFormSchema = UpdateHostSchema.extend({ colorId: z.string() });
export type UpdateHostFormValues = z.infer<typeof UpdateHostFormSchema>;

export const CreateHostFormSchema = CreateHostSchema.extend({
  colorId: z.string(),
  timeout: z.number().int().min(1, "Must be at least 1").max(600, "Max 600s"),
});
export type CreateHostFormValues = z.infer<typeof CreateHostFormSchema>;

export const HOST_TYPE_LABELS: Record<HostType, string> = {
  gitlab: "GitLab",
  github: "GitHub",
  gitea: "Gitea",
  forgejo: "Forgejo",
  bitbucket: "Bitbucket",
};
