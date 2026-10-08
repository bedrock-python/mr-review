import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "@shared/api";
import { aiProviderApi } from "@entities/ai-provider";
import { hostApi } from "./hostApi";

const toastWarning = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { warning: toastWarning, error: vi.fn() } }));

const host = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "GitLab",
  type: "gitlab",
  base_url: "https://gitlab.example.com",
  color: null,
  favourite_repos: [],
  timeout: 30,
  created_at: "2026-05-16T10:00:00+00:00",
  ...overrides,
});

const mock = new MockAdapter(httpClient);

describe("hostApi.list", () => {
  afterEach(() => {
    mock.reset();
    toastWarning.mockClear();
    vi.restoreAllMocks();
  });

  it("lists a host saved before the server validated its URL and timeout", async () => {
    mock
      .onGet("/api/v1/hosts")
      .reply(200, [
        host({}),
        host({ id: "22222222-2222-4222-8222-222222222222", base_url: "gitlab.lan", timeout: 0 }),
      ]);

    const hosts = await hostApi.list();

    expect(hosts.map((h) => h.base_url)).toEqual(["https://gitlab.example.com", "gitlab.lan"]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("skips and reports a malformed host instead of failing the whole list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mock
      .onGet("/api/v1/hosts")
      .reply(200, [
        host({ name: "first" }),
        host({ id: "not-a-uuid" }),
        host({ name: "third", id: "33333333-3333-4333-8333-333333333333" }),
      ]);

    const hosts = await hostApi.list();

    expect(hosts.map((h) => h.name)).toEqual(["first", "third"]);
    expect(toastWarning).toHaveBeenCalledWith(
      "1 hosts could not be read and are hidden",
      expect.objectContaining({ description: expect.stringContaining("#2 id") as unknown })
    );
  });

  it("still fails when the response is not a list at all", async () => {
    mock.onGet("/api/v1/hosts").reply(200, { detail: "not a list" });

    await expect(hostApi.list()).rejects.toThrow();
  });
});

describe("aiProviderApi.list", () => {
  afterEach(() => {
    mock.reset();
    toastWarning.mockClear();
  });

  it("keeps a provider whose stored timeout is not positive", async () => {
    mock.onGet("/api/v1/ai-providers").reply(200, [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Ollama",
        type: "openai_compat",
        base_url: "http://localhost:11434/v1",
        models: [],
        ssl_verify: true,
        timeout: 0,
        created_at: "2026-05-16T10:00:00+00:00",
      },
    ]);

    const providers = await aiProviderApi.list();

    expect(providers).toHaveLength(1);
  });
});
