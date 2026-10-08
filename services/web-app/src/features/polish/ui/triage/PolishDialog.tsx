import { Dialog } from "@shared/ui";

type PolishDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  width?: number;
  /** Off when the caller moves focus itself after closing. */
  shouldRestoreFocus?: boolean;
  children: React.ReactNode;
};

const DEFAULT_WIDTH_PX = 440;

/** The shared Dialog at the width the Polish dialogs were laid out for. */
export const PolishDialog = ({
  width = DEFAULT_WIDTH_PX,
  ...rest
}: PolishDialogProps): React.ReactElement => <Dialog width={width} {...rest} />;
