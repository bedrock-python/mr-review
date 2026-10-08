/** Hands a node to a callback ref or an object ref, whichever the caller passed. */
export const assignRef = <T>(ref: React.Ref<T> | undefined, node: T | null): void => {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
};
