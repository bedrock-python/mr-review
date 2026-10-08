import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { ReviewPresetsManager } from "./ReviewPresetsManager";
import type * as ReviewPresetApiModule from "@entities/review-preset/api/reviewPresetApi";
import type { ReviewPreset } from "@entities/review-preset";

const presetApi = vi.hoisted(() => ({
  list: vi.fn(),
  listBuiltin: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@entities/review-preset/api/reviewPresetApi", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewPresetApiModule>();
  return { ...actual, reviewPresetApi: { ...actual.reviewPresetApi, ...presetApi } };
});

const PRESET: ReviewPreset = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Public API",
  description: "Exported names only",
  instructions: "Review only the public API.",
  brief_config: { min_severity: "major" },
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  presetApi.list.mockResolvedValue([PRESET]);
  presetApi.listBuiltin.mockResolvedValue([
    { id: "security", name: "Security", description: "Auth", instructions: "Focus on security." },
  ]);
  presetApi.delete.mockResolvedValue(undefined);
  presetApi.update.mockImplementation((_id: string, data: Partial<ReviewPreset>) =>
    Promise.resolve({ ...PRESET, ...data })
  );
});

describe("ReviewPresetsManager", () => {
  it("lists saved presets with their instructions and the built-in ones", async () => {
    renderWithQueryClient(<ReviewPresetsManager />);

    const list = await screen.findByRole("list", { name: "Saved review presets" });
    expect(within(list).getByText("Public API")).toBeInTheDocument();
    expect(within(list).getByText("Exported names only · sets 1 brief option")).toBeInTheDocument();
    expect(within(list).getByText("Review only the public API.")).toBeInTheDocument();

    const builtins = screen.getByRole("button", { name: "Built-in presets" });
    expect(builtins).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(builtins);
    expect(screen.getByText("Focus on security.")).toBeInTheDocument();
  });

  it("deletes a preset only after a second, confirming click", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPresetsManager />);

    await user.click(await screen.findByRole("button", { name: "Delete preset Public API" }));
    expect(presetApi.delete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm deleting preset Public API" }));

    await waitFor(() => {
      expect(presetApi.delete).toHaveBeenCalledWith(PRESET.id);
    });
    await waitFor(() => {
      expect(screen.queryByText("Public API")).not.toBeInTheDocument();
    });
  });

  it("edits a preset's text", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPresetsManager />);

    await user.click(await screen.findByRole("button", { name: "Edit preset Public API" }));
    const form = screen.getByRole("form", { name: "Edit preset Public API" });
    const description = within(form).getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "Only what callers see");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(presetApi.update).toHaveBeenCalledWith(PRESET.id, {
        name: "Public API",
        description: "Only what callers see",
        instructions: "Review only the public API.",
      });
    });
    expect(
      await screen.findByText("Only what callers see · sets 1 brief option")
    ).toBeInTheDocument();
  });
});
