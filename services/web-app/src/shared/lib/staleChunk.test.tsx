import { lazy, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@shared/ui/error-boundary";
import {
  STALE_CHUNK_RELOAD_INTERVAL_MS,
  STALE_CHUNK_RELOAD_KEY,
  createStaleChunkReloader,
  installStaleChunkReload,
  isChunkLoadError,
  reloadOnStaleChunk,
} from "./staleChunk";
import type { StaleChunkReloader } from "./staleChunk";

const CHUNK_ERROR = new TypeError(
  "Failed to fetch dynamically imported module: http://localhost/assets/index-old.js"
);

/** In-memory `Storage`: the test runner's own storage globals shadow jsdom's. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
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
};

const reloaderAt = (storage: Storage, time: { now: number }) => {
  const reloadPage = vi.fn();
  const reloader = createStaleChunkReloader({
    getStorage: () => storage,
    reloadPage,
    now: () => time.now,
  });
  return { reloader, reloadPage };
};

describe("createStaleChunkReloader", () => {
  it("reloads once, and not again within the interval in a new page of the same tab", () => {
    const storage = memoryStorage();
    const time = { now: 1_000_000 };
    const first = reloaderAt(storage, time);

    expect(first.reloader.reload()).toBe(true);
    expect(first.reloadPage).toHaveBeenCalledTimes(1);
    expect(first.reloader.reload()).toBe(true);
    expect(first.reloadPage).toHaveBeenCalledTimes(1);

    // The page after the reload still finds the chunk missing: no loop.
    time.now += 5_000;
    const second = reloaderAt(storage, time);
    expect(second.reloader.reload()).toBe(false);
    expect(second.reloadPage).not.toHaveBeenCalled();

    time.now += STALE_CHUNK_RELOAD_INTERVAL_MS;
    expect(second.reloader.reload()).toBe(true);
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe(String(time.now));
  });

  it("does not reload when it cannot remember having done so", () => {
    const reloadPage = vi.fn();
    const reloader = createStaleChunkReloader({
      getStorage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      reloadPage,
      now: () => 0,
    });

    expect(reloader.reload()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe("isChunkLoadError", () => {
  it("recognises the browsers' failed dynamic import errors only", () => {
    expect(isChunkLoadError(CHUNK_ERROR)).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("installStaleChunkReload", () => {
  it("reloads when Vite reports a chunk it could not load", () => {
    const reloader: StaleChunkReloader = { reload: vi.fn(() => true) };
    const remove = installStaleChunkReload(window, reloader);

    window.dispatchEvent(new Event("vite:preloadError"));
    remove();
    window.dispatchEvent(new Event("vite:preloadError"));

    expect(reloader.reload).toHaveBeenCalledTimes(1);
  });
});

describe("reloadOnStaleChunk", () => {
  const Ready = (): React.ReactElement => <p>stage</p>;

  const renderLazy = (load: () => Promise<{ default: () => React.ReactElement }>): void => {
    const Component = lazy(load);
    render(
      <ErrorBoundary fallbackRender={({ error }) => <p role="alert">{error.message}</p>}>
        <Suspense fallback={<p>loading</p>}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    );
  };

  it("keeps the fallback up while the page reloads for a missing chunk", async () => {
    const reloader: StaleChunkReloader = { reload: vi.fn(() => true) };

    renderLazy(reloadOnStaleChunk(() => Promise.reject(CHUNK_ERROR), reloader));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reloader.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the error through when a reload was already tried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reloader: StaleChunkReloader = { reload: vi.fn(() => false) };

    renderLazy(reloadOnStaleChunk(() => Promise.reject(CHUNK_ERROR), reloader));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch dynamically");
    vi.restoreAllMocks();
  });

  it("loads a chunk that is there", async () => {
    const reloader: StaleChunkReloader = { reload: vi.fn(() => true) };

    renderLazy(reloadOnStaleChunk(() => Promise.resolve({ default: Ready }), reloader));

    expect(await screen.findByText("stage")).toBeInTheDocument();
    expect(reloader.reload).not.toHaveBeenCalled();
  });
});
