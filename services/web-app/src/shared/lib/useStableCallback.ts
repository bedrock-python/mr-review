import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a callback with a stable identity that always invokes the latest `fn`.
 * Lets memoized rows receive handlers built from values that change every render
 * (e.g. router-bound navigation helpers) without re-rendering on each change.
 */
export const useStableCallback = <TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult
): ((...args: TArgs) => TResult) => {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: TArgs): TResult => fnRef.current(...args), []);
};
