import { useState } from "react";
import { SeverityLabelSchema } from "@entities/review";
import type { SeverityLabel } from "@entities/review";
import { readStorageItem, writeStorageItem } from "@shared/lib";

const STORAGE_KEY = "mr-review:post:severity-label";
const DEFAULT_LABEL: SeverityLabel = "bold";

const readStored = (): SeverityLabel => {
  const parsed = SeverityLabelSchema.safeParse(readStorageItem(STORAGE_KEY));
  return parsed.success ? parsed.data : DEFAULT_LABEL;
};

/** How posted comments are labelled with their severity; remembered in this browser. */
export const useSeverityLabel = (): [SeverityLabel, (label: SeverityLabel) => void] => {
  const [label, setLabel] = useState<SeverityLabel>(readStored);
  const update = (next: SeverityLabel): void => {
    setLabel(next);
    writeStorageItem(STORAGE_KEY, next);
  };
  return [label, update];
};
