import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockVirtualLayout } from "@shared/lib/test-utils";
import { DiffViewer } from "./DiffViewer";
import type { DiffFile } from "@entities/mr";

const LINE_COUNT = 50_000;

const bigFile = (): DiffFile => ({
  path: "src/generated.ts",
  old_path: null,
  additions: LINE_COUNT,
  deletions: 0,
  hunks: [
    {
      old_start: 0,
      old_count: 0,
      new_start: 1,
      new_count: LINE_COUNT,
      lines: Array.from({ length: LINE_COUNT }, (_, i) => ({
        type: "added" as const,
        content: `export const value${String(i)} = ${String(i)};`,
        old_line: null,
        new_line: i + 1,
      })),
    },
  ],
});

describe("Pick DiffViewer", () => {
  let restoreLayout: () => void;

  beforeEach(() => {
    restoreLayout = mockVirtualLayout({ viewportHeight: 400, rowHeight: 20 });
  });

  afterEach(() => {
    restoreLayout();
  });

  it("renders a 50 000-line file as a window of rows", () => {
    render(<DiffViewer file={bigFile()} />);

    const table = screen.getByRole("table", { name: "Diff of src/generated.ts" });
    const rows = within(table)
      .getAllByRole("row")
      .filter((row) => row.hasAttribute("data-line-type"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(120);
    expect(rows[0]).toHaveTextContent("@@ -0,0 +1,50000 @@");
  });

  it("styles its file header with theme colours that exist", () => {
    const { container } = render(<DiffViewer file={bigFile()} />);

    const html = container.innerHTML;
    for (const missing of ["--surface", "--text-muted", "var(--text)"]) {
      expect(html).not.toContain(missing);
    }
    expect(html).not.toMatch(/(?:green|red)-\d{3}/);
  });
});
