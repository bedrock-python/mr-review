import { afterEach, describe, expect, it, vi } from "vitest";
import { readStorageItem, writeStorageItem } from "./safeStorage";

const storageWith = (overrides: Partial<Storage>): Storage => {
  const items = new Map<string, string>();
  return {
    get length(): number {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => Array.from(items.keys())[index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
    ...overrides,
  };
};

describe("safeStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads back what it wrote", () => {
    vi.stubGlobal("localStorage", storageWith({}));

    expect(writeStorageItem("k", "v")).toBe(true);
    expect(readStorageItem("k")).toBe("v");
    expect(readStorageItem("missing")).toBeNull();
  });

  it("reports a write that exceeds the quota instead of throwing", () => {
    vi.stubGlobal(
      "localStorage",
      storageWith({
        setItem: () => {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        },
      })
    );

    expect(writeStorageItem("k", "v")).toBe(false);
  });

  it("treats unreadable storage as empty", () => {
    vi.stubGlobal(
      "localStorage",
      storageWith({
        getItem: () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      })
    );

    expect(readStorageItem("k")).toBeNull();
  });
});
