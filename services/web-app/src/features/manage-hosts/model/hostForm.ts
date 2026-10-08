import { z } from "zod";
import { HOST_COLORS, HostTypeSchema } from "@entities/host";
import type { HostColorId } from "@entities/host";

/** The bounds the server accepts for a host's request timeout, in seconds. */
export const HOST_TIMEOUT_LIMITS = { min: 1, max: 600 } as const;
const DEFAULT_HOST_TIMEOUT_S = 30;

const timeout = z
  .number()
  .int()
  .min(HOST_TIMEOUT_LIMITS.min, "Must be at least 1")
  .max(HOST_TIMEOUT_LIMITS.max, "Max 600s");

/** A new host: every field, the token included. */
export const CreateHostFormSchema = z.object({
  name: z.string().min(1, "Name required"),
  type: HostTypeSchema,
  base_url: z.string().url("Must be a valid URL"),
  token: z.string().min(1, "Token required"),
  colorId: z.string(),
  timeout,
});

/** An existing host: its type is fixed, and an empty token keeps the saved one. */
export const EditHostFormSchema = CreateHostFormSchema.extend({ token: z.string() });

/** What both forms hold. */
export type HostFormValues = z.infer<typeof CreateHostFormSchema>;

export const EMPTY_HOST_FORM: HostFormValues = {
  name: "",
  type: "gitlab",
  base_url: "",
  token: "",
  colorId: HOST_COLORS[0].id satisfies HostColorId,
  timeout: DEFAULT_HOST_TIMEOUT_S,
};
