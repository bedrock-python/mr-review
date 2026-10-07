/**
 * Export/Import API client
 */

import { z } from "zod";

import { httpClient } from "./http-client";

// Exports and imports move the whole store and an import fsyncs every record it writes.
const DATA_TRANSFER_TIMEOUT_MS = 300_000;

export type MergeStrategy = "skip" | "merge" | "replace";
export type SecretsMode = "encrypted" | "plain" | "omitted";

export type ExportRequest = {
  include_hosts: boolean;
  include_ai_providers: boolean;
  include_reviews: boolean;
  /** Encrypts host tokens and provider API keys with this passphrase. */
  encryption_password?: string;
  /** Writes tokens and API keys in plain text. Without it and without a passphrase they are left out. */
  include_plain_secrets?: boolean;
};

/** An export file, kept exactly as the backend wrote it so it can be sent back on import. */
export const ExportFileSchema = z.looseObject({
  version: z.string(),
  exported_at: z.string(),
  encrypted: z.boolean().optional(),
});

export type ExportFile = z.infer<typeof ExportFileSchema>;

const PreviewCountsSchema = z.object({
  total: z.number(),
  existing: z.number(),
});

export const ImportPreviewSchema = z.object({
  version: z.string(),
  exported_at: z.string(),
  encrypted: z.boolean(),
  secrets: z.enum(["encrypted", "plain", "omitted"]),
  hosts: PreviewCountsSchema,
  ai_providers: PreviewCountsSchema,
  reviews: PreviewCountsSchema,
  reviews_without_host: z.number(),
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;
export type ImportPreviewCounts = z.infer<typeof PreviewCountsSchema>;

export const ImportResultSchema = z.object({
  hosts_imported: z.number(),
  hosts_updated: z.number(),
  hosts_skipped: z.number(),
  ai_providers_imported: z.number(),
  ai_providers_updated: z.number(),
  ai_providers_skipped: z.number(),
  reviews_imported: z.number(),
  reviews_updated: z.number(),
  reviews_skipped: z.number(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

export type ImportRequest = {
  file: ExportFile;
  merge_strategy: MergeStrategy;
  decryption_password?: string;
};

export const exportImportApi = {
  /** Export hosts, AI providers and reviews as one file. */
  exportData: async (request: ExportRequest): Promise<ExportFile> => {
    const response = await httpClient.post<unknown>("/api/v1/data/export", request, {
      timeout: DATA_TRANSFER_TIMEOUT_MS,
    });
    return ExportFileSchema.parse(response.data);
  },

  /** Validate an export file and count what it holds and what already exists. Writes nothing. */
  previewImport: async (file: ExportFile): Promise<ImportPreview> => {
    const response = await httpClient.post<unknown>("/api/v1/data/import/preview", file, {
      timeout: DATA_TRANSFER_TIMEOUT_MS,
    });
    return ImportPreviewSchema.parse(response.data);
  },

  /** Import an export file with the chosen merge strategy. */
  importData: async ({
    file,
    merge_strategy,
    decryption_password,
  }: ImportRequest): Promise<ImportResult> => {
    const response = await httpClient.post<unknown>(
      "/api/v1/data/import",
      { ...file, merge_strategy, decryption_password: decryption_password ?? null },
      { timeout: DATA_TRANSFER_TIMEOUT_MS }
    );
    return ImportResultSchema.parse(response.data);
  },
};
