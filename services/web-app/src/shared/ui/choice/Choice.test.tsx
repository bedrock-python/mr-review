import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";
import { Radio } from "./Radio";
import { RadioGroup } from "./RadioGroup";
import { Switch } from "./Switch";

describe("Checkbox", () => {
  it("is named by its label alone and described by its description", () => {
    render(<Checkbox label="Include diff" description="The full patch, up to the budget." />);

    const box = screen.getByRole("checkbox", { name: "Include diff" });
    expect(box).toHaveAccessibleDescription("The full patch, up to the budget.");
  });

  it("toggles from the label text and from Space", async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    render(<Checkbox label="Line numbers" onCheckedChange={handleCheckedChange} />);

    await user.click(screen.getByText("Line numbers"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    await user.keyboard(" ");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(handleCheckedChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reads as mixed when indeterminate", () => {
    render(<Checkbox label="All files" isIndeterminate />);

    expect(screen.getByRole("checkbox", { name: "All files" })).toBePartiallyChecked();
  });

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Locked" disabled />);

    await user.click(screen.getByText("Locked"));

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("keeps a hidden label as the name", () => {
    render(<Checkbox label="Select comment" isLabelHidden />);

    expect(screen.getByRole("checkbox", { name: "Select comment" })).toBeInTheDocument();
  });
});

describe("Switch", () => {
  it("is a switch that turns on and off", async () => {
    const user = userEvent.setup();
    const handleCheckedChange = vi.fn();
    render(<Switch label="Reasoning" onCheckedChange={handleCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Reasoning" });

    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(handleCheckedChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe("RadioGroup", () => {
  const Group = ({ isDisabled = false }: { isDisabled?: boolean }): React.ReactElement => {
    const [value, setValue] = useState("all");
    return (
      <RadioGroup legend="Export" value={value} onValueChange={setValue} isDisabled={isDisabled}>
        <Radio value="all" label="Everything" />
        <Radio value="hosts" label="Hosts only" description="No tokens." />
        <Radio value="reviews" label="Reviews only" />
      </RadioGroup>
    );
  };

  it("is a group named by its legend, with the value checked", () => {
    render(<Group />);

    expect(screen.getByRole("group", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Everything" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Hosts only" })).toHaveAccessibleDescription(
      "No tokens."
    );
  });

  it("changes value on click and with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Group />);

    await user.click(screen.getByText("Hosts only"));
    expect(screen.getByRole("radio", { name: "Hosts only" })).toBeChecked();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Reviews only" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Reviews only" })).toHaveFocus();
  });

  it("shares one name between its radios", () => {
    render(<Group />);

    const names = new Set(screen.getAllByRole("radio").map((radio) => radio.getAttribute("name")));
    expect(names.size).toBe(1);
  });

  it("disables every radio", () => {
    render(<Group isDisabled />);

    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
