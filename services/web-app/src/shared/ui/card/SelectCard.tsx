import { Check } from "lucide-react";
import type { RovingRadioItemProps } from "@shared/lib";

export type SelectCardOption<T extends string> = {
  value: T;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Before the title: a provider logo, a preset glyph. Identity colour goes here only. */
  icon?: React.ReactNode;
  /** Right of the title: a badge, "6 models". */
  aside?: React.ReactNode;
  /** Under the text: a theme preview, a model list. */
  preview?: React.ReactNode;
  isDisabled?: boolean;
};

export type SelectCardProps<T extends string> = {
  option: SelectCardOption<T>;
  /** From the group: role, aria-checked, tab stop, keys and click. */
  radioProps: RovingRadioItemProps;
};

/** One choice of a SelectCardGroup: the standard selection ring and a check when chosen. */
export const SelectCard = <T extends string>({
  option,
  radioProps,
}: SelectCardProps<T>): React.ReactElement => (
  <div {...radioProps} className="ui-select-card">
    <div className="ui-select-card__head">
      {option.icon}
      <span className="ui-select-card__title">{option.title}</span>
      {option.aside}
    </div>
    {option.description !== undefined && (
      <span className="ui-select-card__description">{option.description}</span>
    )}
    {option.preview}
    {radioProps["aria-checked"] && (
      <span className="ui-select-card__check" aria-hidden="true">
        <Check size={11} strokeWidth={3} />
      </span>
    )}
  </div>
);
