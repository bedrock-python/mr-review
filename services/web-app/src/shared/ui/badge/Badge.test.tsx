import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { CountBadge } from "./CountBadge";
import { StatusBadge } from "./StatusBadge";

describe("Badge", () => {
  it("renders its text in a tone", () => {
    render(<Badge tone="major">Truncated</Badge>);

    const badge = screen.getByText("Truncated");
    expect(badge).toHaveClass("ui-badge");
    expect(badge).toHaveAttribute("data-tone", "major");
  });

  it("sets no tone attribute for neutral", () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText("Draft")).not.toHaveAttribute("data-tone");
  });

  it("draws a hidden dot, or an icon instead", () => {
    const { container, rerender } = render(<Badge hasDot>Running</Badge>);
    expect(container.querySelector(".ui-badge__dot")).toHaveAttribute("aria-hidden", "true");

    rerender(
      <Badge hasDot icon={<svg data-testid="icon" />}>
        Running
      </Badge>
    );
    expect(container.querySelector(".ui-badge__dot")).toBeNull();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("maps a status to a tone and always has a dot", () => {
    const { container } = render(<StatusBadge status="warning" label="Partly posted" />);

    expect(screen.getByText("Partly posted")).toHaveAttribute("data-tone", "warn");
    expect(container.querySelector(".ui-badge__dot")).toBeInTheDocument();
  });

  it("pulses its dot while live", () => {
    const { container } = render(<StatusBadge status="active" label="Running" isLive />);

    expect(container.querySelector(".ui-badge__dot--pulse")).toBeInTheDocument();
  });
});

describe("CountBadge", () => {
  it("shows the number, capped", () => {
    const { rerender } = render(<CountBadge count={7} />);
    expect(screen.getByText("7")).toHaveClass("ui-count");

    rerender(<CountBadge count={250} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("reads its label instead of the bare number", () => {
    const { container } = render(<CountBadge count={3} label="3 iterations" />);

    expect(container.firstElementChild).toHaveTextContent("3 iterations");
    expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Chip", () => {
  const Toggle = ({ onChange }: { onChange: (value: boolean) => void }): React.ReactElement => {
    const [isSelected, setIsSelected] = useState(false);
    return (
      <Chip
        isSelected={isSelected}
        onSelectedChange={(next) => {
          setIsSelected(next);
          onChange(next);
        }}
        tone="critical"
        hasDot
        count={3}
      >
        critical
      </Chip>
    );
  };

  it("is a toggle button with aria-pressed", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Toggle onChange={handleChange} />);
    const chip = screen.getByRole("button", { name: "critical 3" });

    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    chip.focus();
    await user.keyboard(" ");

    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(handleChange.mock.calls).toEqual([[true], [false]]);
  });

  it("is a plain button without a selected state", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Chip onClick={handleClick}>Clear filters</Chip>);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
