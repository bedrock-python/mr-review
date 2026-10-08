import { useId } from "react";
import { joinIds } from "@shared/lib";

export type ChoiceIds = {
  labelId: string;
  descriptionId: string;
  hasDescription: boolean;
  /** Spread on the input: named by the label, described by the description. */
  aria: { "aria-labelledby": string | undefined; "aria-describedby": string | undefined };
};

/** Ids that tie a choice control to its label and description. */
export const useChoiceIds = (
  description: React.ReactNode,
  ownLabelledBy: string | undefined,
  ownDescribedBy: string | undefined
): ChoiceIds => {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const hasDescription = description !== undefined && description !== null && description !== false;
  return {
    labelId,
    descriptionId,
    hasDescription,
    aria: {
      "aria-labelledby": ownLabelledBy ?? labelId,
      "aria-describedby": joinIds(ownDescribedBy, hasDescription && descriptionId),
    },
  };
};
