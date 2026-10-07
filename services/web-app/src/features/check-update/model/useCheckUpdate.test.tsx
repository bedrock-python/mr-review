import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "@app/providers/queryClient";
import { createQueryClientWrapper } from "@shared/lib/test-utils";
import { checkUpdateApi } from "../api";
import { useCheckUpdate } from "./useCheckUpdate";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError, warning: vi.fn() } }));

describe("useCheckUpdate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastError.mockClear();
  });

  it("fails without a toast when GitHub cannot be reached", async () => {
    vi.spyOn(checkUpdateApi, "checkForUpdate").mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useCheckUpdate(), {
      wrapper: createQueryClientWrapper(createAppQueryClient()),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});
