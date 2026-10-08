import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StageFooter } from "../stage-footer";
import { Toolbar, ToolbarDivider, ToolbarSpacer } from "../toolbar";
import { SegmentedControl } from "./SegmentedControl";

type View = "list" | "pinned" | "thread";

const View = ({ onChange }: { onChange?: (value: View) => void }): React.ReactElement => {
  const [value, setValue] = useState<View>("list");
  return (
    <SegmentedControl<View>
      aria-label="View"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={[
        { value: "list", label: "List", count: 9 },
        { value: "pinned", label: "Pinned" },
        { value: "thread", label: "Thread", isDisabled: true, title: "No comments yet" },
      ]}
    />
  );
};

describe("SegmentedControl", () => {
  it("is a radio group with the value checked", () => {
    render(<View />);

    expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "List 9" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Pinned" })).toHaveAttribute("aria-checked", "false");
  });

  it("is one tab stop; the arrows move and select, skipping disabled options", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <>
        <View onChange={handleChange} />
        <button type="button">After</button>
      </>
    );

    await user.tab();
    expect(screen.getByRole("radio", { name: "List 9" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Pinned" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "List 9" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    await user.tab();

    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(handleChange.mock.calls).toEqual([["pinned"], ["list"], ["pinned"]]);
  });

  it("is a horizontal group that leaves ↑ ↓ to the page", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const pageKeys: { key: string; isHandled: boolean }[] = [];
    const handlePageKey = (event: KeyboardEvent): void => {
      pageKeys.push({ key: event.key, isHandled: event.defaultPrevented });
    };
    render(<View onChange={handleChange} />);

    await user.tab();
    document.addEventListener("keydown", handlePageKey);
    await user.keyboard("{ArrowDown}{ArrowUp}{End}{Home}");
    document.removeEventListener("keydown", handlePageKey);

    expect(screen.getByRole("radiogroup", { name: "View" })).toHaveAttribute(
      "aria-orientation",
      "horizontal"
    );
    expect(screen.getByRole("radio", { name: "List 9" })).toHaveFocus();
    expect(handleChange.mock.calls).toEqual([["pinned"], ["list"]]);
    expect(pageKeys).toEqual([
      { key: "ArrowDown", isHandled: false },
      { key: "ArrowUp", isHandled: false },
      { key: "End", isHandled: true },
      { key: "Home", isHandled: true },
    ]);
  });

  it("selects on click, not on a disabled option", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<View onChange={handleChange} />);

    await user.click(screen.getByRole("radio", { name: "Thread" }));
    await user.click(screen.getByRole("radio", { name: "Pinned" }));

    expect(handleChange.mock.calls).toEqual([["pinned"]]);
    expect(screen.getByRole("radio", { name: "Thread" })).toHaveAttribute(
      "title",
      "No comments yet"
    );
  });
});

describe("SegmentedControl, options and layout", () => {
  it("names icon-only options, takes a description, and can span its row", () => {
    render(
      <>
        <p id="view-hint">Tree groups the files by folder.</p>
        <SegmentedControl
          aria-label="File view"
          aria-describedby="view-hint"
          isFullWidth
          value="tree"
          onValueChange={vi.fn()}
          options={[
            { value: "tree", "aria-label": "Tree", icon: <svg aria-hidden="true" /> },
            { value: "list", "aria-label": "List", icon: <svg aria-hidden="true" /> },
          ]}
        />
      </>
    );

    const group = screen.getByRole("radiogroup", { name: "File view" });
    expect(group).toHaveAccessibleDescription("Tree groups the files by folder.");
    expect(group).toHaveClass("ui-segmented--full");
    expect(screen.getByRole("radio", { name: "Tree" })).toHaveAttribute("title", "Tree");
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("SegmentedControl, manual activation", () => {
  it("moves focus with the arrows and chooses only on Space or Enter", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <>
        <SegmentedControl<View>
          aria-label="Apply"
          activation="manual"
          value="list"
          onValueChange={handleChange}
          options={[
            { value: "list", label: "List" },
            { value: "pinned", label: "Pinned" },
            { value: "thread", label: "Thread" },
          ]}
        />
        <button type="button">After</button>
      </>
    );

    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Thread" })).toHaveFocus();
    expect(handleChange).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowLeft} ");
    expect(handleChange.mock.calls).toEqual([["thread"], ["pinned"]]);

    // Away and back: the tab stop is the chosen option again, not the last one focused.
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole("radio", { name: "List" })).toHaveFocus();
  });
});

describe("SegmentedControl, a disabled option", () => {
  it("is not chosen by Space even when it has focus", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<View onChange={handleChange} />);
    const thread = screen.getByRole("radio", { name: "Thread" });

    await user.click(thread);
    expect(thread).toHaveFocus();
    await user.keyboard(" ");

    expect(handleChange).not.toHaveBeenCalled();
    expect(thread).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "List 9" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("Toolbar", () => {
  it("lays out controls with spacer and divider hidden from assistive tech", () => {
    const { container } = render(
      <Toolbar aria-label="Comment filters" size="sm">
        <button type="button">Search</button>
        <ToolbarDivider />
        <ToolbarSpacer />
        <button type="button">New comment</button>
      </Toolbar>
    );

    expect(container.firstElementChild).toHaveClass("ui-toolbar", "ui-toolbar--sm");
    expect(container.querySelector(".ui-toolbar__spacer")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".ui-toolbar__divider")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Comment filters" })).toBe(
      container.firstElementChild
    );
  });
});

describe("StageFooter, message and column", () => {
  it("shows a message in place of the summary and lines up with a column", () => {
    render(
      <StageFooter
        summary="Thorough"
        message={<p>Everything is excluded by the path filters.</p>}
        contentMaxWidth="660px"
        primaryAction={<button type="button">Continue</button>}
      />
    );

    const footer = screen.getByRole("region", { name: "Stage actions" });
    expect(footer).toHaveTextContent("Everything is excluded by the path filters.");
    expect(footer).not.toHaveTextContent("Thorough");
    expect(footer).toHaveClass("ui-stage-footer--column");
    expect(footer.style.getPropertyValue("--stage-footer-content")).toBe("660px");
  });
});

describe("StageFooter", () => {
  it("is a named region with the summary and the actions in order", () => {
    render(
      <StageFooter
        summary="Thorough · ~1.7k tokens"
        secondaryActions={<button type="button">Dry run</button>}
        primaryAction={<button type="button">Continue to Dispatch</button>}
      />
    );

    const footer = screen.getByRole("region", { name: "Stage actions" });
    expect(footer).toHaveTextContent("Thorough · ~1.7k tokens");
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Dry run", "Continue to Dispatch"]);
  });
});
