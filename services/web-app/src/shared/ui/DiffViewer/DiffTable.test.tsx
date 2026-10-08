import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_TIMEOUT_MS, mockVirtualLayout } from "@shared/lib/test-utils";
import { DiffViewer } from "./DiffViewer";
import { VIRTUALIZE_FROM_LINES } from "./DiffTable";

const LINE_COUNT = 50_000;
const VIEWPORT_PX = 400;
const ROW_PX = 20;
// The rows a 400px window shows, plus the overscan on both sides, with room to spare.
const MAX_RENDERED_ROWS = 120;

/** One file whose every line was added: `+line N`. */
const bigDiff = (count: number): string =>
  [
    "--- a/src/big.ts",
    "+++ b/src/big.ts",
    `@@ -0,0 +1,${String(count)} @@`,
    ...Array.from({ length: count }, (_, i) => `+line ${String(i + 1)}`),
  ].join("\n");

const bodyRows = (): HTMLElement[] =>
  screen
    .getAllByRole("row")
    .filter((row) => row.closest("tbody") !== null && row.hasAttribute("data-line-type"));

describe("DiffViewer on a long diff", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  let restoreLayout: () => void;

  beforeEach(() => {
    restoreLayout = mockVirtualLayout({ viewportHeight: VIEWPORT_PX, rowHeight: ROW_PX });
    // jsdom has no layout or scrolling: give the scroll container its content height, and
    // move it and tell the virtualizer on scrollTo, as a browser would.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => (LINE_COUNT + 3) * ROW_PX,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => VIEWPORT_PX,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: function scrollTo(this: HTMLElement, options?: ScrollToOptions): void {
        this.scrollTop = options?.top ?? this.scrollTop;
        this.dispatchEvent(new Event("scroll"));
      },
    });
  });

  afterEach(() => {
    restoreLayout();
    for (const property of ["scrollTo", "scrollHeight", "clientHeight"]) {
      Reflect.deleteProperty(HTMLElement.prototype, property);
    }
  });

  it("puts only the rows near the viewport in the DOM", () => {
    render(<DiffViewer diff={bigDiff(LINE_COUNT)} />);

    const rows = bodyRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(MAX_RENDERED_ROWS);
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", String(LINE_COUNT + 3));
  });

  it("scrolls a far line into the window and highlights it", async () => {
    render(
      <DiffViewer diff={bigDiff(LINE_COUNT)} highlightFile="src/big.ts" highlightLine={40_000} />
    );

    await waitFor(() => {
      const target = document.querySelector('[data-diff-row="src/big.ts:40000"]');
      expect(target).toHaveAttribute("aria-current", "true");
    });
    expect(bodyRows().length).toBeLessThan(MAX_RENDERED_ROWS);
  });

  it("renders a short diff whole", () => {
    render(<DiffViewer diff={bigDiff(VIRTUALIZE_FROM_LINES - 10)} />);

    expect(bodyRows()).toHaveLength(VIRTUALIZE_FROM_LINES - 10 + 3);
  });
});
