import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { httpClient } from "@shared/api";
import { mrApi } from "./mrApi";

const HOST = "host-1";

const mr = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  iid: 7,
  title: "feat: paginate",
  description: "",
  author: "alice",
  source_branch: "feat/paginate",
  target_branch: "main",
  status: "opened",
  draft: false,
  pipeline: null,
  additions: 10,
  deletions: 2,
  file_count: 3,
  web_url: "https://example.com/mr/7",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00+00:00",
  ...overrides,
});

const envelope = (
  items: unknown[],
  page = 1,
  hasMore = false
): { items: unknown[]; page: number; per_page: number; has_more: boolean } => ({
  items,
  page,
  per_page: 30,
  has_more: hasMore,
});

describe("mrApi list endpoints", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(httpClient);
  });
  afterEach(() => {
    mock.restore();
  });

  it("listRepos sends paging and search params and parses the page", async () => {
    mock.onGet(`/api/v1/hosts/${HOST}/repos`).reply(200, {
      items: [{ id: "1", path: "g/repo", name: "repo", description: null }],
      page: 2,
      per_page: 50,
      has_more: true,
    });

    const page = await mrApi.listRepos(HOST, { q: " repo ", page: 2, perPage: 50 });

    expect(page).toEqual({
      items: [{ id: "1", path: "g/repo", name: "repo", description: null }],
      page: 2,
      per_page: 50,
      has_more: true,
    });
    expect(mock.history.get[0]?.params).toEqual({ q: "repo", page: 2, per_page: 50 });
  });

  it("listRepos leaves out a blank search", async () => {
    mock.onGet(`/api/v1/hosts/${HOST}/repos`).reply(200, envelope([]));

    await mrApi.listRepos(HOST, { q: "  ", page: 1, perPage: 50 });

    expect(mock.history.get[0]?.params).toEqual({ q: undefined, page: 1, per_page: 50 });
  });

  it("listMRs sends state, q and paging for a nested repository path", async () => {
    mock.onGet(`/api/v1/hosts/${HOST}/repos/group/sub/repo/mrs`).reply(200, envelope([mr()]));

    const page = await mrApi.listMRs(HOST, "group/sub/repo", {
      state: "merged",
      q: "paginate",
      page: 3,
      perPage: 30,
    });

    expect(page.items[0]?.iid).toBe(7);
    expect(mock.history.get[0]?.params).toEqual({
      state: "merged",
      q: "paginate",
      page: 3,
      per_page: 30,
    });
  });

  it("parses null diff stats as unknown rather than zero", async () => {
    mock
      .onGet(`/api/v1/hosts/${HOST}/repos/g/r/mrs`)
      .reply(200, envelope([mr({ additions: null, deletions: null, file_count: null })]));

    const page = await mrApi.listMRs(HOST, "g/r", { state: "opened", page: 1, perPage: 30 });

    expect(page.items[0]).toMatchObject({ additions: null, deletions: null, file_count: null });
  });

  it("listInboxMRs sends the scope and accepts items without branches", async () => {
    mock
      .onGet(`/api/v1/hosts/${HOST}/inbox`)
      .reply(
        200,
        envelope([mr({ repo_path: "g/r", source_branch: "", target_branch: "" })], 1, true)
      );

    const page = await mrApi.listInboxMRs(HOST, {
      scope: "review_requested",
      page: 1,
      perPage: 30,
    });

    expect(page.has_more).toBe(true);
    expect(page.items[0]).toMatchObject({ repo_path: "g/r", source_branch: "", target_branch: "" });
    expect(mock.history.get[0]?.params).toEqual({
      scope: "review_requested",
      page: 1,
      per_page: 30,
    });
  });

  it("rejects the pre-pagination bare array response", async () => {
    mock.onGet(`/api/v1/hosts/${HOST}/inbox`).reply(200, [mr({ repo_path: "g/r" })]);

    await expect(
      mrApi.listInboxMRs(HOST, { scope: "all", page: 1, perPage: 30 })
    ).rejects.toThrow();
  });

  it("rejects an envelope without has_more", async () => {
    mock.onGet(`/api/v1/hosts/${HOST}/repos`).reply(200, { items: [], page: 1, per_page: 50 });

    await expect(mrApi.listRepos(HOST, { page: 1, perPage: 50 })).rejects.toThrow();
  });
});
