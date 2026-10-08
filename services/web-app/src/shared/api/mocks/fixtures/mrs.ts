import type { InboxMR, InboxScope, MR, MRStatus, PipelineStatus, Repo } from "@entities/mr";

// Deterministic fake data sized to span several pages of every list endpoint:
// 137 repositories (3 pages of 50), up to ~95 MRs per repository (4 pages of 30)
// and an inbox aggregated across all of them.

export const MOCK_HOST_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_CURRENT_USER = "mock-user";
export const MOCK_REPO_COUNT = 137;

/** Repository with the most MRs; handy for exercising MR list pagination. */
export const MOCK_BUSY_REPO = "platform/api-1";
export const MOCK_BUSY_REPO_MR_COUNT = 95;

/** Pinned by URL; the host listing never returns it, so page 1 prepends it. */
export const MOCK_EXTERNAL_PINNED_REPO = "external/vendored-lib";

const NAMESPACES = [
  "platform",
  "platform/infra",
  "web",
  "web/design-system",
  "mobile",
  "data/pipelines",
  "data/ml",
  "tools",
] as const;

const REPO_WORDS = [
  "api",
  "gateway",
  "auth",
  "billing",
  "search",
  "notifications",
  "worker",
  "frontend",
  "admin",
  "sdk",
  "cli",
  "docs",
  "metrics",
  "scheduler",
  "storage",
  "ingest",
  "export",
  "reports",
] as const;

const pick = <T>(values: readonly T[], index: number): T => {
  const value = values[index % values.length];
  if (value === undefined) throw new Error("pick() called with an empty list");
  return value;
};

const buildRepo = (index: number): Repo => {
  const word = pick(REPO_WORDS, index);
  const name = `${word}-${String(index + 1)}`;
  return {
    id: String(1000 + index),
    path: `${pick(NAMESPACES, index)}/${name}`,
    name,
    description: index % 3 === 0 ? null : `Mock ${word} service`,
  };
};

export const MOCK_REPOS: readonly Repo[] = Array.from({ length: MOCK_REPO_COUNT }, (_, index) =>
  buildRepo(index)
);

/** A favourite that only arrives with the third page of repositories. */
const LATE_FAVOURITE_INDEX = 130;

/** Favourites of the mock host: one on page 1, one on page 3, one external. */
export const MOCK_FAVOURITE_REPOS: readonly string[] = [
  MOCK_BUSY_REPO,
  buildRepo(LATE_FAVOURITE_INDEX).path,
  MOCK_EXTERNAL_PINNED_REPO,
];

export const MOCK_EXTERNAL_REPO: Repo = {
  id: "external-1",
  path: MOCK_EXTERNAL_PINNED_REPO,
  name: "vendored-lib",
  description: "Pinned by URL",
};

const TITLE_VERBS = ["feat", "fix", "refactor", "chore", "perf", "docs", "test"] as const;
const TITLE_SUBJECTS = [
  "paginate repository listing",
  "handle expired tokens on refresh",
  "drop legacy retry wrapper",
  "bump dependencies",
  "cache pipeline status lookups",
  "document webhook payloads",
  "cover inbox scopes with tests",
  "speed up diff parsing",
  "add audit log export",
  "support self-hosted runners",
  "tidy error envelopes",
] as const;
const AUTHORS = [MOCK_CURRENT_USER, "alice", "bob", "carol", "dave"] as const;
const PIPELINES: readonly (PipelineStatus | null)[] = ["passed", "failed", "running", "none", null];

const BASE_TIME_MS = Date.parse("2026-10-01T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const UPDATE_STEP_HOURS = 7;

const hashPath = (path: string): number => {
  let hash = 0;
  for (const char of path) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash;
};

const getMRCount = (repoPath: string): number => {
  if (repoPath === MOCK_BUSY_REPO) return MOCK_BUSY_REPO_MR_COUNT;
  const hash = hashPath(repoPath);
  // Roughly one repository in eleven has no MRs at all (empty state).
  return hash % 11 === 0 ? 0 : 3 + (hash % 60);
};

const getStatus = (index: number): MRStatus => {
  if (index % 9 === 4) return "merged";
  if (index % 13 === 6) return "closed";
  return "opened";
};

/** Builds the `index`-th most recently updated MR of a repository. */
const buildMR = (repoPath: string, index: number, count: number): MR => {
  const iid = count - index;
  const hash = hashPath(repoPath);
  const updatedMs = BASE_TIME_MS - (index * UPDATE_STEP_HOURS + (hash % 5)) * HOUR_MS;
  const createdMs = updatedMs - ((index % 4) + 1) * 30 * HOUR_MS;
  // Every 7th MR mimics a host that does not report diff stats in list views.
  const hasStats = index % 7 !== 3;
  const subject = pick(TITLE_SUBJECTS, index * 7 + hash);
  return {
    iid,
    title: `${pick(TITLE_VERBS, index + hash)}: ${subject}`,
    description: `Mock merge request !${String(iid)} in ${repoPath}.`,
    // Offset from the draft / update cadence so filters do not single out one author.
    author: pick(AUTHORS, Math.floor(index / 3) + Math.floor(hash / 5)),
    source_branch: `feature/${subject.split(" ").slice(0, 2).join("-")}-${String(iid)}`,
    target_branch: "main",
    status: getStatus(index),
    draft: index % 5 === 2,
    pipeline: pick(PIPELINES, index + hash),
    additions: hasStats ? 5 + ((index * 37 + hash) % 400) : null,
    deletions: hasStats ? (index * 13 + hash) % 120 : null,
    file_count: hasStats ? 1 + ((index + hash) % 24) : null,
    web_url: `https://gitlab.example.com/${repoPath}/-/merge_requests/${String(iid)}`,
    created_at: new Date(createdMs).toISOString(),
    updated_at: new Date(updatedMs).toISOString(),
  };
};

const mrCache = new Map<string, readonly MR[]>();

/** All MRs of a repository, most recently updated first. */
export const getMockMRs = (repoPath: string): readonly MR[] => {
  const cached = mrCache.get(repoPath);
  if (cached) return cached;
  const count = getMRCount(repoPath);
  const mrs = Array.from({ length: count }, (_, index) => buildMR(repoPath, index, count));
  mrCache.set(repoPath, mrs);
  return mrs;
};

const matchesScope = (mr: MR, scope: InboxScope): boolean => {
  if (scope === "authored") return mr.author === MOCK_CURRENT_USER;
  if (scope === "assigned") return mr.iid % 3 === 0;
  if (scope === "review_requested") return mr.iid % 4 === 1;
  return true;
};

/**
 * Open MRs across all mock repositories for an inbox scope, newest update first.
 * `review_requested` mimics GitHub search results: no branches, no diff stats.
 */
export const getMockInbox = (scope: InboxScope): InboxMR[] => {
  const items: InboxMR[] = [];
  for (const repo of MOCK_REPOS) {
    for (const mr of getMockMRs(repo.path)) {
      if (mr.status !== "opened" || !matchesScope(mr, scope)) continue;
      const item: InboxMR = { ...mr, repo_path: repo.path };
      if (scope === "review_requested") {
        item.source_branch = "";
        item.target_branch = "";
        item.additions = null;
        item.deletions = null;
        item.file_count = null;
      }
      items.push(item);
    }
  }
  return items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
};

export type MockPage<TItem> = {
  items: TItem[];
  page: number;
  per_page: number;
  has_more: boolean;
};

/** Slices `items` into the backend page envelope (1-based pages). */
export const paginate = <TItem>(
  items: readonly TItem[],
  page: number,
  perPage: number
): MockPage<TItem> => {
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page,
    per_page: perPage,
    has_more: start + perPage < items.length,
  };
};
