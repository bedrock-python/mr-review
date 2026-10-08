import { Search } from "lucide-react";
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
};

/** A search box: glass icon, the browser's clear button, a busy spinner. */
export const SearchField = ({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  isBusy = false,
  isDisabled = false,
}: SearchFieldProps): React.ReactElement => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onValueChange(event.target.value);
  };

  return (
    <Input
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      disabled={isDisabled}
      leadingIcon={<Search size={13} />}
      trailing={isBusy ? <Spinner size="sm" tone="muted" label="Searching" /> : undefined}
      style={{ flex: 1 }}
    />
  );
};
