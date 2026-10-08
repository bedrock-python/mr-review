import { createContext } from "react";

export type RadioGroupContextValue = {
  name: string;
  value: string | undefined;
  onValueChange: ((value: string) => void) | undefined;
  isDisabled: boolean;
};

export const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);
