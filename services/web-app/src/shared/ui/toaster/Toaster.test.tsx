import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Toaster } from "./Toaster";
import { toasterThemeFor } from "./toasterThemeFor";

const renderIn = (theme: string): void => {
  render(
    <ThemeProvider attribute="data-theme" themes={["ink", "paper", "phosphor"]} forcedTheme={theme}>
      <Toaster />
    </ThemeProvider>
  );
};

describe("Toaster", () => {
  beforeAll(() => {
    // jsdom has no pointer capture; sonner calls it when a toast button is pressed.
    for (const method of ["setPointerCapture", "releasePointerCapture"] as const) {
      if (!(method in Element.prototype)) {
        Object.defineProperty(Element.prototype, method, {
          configurable: true,
          value: () => undefined,
        });
      }
    }
  });

  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it.each([
    ["ink", "dark"],
    ["phosphor", "dark"],
    ["paper", "light"],
  ])("renders %s toasts in sonner's %s theme", async (theme, expected) => {
    renderIn(theme);

    act(() => {
      toast("Saved");
    });

    await screen.findByText("Saved");
    expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      expected
    );
  });

  it("styles toasts itself: no rich colours, the type on the toast", async () => {
    renderIn("ink");

    act(() => {
      toast.error("Failed to save comments");
    });

    const toastElement = (await screen.findByText("Failed to save comments")).closest(
      "[data-sonner-toast]"
    );
    expect(toastElement).toHaveAttribute("data-type", "error");
    expect(toastElement).not.toHaveAttribute("data-rich-colors", "true");
    expect(toastElement).toHaveClass("ui-toast");
  });

  it("keeps the action button working (Undo)", async () => {
    const user = userEvent.setup();
    const handleUndo = vi.fn();
    renderIn("ink");

    act(() => {
      toast("Comment dismissed", { action: { label: "Undo", onClick: handleUndo } });
    });
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(handleUndo).toHaveBeenCalledTimes(1);
  });
});

describe("toasterThemeFor", () => {
  it("is light only for paper, dark before the theme is known", () => {
    expect(toasterThemeFor("paper")).toBe("light");
    expect(toasterThemeFor("ink")).toBe("dark");
    expect(toasterThemeFor(undefined)).toBe("dark");
  });
});
