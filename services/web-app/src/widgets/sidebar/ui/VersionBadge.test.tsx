import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUpdateApi } from "@features/check-update/api";
import { systemApi } from "@shared/api";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { VersionBadge } from "./VersionBadge";
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

describe("VersionBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names both versions even when GitHub cannot be reached", async () => {
    vi.spyOn(systemApi, "getInfo").mockResolvedValue(SYSTEM_INFO);
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockRejectedValue(new Error("Network Error"));
    const user = userEvent.setup();
    renderWithQueryClient(<VersionBadge />);

    const badge = await screen.findByRole("button", {
      name: "Versions: web app 0.0.0-test, API 0.2.1",
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

  it("says which part has a newer release and shows what is new in it", async () => {
    vi.spyOn(systemApi, "getInfo").mockResolvedValue(SYSTEM_INFO);
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockResolvedValue({
      backend: {
        current: "0.2.1",
        latest: "0.3.0",
        isUpdateAvailable: true,
        release: release("mr-review-v0.3.0"),
      },
      frontend: null,
      isAnyUpdateAvailable: true,
      deploymentMode: "standard",
    });
    const user = userEvent.setup();
    renderWithQueryClient(<VersionBadge />);

    await user.click(
      await screen.findByRole("button", {
        name: "Versions: web app 0.0.0-test, API 0.2.1, update available",
      })
    );
    const dialog = await screen.findByRole("dialog", { name: "Versions" });
    expect(within(dialog).getByText("v0.3.0 available")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "What's new" }));

    expect(
      await screen.findByRole("dialog", { name: "What's new in API v0.3.0" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Versions" })).not.toBeInTheDocument();
  });
});
