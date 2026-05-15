import { http, HttpResponse } from "msw";

const MOCK_HOST_ID = "00000000-0000-0000-0000-000000000001";

export const handlers = [
  // Hosts
  http.get("/api/v1/hosts", () => {
    return HttpResponse.json([
      {
        id: MOCK_HOST_ID,
        name: "GitLab (mock)",
        type: "gitlab",
        base_url: "https://gitlab.example.com",
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

  // Repos
  http.get(`/api/v1/hosts/${MOCK_HOST_ID}/repos`, () => {
    return HttpResponse.json([
      { id: "1", path: "group/awesome-repo", name: "awesome-repo", description: "Mock repo" },
      { id: "2", path: "group/another-repo", name: "another-repo", description: null },
    ]);
  }),

  http.get("/api/v1/hosts/:hostId/repos", () => {
    return HttpResponse.json([]);
  }),

  // MRs
  http.get("/api/v1/hosts/:hostId/repos/:repoPath/mrs", () => {
    return HttpResponse.json([
      {
        iid: 42,
        title: "feat: add awesome feature",
        description: "This MR adds something great",
        author: "john.doe",
        source_branch: "feat/awesome",
        target_branch: "main",
        status: "opened",
        draft: false,
        pipeline: null,
        additions: 150,
        deletions: 30,
        file_count: 5,
        created_at: "2024-06-01T10:00:00Z",
        updated_at: "2024-06-02T12:00:00Z",
      },
    ]);
  }),

  http.get("/api/v1/hosts/:hostId/repos/:repoPath/mrs/:mrIid", () => {
    return HttpResponse.json({
      iid: 42,
      title: "feat: add awesome feature",
      description: "This MR adds something great",
      author: "john.doe",
      source_branch: "feat/awesome",
      target_branch: "main",
      status: "opened",
      draft: false,
      pipeline: null,
      additions: 150,
      deletions: 30,
      file_count: 5,
      created_at: "2024-06-01T10:00:00Z",
      updated_at: "2024-06-02T12:00:00Z",
    });
  }),

  http.get("/api/v1/hosts/:hostId/repos/:repoPath/mrs/:mrIid/diff", () => {
    return HttpResponse.json([
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
    ]);
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
