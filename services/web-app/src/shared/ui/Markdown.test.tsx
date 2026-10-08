import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

// The renderer's chunk cannot be loaded (an old tab after an upgrade, a network failure).
vi.mock("./MarkdownContent", () => {
  throw new Error("the Markdown chunk could not be loaded");
});

describe("Markdown", () => {
  it("shows the text as it is when the renderer cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <div>
        <Markdown>{"**Fix** the loop"}</Markdown>
        <p>rest of the page</p>
      </div>
    );

    // Let the failed import settle and React render what follows from it.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.getByText("**Fix** the loop")).toBeInTheDocument();
    expect(screen.getByText("rest of the page")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
