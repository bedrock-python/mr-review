import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "../drawer";
import { Dialog } from "./Dialog";

const Harness = ({
  withFooter = true,
  onClose,
}: {
  withFooter?: boolean;
  onClose?: () => void;
}): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Add host
      </button>
      <Dialog
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          onClose?.();
        }}
        title="Add host"
        description="Connect a GitLab or GitHub instance."
        footer={
          withFooter ? (
            <>
              <button type="button">Cancel</button>
              <button type="submit">Add</button>
            </>
          ) : undefined
        }
      >
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  );
};

describe("Dialog", () => {
  it("is a named, described modal dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add host" }));

    const dialog = screen.getByRole("dialog", { name: "Add host" });
    expect(dialog).toHaveAccessibleDescription("Connect a GitLab or GitHub instance.");
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("focuses the first control of the body, not the close button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add host" }));

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });

  it("closes on Escape and gives focus back to what opened it", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<Harness onClose={handleClose} />);
    const opener = screen.getByRole("button", { name: "Add host" });

    await user.click(opener);
    await user.keyboard("{Escape}");

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<Harness onClose={handleClose} />);

    await user.click(screen.getByRole("button", { name: "Add host" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add host" }));

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("focuses what initialFocusRef points at", async () => {
    const user = userEvent.setup();
    const WithRef = (): React.ReactElement => {
      const [isOpen, setIsOpen] = useState(false);
      const saveRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
            }}
          >
            Open
          </button>
          <Dialog
            isOpen={isOpen}
            onClose={() => {
              setIsOpen(false);
            }}
            title="Unsaved changes"
            initialFocusRef={saveRef}
            footer={
              <>
                <button type="button">Discard</button>
                <button type="button" ref={saveRef}>
                  Save
                </button>
              </>
            }
          />
        </>
      );
    };
    render(<WithRef />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Unsaved changes" })).not.toHaveAttribute(
      "aria-describedby"
    );
  });
});

describe("Drawer", () => {
  const DrawerHarness = (): React.ReactElement => {
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
        >
          History
        </button>
        <Drawer
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
          }}
          title="Review History"
          headerExtra={<span>3</span>}
          initialFocusRef={searchRef}
        >
          <input ref={searchRef} aria-label="Search reviews" />
        </Drawer>
      </>
    );
  };

  it("renders nothing while closed", () => {
    render(<DrawerHarness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opens as a named dialog with focus where asked, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("dialog", { name: "Review History" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search reviews" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "History" })).toHaveFocus();
    });
  });
});
