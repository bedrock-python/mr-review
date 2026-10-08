import { http, HttpResponse } from "msw";

const MOCK_PROMPT = [
  "# Code Review Task",
  "",
  "Perform a thorough code review.",
  "",
  "## Diff",
  "",
  "```diff",
  "--- a/src/main.py",
  "+++ b/src/main.py",
  "@@ -1,2 +1,2 @@",
  " 1 | def hello():",
  '+2 |     print("Hello, world!")',
  "-  |     pass",
  "```",
].join("\n");

const BUILTIN_PRESETS = [
  {
    id: "thorough",
    name: "Thorough",
    description: "Complete review, bugs, logic, naming",
    instructions: "Perform a thorough code review.",
  },
  {
    id: "security",
    name: "Security",
    description: "Injections, auth, crypto, exposure",
    instructions: "Focus on security issues.",
  },
  {
    id: "style",
    name: "Style",
    description: "Naming, readability, conventions",
    instructions: "Review for code style, readability, and consistency.",
  },
  {
    id: "performance",
    name: "Performance",
    description: "Complexity, queries, allocations",
    instructions: "Focus on performance.",
  },
];

/** Brief-stage endpoints: the prompt preview, the path-filter check and review presets. */
export const briefHandlers = [
  http.post("/api/v1/reviews/:reviewId/prompt/preview", () =>
    HttpResponse.json({
      prompt: MOCK_PROMPT,
      total_chars: MOCK_PROMPT.length,
      estimated_tokens: Math.ceil(MOCK_PROMPT.length / 4),
      budget_chars: 600_000,
      sections: [
        {
          key: "instructions",
          label: "Instructions",
          chars: 60,
          source_chars: 60,
          items: 1,
          included: 1,
          truncated: [],
          omitted: [],
          skipped: [],
        },
        {
          key: "diff",
          label: "Diff",
          chars: MOCK_PROMPT.length - 60,
          source_chars: MOCK_PROMPT.length - 60,
          items: 1,
          included: 1,
          truncated: [],
          omitted: [],
          skipped: [],
        },
      ],
      files_total: 1,
      excluded_files: [],
      preset_name: null,
      preset_missing: false,
    })
  ),

  http.post("/api/v1/reviews/:reviewId/excluded-files", () =>
    HttpResponse.json({ total: 1, excluded: [] })
  ),

  http.get("/api/v1/review-presets/builtin", () => HttpResponse.json(BUILTIN_PRESETS)),

  http.get("/api/v1/review-presets", () => HttpResponse.json([])),

  http.post("/api/v1/review-presets", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    return HttpResponse.json(
      {
        description: "",
        instructions: "",
        brief_config: {},
        ...body,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      },
      { status: 201 }
    );
  }),

  http.delete("/api/v1/review-presets/:presetId", () => new HttpResponse(null, { status: 204 })),
];
