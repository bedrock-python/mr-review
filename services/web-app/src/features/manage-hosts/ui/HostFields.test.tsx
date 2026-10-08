import { useForm } from "react-hook-form";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EMPTY_HOST_FORM } from "../model/hostForm";
import { HostFields } from "./HostFields";
import type { HostFormValues } from "../model/hostForm";

const Form = ({ mode }: { mode: "create" | "edit" }): React.ReactElement => {
  const form = useForm<HostFormValues>({
    defaultValues: { ...EMPTY_HOST_FORM, type: mode === "edit" ? "gitea" : "gitlab" },
  });
  return (
    <form>
      <HostFields form={form} mode={mode} />
    </form>
  );
};

describe("HostFields", () => {
  it("creates: picks the type and links to where the token is made", async () => {
    const user = userEvent.setup();
    render(<Form mode="create" />);

    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("gitlab");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Base URL"), "https://gitlab.example.com");

    expect(
      screen.getByRole("link", { name: /Create a token on gitlab.example.com/ })
    ).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("Access token")).toHaveAccessibleDescription(
      "Stored on the server, never exposed to the browser."
    );
    expect(screen.getByRole("group", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout (s)")).toHaveValue(30);
  });

  it("edits: the type is fixed and an empty token keeps the saved one", () => {
    render(<Form mode="edit" />);

    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Access token")).toHaveAccessibleDescription(
      "Leave blank to keep the existing token."
    );
    expect(screen.getByPlaceholderText("New token (optional)")).toBeInTheDocument();
  });
});
