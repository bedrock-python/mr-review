import { Drawer } from "./drawer";
import type { DrawerProps } from "./drawer";

export type SideSheetProps = Omit<DrawerProps, "side" | "footer">;

const LEGACY_WIDTH_PX = 340;

/**
 * The right-hand Drawer at the width the history panels were laid out for.
 * @deprecated Use Drawer; the panels move to its default width in the screen migration.
 */
export const SideSheet = ({
  width = LEGACY_WIDTH_PX,
  ...rest
}: SideSheetProps): React.ReactElement => <Drawer width={width} {...rest} />;
