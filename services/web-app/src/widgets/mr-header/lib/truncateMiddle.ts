const ELLIPSIS = "…";
/** Share of the kept characters taken from the start: a branch's prefix says more. */
const HEAD_SHARE = 0.6;

/**
 * Shortens `text` to `maxLength` characters by cutting out its middle, so both the start
 * (`feature/…`) and the end (what the branch is about) stay readable.
 */
export const truncateMiddle = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  const kept = Math.max(maxLength - ELLIPSIS.length, 2);
  const head = Math.ceil(kept * HEAD_SHARE);
  const tail = kept - head;
  return `${text.slice(0, head)}${ELLIPSIS}${tail > 0 ? text.slice(-tail) : ""}`;
};
