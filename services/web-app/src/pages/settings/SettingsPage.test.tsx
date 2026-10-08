import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INTEGRATION_TEST_TIMEOUT_MS } from "@shared/lib/test-utils";

import { SettingsPage } from "./SettingsPage";

import type { AIProvider } from "@entities/ai-provider";
import type * as AIProviderEntity from "@entities/ai-provider";
import type * as HostEntity from "@entities/host";
import type * as SharedApi from "@shared/api";

// The provider forms take many interactions per test; give them room when suites run in parallel.
configure({ asyncUtilTimeout: 5000 });

const providerHooks = vi.hoisted(() => ({
  providers: [] as AIProvider[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  previewModels: vi.fn(),
}));

const theme = vi.hoisted(() => ({ setTheme: vi.fn() }));

vi.mock("@entities/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof AIProviderEntity>();
  return {
    ...actual,
    aiProviderApi: { ...actual.aiProviderApi, previewModels: providerHooks.previewModels },
    useAIProviders: () => ({ data: providerHooks.providers, isLoading: false }),
    useCreateAIProvider: () => ({ mutate: providerHooks.create, isPending: false }),
    useUpdateAIProvider: () => ({ mutate: providerHooks.update, isPending: false }),
    useDeleteAIProvider: () => ({ mutate: providerHooks.remove, isPending: false }),
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

vi.mock("@features/export-import", () => ({ ExportPanel: () => null, ImportPanel: () => null }));

// The presets list has its own tests; here it would only add network calls and states.
vi.mock("@features/manage-review-presets", () => ({ ReviewPresetsManager: () => null }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: theme.setTheme }),
}));

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

type User = ReturnType<typeof userEvent.setup>;

// One paste event instead of a key event per character: fast and steady under load.
const fill = async (user: User, field: HTMLElement, text: string): Promise<void> => {
  await user.click(field);
  await user.paste(text);
};

const configuredModels = (): string[] =>
  within(screen.getByRole("list", { name: "Configured models" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".mono")?.textContent ?? "");

describe("SettingsPage — AI provider models", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHooks.providers = [PROVIDER];
  });

  it("fetches models with the key and base URL being edited, not the saved ones", async () => {
    providerHooks.previewModels.mockResolvedValue(["claude-sonnet-5-5"]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await fill(user, screen.getByPlaceholderText("New API key (optional)"), "sk-ant-new");
    await fill(
      user,
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

    await user.click(screen.getByRole("button", { name: "Add provider" }));
    const fetchButton = screen.getByRole("button", { name: "Fetch models from API" });
    expect(fetchButton).toBeDisabled();
    await fill(user, screen.getByPlaceholderText("e.g. My Claude"), "Gateway Claude");
    await fill(user, screen.getByPlaceholderText("sk-ant-api03-…"), "sk-ant-key");
    await fill(
      user,
      screen.getByPlaceholderText("https://api.anthropic.com"),
      "https://gw.example.com"
    );
    await user.click(fetchButton);
    await user.click(await screen.findByRole("button", { name: "Add claude-opus-5-5" }));
    await fill(user, screen.getByRole("textbox", { name: "New model ID" }), "claude-haiku-4-5");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Add provider" }));

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

  it("asks for the key before fetching from a changed base URL", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await fill(
      user,
      screen.getByPlaceholderText("https://api.anthropic.com"),
      "https://evil.example.com"
    );

    expect(screen.getByRole("button", { name: "Fetch models from API" })).toBeDisabled();
    expect(
      screen.getByText("Enter the API key to fetch models from a changed base URL")
    ).toBeInTheDocument();
    await fill(user, screen.getByPlaceholderText("New API key (optional)"), "sk-ant-new");
    expect(screen.getByRole("button", { name: "Fetch models from API" })).toBeEnabled();
    expect(providerHooks.previewModels).not.toHaveBeenCalled();
  });

  it("warns when a Claude provider sends its requests somewhere other than Anthropic", () => {
    providerHooks.providers = [
      { ...PROVIDER, base_url: "http://localhost:11434/v1" },
      {
        ...PROVIDER,
        id: "55555555-5555-4555-8555-555555555555",
        base_url: "https://api.anthropic.com/v1",
      },
    ];
    renderPage();

    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(
      "Requests go to http://localhost:11434/v1 instead of Anthropic"
    );
  });

  it("clears the base URL when the provider type changes", async () => {
    providerHooks.providers = [];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add provider" }));
    const typeSelect = screen.getByDisplayValue("Claude");
    await user.selectOptions(typeSelect, "openai_compat");
    await fill(
      user,
      screen.getByPlaceholderText("http://localhost:11434/v1"),
      "http://localhost:11434/v1"
    );
    await user.selectOptions(typeSelect, "claude");
    await fill(user, screen.getByPlaceholderText("e.g. My Claude"), "Claude");
    await fill(user, screen.getByPlaceholderText("sk-ant-api03-…"), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: "Add provider" }));

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(providerHooks.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "claude", base_url: "" }),
        expect.anything()
      );
    });
  });
});

describe("SettingsPage — rows and appearance", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHooks.providers = [PROVIDER];
  });

  it("removes a provider only once the confirmation dialog says so", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Remove Team Claude" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Team Claude?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(providerHooks.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Team Claude" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove provider" })
    );
    expect(providerHooks.remove).toHaveBeenCalledWith(PROVIDER.id);
  });

  it("offers the themes as one choice and switches on selection", async () => {
    const user = userEvent.setup();
    renderPage();

    const themes = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(within(themes).getAllByRole("radio")).toHaveLength(3);
    await user.click(within(themes).getByRole("radio", { name: /Paper/ }));

    expect(theme.setTheme).toHaveBeenCalledWith("paper");
  });
});
