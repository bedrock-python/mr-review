import { useState } from "react";
import { Server } from "lucide-react";

import { HOST_COLORS, getHostColor, useDeleteHost, useHosts } from "@entities/host";
import type { Host, HostColorId } from "@entities/host";
import { Badge, ICON_SIZE } from "@shared/ui";

import { HOST_TYPE_LABELS } from "../../lib/hostForm";
import { SettingsList } from "../SettingsList";
import { RowActions, SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { rowNameStyle } from "../styles";
import { AddHostForm } from "./AddHostForm";
import { EditHostForm } from "./EditHostForm";

const urlStyle: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
};

const HostRow = ({ host }: { host: Host }): React.ReactElement => {
  const deleteHost = useDeleteHost();
  const [isEditing, setIsEditing] = useState(false);
  const colorId = (host.color ?? HOST_COLORS[0].id) as HostColorId;

  if (isEditing) {
    return (
      <li>
        <EditHostForm
          host={host}
          colorId={colorId}
          onDone={() => {
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li>
      <SettingsRow
        icon={
          <Server
            size={ICON_SIZE.button}
            aria-hidden="true"
            style={{ color: getHostColor(colorId) }}
          />
        }
        head={
          <>
            <span style={rowNameStyle} title={host.name}>
              {host.name}
            </span>
            <Badge>{HOST_TYPE_LABELS[host.type]}</Badge>
          </>
        }
        details={
          <span style={urlStyle} title={host.base_url}>
            {host.base_url}
          </span>
        }
        actions={
          <RowActions
            name={host.name}
            kind="host"
            consequence="Its access token and favourite repositories are deleted. Reviews made on this host stay in the history."
            isRemoving={deleteHost.isPending}
            onEdit={() => {
              setIsEditing(true);
            }}
            onRemove={() => {
              deleteHost.mutate(host.id);
            }}
          />
        }
      />
    </li>
  );
};

export const HostsSection = (): React.ReactElement => {
  const { data: hosts, isLoading } = useHosts();
  return (
    <SettingsSection
      titleId="settings-hosts"
      title="Git hosts"
      description="Add GitLab, GitHub, Gitea, Forgejo or Bitbucket instances to browse their merge requests."
    >
      <SettingsList
        label="Git hosts"
        isLoading={isLoading}
        emptyTitle="No hosts yet"
        emptyIcon={<Server size={ICON_SIZE.inline} aria-hidden="true" />}
        footer={<AddHostForm />}
      >
        {hosts?.map((host) => (
          <HostRow key={host.id} host={host} />
        ))}
      </SettingsList>
    </SettingsSection>
  );
};
