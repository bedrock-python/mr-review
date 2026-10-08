import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

const renderConfirm = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  render(
    <ConfirmDialog
      isOpen
      title="Remove GitLab Acme?"
      description="Its token is deleted."
      confirmLabel="Remove host"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe("ConfirmDialog", () => {
  it("asks with the consequence, Cancel first and focused, the action after", async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderConfirm();
    const dialog = screen.getByRole("dialog", { name: "Remove GitLab Acme?" });

    expect(dialog).toHaveAccessibleDescription("Its token is deleted.");
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(["Cancel", "Remove host"]);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove host" })).toHaveClass("ui-btn--danger");

    await user.click(screen.getByRole("button", { name: "Remove host" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cannot be left while the action runs", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderConfirm({ isPending: true });

    await user.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove host" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("has a primary tone for a confirmation that destroys nothing", () => {
    renderConfirm({ tone: "primary", confirmLabel: "Post it again" });

    expect(screen.getByRole("button", { name: "Post it again" })).toHaveClass("ui-btn--primary");
  });

  it("draws one rule between header and footer when it has no body", () => {
    renderConfirm();

    const header = document.querySelector(".ui-dialog__header");
    expect(header?.nextElementSibling).toHaveClass("ui-dialog__footer");
  });
});
