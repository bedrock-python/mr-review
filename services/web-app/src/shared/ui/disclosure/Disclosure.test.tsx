import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("is a button in a heading that opens and closes its content", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Advanced" summary="2 of 7 files excluded" headingLevel="h2">
        <p>Path filters</p>
      </Disclosure>
    );
    const button = screen.getByRole("button", { name: "Advanced 2 of 7 files excluded" });

    expect(screen.getByRole("heading", { level: 2 })).toContainElement(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Path filters")).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel).toHaveTextContent("Path filters");
    expect(screen.getByRole("region", { name: /Advanced/ })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(screen.queryByText("Path filters")).not.toBeInTheDocument();
  });

  it("can be controlled from outside", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    const Controlled = (): React.ReactElement => {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Close it
          </button>
          <Disclosure
            title="Advanced"
            isOpen={isOpen}
            onOpenChange={(next) => {
              handleOpenChange(next);
              setIsOpen(next);
            }}
          >
            <p>Inside</p>
          </Disclosure>
        </>
      );
    };
    render(<Controlled />);

    expect(screen.getByText("Inside")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close it" }));
    expect(screen.queryByText("Inside")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    expect(handleOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });

  it("can keep its content in the page, hidden until found, and open on a match", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Built-in presets" variant="inline" shouldKeepMounted>
        <p>Thorough</p>
      </Disclosure>
    );
    const button = screen.getByRole("button", { name: "Built-in presets" });
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");

    expect(screen.getByText("Thorough")).toBeInTheDocument();
    expect(panel).toHaveAttribute("hidden", "until-found");
    expect(screen.queryByText("Thorough")).not.toBeVisible();

    act(() => {
      panel?.dispatchEvent(new Event("beforematch"));
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");

    await user.click(button);
    expect(panel).toHaveAttribute("hidden", "until-found");
  });

  it("inline: no landmark and no heading when asked", () => {
    render(
      <Disclosure title="Built-in presets" variant="inline" headingLevel="none" defaultIsOpen>
        <p>Thorough</p>
      </Disclosure>
    );

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Built-in presets" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Thorough")).toBeInTheDocument();
  });
});
