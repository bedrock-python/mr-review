import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@shared/lib";
import { Spinner } from "@shared/ui";
import { useHosts, useCreateHost } from "@entities/host";
import { CreateHostSchema } from "@entities/host";
import type { CreateHost, Host, HostType } from "@entities/host";
import { useAppStore } from "@app/providers";

const HOST_TYPE_ICONS: Record<HostType, string> = {
  gitlab: "GL",
  github: "GH",
};

const HOST_TYPE_COLORS: Record<HostType, string> = {
  gitlab: "bg-orange-600",
  github: "bg-neutral-600",
};

type HostIconProps = {
  host: Host;
  isSelected: boolean;
  onClick: () => void;
};

const HostIcon = ({ host, isSelected, onClick }: HostIconProps): React.ReactElement => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={host.name}
      aria-label={`Select host: ${host.name}`}
      aria-pressed={isSelected}
      className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono",
        "transition-all duration-150 cursor-pointer",
        HOST_TYPE_COLORS[host.type],
        "text-white",
        isSelected
          ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-bg"
          : "opacity-60 hover:opacity-100",
      )}
    >
      {HOST_TYPE_ICONS[host.type]}
    </button>
  );
};

type AddHostModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const AddHostModal = ({ isOpen, onClose }: AddHostModalProps): React.ReactElement | null => {
  const createHost = useCreateHost();

  const form = useForm<CreateHost>({
    resolver: zodResolver(CreateHostSchema),
    defaultValues: {
      name: "",
      type: "gitlab",
      base_url: "",
      token: "",
    },
  });

  const handleSubmit = (data: CreateHost): void => {
    createHost.mutate(data, {
      onSuccess: () => {
        form.reset();
        onClose();
      },
    });
  };

  const handleClose = (): void => {
    form.reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add host"
    >
      <div
        className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-text mb-5">Add Host</h2>

        <form onSubmit={form.handleSubmit(handleSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="host-name" className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Name
            </label>
            <input
              id="host-name"
              type="text"
              {...form.register("name")}
              placeholder="My GitLab"
              className={cn(
                "w-full px-3 py-2 rounded-lg bg-surface-2 border text-sm text-text",
                "placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
                form.formState.errors.name ? "border-red-500" : "border-border",
              )}
            />
            {form.formState.errors.name && (
              <p role="alert" className="text-xs text-red-400">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="host-type" className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Type
            </label>
            <select
              id="host-type"
              {...form.register("type")}
              className={cn(
                "w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm text-text",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer",
              )}
            >
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="host-url" className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Base URL
            </label>
            <input
              id="host-url"
              type="url"
              {...form.register("base_url")}
              placeholder="https://gitlab.example.com"
              className={cn(
                "w-full px-3 py-2 rounded-lg bg-surface-2 border text-sm text-text font-mono",
                "placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
                form.formState.errors.base_url ? "border-red-500" : "border-border",
              )}
            />
            {form.formState.errors.base_url && (
              <p role="alert" className="text-xs text-red-400">{form.formState.errors.base_url.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="host-token" className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Access Token
            </label>
            <input
              id="host-token"
              type="password"
              {...form.register("token")}
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              className={cn(
                "w-full px-3 py-2 rounded-lg bg-surface-2 border text-sm text-text font-mono",
                "placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
                form.formState.errors.token ? "border-red-500" : "border-border",
              )}
            />
            {form.formState.errors.token && (
              <p role="alert" className="text-xs text-red-400">{form.formState.errors.token.message}</p>
            )}
          </div>

          {createHost.isError && (
            <p role="alert" className="text-xs text-red-400">
              Failed to add host. Check your credentials and try again.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg border border-border text-sm text-text-muted",
                "hover:text-text hover:border-text-muted transition-colors",
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting || createHost.isPending}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                "bg-[var(--accent)] text-[rgb(var(--accent-fg))]",
                "hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2",
              )}
            >
              {createHost.isPending && <Spinner size="sm" />}
              Add Host
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const HostsRail = (): React.ReactElement => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: hosts, isLoading } = useHosts();
  const { selectedHostId, setHost } = useAppStore();

  return (
    <>
      <nav
        aria-label="Hosts"
        className="flex flex-col items-center gap-2 w-14 h-screen bg-surface border-r border-border py-3 px-[10px] flex-shrink-0"
      >
        {isLoading && <Spinner size="sm" className="mt-2" />}

        {hosts?.map((host) => (
          <HostIcon
            key={host.id}
            host={host}
            isSelected={selectedHostId === host.id}
            onClick={() => setHost(host.id)}
          />
        ))}

        <div className="mt-auto">
          <button
            type="button"
            aria-label="Add host"
            onClick={() => setIsModalOpen(true)}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              "border border-dashed border-border text-text-muted text-lg",
              "hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors",
            )}
          >
            +
          </button>
        </div>
      </nav>

      <AddHostModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
