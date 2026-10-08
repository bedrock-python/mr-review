import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter } from "./Meter";

describe("Meter", () => {
  it("is a named meter with its value, bounds and text", () => {
    render(
      <Meter
        label="Prompt budget used"
        value={30_000}
        max={120_000}
        valueText="25% of the budget"
        caption="30,000 of 120,000 characters"
        isValueShown
      />
    );

    const meter = screen.getByRole("meter", { name: "Prompt budget used" });
    expect(meter).toHaveAttribute("aria-valuenow", "30000");
    expect(meter).toHaveAttribute("aria-valuemax", "120000");
    expect(meter).toHaveAttribute("aria-valuetext", "25% of the budget");
    expect(screen.getByText("30,000 of 120,000 characters")).toBeInTheDocument();
    expect(screen.getByText("25% of the budget")).toBeInTheDocument();
  });

  it("caps an overflow at the whole and takes the tone", () => {
    const { container } = render(<Meter label="Used" value={150} max={100} tone="warn" />);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(container.firstElementChild).toHaveAttribute("data-tone", "warn");
    expect(container.querySelector<HTMLElement>(".ui-meter__bar")?.style.width).toContain("100%");
  });

  it("draws an empty bar for nothing used", () => {
    const { container } = render(<Meter label="Used" value={0} max={100} />);

    expect(container.querySelector<HTMLElement>(".ui-meter__bar")?.style.width).toBe("0px");
  });
});
