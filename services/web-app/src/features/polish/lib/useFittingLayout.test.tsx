import { useRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFittingLayout } from "./useFittingLayout";

const LAYOUTS = ["wide", "medium", "narrow"] as const;
type Layout = (typeof LAYOUTS)[number];

const ONE_LINE_PX = 40;
const TWO_LINES_PX = 72;

// A fake layout engine: each layout's row needs a width; past the container's it wraps.
const needs: Record<Layout, number> = { wide: 1200, medium: 900, narrow: 600 };
let containerWidth = 1000;
let extraWidth = 0;
let measurements = 0;
const resizeCallbacks: (() => void)[] = [];

const Row = ({ contentKey }: { contentKey: string }): React.ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const layout = useFittingLayout(ref, LAYOUTS, contentKey);
  return (
    <div>
      <div ref={ref} data-testid="row" data-layout={layout} style={{ minHeight: ONE_LINE_PX }}>
        <button type="button">In the row</button>
      </div>
      <button type="button">Elsewhere</button>
    </div>
  );
};

const layout = (): string | null => screen.getByTestId("row").getAttribute("data-layout");

const resizeTo = (width: number): void => {
  containerWidth = width;
  act(() => {
    resizeCallbacks.forEach((callback) => {
      callback();
    });
  });
};

beforeEach(() => {
  needs.wide = 1200;
  containerWidth = 1000;
  extraWidth = 0;
  measurements = 0;
  resizeCallbacks.length = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rowLayout = this.getAttribute("data-layout") as Layout | null;
    if (rowLayout === null) return new DOMRect(0, 0, containerWidth, ONE_LINE_PX);
    measurements += 1;
    const isWrapped = needs[rowLayout] + extraWidth > containerWidth;
    return new DOMRect(0, 0, containerWidth, isWrapped ? TWO_LINES_PX : ONE_LINE_PX);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe(): void {
        // the test calls the callbacks
      }
      disconnect(): void {
        // nothing to release
      }
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
});

describe("useFittingLayout", () => {
  it("takes the roomiest layout that fits on one line", () => {
    render(<Row contentKey="a" />);

    expect(layout()).toBe("medium");
  });

  it("steps down as the container narrows and back up past where the roomier one wrapped", () => {
    render(<Row contentKey="a" />);

    resizeTo(700);
    expect(layout()).toBe("narrow");
    resizeTo(950);
    expect(layout()).toBe("medium");
    resizeTo(1300);
    expect(layout()).toBe("wide");
  });

  it("starts over when the content changes, so a roomier layout comes back at the same width", () => {
    const { rerender } = render(<Row contentKey="a" />);

    extraWidth = 200;
    rerender(<Row contentKey="b" />);
    expect(layout()).toBe("narrow");
    extraWidth = 0;
    rerender(<Row contentKey="a" />);

    expect(layout()).toBe("medium");
  });

  it("only steps down while focus is in the row, and starts over once it leaves", async () => {
    const { rerender } = render(<Row contentKey="a" />);
    extraWidth = 200;
    rerender(<Row contentKey="b" />);
    screen.getByRole("button", { name: "In the row" }).focus();

    extraWidth = 0;
    rerender(<Row contentKey="a" />);
    expect(layout()).toBe("narrow");
    act(() => {
      screen.getByRole("button", { name: "Elsewhere" }).focus();
    });

    await waitFor(() => {
      expect(layout()).toBe("medium");
    });
  });

  it("starts over when the theme changes", async () => {
    render(<Row contentKey="a" />);
    expect(layout()).toBe("medium");

    needs.wide = 950;
    document.documentElement.setAttribute("data-theme", "paper");

    await waitFor(() => {
      expect(layout()).toBe("wide");
    });
  });

  it("measures nothing on renders that change nothing it depends on", () => {
    const { rerender } = render(<Row contentKey="a" />);
    const settled = measurements;

    rerender(<Row contentKey="a" />);
    rerender(<Row contentKey="a" />);

    expect(measurements).toBe(settled);
  });
});
