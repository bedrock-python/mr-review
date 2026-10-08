import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("shows an image as a link, so the browser never fetches it on its own", () => {
    const { container } = render(
      <MarkdownContent>
        {"See ![the failing build](https://evil.example/track.png)"}
      </MarkdownContent>
    );

    expect(container.querySelector("img")).toBeNull();
    const link = screen.getByRole("link", { name: "[image: the failing build]" });
    expect(link).toHaveAttribute("href", "https://evil.example/track.png");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("falls back to the URL when the image has no alt text", () => {
    render(<MarkdownContent>{"![](https://example.com/a.png)"}</MarkdownContent>);

    expect(screen.getByRole("link")).toHaveTextContent("[image: https://example.com/a.png]");
  });

  it("does not link an image with an unsafe or relative source", () => {
    const { container } = render(
      <MarkdownContent>
        {"![payload](javascript:alert(1)) ![local](/uploads/a.png)"}
      </MarkdownContent>
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("[payload]");
  });

  it("keeps raw HTML as text", () => {
    const { container } = render(
      <MarkdownContent>{'<img src="https://evil.example/x.png"> <b>bold</b>'}</MarkdownContent>
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
