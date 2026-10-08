import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@shared/lib/test-utils";
import { ErrorBoundary } from "@shared/ui/error-boundary";
import { ActiveStage } from "./ActiveStage";

// The Pick stage's chunk cannot be loaded.
vi.mock("@features/pick", () => {
  throw new Error("the Pick chunk could not be loaded");
});

describe("ActiveStage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("keeps a stage that fails to load inside its panel and offers a reload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/h/group%2Frepo/mrs/12");

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <ErrorBoundary fallback={<p>whole page failed</p>}>
            <nav>stage bar</nav>
            <ActiveStage />
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    );

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("This stage could not be shown");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.getByText("stage bar")).toBeInTheDocument();
    expect(screen.queryByText("whole page failed")).not.toBeInTheDocument();
  });
});
