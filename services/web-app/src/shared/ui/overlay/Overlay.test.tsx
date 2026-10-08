import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu, MenuGroup, MenuItem, MenuSeparator } from "./Menu";
import { Popover } from "./Popover";

describe("Menu", () => {
  it("opens from its button, runs an item and gives focus back", async () => {
    const user = userEvent.setup();
    const handleKeep = vi.fn();
    render(
      <Menu aria-label="Bulk actions" trigger={<button type="button">Bulk</button>}>
        <MenuGroup label="All 3 comments">
          <MenuItem shortcut="a" onSelect={handleKeep}>
            Keep all
          </MenuItem>
          <MenuItem isDisabled onSelect={vi.fn()}>
            Dismiss all
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
      </Menu>
    );
    const trigger = screen.getByRole("button", { name: "Bulk" });

    await user.click(trigger);
    expect(await screen.findByRole("menu", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "All 3 comments" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Dismiss all/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await user.click(screen.getByRole("menuitem", { name: /Keep all/ }));

    expect(handleKeep).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("Popover", () => {
  const Filters = ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => {
    const [value, setValue] = useState("b");
    return (
      <Popover
        aria-label="Filters"
        trigger={<button type="button">Filters</button>}
        getInitialFocus={(panel) => panel.querySelector("input:checked")}
        {...(onOpenChange === undefined ? {} : { onOpenChange })}
      >
        {["a", "b"].map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="f"
              value={option}
              checked={value === option}
              onChange={() => {
                setValue(option);
              }}
            />
            {option}
          </label>
        ))}
      </Popover>
    );
  };

  it("is a named dialog that focuses the control asked for and closes on Escape", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    render(<Filters onOpenChange={handleOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Filters" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "b" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(handleOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});
