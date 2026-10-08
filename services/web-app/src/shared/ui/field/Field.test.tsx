import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Search } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "../SearchField";
import { Field } from "./Field";
import { Input } from "./Input";
import { Select } from "./Select";
import { Textarea } from "./Textarea";

describe("Select width", () => {
  it("fills its container by default and takes its own width in a row when asked", () => {
    render(
      <>
        <Select aria-label="Type">
          <option>GitLab</option>
        </Select>
        <Select aria-label="Sort by" isFullWidth={false}>
          <option>Updated</option>
        </Select>
      </>
    );

    expect(screen.getByRole("combobox", { name: "Type" }).parentElement).not.toHaveClass(
      "ui-select-shell--auto"
    );
    expect(screen.getByRole("combobox", { name: "Sort by" }).parentElement).toHaveClass(
      "ui-select-shell--auto"
    );
  });
});

describe("SearchField", () => {
  it("forwards its ref to the input", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(
      <SearchField
        ref={ref}
        value=""
        onValueChange={vi.fn()}
        placeholder="Search"
        ariaLabel="Search"
      />
    );

    expect(ref.current).toBe(screen.getByRole("searchbox", { name: "Search" }));
  });
});

describe("Field", () => {
  it("labels its control", () => {
    render(
      <Field label="Base URL">
        <Input />
      </Field>
    );

    expect(screen.getByRole("textbox", { name: "Base URL" })).toHaveClass("ui-input");
  });

  it("uses the given id for the control", () => {
    render(
      <Field label="Name" id="host-name">
        <Input />
      </Field>
    );

    expect(screen.getByLabelText("Name")).toHaveAttribute("id", "host-name");
  });

  it("describes the control with its hint", () => {
    render(
      <Field label="Access Token" hint="Needs the api scope.">
        <Input type="password" />
      </Field>
    );

    expect(screen.getByLabelText("Access Token")).toHaveAccessibleDescription(
      "Needs the api scope."
    );
    expect(screen.getByLabelText("Access Token")).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and describes it with hint and error", () => {
    render(
      <Field label="Base URL" hint="https:// only." error="Not a URL">
        <Input />
      </Field>
    );
    const input = screen.getByLabelText("Base URL");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("https:// only. Not a URL");
  });

  it("drops the error state once the error is gone", () => {
    const { rerender } = render(
      <Field label="Name" error="Required">
        <Input />
      </Field>
    );
    rerender(
      <Field label="Name" error={undefined}>
        <Input />
      </Field>
    );

    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });

  it("marks the control required", () => {
    render(
      <Field label="Name" isRequired>
        <Input />
      </Field>
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toBeRequired();
  });

  it("keeps a hidden label readable", () => {
    render(
      <Field label="Search models" isLabelHidden>
        <Input type="search" />
      </Field>
    );

    expect(screen.getByRole("searchbox", { name: "Search models" })).toBeInTheDocument();
  });

  it("lets the control's own aria props win", () => {
    render(
      <>
        <p id="extra">Extra help</p>
        <Field label="Name" hint="Shown in the rail.">
          <Input aria-describedby="extra" />
        </Field>
      </>
    );

    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      "Extra help Shown in the rail."
    );
  });

  it("wires Textarea and Select the same way", () => {
    render(
      <>
        <Field label="System prompt" error="Too long">
          <Textarea isMono />
        </Field>
        <Field label="Sort by" hint="Applies to every repository.">
          <Select defaultValue="updated">
            <option value="updated">Updated</option>
            <option value="created">Created</option>
          </Select>
        </Field>
      </>
    );

    const textarea = screen.getByRole("textbox", { name: "System prompt" });
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveClass("ui-textarea--mono");
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveAccessibleDescription(
      "Applies to every repository."
    );
  });
});

describe("Input", () => {
  it("types like a native input", async () => {
    const user = userEvent.setup();
    const Controlled = (): React.ReactElement => {
      const [value, setValue] = useState("");
      return (
        <Input
          aria-label="Model"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      );
    };
    render(<Controlled />);

    await user.type(screen.getByRole("textbox", { name: "Model" }), "gpt-review");

    expect(screen.getByRole("textbox")).toHaveValue("gpt-review");
  });

  it("draws an icon box around itself and marks it invalid", () => {
    const { container } = render(
      <Input aria-label="Filter files" leadingIcon={<Search size={13} />} isInvalid />
    );

    const shell = container.querySelector(".ui-input-shell");
    expect(shell).toHaveAttribute("data-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Filter files" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("forwards the ref to the input", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input aria-label="Name" ref={ref} />);

    expect(ref.current).toBe(screen.getByRole("textbox"));
  });
});

describe("Select", () => {
  it("changes value with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="Effort" defaultValue="low">
        <option value="low">Low</option>
        <option value="high">High</option>
      </Select>
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Effort" }), "high");

    expect(screen.getByRole("combobox")).toHaveValue("high");
  });
});
