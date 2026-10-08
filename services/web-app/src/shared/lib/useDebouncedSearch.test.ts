import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS, useDebouncedSearch } from "./useDebouncedSearch";

describe("useDebouncedSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits the trimmed value once typing pauses", () => {
    const { result } = renderHook(() => useDebouncedSearch());

    act(() => {
      result.current.setValue(" fe");
    });
    act(() => {
      result.current.setValue(" feat ");
    });
    expect(result.current.value).toBe(" feat ");
    expect(result.current.debouncedValue).toBe("");
    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(result.current.debouncedValue).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedValue).toBe("feat");
    expect(result.current.isPending).toBe(false);
  });

  it("commits a cleared box immediately and drops the pending value", () => {
    const { result } = renderHook(() => useDebouncedSearch());
    act(() => {
      result.current.setValue("feat");
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.debouncedValue).toBe("feat");

    act(() => {
      result.current.setValue("feature");
      result.current.setValue("");
    });
    expect(result.current.debouncedValue).toBe("");
    expect(result.current.isPending).toBe(false);

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.debouncedValue).toBe("");
  });
});
