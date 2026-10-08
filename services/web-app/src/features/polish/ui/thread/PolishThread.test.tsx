import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("threads comments by file under a heading with their severities", () => {
    render(
      <PolishThread
        comments={[
          comment({ id: "a1", severity: "critical" }),
          comment({ id: "g1", file: null, line: null, severity: "suggestion" }),
          comment({ id: "a2", severity: "minor" }),
        ]}
        onToggleStatus={vi.fn()}
      />
    );

    const file = screen.getByRole("region", { name: "src/a.ts" });
    expect(within(file).getAllByRole("listitem")).toHaveLength(2);
    expect(within(file).getByText("1 critical, 1 minor")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "General notes" })).toBeInTheDocument();
  });

  it("dismisses and keeps a comment from its bubble", async () => {
    const user = userEvent.setup();
    const onToggleStatus = vi.fn();
    render(
      <PolishThread
        comments={[comment({}), comment({ id: "d1", status: "dismissed" })]}
        onToggleStatus={onToggleStatus}
      />
    );

    await user.click(screen.getByRole("button", { name: "Dismiss comment" }));
    await user.click(screen.getByRole("button", { name: "Keep comment" }));

    expect(onToggleStatus.mock.calls).toEqual([["11111111-1111-4111-8111-111111111111"], ["d1"]]);
  });
});
