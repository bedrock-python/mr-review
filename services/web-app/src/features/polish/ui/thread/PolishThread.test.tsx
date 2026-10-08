import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PolishThread } from "./PolishThread";
import type { Comment } from "@entities/review";

const comment = (overrides: Partial<Comment>): Comment => ({
  id: "11111111-1111-4111-8111-111111111111",
  file: "src/a.ts",
  line: 3,
  severity: "major",
  body: "plain",
  status: "kept",
  resolved: false,
  suggested_patch: null,
  patch_status: "pending",
  patch_ref_url: null,
  patch_applied_at: null,
  ...overrides,
});

describe("PolishThread", () => {
  it("renders comment bodies as Markdown", async () => {
    render(
      <PolishThread
        comments={[comment({ body: "**Fix** the `loop` here" })]}
        onToggleStatus={vi.fn()}
      />
    );

    expect((await screen.findByText("Fix")).tagName).toBe("STRONG");
    expect(screen.getByText("loop").tagName).toBe("CODE");
  });
});
