import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_BLOCKED_MESSAGE, copyText } from "./copyText";

const setClipboard = (clipboard: Partial<Clipboard> | undefined): void => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
};

const setSecure = (secure: boolean): void => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
};

describe("copyText", () => {
  const execCommand = vi.fn<(command: string) => boolean>();

  beforeEach(() => {
    // jsdom has no execCommand; the fallback path needs one to call.
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    execCommand.mockReset();
  });

  afterEach(() => {
    setClipboard(undefined);
    setSecure(false);
  });

  it("uses the Clipboard API on a secure origin", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setSecure(true);

    await copyText("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to a selection copy on a plain-http origin without the Clipboard API", async () => {
    setClipboard(undefined);
    setSecure(false);
    let selected = "";
    execCommand.mockImplementation((command) => {
      selected = document.querySelector("textarea")?.value ?? "";
      return command === "copy";
    });

    await copyText("from a LAN host");

    expect(selected).toBe("from a LAN host");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the Clipboard API refuses", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    setSecure(true);
    execCommand.mockReturnValue(true);

    await expect(copyText("x")).resolves.toBeUndefined();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("rejects with a clear message when both ways fail", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    setSecure(true);
    execCommand.mockReturnValue(false);

    await expect(copyText("x")).rejects.toThrow(COPY_BLOCKED_MESSAGE);
  });
});
