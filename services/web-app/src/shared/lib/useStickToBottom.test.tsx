import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStickToBottom } from "./useStickToBottom";

const VIEWPORT_HEIGHT = 100;

const Log = ({ lines }: { lines: string[] }): React.ReactElement => {
  const { ref, handleScroll } = useStickToBottom<HTMLDivElement>(lines.length);
  return (
    <div data-testid="log" ref={ref} onScroll={handleScroll}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
};

const linesOf = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `line ${String(i)}`);

/** jsdom has no layout: give the element a geometry that grows with its content. */
const fakeGeometry = (element: HTMLElement, lineHeight: number): void => {
  Object.defineProperty(element, "clientHeight", { configurable: true, value: VIEWPORT_HEIGHT });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => element.childElementCount * lineHeight,
  });
  Object.defineProperty(element, "scrollTop", { configurable: true, writable: true, value: 0 });
};

describe("useStickToBottom", () => {
  it("follows new content while the user stays at the bottom", () => {
    const { rerender } = render(<Log lines={linesOf(1)} />);
    const log = screen.getByTestId("log");
    fakeGeometry(log, 20);

    rerender(<Log lines={linesOf(10)} />);

    expect(log.scrollTop).toBe(200);
  });

  it("stops following once the user scrolls up and resumes at the bottom", () => {
    const { rerender } = render(<Log lines={linesOf(1)} />);
    const log = screen.getByTestId("log");
    fakeGeometry(log, 20);
    rerender(<Log lines={linesOf(10)} />);

    log.scrollTop = 40;
    fireEvent.scroll(log);
    rerender(<Log lines={linesOf(20)} />);

    expect(log.scrollTop).toBe(40);

    log.scrollTop = log.scrollHeight - VIEWPORT_HEIGHT;
    fireEvent.scroll(log);
    rerender(<Log lines={linesOf(30)} />);

    expect(log.scrollTop).toBe(600);
  });
});
