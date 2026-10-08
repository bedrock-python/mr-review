import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState } from "../state";
import { SectionHeader } from "../section-header";
import { Callout } from "./Callout";

describe("Callout", () => {
  it("announces danger at once", () => {
    render(
      <Callout tone="danger" title="The model output wasn't valid JSON">
        Use Copy & paste to fix it.
      </Callout>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The model output wasn't valid JSON");
    expect(alert).toHaveAttribute("data-tone", "danger");
  });

  it("is a note for warnings and info, a status for success", () => {
    render(
      <>
        <Callout tone="warn">Base URL has a path.</Callout>
        <Callout tone="success">3 comments imported</Callout>
      </>
    );

    expect(screen.getByRole("note")).toHaveTextContent("Base URL has a path.");
    expect(screen.getByRole("status")).toHaveTextContent("3 comments imported");
  });

  it("takes another role, or none", () => {
    render(
      <Callout tone="danger" role="none">
        Inline hint
      </Callout>
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders actions", async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();
    render(
      <Callout
        tone="danger"
        title="Generation failed"
        actions={
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        }
      />
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState", () => {
  it("is a status with its title and actions", () => {
    render(
      <EmptyState
        title="No open merge requests"
        description="Try another filter."
        actions={<button type="button">Clear filters</button>}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("No open merge requests");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("is an alert with the message and a Retry", async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();
    render(
      <ErrorState
        title="Could not load merge requests"
        message="502 Bad Gateway"
        onRetry={handleRetry}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("502 Bad Gateway");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("has no Retry without a handler", () => {
    render(<ErrorState message="Not found" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });
});

describe("SectionHeader", () => {
  it("is a heading at the level asked for, with a count and actions", () => {
    render(
      <SectionHeader
        as="h2"
        id="files-title"
        title="Changed files"
        count={12}
        countLabel="12 files"
        actions={<button type="button">Collapse all</button>}
      />
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Changed files" });
    expect(heading).toHaveAttribute("id", "files-title");
    expect(heading).toHaveClass("ui-eyebrow");
    expect(screen.getByText("12 files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("can be a plain label", () => {
    render(<SectionHeader as="div" title="Advanced" />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Advanced")).toHaveClass("ui-eyebrow");
  });
});
