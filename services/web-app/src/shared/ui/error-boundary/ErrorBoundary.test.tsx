import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

const Throws = ({ error }: { error: Error }): React.ReactElement => {
  throw error;
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a reload, not a retry that cannot work, when a chunk failed to load", () => {
    render(
      <ErrorBoundary>
        <Throws
          error={new TypeError("Failed to fetch dynamically imported module: /assets/a.js")}
        />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers to try again after any other error", () => {
    render(
      <ErrorBoundary>
        <Throws error={new Error("render failed")} />
      </ErrorBoundary>
    );

    expect(screen.getByText("render failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders the fallback a caller builds from the error", () => {
    render(
      <ErrorBoundary fallbackRender={({ error }) => <p role="alert">custom: {error.message}</p>}>
        <Throws error={new Error("render failed")} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("custom: render failed");
  });
});
