import { http, HttpResponse } from "msw";
import { MOCK_FAVOURITE_REPOS, MOCK_HOST_ID } from "./fixtures/mrs";
import { mrHandlers } from "./handlers/mrs";
import { patchHandlers } from "./handlers/patch";

const reviewHandlers = [
  // Hosts
  http.get("/api/v1/hosts", () => {
    return HttpResponse.json([
      {
        id: MOCK_HOST_ID,
        name: "GitLab (mock)",
        type: "gitlab",
        base_url: "https://gitlab.example.com",
        favourite_repos: MOCK_FAVOURITE_REPOS,
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);
  }),

  http.post("/api/v1/hosts", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: crypto.randomUUID(),
        name: body.name,
        type: body.type,
        base_url: body.base_url,
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  http.patch("/api/v1/hosts/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: MOCK_HOST_ID,
      name: body.name ?? "GitLab (mock)",
      type: "gitlab",
      base_url: body.base_url ?? "https://gitlab.example.com",
      created_at: "2024-01-01T00:00:00Z",
    });
  }),

  http.delete("/api/v1/hosts/:id", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/v1/hosts/:id/test", () => {
    return HttpResponse.json({ ok: true, user: "mock-user" });
  }),

  // Matches any origin, like the list handlers in handlers/mrs.ts.
  http.post(/\/api\/v1\/hosts\/[^/]+\/cache\/invalidate$/, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Reviews
  http.get("/api/v1/reviews", () => {
    return HttpResponse.json([]);
  }),

  http.post("/api/v1/reviews", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: crypto.randomUUID(),
        host_id: body.host_id,
        repo_path: body.repo_path,
        mr_iid: body.mr_iid,
        stage: "pending",
        comments: [],
        brief_config: body.brief_config ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  http.get("/api/v1/reviews/:reviewId", () => {
    return HttpResponse.json({
      id: "mock-review-id",
      host_id: MOCK_HOST_ID,
      repo_path: "group/awesome-repo",
      mr_iid: 42,
      stage: "pending",
      comments: [],
      brief_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.patch("/api/v1/reviews/:reviewId", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: "mock-review-id",
      host_id: MOCK_HOST_ID,
      repo_path: "group/awesome-repo",
      mr_iid: 42,
      stage: body.stage ?? "pending",
      comments: body.comments ?? [],
      brief_config: body.brief_config ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.get("/api/v1/reviews/:reviewId/diff", () => {
    return new HttpResponse(
      `diff --git a/src/main.py b/src/main.py\n--- a/src/main.py\n+++ b/src/main.py\n@@ -1,5 +1,13 @@\n def hello():\n+    print("Hello, world!")\n-    pass\n`,
      { headers: { "Content-Type": "text/plain" } }
    );
  }),

  http.get("/api/v1/reviews/:reviewId/prompt", () => {
    return new HttpResponse("Mock prompt text for review", {
      headers: { "Content-Type": "text/plain" },
    });
  }),

  http.delete("/api/v1/reviews/:reviewId", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/v1/reviews/:reviewId/import-response", () => {
    return HttpResponse.json({ imported: 0, errors: [], json_error: null });
  }),

  http.post("/api/v1/reviews/:reviewId/post", () => {
    return HttpResponse.json({ posted: 0 });
  }),
];

export const handlers = [...reviewHandlers, ...mrHandlers, ...patchHandlers];
