import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "../field";
import { Combobox } from "./Combobox";

const MODELS = ["claude-opus-5-5", "claude-haiku-4-5", "gpt-5"];

const Picker = ({
  allowsCustomValue = false,
  onChange,
}: {
  allowsCustomValue?: boolean;
  onChange?: (value: string) => void;
}): React.ReactElement => {
  const [value, setValue] = useState("claude-haiku-4-5");
  return (
    <>
      <Field label="Model">
        <Combobox
          options={MODELS}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onChange?.(next);
          }}
          allowsCustomValue={allowsCustomValue}
          listLabel="Models"
        />
      </Field>
      <button type="button">After</button>
    </>
  );
};

describe("Combobox", () => {
  it("is a named combobox showing the value, with a listbox it controls", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole("combobox", { name: "Model" });

    expect(input).toHaveValue("claude-haiku-4-5");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);

    expect(input).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Models" });
    expect(input).toHaveAttribute("aria-controls", list.id);
    expect(screen.getByRole("option", { name: "claude-haiku-4-5" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("moves with the arrows from the chosen value and takes it with Enter", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Picker onChange={handleChange} />);
    const input = screen.getByRole("combobox", { name: "Model" });

    await user.tab();
    await user.keyboard("{Escape}{ArrowDown}");
    const active = document.getElementById(input.getAttribute("aria-activedescendant") ?? "");
    expect(active).toHaveTextContent("claude-haiku-4-5");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(handleChange).toHaveBeenCalledWith("gpt-5");
    expect(input).toHaveValue("gpt-5");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("filters as you type and drops the search on Escape", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole("combobox", { name: "Model" });

    await user.click(input);
    await user.keyboard("gpt");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["gpt-5"]);
    await user.keyboard("{Escape}");

    expect(input).toHaveValue("claude-haiku-4-5");
  });

  it("offers and keeps a typed value only when custom values are allowed", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const { unmount } = render(<Picker onChange={handleChange} />);
    await user.click(screen.getByRole("combobox", { name: "Model" }));
    await user.keyboard("my-model");
    expect(screen.queryByRole("option", { name: "Use “my-model”" })).not.toBeInTheDocument();
    await user.tab();
    expect(handleChange).not.toHaveBeenCalled();
    unmount();

    render(<Picker allowsCustomValue onChange={handleChange} />);
    await user.click(screen.getByRole("combobox", { name: "Model" }));
    await user.keyboard("my-model");
    expect(screen.getByRole("option", { name: "Use “my-model”" })).toBeInTheDocument();
    await user.tab();

    expect(handleChange).toHaveBeenCalledWith("my-model");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("my-model");
  });
});
