import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { systemApi } from "@shared/api";
import { copyFolderPath } from "@shared/lib";
import { Button, Card, Field, ICON_SIZE, Input, Skeleton } from "@shared/ui";

import { formatPlatform } from "../lib/formatPlatform";
import { SettingsSection } from "./SettingsSection";

const pathRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "var(--space-2)",
};

const platformStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-4)",
  margin: "var(--space-3) 0 0",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
};

const COPY_LABELS: Record<string, string> = {
  Windows: "Copy Explorer path",
  Darwin: "Copy Finder path",
};

export const StorageSection = (): React.ReactElement => {
  const { data: info, isLoading } = useQuery({
    queryKey: ["system-info"],
    queryFn: systemApi.getInfo,
    staleTime: Infinity,
  });

  const handleCopyPath = async (): Promise<void> => {
    const copied = await copyFolderPath(info?.data_dir);
    if (copied) {
      toast.success("Path copied to clipboard");
    } else {
      toast.error("Failed to copy path");
    }
  };

  const copyLabel = (info && COPY_LABELS[info.os]) ?? "Copy folder path";

  return (
    <SettingsSection
      titleId="settings-storage"
      title="Storage"
      description="Location of local data files (hosts, providers, reviews)."
    >
      <Card aria-busy={isLoading || undefined}>
        <div style={pathRowStyle}>
          <Field label="Data folder" style={{ flex: 1 }}>
            {isLoading ? (
              <Skeleton width="100%" height="var(--control-md)" radius="control" />
            ) : (
              <Input
                readOnly
                isMono
                value={info?.data_dir ?? "—"}
                title={info?.data_dir}
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
              />
            )}
          </Field>
          <Button
            icon={<Copy size={ICON_SIZE.inline} aria-hidden="true" />}
            disabled={!info?.data_dir}
            onClick={() => void handleCopyPath()}
          >
            {copyLabel}
          </Button>
        </div>
        {info && (
          <p style={platformStyle}>
            <span>{formatPlatform(info.os, info.os_version)}</span>
            <span>Python {info.python_version}</span>
          </p>
        )}
      </Card>
    </SettingsSection>
  );
};
