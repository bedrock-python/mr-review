/**
 * Export/Import API client
 */

import { httpClient } from "./http-client";

export type ExportRequest = {
  include_hosts: boolean;
  include_ai_providers: boolean;
  include_reviews: boolean;
  encryption_password?: string | null;
};

export type ExportResponse = {
  version: string;
  exported_at: string;
  encrypted: boolean;
  hosts: unknown[];
  ai_providers: unknown[];
  reviews: unknown[];
};

export type ImportRequest = {
  version: string;
  exported_at: string;
  encrypted: boolean;
  hosts: unknown[];
  ai_providers: unknown[];
  reviews: unknown[];
  merge_strategy: "skip" | "replace" | "merge";
  decryption_password?: string | null;
};

export type ImportResponse = {
  hosts_imported: number;
  hosts_skipped: number;
  ai_providers_imported: number;
  ai_providers_skipped: number;
  reviews_imported: number;
  reviews_skipped: number;
  errors: string[];
};

export const exportImportApi = {
  /**
   * Export data (hosts, AI providers, reviews)
   */
  exportData: async (request: ExportRequest): Promise<ExportResponse> => {
    const response = await httpClient.post<ExportResponse>("/api/v1/data/export", request);
    return response.data;
  },

  /**
   * Import data from exported file
   */
  importData: async (request: ImportRequest): Promise<ImportResponse> => {
    const response = await httpClient.post<ImportResponse>("/api/v1/data/import", request);
    return response.data;
  },
};
