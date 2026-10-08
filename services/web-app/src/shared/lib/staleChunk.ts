/**
 * After an upgrade the old build's hashed chunks are gone from the server: a page loaded
 * before it fails on its next lazy import. Reloading fetches the new index.html and its
 * chunks. The reload happens at most once a minute per tab, so a chunk that is missing for
 * another reason ends in an error message instead of a reload loop.
 */
export const STALE_CHUNK_RELOAD_KEY = "mr-review:stale-chunk-reload-at";
export const STALE_CHUNK_RELOAD_INTERVAL_MS = 60_000;

const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** The error a failed `import()` of a build chunk ends in (Chromium, Firefox, Safari, Vite). */
export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);

export type StaleChunkReloader = {
  /** Starts a reload unless one was tried within the interval; true while one is underway. */
  reload: () => boolean;
};

export type StaleChunkReloaderDeps = {
  getStorage: () => Storage;
  reloadPage: () => void;
  now: () => number;
};

export const createStaleChunkReloader = ({
  getStorage,
  reloadPage,
  now,
}: StaleChunkReloaderDeps): StaleChunkReloader => {
  let isReloading = false;
  return {
    reload: (): boolean => {
      if (isReloading) return true;
      try {
        const storage = getStorage();
        const last = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY));
        const time = now();
        if (Number.isFinite(last) && time - last < STALE_CHUNK_RELOAD_INTERVAL_MS) return false;
        storage.setItem(STALE_CHUNK_RELOAD_KEY, String(time));
      } catch {
        // Without storage there is no guard against a loop: leave it to the error message.
        return false;
      }
      isReloading = true;
      reloadPage();
      return true;
    },
  };
};

export const staleChunkReloader: StaleChunkReloader = createStaleChunkReloader({
  getStorage: () => window.sessionStorage,
  reloadPage: () => {
    window.location.reload();
  },
  now: () => Date.now(),
});

/**
 * Reloads when Vite reports a chunk it could not load (`vite:preloadError`), which covers
 * every lazy import of the build. Returns a function removing the listener.
 */
export const installStaleChunkReload = (
  target: Window = window,
  reloader: StaleChunkReloader = staleChunkReloader
): (() => void) => {
  const handlePreloadError = (): void => {
    reloader.reload();
  };
  target.addEventListener("vite:preloadError", handlePreloadError);
  return () => {
    target.removeEventListener("vite:preloadError", handlePreloadError);
  };
};

/**
 * Wraps the loader of a `React.lazy` component: when its chunk is gone the page reloads, and
 * the component stays suspended (its fallback shows) until it does, instead of failing into
 * an error message. When a reload is not allowed the error reaches the nearest error boundary.
 *
 * `lazy(reloadOnStaleChunk(() => import("./Page")))`
 */
export const reloadOnStaleChunk =
  <T>(load: () => Promise<T>, reloader: StaleChunkReloader = staleChunkReloader) =>
  (): Promise<T> =>
    load().catch((error: unknown): Promise<T> => {
      if (isChunkLoadError(error) && reloader.reload()) return new Promise<T>(() => undefined);
      throw error;
    });
