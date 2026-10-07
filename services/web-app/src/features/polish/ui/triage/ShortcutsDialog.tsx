import { PolishDialog } from "./PolishDialog";
import { TRIAGE_SHORTCUTS } from "./shortcuts";

type ShortcutsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ShortcutsDialog = ({ isOpen, onClose }: ShortcutsDialogProps): React.ReactElement => (
  <PolishDialog
    isOpen={isOpen}
    onClose={onClose}
    title="Keyboard shortcuts"
    description="Work through the list without leaving the keyboard. Keys are ignored while you type."
  >
    <table className="w-full border-collapse text-[12px]">
      <tbody>
        {TRIAGE_SHORTCUTS.map(({ keys, description }) => (
          <tr key={description} className="border-border border-b last:border-b-0">
            <td className="py-1.5 pr-4 whitespace-nowrap">
              <span className="inline-flex gap-1">
                {keys.map((key) => (
                  <kbd key={key} className="kbd">
                    {key}
                  </kbd>
                ))}
              </span>
            </td>
            <td className="text-fg-1 py-1.5">{description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </PolishDialog>
);
