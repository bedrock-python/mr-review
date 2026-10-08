/** A space-separated id list for aria-describedby / aria-labelledby; undefined when empty. */
export const joinIds = (...ids: (string | false | null | undefined)[]): string | undefined => {
  const joined = ids.filter((value): value is string => typeof value === "string" && value !== "");
  return joined.length === 0 ? undefined : joined.join(" ");
};
