import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";

/** Test-only helpers; not re-exported from `@shared/lib` so they stay out of the bundle. */

/**
 * Per-test budget for component tests that render through MSW, debounces and the
 * virtualizer; the 5 s default is too tight when CI runs suites in parallel.
 */
export const INTEGRATION_TEST_TIMEOUT_MS = 15_000;

/**
 * How long `findBy*` / `waitFor` wait in tests whose screen pulls a lazy chunk (a stage, the
 * Markdown renderer) or settles through MSW and debounces. The library's 1 s default passes
 * alone and in CI, but fails when the machine is loaded; set it per file with
 * `configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS })`.
 */
export const ASYNC_UTIL_TIMEOUT_MS = 10_000;

export const createTestQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

export const renderWithQueryClient = (
  ui: React.ReactElement,
  queryClient: QueryClient = createTestQueryClient()
): RenderResult & { queryClient: QueryClient } => ({
  ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  queryClient,
});

export const createQueryClientWrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

/** `items[index]`, failing the test with a clear message when it is missing. */
export const getAt = <T,>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected an item at index ${String(index)}`);
  return item;
};

/** Attribute `InfiniteVirtualList` puts on its scroll container. */
const VIRTUAL_SCROLL_ATTR = "data-virtual-scroll";

export type VirtualLayout = { viewportHeight: number; rowHeight: number; width?: number };

/**
 * jsdom has no layout: every element measures 0px, so a virtualizer would render
 * nothing useful. Gives virtual scroll containers a viewport height and every
 * other element a row height. The virtualizer reads the viewport from
 * clientWidth/clientHeight and the rows from offsetWidth/offsetHeight, so both
 * pairs are set. Returns a function restoring the originals.
 */
export const mockVirtualLayout = ({
  viewportHeight,
  rowHeight,
  width = 360,
}: VirtualLayout): (() => void) => {
  const height = function (this: HTMLElement): number {
    return this.hasAttribute(VIRTUAL_SCROLL_ATTR) ? viewportHeight : rowHeight;
  };
  const sizes: Record<string, (this: HTMLElement) => number> = {
    offsetHeight: height,
    clientHeight: height,
    offsetWidth: () => width,
    clientWidth: () => width,
  };
  const originals = Object.keys(sizes).map(
    (property) =>
      [property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)] as const
  );
  for (const [property, get] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get });
  }
  return () => {
    for (const [property, original] of originals) {
      // clientWidth/clientHeight live on Element.prototype: deleting the override restores them.
      if (original) Object.defineProperty(HTMLElement.prototype, property, original);
      else Reflect.deleteProperty(HTMLElement.prototype, property);
    }
  };
};

/** Finds the virtual scroll container around a rendered virtual list. */
export const getVirtualScrollContainer = (list: HTMLElement): HTMLElement => {
  const container = list.closest<HTMLElement>(`[${VIRTUAL_SCROLL_ATTR}]`);
  if (!container) throw new Error("List is not inside a virtual scroll container");
  return container;
};

/** Scrolls a virtual list container to its very end and notifies the virtualizer. */
export const scrollToEnd = (container: HTMLElement): void => {
  const list = container.querySelector<HTMLElement>('[role="list"]');
  const total = list ? Number.parseFloat(list.style.height) : 0;
  container.scrollTop = Number.isFinite(total) ? total : 0;
  fireEvent.scroll(container);
};
