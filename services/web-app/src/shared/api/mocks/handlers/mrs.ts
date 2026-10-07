import { http, HttpResponse } from "msw";
import {
  MOCK_EXTERNAL_REPO,
  MOCK_FAVOURITE_REPOS,
  MOCK_HOST_ID,
  MOCK_REPOS,
  getMockInbox,
  getMockMRs,
  paginate,
} from "../fixtures/mrs";
import type { InboxScope, MRStateFilter, Repo } from "@entities/mr";

// RegExp routes match any origin (the dev worker and Node tests use different API
// base URLs) and allow repository paths with slashes ("group/sub/repo").
// Capture groups: host id, then repository path and MR iid where present.
const REPOS_URL = /\/api\/v1\/hosts\/([^/]+)\/repos$/;
const MR_LIST_URL = /\/api\/v1\/hosts\/([^/]+)\/repos\/(.+)\/mrs$/;
const MR_DETAIL_URL = /\/api\/v1\/hosts\/([^/]+)\/repos\/(.+)\/mrs\/(\d+)$/;
const MR_DIFF_URL = /\/api\/v1\/hosts\/([^/]+)\/repos\/(.+)\/mrs\/(\d+)\/diff$/;
const INBOX_URL = /\/api\/v1\/hosts\/([^/]+)\/inbox$/;

const REPOS_DEFAULT_PER_PAGE = 50;
const MRS_DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

const STATE_FILTERS: readonly MRStateFilter[] = ["opened", "merged", "closed", "all"];
const INBOX_SCOPES: readonly InboxScope[] = ["all", "authored", "assigned", "review_requested"];

type RouteParts = { hostId: string; repoPath: string; mrIid: number | null };

const parseRoute = (url: URL, route: RegExp): RouteParts => {
  const match = route.exec(url.pathname);
  return {
    hostId: decodeURIComponent(match?.[1] ?? ""),
    repoPath: decodeURIComponent(match?.[2] ?? ""),
    mrIid: match?.[3] ? Number(match[3]) : null,
  };
};

type Paging = { page: number; perPage: number };

/** Mirrors the backend's `page >= 1` and `1 <= per_page <= 100` validation. */
const parsePaging = (url: URL, defaultPerPage: number): Paging | null => {
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = Number(url.searchParams.get("per_page") ?? String(defaultPerPage));
  const isValid =
    Number.isInteger(page) &&
    page >= 1 &&
    Number.isInteger(perPage) &&
    perPage >= 1 &&
    perPage <= MAX_PER_PAGE;
  return isValid ? { page, perPage } : null;
};

const validationError = (message: string): Response =>
  HttpResponse.json({ detail: message }, { status: 422 });

const matchesQuery = (value: string, query: string): boolean =>
  value.toLowerCase().includes(query.toLowerCase());

const isOneOf = <TValue extends string>(
  values: readonly TValue[],
  value: string
): value is TValue => (values as readonly string[]).includes(value);

export const mrHandlers = [
  http.get(REPOS_URL, ({ request }) => {
    const url = new URL(request.url);
    const paging = parsePaging(url, REPOS_DEFAULT_PER_PAGE);
    if (!paging) return validationError("Invalid page or per_page");
    const { hostId } = parseRoute(url, REPOS_URL);
    if (hostId !== MOCK_HOST_ID)
      return HttpResponse.json(paginate([], paging.page, paging.perPage));

    const query = url.searchParams.get("q")?.trim() ?? "";
    const matches = (repo: Repo): boolean =>
      query === "" || matchesQuery(repo.path, query) || matchesQuery(repo.name, query);
    const listed = MOCK_REPOS.filter(matches);
    const body = paginate(listed, paging.page, paging.perPage);

    // Favourites the host listing does not return are prepended to page 1 only.
    if (paging.page === 1) {
      const listedPaths = new Set(listed.map((repo) => repo.path));
      const pinned = [MOCK_EXTERNAL_REPO].filter(
        (repo) =>
          MOCK_FAVOURITE_REPOS.includes(repo.path) && !listedPaths.has(repo.path) && matches(repo)
      );
      body.items = [...pinned, ...body.items];
    }
    return HttpResponse.json(body);
  }),

  http.get(MR_DIFF_URL, () =>
    HttpResponse.json([
      {
        path: "src/main.py",
        old_path: "src/main.py",
        additions: 10,
        deletions: 2,
        hunks: [
          {
            old_start: 1,
            new_start: 1,
            old_count: 5,
            new_count: 13,
            lines: [
              { type: "context", old_line: 1, new_line: 1, content: " def hello():" },
              {
                type: "added",
                old_line: null,
                new_line: 2,
                content: '+    print("Hello, world!")',
              },
              { type: "removed", old_line: 2, new_line: null, content: "-    pass" },
            ],
          },
        ],
      },
    ])
  ),

  http.get(MR_DETAIL_URL, ({ request }) => {
    const { repoPath, mrIid } = parseRoute(new URL(request.url), MR_DETAIL_URL);
    const mr = getMockMRs(repoPath).find((item) => item.iid === mrIid);
    if (!mr) return HttpResponse.json({ detail: "Merge request not found" }, { status: 404 });
    return HttpResponse.json(mr);
  }),

  http.get(MR_LIST_URL, ({ request }) => {
    const url = new URL(request.url);
    const paging = parsePaging(url, MRS_DEFAULT_PER_PAGE);
    if (!paging) return validationError("Invalid page or per_page");
    const state = url.searchParams.get("state") ?? "opened";
    if (!isOneOf(STATE_FILTERS, state)) return validationError(`Unknown state: ${state}`);

    const query = url.searchParams.get("q")?.trim() ?? "";
    const { repoPath } = parseRoute(url, MR_LIST_URL);
    const mrs = getMockMRs(repoPath).filter(
      (mr) =>
        (state === "all" || mr.status === state) && (query === "" || matchesQuery(mr.title, query))
    );
    return HttpResponse.json(paginate(mrs, paging.page, paging.perPage));
  }),

  http.get(INBOX_URL, ({ request }) => {
    const url = new URL(request.url);
    const paging = parsePaging(url, MRS_DEFAULT_PER_PAGE);
    if (!paging) return validationError("Invalid page or per_page");
    const scope = url.searchParams.get("scope") ?? "all";
    if (!isOneOf(INBOX_SCOPES, scope)) return validationError(`Unknown scope: ${scope}`);

    const { hostId } = parseRoute(url, INBOX_URL);
    const items = hostId === MOCK_HOST_ID ? getMockInbox(scope) : [];
    return HttpResponse.json(paginate(items, paging.page, paging.perPage));
  }),
];
