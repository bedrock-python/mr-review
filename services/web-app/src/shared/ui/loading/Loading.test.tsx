import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";
import { StageLoading } from "./StageLoading";

describe("Spinner", () => {
  it("is a status named Loading by default", () => {
    render(<Spinner />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("takes another name", () => {
    render(<Spinner label="Fetching models" />);

    expect(screen.getByRole("status", { name: "Fetching models" })).toBeInTheDocument();
  });

  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<Spinner isDecorative />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes and tones by class", () => {
    const { container } = render(<Spinner size="lg" tone="current" />);

    expect(container.firstElementChild).toHaveClass("ui-spinner", "ui-spinner--lg");
    expect(container.firstElementChild).toHaveClass("ui-spinner--current");
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech and sized by props", () => {
    const { container } = render(<Skeleton width={120} height={12} radius="pill" />);
    const block = container.firstElementChild as HTMLElement;

    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.style.width).toBe("120px");
    expect(block.style.height).toBe("12px");
    expect(block.style.borderRadius).toBe("var(--radius-pill)");
  });

  it("lets style win over the size props", () => {
    const { container } = render(<Skeleton width={10} style={{ width: "50%", marginTop: 4 }} />);
    const block = container.firstElementChild as HTMLElement;

    expect(block.style.width).toBe("50%");
    expect(block.style.marginTop).toBe("4px");
  });
});

describe("StageLoading", () => {
  it("announces its label once, with the spinner hidden", () => {
    render(<StageLoading label="Loading review…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading review…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("still says loading without a label", () => {
    render(<StageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});
