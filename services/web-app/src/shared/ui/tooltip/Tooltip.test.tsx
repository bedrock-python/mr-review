import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("does not open when code moves focus, only when the user does", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Tooltip content="Close" shortcut="Esc">
          <button type="button">X</button>
        </Tooltip>
      </>
    );

    // A dialog giving focus back, a panel focusing its first control
    await user.keyboard("{Escape}");
    act(() => {
      screen.getByRole("button", { name: "X" }).focus();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Before" }).focus();
    });
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close");
  });

  it("stays controlled when it is switched off and on, with no React warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { rerender } = render(
      <Tooltip content="Finish Brief first">
        <button type="button">Dispatch</button>
      </Tooltip>
    );
    rerender(
      <Tooltip content="Finish Brief first" isDisabled>
        <button type="button">Dispatch</button>
      </Tooltip>
    );
    rerender(
      <Tooltip content="Finish Brief first">
        <button type="button">Dispatch</button>
      </Tooltip>
    );

    const messages = [...warn.mock.calls, ...error.mock.calls].map((call) => String(call[0]));
    expect(messages.filter((message) => message.includes("controlled"))).toEqual([]);
    warn.mockRestore();
    error.mockRestore();
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
