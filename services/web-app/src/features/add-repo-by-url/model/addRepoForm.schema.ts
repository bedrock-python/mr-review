import { z } from "zod";

export const AddRepoFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "URL or path required")
    .refine(
      (value) => {
        const normalized = value.startsWith("http") ? value : value.replace(/^\/+/, "");
        const path = normalized.includes("://")
          ? normalized.split("://", 2)[1]?.split("/").slice(1).join("/") ?? ""
          : normalized;
        const segments = path
          .replace(/\.git$/u, "")
          .split("/")
          .filter(Boolean);
        return segments.length >= 2;
      },
      { message: "Provide a full URL or owner/repo path" }
    ),
});

export type AddRepoFormValues = z.infer<typeof AddRepoFormSchema>;
