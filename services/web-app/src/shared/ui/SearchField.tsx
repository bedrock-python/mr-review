import { Search } from "lucide-react";
import { ICON_SIZE } from "./ICON_SIZE";
import { Input } from "./field";
import { Spinner } from "./loading";

export type SearchFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Shows a small spinner while a debounced search is pending or in flight. */
  isBusy?: boolean;
  isDisabled?: boolean;
  /** The input, e.g. for a drawer's `initialFocusRef`. */
  ref?: React.Ref<HTMLInputElement>;
};

/** A search box: glass icon, the browser's clear button, a busy spinner. */
export const SearchField = ({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  isBusy = false,
  isDisabled = false,
  ref,
}: SearchFieldProps): React.ReactElement => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onValueChange(event.target.value);
  };

  return (
    <Input
      {...(ref === undefined ? {} : { ref })}
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      disabled={isDisabled}
      leadingIcon={<Search size={ICON_SIZE.inline} />}
      trailing={isBusy ? <Spinner size="sm" tone="muted" label="Searching" /> : undefined}
      style={{ flex: 1 }}
    />
  );
};
