import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { checkUpdateApi } from "../api";
import { useDismissStore } from "../model/useDismissUpdate";
import { UpdateBanner } from "./UpdateBanner";

// The dismiss store persists to localStorage, which Node 26's own (file-less) global
// shadows in jsdom; an in-memory one, in place before the store module loads.
vi.hoisted(() => {
  const items = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

const release = (tag: string) => ({
  tag_name: tag,
  name: tag,
  body: "## Bug Fixes\n\n* parse comments reliably",
  html_url: `https://github.com/bedrock-python/mr-review/releases/tag/${tag}`,
  published_at: "2026-10-07T10:00:00Z",
  draft: false,
  prerelease: false,
});

describe("UpdateBanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useDismissStore.setState({ dismissed: [] });
  });

  it("names the part that has a newer release, as the version badge does", async () => {
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
    renderWithQueryClient(<UpdateBanner />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "API v0.3.0 is available — you're on v0.2.1"
    );

    await user.click(screen.getByRole("button", { name: "What's new" }));
    expect(
      await screen.findByRole("dialog", { name: "What's new in API v0.3.0" })
    ).toHaveTextContent("parse comments reliably");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Dismiss update notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
