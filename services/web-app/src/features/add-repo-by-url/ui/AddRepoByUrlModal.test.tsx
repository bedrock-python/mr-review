import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper, createTestQueryClient } from "@shared/lib/test-utils";
import { AddRepoByUrlModal } from "./AddRepoByUrlModal";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const Harness = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Add repository
      </button>
      <AddRepoByUrlModal
        isOpen={isOpen}
        hostId="11111111-1111-4111-8111-111111111111"
        onClose={() => {
          setIsOpen(false);
        }}
      />
    </>
  );
};

const renderHarness = (): void => {
  render(<Harness />, { wrapper: createQueryClientWrapper(createTestQueryClient()) });
};

describe("AddRepoByUrlModal", () => {
  it("starts in the URL field and keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Add repository" }));

    const field = screen.getByRole("textbox", { name: "Repository URL or owner/repo" });
    expect(field).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("dialog", { name: "Add repository by URL" })).toContainElement(
      document.activeElement as HTMLElement
    );
  });

  it("closes on Escape and gives focus back to the button that opened it", async () => {
    const user = userEvent.setup();
    renderHarness();
    const trigger = screen.getByRole("button", { name: "Add repository" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});
