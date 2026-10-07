import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import type { AIProvider } from "@entities/ai-provider";
import type * as AIProviderEntity from "@entities/ai-provider";
import type * as HostEntity from "@entities/host";
import type * as SharedApi from "@shared/api";

const providerHooks = vi.hoisted(() => ({
  providers: [] as AIProvider[],
  create: vi.fn(),
  update: vi.fn(),
  previewModels: vi.fn(),
}));

vi.mock("@entities/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof AIProviderEntity>();
  return {
    ...actual,
    aiProviderApi: { ...actual.aiProviderApi, previewModels: providerHooks.previewModels },
    useAIProviders: () => ({ data: providerHooks.providers, isLoading: false }),
    useCreateAIProvider: () => ({ mutate: providerHooks.create, isPending: false }),
    useUpdateAIProvider: () => ({ mutate: providerHooks.update, isPending: false }),
    useDeleteAIProvider: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("@entities/host", async (importOriginal) => {
  const actual = await importOriginal<typeof HostEntity>();
  const mutation = (): { mutate: () => void; isPending: boolean } => ({
    mutate: vi.fn(),
    isPending: false,
  });
  return {
    ...actual,
    useHosts: () => ({ data: [], isLoading: false }),
    useCreateHost: mutation,
    useUpdateHost: mutation,
    useDeleteHost: mutation,
  };
});

vi.mock("@features/export-import", () => ({ ExportImportSection: () => null }));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));

vi.mock("@shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedApi>();
  return { ...actual, systemApi: { getInfo: () => new Promise(() => undefined) } };
});

const PROVIDER: AIProvider = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Team Claude",
  type: "claude",
  base_url: "",
  models: ["claude-opus-5-5", "claude-haiku-4-5"],
  ssl_verify: true,
  timeout: 60,
  created_at: "2026-05-16T10:00:00+00:00",
};

const renderPage = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const configuredModels = (): string[] =>
  within(screen.getByRole("list", { name: "Configured models" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".mono")?.textContent ?? "");

describe("SettingsPage — AI provider models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHooks.providers = [PROVIDER];
  });

  it("fetches models with the key and base URL being edited, not the saved ones", async () => {
    providerHooks.previewModels.mockResolvedValue(["claude-sonnet-5-5"]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.type(screen.getByPlaceholderText("New API key (optional)"), "sk-ant-new");
    await user.type(
      screen.getByPlaceholderText("https://api.anthropic.com"),
      "https://llm-gateway.example.com"
    );
    await user.click(screen.getByRole("button", { name: "Fetch models from API" }));

    await waitFor(() => {
      expect(providerHooks.previewModels).toHaveBeenCalledWith({
        provider_id: PROVIDER.id,
        type: "claude",
        api_key: "sk-ant-new",
        base_url: "https://llm-gateway.example.com",
        ssl_verify: true,
        timeout: 60,
      });
    });
  });

  it("merges fetched models into the list and keeps the chosen default", async () => {
    providerHooks.previewModels.mockResolvedValue([
      "claude-haiku-4-5",
      "claude-fable-5-1",
      "claude-sonnet-5-5",
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.click(screen.getByRole("button", { name: "Fetch models from API" }));
    const offered = await screen.findByRole("region", { name: "Models offered by the API" });

    expect(configuredModels()).toEqual(["claude-opus-5-5", "claude-haiku-4-5"]);
    expect(within(offered).getByText("2 more offered by the API")).toBeInTheDocument();
    await user.click(within(offered).getByRole("button", { name: "Add claude-sonnet-5-5" }));
    await user.click(screen.getByRole("button", { name: "Make claude-sonnet-5-5 the default" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(providerHooks.update).toHaveBeenCalledWith(
      {
        id: PROVIDER.id,
        data: expect.objectContaining({
          models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"],
        }) as unknown,
      },
      expect.anything()
    );
  });

  it("shows why fetching failed", async () => {
    providerHooks.previewModels.mockRejectedValue(
      new Error("Claude rejected the API key (401): invalid x-api-key")
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.click(screen.getByRole("button", { name: "Fetch models from API" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid x-api-key");
    expect(configuredModels()).toEqual(["claude-opus-5-5", "claude-haiku-4-5"]);
  });

  it("adds a provider with models and a gateway base URL", async () => {
    providerHooks.providers = [];
    providerHooks.previewModels.mockResolvedValue(["claude-opus-5-5"]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add Provider" }));
    const fetchButton = screen.getByRole("button", { name: "Fetch models from API" });
    expect(fetchButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText("My Claude"), "Gateway Claude");
    await user.type(screen.getByPlaceholderText("sk-ant-api03-…"), "sk-ant-key");
    await user.type(
      screen.getByPlaceholderText("https://api.anthropic.com"),
      "https://gw.example.com"
    );
    await user.click(fetchButton);
    await user.click(await screen.findByRole("button", { name: "Add claude-opus-5-5" }));
    await user.type(
      screen.getByRole("textbox", { name: "New model ID" }),
      "claude-haiku-4-5{Enter}"
    );
    await user.click(screen.getByRole("button", { name: "Add Provider" }));

    expect(providerHooks.previewModels).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "claude",
        api_key: "sk-ant-key",
        base_url: "https://gw.example.com",
      })
    );
    await waitFor(() => {
      expect(providerHooks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gateway Claude",
          base_url: "https://gw.example.com",
          models: ["claude-opus-5-5", "claude-haiku-4-5"],
        }),
        expect.anything()
      );
    });
  });
});
