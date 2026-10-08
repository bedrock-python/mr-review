import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { buttonClassName } from "./buttonClassName";

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn((event: React.FormEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={handleSubmit}>
        <Button>Cancel</Button>
      </form>
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("submits when asked to", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn((event: React.FormEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={handleSubmit}>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onClick and responds to Enter and Space", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Run</Button>);

    await user.click(screen.getByRole("button", { name: "Run" }));
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(handleClick).toHaveBeenCalledTimes(3);
  });

  it("renders the variant, size and width as classes", () => {
    render(
      <Button variant="danger" size="lg" isFullWidth>
        Delete
      </Button>
    );

    expect(screen.getByRole("button")).toHaveClass(
      "ui-btn",
      "ui-btn--danger",
      "ui-btn--lg",
      "ui-btn--block"
    );
  });

  it("keeps the icon out of the accessible name", () => {
    render(<Button icon={<Plus size={14} aria-hidden="true" />}>Add host</Button>);

    expect(screen.getByRole("button", { name: "Add host" })).toBeInTheDocument();
  });

  it("while loading: stays focusable, says busy, ignores clicks", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Posting…
      </Button>
    );
    const button = screen.getByRole("button", { name: "Posting…" });

    await user.click(button);
    button.focus();

    expect(handleClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
  });

  it("is disabled like a native button", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Continue
      </Button>
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("draws an xs size and the danger tone on a quiet button", () => {
    render(
      <Button variant="ghost" tone="danger" size="xs">
        Remove
      </Button>
    );

    expect(screen.getByRole("button")).toHaveClass(
      "ui-btn--ghost",
      "ui-btn--xs",
      "ui-btn--tone-danger"
    );
  });

  it("with a disabled reason: stays focusable, ignores clicks, says why", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button disabledReason="Posted iterations are read-only" onClick={handleClick}>
        New comment
      </Button>
    );
    const button = screen.getByRole("button", { name: "New comment" });

    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Posted iterations are read-only");
    await user.keyboard("{Enter}");
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
  });

  it("works again once the reason is gone, and shows its own tooltip", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button tooltip="New comment" shortcut="n" disabledReason={null} onClick={handleClick}>
        Add
      </Button>
    );

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.tab();
    await user.tab({ shift: true });

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-disabled");
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("New comment");
    expect(tooltip).toHaveTextContent("n");
  });

  it("forwards the ref to the button", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Go</Button>);

    expect(ref.current).toBe(screen.getByRole("button"));
  });
});

describe("buttonClassName", () => {
  it("styles a link like a button", () => {
    render(
      <a href="https://example.com" className={buttonClassName({ variant: "ghost", size: "sm" })}>
        Open in GitLab
      </a>
    );

    expect(screen.getByRole("link")).toHaveClass("ui-btn", "ui-btn--ghost", "ui-btn--sm");
  });

  it("defaults to a medium secondary button", () => {
    expect(buttonClassName()).toBe("ui-btn ui-btn--secondary");
  });
});
