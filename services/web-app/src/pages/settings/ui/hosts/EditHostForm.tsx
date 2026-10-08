import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { HOST_TYPE_LABELS, useUpdateHost } from "@entities/host";
import type { Host, HostColorId, UpdateHost } from "@entities/host";
import { EditHostFormSchema, HostFields } from "@features/manage-hosts";
import type { HostFormValues } from "@features/manage-hosts";
import { Badge } from "@shared/ui";

import { InlineForm } from "../InlineForm";

type EditHostFormProps = {
  host: Host;
  colorId: HostColorId;
  onDone: () => void;
};

/** Edits a host in place of its row; only the fields that changed are sent. */
export const EditHostForm = ({ host, colorId, onDone }: EditHostFormProps): React.ReactElement => {
  const updateHost = useUpdateHost();
  const form = useForm<HostFormValues>({
    resolver: zodResolver(EditHostFormSchema),
    defaultValues: {
      name: host.name,
      type: host.type,
      base_url: host.base_url,
      token: "",
      colorId,
      timeout: host.timeout,
    },
  });

  const handleSave = ({ colorId: color, ...data }: HostFormValues): void => {
    const payload: UpdateHost = {};
    if (data.name !== host.name) payload.name = data.name;
    if (data.base_url !== host.base_url) payload.base_url = data.base_url;
    if (data.token) payload.token = data.token;
    payload.color = color;
    if (data.timeout !== host.timeout) payload.timeout = data.timeout;

    updateHost.mutate({ id: host.id, data: payload }, { onSuccess: onDone });
  };

  return (
    <InlineForm
      title="Edit host"
      label={`Edit host ${host.name}`}
      aside={<Badge>{HOST_TYPE_LABELS[host.type]}</Badge>}
      submitLabel="Save"
      isPending={updateHost.isPending}
      onSubmit={(e) => {
        void form.handleSubmit(handleSave)(e);
      }}
      onCancel={onDone}
    >
      <HostFields form={form} mode="edit" />
    </InlineForm>
  );
};
