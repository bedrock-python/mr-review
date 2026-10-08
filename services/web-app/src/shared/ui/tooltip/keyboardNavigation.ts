const NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);
// Focus follows a navigation key within the same task; the margin covers slow machines.
const NAVIGATION_FOCUS_WINDOW_MS = 500;

let lastNavigationKeyAt = Number.NEGATIVE_INFINITY;

const trackKey = (event: KeyboardEvent): void => {
  // Any other key (Enter opening a panel, Esc closing one) ends the navigation window.
  lastNavigationKeyAt = NAVIGATION_KEYS.has(event.key)
    ? performance.now()
    : Number.NEGATIVE_INFINITY;
};

const forgetKey = (): void => {
  lastNavigationKeyAt = Number.NEGATIVE_INFINITY;
};

if (typeof document !== "undefined") {
  // Capture phase: recorded before any handler moves focus in response to the key.
  document.addEventListener("keydown", trackKey, true);
  document.addEventListener("pointerdown", forgetKey, true);
}

/**
 * Whether the focus that just happened came from the user moving it with the keyboard (Tab,
 * arrows, Home/End), rather than from code: a dialog giving focus back, a panel focusing its
 * first control. Only the former should pop a tooltip.
 */
export const isKeyboardNavigationFocus = (): boolean =>
  performance.now() - lastNavigationKeyAt < NAVIGATION_FOCUS_WINDOW_MS;
