import { describe, expect, it } from "vitest";
import { hostConnectionOf } from "./hostConnection";

const state = (overrides: Partial<Parameters<typeof hostConnectionOf>[0]>) => ({
  isError: false,
  isFetchNextPageError: false,
  isFetching: false,
  isSuccess: false,
  ...overrides,
});

describe("hostConnectionOf", () => {
  it("is connecting until the first page answers", () => {
    expect(hostConnectionOf(state({ isFetching: true }))).toBe("connecting");
  });

  it("is connected once a page arrived", () => {
    expect(hostConnectionOf(state({ isSuccess: true }))).toBe("connected");
  });

  it("is unreachable when the list request failed for good", () => {
    expect(hostConnectionOf(state({ isError: true }))).toBe("unreachable");
  });

  it("is connecting again while a failed request is retried", () => {
    expect(hostConnectionOf(state({ isError: true, isFetching: true }))).toBe("connecting");
  });

  it("stays connected when only a further page failed", () => {
    expect(hostConnectionOf(state({ isError: true, isFetchNextPageError: true }))).toBe(
      "connected"
    );
  });
});
