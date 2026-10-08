/**
 * Export/Import Section Component
 */

import { ExportPanel } from "./ExportPanel";
import { ImportPanel } from "./ImportPanel";

export const ExportImportSection = (): React.ReactElement => (
  <div>
    <ExportPanel />
    <ImportPanel />
  </div>
);
