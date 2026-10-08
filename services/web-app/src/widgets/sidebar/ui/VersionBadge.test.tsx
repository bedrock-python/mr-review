import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUpdateApi } from "@features/check-update/api";
import { systemApi } from "@shared/api";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { VersionBadge } from "./VersionBadge";
import type { UpdateInfo } from "@features/check-update";
import type { SystemInfo } from "@shared/api";

const SYSTEM_INFO: SystemInfo = {
  data_dir: "/data",
  os: "Linux",
  os_version: "6.1",
  python_version: "3.12",
  can_open_explorer: false,
  backend_version: "0.2.1",
  frontend_version: null,
  deployment_mode: "standard",
};

const release = (tag: string) => ({
  tag_name: tag,
  name: tag,
  body: "## Features\n\n* faster",
  html_url: `https://github.com/bedrock-python/mr-review/releases/tag/${tag}`,
  published_at: "2026-10-07T10:00:00Z",
  draft: false,
  prerelease: false,
});

const updateInfo = (isUpdateAvailable: boolean): UpdateInfo => ({
  backend: {
    current: "0.2.1",
    latest: isUpdateAvailable ? "0.3.0" : "0.2.1",
    isUpdateAvailable,
    release: release(isUpdateAvailable ? "mr-review-v0.3.0" : "mr-review-v0.2.1"),
  },
  frontend: null,
  isAnyUpdateAvailable: isUpdateAvailable,
  deploymentMode: "standard",
});

const githubError = (status: number): AxiosError => {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data: {},
  });
};

describe("VersionBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names both versions even when GitHub cannot be reached", async () => {
    vi.spyOn(systemApi, "getInfo").mockResolvedValue(SYSTEM_INFO);
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockRejectedValue(new Error("Network Error"));
    const user = userEvent.setup();
    renderWithQueryClient(<VersionBadge />);

    // The name starts with what the button shows.
    const badge = await screen.findByRole("button", {
      name: "web 0.0.0-test · api 0.2.1 — versions",
    });
    expect(badge).toHaveTextContent("web 0.0.0-test·api 0.2.1");

    await user.click(badge);

    const dialog = await screen.findByRole("dialog", { name: "Versions" });
    expect(within(dialog).getByText("v0.0.0-test")).toBeInTheDocument();
    expect(within(dialog).getByText("v0.2.1")).toBeInTheDocument();
    expect(
      await within(dialog).findByText("Could not reach GitHub to look for updates.")
    ).toBeInTheDocument();
    // Nothing was compared, so nothing is called up to date.
    expect(within(dialog).queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("stops calling a version up to date when a later look fails", async () => {
    vi.spyOn(systemApi, "getInfo").mockResolvedValue(SYSTEM_INFO);
    const check = vi
      .spyOn(checkUpdateApi, "checkForUpdate")
      .mockResolvedValueOnce(updateInfo(false))
      .mockRejectedValueOnce(githubError(403));
    const user = userEvent.setup();
    renderWithQueryClient(<VersionBadge />);

    await user.click(await screen.findByRole("button", { name: /— versions$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Versions" });
    expect(await within(dialog).findByText("Up to date")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));

    expect(
      await within(dialog).findByText("GitHub's rate limit was reached. Try again later.")
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Up to date")).not.toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("shows what is new in the part that has a newer release, then returns to the badge", async () => {
    vi.spyOn(systemApi, "getInfo").mockResolvedValue(SYSTEM_INFO);
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockResolvedValue(updateInfo(true));
    const user = userEvent.setup();
    renderWithQueryClient(<VersionBadge />);

    const badge = await screen.findByRole("button", {
      name: "web 0.0.0-test · api 0.2.1 — versions, update available",
    });
    await user.click(badge);
    const dialog = await screen.findByRole("dialog", { name: "Versions" });
    expect(within(dialog).getByText("v0.3.0 available")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "What's new" }));

    const notes = await screen.findByRole("dialog", { name: "What's new in API v0.3.0" });
    expect(screen.queryByRole("dialog", { name: "Versions" })).not.toBeInTheDocument();

    await user.click(within(notes).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(badge).toHaveFocus();
    });
  });
});
