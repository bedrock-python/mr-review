import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Kbd } from "./Kbd";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("opens on keyboard focus and describes its trigger", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Finish Polish first">
        <button type="button">Post</button>
      </Tooltip>
    );

    await user.tab();

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Finish Polish first");
    expect(screen.getByRole("button", { name: "Post" })).toHaveAccessibleDescription(
      "Finish Polish first"
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Copy">
        <button type="button">Copy</button>
      </Tooltip>
    );
    await user.tab();
    await screen.findByRole("tooltip");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("shows a shortcut as a key cap", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Keyboard shortcuts" shortcut="?">
        <button type="button">Help</button>
      </Tooltip>
    );

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent("?");
  });

  it("never opens while disabled", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Finish Polish first" isDisabled>
        <button type="button">Post</button>
      </Tooltip>
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Post" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("Kbd", () => {
  it("renders a kbd element", () => {
    render(<Kbd>Esc</Kbd>);

    expect(screen.getByText("Esc").tagName).toBe("KBD");
  });
});
