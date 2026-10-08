import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card } from "./Card";
import { SelectCardGroup } from "./SelectCardGroup";
import type { SelectCardOption } from "./SelectCard";

describe("Card", () => {
  it("renders the element it is asked for, padded by class", () => {
    render(
      <Card as="section" aria-label="Storage" padding="lg" surface="raised">
        Data folder
      </Card>
    );

    const card = screen.getByRole("region", { name: "Storage" });
    expect(card).toHaveClass("ui-card", "ui-card--pad-lg", "ui-card--raised");
  });

  it("has no padding class when told none", () => {
    render(<Card padding="none">Body</Card>);

    expect(screen.getByText("Body")).not.toHaveClass("ui-card--pad-md");
  });
});

type Preset = "quick" | "thorough" | "security";

const PRESETS: SelectCardOption<Preset>[] = [
  { value: "quick", title: "Quick", description: "Obvious bugs only." },
  { value: "thorough", title: "Thorough", description: "Everything worth saying." },
  { value: "security", title: "Security", isDisabled: true },
];

const Presets = ({ onChange }: { onChange?: (value: Preset) => void }): React.ReactElement => {
  const [value, setValue] = useState<Preset>("quick");
  return (
    <SelectCardGroup<Preset>
      aria-label="Preset"
      options={PRESETS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
};

describe("SelectCardGroup", () => {
  it("is a radio group with the value checked", () => {
    render(<Presets />);

    expect(screen.getByRole("radiogroup", { name: "Preset" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Quick/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Thorough/ })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("has one tab stop, on the checked card", async () => {
    const user = userEvent.setup();
    render(<Presets />);

    await user.tab();

    expect(screen.getByRole("radio", { name: /Quick/ })).toHaveFocus();
    expect(screen.getByRole("radio", { name: /Thorough/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with the arrows, skipping disabled cards and wrapping", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Presets onChange={handleChange} />);
    await user.tab();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Thorough/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: /Quick/ })).toHaveFocus();
    expect(handleChange.mock.calls).toEqual([["thorough"], ["quick"]]);
  });

  it("selects on click but not a disabled card", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Presets onChange={handleChange} />);

    await user.click(screen.getByRole("radio", { name: /Thorough/ }));
    await user.click(screen.getByRole("radio", { name: /Security/ }));

    expect(handleChange.mock.calls).toEqual([["thorough"]]);
    expect(screen.getByRole("radio", { name: /Security/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("does not choose a disabled card with Space", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Presets onChange={handleChange} />);
    const security = screen.getByRole("radio", { name: /Security/ });

    await user.click(security);
    security.focus();
    await user.keyboard(" ");

    expect(handleChange).not.toHaveBeenCalled();
    expect(security).toHaveAttribute("aria-checked", "false");
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    render(<Presets />);
    await user.tab();

    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: /Thorough/ })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: /Quick/ })).toHaveFocus();
  });
});
