import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@shared/api";
import type * as ExportImportApi from "@shared/api/export-import.api";
import type { ImportPreview, ImportResult } from "@shared/api/export-import.api";
import { ExportImportSection } from "./ExportImportSection";

const api = vi.hoisted(() => ({
  exportData: vi.fn(),
  previewImport: vi.fn(),
  importData: vi.fn(),
}));

vi.mock("@shared/api/export-import.api", async (importOriginal) => {
  const actual = await importOriginal<typeof ExportImportApi>();
  return { ...actual, exportImportApi: api };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const EXPORT_FILE = {
  version: "2.0",
  exported_at: "2026-10-08T10:00:00Z",
  encrypted: true,
  secrets: "encrypted",
  encryption: { kdf: "pbkdf2-sha256", iterations: 600000, salt: "c2FsdA==", check: "x" },
  hosts: [{ id: "h1" }],
  ai_providers: [],
  reviews: [{ id: "r1" }, { id: "r2" }],
};

const makePreview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  version: "2.0",
  exported_at: "2026-10-08T10:00:00Z",
  encrypted: true,
  secrets: "encrypted",
  hosts: { total: 1, existing: 1 },
  ai_providers: { total: 0, existing: 0 },
  reviews: { total: 2, existing: 0 },
  reviews_without_host: 0,
  ...overrides,
});

const IMPORT_RESULT: ImportResult = {
  hosts_imported: 0,
  hosts_updated: 1,
  hosts_skipped: 0,
  ai_providers_imported: 0,
  ai_providers_updated: 0,
  ai_providers_skipped: 0,
  reviews_imported: 2,
  reviews_updated: 0,
  reviews_skipped: 0,
  errors: [],
  warnings: [],
};

const renderSection = (): ReturnType<typeof userEvent.setup> => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExportImportSection />
    </QueryClientProvider>
  );
  return userEvent.setup();
};

const chooseFile = async (
  user: ReturnType<typeof userEvent.setup>,
  content: string,
  name = "backup.json"
): Promise<void> => {
  const input = screen.getByLabelText("Export file to import");
  await user.upload(input, new File([content], name, { type: "application/json" }));
};

const downloads: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  downloads.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("export", () => {
  it("encrypts by default and needs the passphrase twice", async () => {
    api.exportData.mockResolvedValue({ version: "2.0", exported_at: "2026-10-08T10:00:00Z" });
    const user = renderSection();
    const exportButton = screen.getByRole("button", { name: "Export data" });

    expect(screen.getByRole("radio", { name: /Encrypt with a passphrase/ })).toBeChecked();
    expect(exportButton).toBeDisabled();

    await user.type(screen.getByLabelText("Passphrase"), "s3cret");
    await user.type(screen.getByLabelText("Repeat passphrase"), "s3creX");
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(exportButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Repeat passphrase"));
    await user.type(screen.getByLabelText("Repeat passphrase"), "s3cret");
    await user.click(exportButton);

    await waitFor(() => {
      expect(api.exportData).toHaveBeenCalledWith({
        include_hosts: true,
        include_ai_providers: true,
        include_reviews: true,
        encryption_password: "s3cret",
      });
    });
    await waitFor(() => {
      expect(downloads).toEqual(["mr-review-export-20261008T100000Z.json"]);
    });
  });

  it("includes plain secrets only when that option is chosen", async () => {
    api.exportData.mockResolvedValue({ version: "2.0", exported_at: "2026-10-08T10:00:00Z" });
    const user = renderSection();

    await user.click(screen.getByRole("radio", { name: /Leave secrets out/ }));
    await user.click(screen.getByRole("button", { name: "Export data" }));
    await waitFor(() => {
      expect(api.exportData).toHaveBeenLastCalledWith({
        include_hosts: true,
        include_ai_providers: true,
        include_reviews: true,
      });
    });

    await user.click(screen.getByRole("radio", { name: /Include secrets in plain text/ }));
    expect(screen.getByRole("note")).toHaveTextContent("plain text");
    await user.click(screen.getByRole("button", { name: "Export data" }));
    await waitFor(() => {
      expect(api.exportData).toHaveBeenLastCalledWith({
        include_hosts: true,
        include_ai_providers: true,
        include_reviews: true,
        include_plain_secrets: true,
      });
    });
  });
});

describe("import", () => {
  it("previews a chosen file without importing it", async () => {
    api.previewImport.mockResolvedValue(makePreview());
    const user = renderSection();

    await chooseFile(user, JSON.stringify(EXPORT_FILE));

    const summary = await screen.findByLabelText("Import file summary");
    expect(within(summary).getByText("backup.json")).toBeInTheDocument();
    expect(within(summary).getByText("1 host (1 already here)")).toBeInTheDocument();
    expect(within(summary).getByText("2 reviews")).toBeInTheDocument();
    expect(api.previewImport).toHaveBeenCalledWith(EXPORT_FILE);
    expect(api.importData).not.toHaveBeenCalled();
  });

  it("rejects a file that is not JSON without calling the server", async () => {
    const user = renderSection();

    await chooseFile(user, "{oops");

    expect(await screen.findByRole("alert")).toHaveTextContent("not valid JSON");
    expect(api.previewImport).not.toHaveBeenCalled();
  });

  it("keeps the file after a wrong passphrase and shows a single error per attempt", async () => {
    api.previewImport.mockResolvedValue(makePreview());
    api.importData.mockRejectedValue(
      new ApiError("Wrong passphrase: it does not decrypt this file.", 400)
    );
    const user = renderSection();
    await chooseFile(user, JSON.stringify(EXPORT_FILE));
    const importButton = await screen.findByRole("button", { name: "Import…" });
    expect(importButton).toBeDisabled();

    await user.type(screen.getByLabelText("Passphrase of this file"), "wrong");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole("button", { name: "Import…" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Import" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent("Wrong passphrase");
    }

    expect(api.importData).toHaveBeenLastCalledWith({
      file: EXPORT_FILE,
      merge_strategy: "skip",
      decryption_password: "wrong",
    });
    expect(screen.getByLabelText("Import file summary")).toBeInTheDocument();
  });

  it("asks for an explicit acknowledgement before replacing existing records", async () => {
    api.previewImport.mockResolvedValue(makePreview({ encrypted: false, secrets: "plain" }));
    api.importData.mockResolvedValue(IMPORT_RESULT);
    const user = renderSection();
    await chooseFile(user, JSON.stringify({ ...EXPORT_FILE, encrypted: false }));

    await user.click(await screen.findByRole("radio", { name: /Replace existing/ }));
    await user.click(screen.getByRole("button", { name: "Import…" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Replace and import" });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(confirm);

    await waitFor(() => {
      expect(api.importData).toHaveBeenCalledWith({
        file: { ...EXPORT_FILE, encrypted: false },
        merge_strategy: "replace",
      });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Import file summary")).not.toBeInTheDocument();
    });
  });

  it("imports nothing when the confirmation is cancelled", async () => {
    api.previewImport.mockResolvedValue(makePreview({ encrypted: false, secrets: "plain" }));
    const user = renderSection();
    await chooseFile(user, JSON.stringify({ ...EXPORT_FILE, encrypted: false }));

    await user.click(await screen.findByRole("button", { name: "Import…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.importData).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Import file summary")).toBeInTheDocument();
  });
});
