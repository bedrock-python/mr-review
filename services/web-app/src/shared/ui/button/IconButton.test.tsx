import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { X } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

const icon = <X size={16} aria-hidden="true" />;

describe("IconButton", () => {
  it("is named by its label", () => {
    render(<IconButton label="Close" icon={icon} />);

    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("ui-icon-btn");
  });

  it("shows its label as a tooltip on keyboard focus", async () => {
    const user = userEvent.setup();
    render(<IconButton label="Open history" icon={icon} shortcut="H" />);

    await user.tab();

    expect(screen.getByRole("button", { name: "Open history" })).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Open history");
    expect(tooltip).toHaveTextContent("H");
  });

  it("takes other tooltip text, or none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<IconButton label="Close" icon={icon} tooltip="Close (Esc)" />);
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close (Esc)");
    unmount();

    render(<IconButton label="Close" icon={icon} tooltip={false} />);
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("is a toggle when pressed is given", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<IconButton label="Pin" icon={icon} isPressed={false} onClick={handleClick} />);
    const button = screen.getByRole("button", { name: "Pin" });

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("has no aria-pressed when it is not a toggle", () => {
    render(<IconButton label="Refresh" icon={icon} />);

    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("sizes and variants by class", () => {
    render(<IconButton label="Delete" icon={icon} size="sm" variant="danger" />);

    expect(screen.getByRole("button")).toHaveClass("ui-icon-btn--sm", "ui-icon-btn--danger");
  });
});
