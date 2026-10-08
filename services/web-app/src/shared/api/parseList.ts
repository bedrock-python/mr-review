import { z } from "zod";
import { toast } from "sonner";

export type ParsedList<T> = {
  items: T[];
  /** One line per record that did not match the schema: its position and the first issue. */
  skipped: string[];
};

/**
 * Parses a list response record by record. One malformed record (a legacy value, a field
 * the backend once accepted unchecked) must not empty the whole list: it is skipped and
 * reported, and the others are shown.
 */
export const parseListItems = <T>(schema: z.ZodType<T>, data: unknown): ParsedList<T> => {
  const rows = z.array(z.unknown()).parse(data);
  const items: T[] = [];
  const skipped: string[] = [];
  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      items.push(result.data);
      return;
    }
    const issue = result.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    skipped.push(`#${String(index + 1)} ${where}${issue?.message ?? "invalid"}`);
  });
  return { items, skipped };
};

/** `parseListItems`, telling the user once per response which records could not be shown. */
export const parseListOrWarn = <T>(schema: z.ZodType<T>, data: unknown, noun: string): T[] => {
  const { items, skipped } = parseListItems(schema, data);
  if (skipped.length > 0) {
    console.warn(`Skipped ${String(skipped.length)} unreadable ${noun}:`, skipped);
    toast.warning(`${String(skipped.length)} ${noun} could not be read and are hidden`, {
      id: `unreadable-${noun}`,
      description: skipped.slice(0, 3).join("\n"),
    });
  }
  return items;
};
