import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InboxMRPageSchema, MRPageSchema, MRSchema, RepoPageSchema } from "@entities/mr";
import {
  MOCK_BUSY_REPO,
  MOCK_BUSY_REPO_MR_COUNT,
  MOCK_EXTERNAL_PINNED_REPO,
  MOCK_HOST_ID,
  MOCK_REPO_COUNT,
} from "../fixtures/mrs";
import { mrHandlers } from "./mrs";

const server = setupServer(...mrHandlers);
const API = `http://api.test/api/v1/hosts/${MOCK_HOST_ID}`;

const getJson = async (path: string): Promise<{ status: number; body: unknown }> => {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: (await res.json()) as unknown };
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe("repos handler", () => {
  it("serves the page envelope and prepends the external pin on page 1 only", async () => {
    const first = RepoPageSchema.parse((await getJson("/repos?page=1&per_page=50")).body);
    expect(first).toMatchObject({ page: 1, per_page: 50, has_more: true });
    expect(first.items).toHaveLength(51);
    expect(first.items[0]?.path).toBe(MOCK_EXTERNAL_PINNED_REPO);

    const last = RepoPageSchema.parse((await getJson("/repos?page=3&per_page=50")).body);
    expect(last.has_more).toBe(false);
    expect(last.items).toHaveLength(MOCK_REPO_COUNT - 100);
    expect(last.items.some((repo) => repo.path === MOCK_EXTERNAL_PINNED_REPO)).toBe(false);
  });

  it("filters by q on path or name", async () => {
    const page = RepoPageSchema.parse((await getJson("/repos?q=gateway&per_page=100")).body);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((repo) => repo.path.includes("gateway"))).toBe(true);
  });

  it("rejects per_page outside 1..100 like the backend", async () => {
    expect((await getJson("/repos?per_page=101")).status).toBe(422);
    expect((await getJson("/repos?page=0")).status).toBe(422);
  });
});

describe("MR list handler", () => {
  it("paginates a repository with nested path", async () => {
    const pages = await Promise.all(
      [1, 2, 3, 4].map(async (page) =>
        MRPageSchema.parse(
          (await getJson(`/repos/${MOCK_BUSY_REPO}/mrs?state=all&page=${String(page)}&per_page=30`))
            .body
        )
      )
    );
    expect(pages.map((page) => page.items.length)).toEqual([30, 30, 30, 5]);
    expect(pages.map((page) => page.has_more)).toEqual([true, true, true, false]);
    expect(new Set(pages.flatMap((page) => page.items.map((mr) => mr.iid))).size).toBe(
      MOCK_BUSY_REPO_MR_COUNT
    );
  });

  it("filters by state and title, newest update first", async () => {
    const page = MRPageSchema.parse(
      (await getJson(`/repos/${MOCK_BUSY_REPO}/mrs?state=merged&per_page=100`)).body
    );
    expect(page.items.every((mr) => mr.status === "merged")).toBe(true);
    const updated = page.items.map((mr) => Date.parse(mr.updated_at));
    expect([...updated].sort((a, b) => b - a)).toEqual(updated);

    const search = MRPageSchema.parse(
      (await getJson(`/repos/${MOCK_BUSY_REPO}/mrs?state=all&q=CACHE&per_page=100`)).body
    );
    expect(search.items.length).toBeGreaterThan(0);
    expect(search.items.every((mr) => mr.title.toLowerCase().includes("cache"))).toBe(true);
  });

  it("includes MRs without diff stats", async () => {
    const page = MRPageSchema.parse(
      (await getJson(`/repos/${MOCK_BUSY_REPO}/mrs?state=all&per_page=30`)).body
    );
    expect(page.items.some((mr) => mr.additions === null && mr.file_count === null)).toBe(true);
  });

  it("serves MR details for nested repository paths", async () => {
    const { status, body } = await getJson(`/repos/${MOCK_BUSY_REPO}/mrs/1`);
    expect(status).toBe(200);
    expect(MRSchema.parse(body).iid).toBe(1);
    expect((await getJson(`/repos/${MOCK_BUSY_REPO}/mrs/9999`)).status).toBe(404);
  });
});

describe("inbox handler", () => {
  it("paginates open MRs and filters by scope", async () => {
    const all = InboxMRPageSchema.parse((await getJson("/inbox?scope=all&per_page=30")).body);
    expect(all.items).toHaveLength(30);
    expect(all.has_more).toBe(true);
    expect(all.items.every((mr) => mr.status === "opened")).toBe(true);

    const assigned = InboxMRPageSchema.parse((await getJson("/inbox?scope=assigned")).body);
    expect(assigned.items.every((mr) => mr.iid % 3 === 0)).toBe(true);
  });

  it("returns GitHub-search-like items for review_requested", async () => {
    const page = InboxMRPageSchema.parse((await getJson("/inbox?scope=review_requested")).body);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((mr) => mr.source_branch === "" && mr.additions === null)).toBe(true);
  });

  it("rejects unknown scopes", async () => {
    expect((await getJson("/inbox?scope=everything")).status).toBe(422);
  });
});
