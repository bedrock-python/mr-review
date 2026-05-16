import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  useHosts,
  useCreateHost,
  HOST_COLORS,
  getHostColor,
  ColorPicker,
  CreateHostSchema,
} from "@entities/host";
import type { Host, HostType, HostColorId } from "@entities/host";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";

const AddHostFormSchema = CreateHostSchema.extend({
  colorId: z.string(),
  timeout: z.number().int().min(1, "Must be at least 1").max(600, "Max 600s"),
});
type AddHostFormValues = z.infer<typeof AddHostFormSchema>;

/* ── SVG icons ──────────────────────────────────────────────── */
const GitLabIcon = (): React.ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
  </svg>
);

const GitHubIcon = (): React.ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const HistoryIcon = (): React.ReactElement => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 1 .5 4" />
    <polyline points="3 16 3 11 8 11" />
  </svg>
);

const SettingsIcon = (): React.ReactElement => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const GiteaIcon = (): React.ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
  </svg>
);

const BitbucketIcon = (): React.ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.65 3a.67.67 0 0 0-.66.77l3.22 14.4a.9.9 0 0 0 .88.72h12.3a.67.67 0 0 0 .66-.55l3.22-14.56a.67.67 0 0 0-.66-.78zm11.1 9.8H10.3l-.9-4.7h5.3z" />
  </svg>
);

const HOST_ICONS: Record<HostType, () => React.ReactElement> = {
  gitlab: GitLabIcon,
  github: GitHubIcon,
  gitea: GiteaIcon,
  forgejo: GiteaIcon,
  bitbucket: BitbucketIcon,
};

/* ── Tooltip ────────────────────────────────────────────────── */
type TooltipProps = {
  label: string;
  children: React.ReactElement;
};

const Tooltip = ({ label, children }: TooltipProps): React.ReactElement => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}
      onMouseEnter={() => {
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        setIsVisible(false);
      }}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: "50%",
            transform: "translateY(-50%)",
            background: "var(--bg-3)",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--fg-0)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 100,
            boxShadow: "var(--shadow)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

/* ── HostAvatar ─────────────────────────────────────────────── */
type HostAvatarProps = {
  host: Host;
  isSelected: boolean;
  onClick: () => void;
};

const HostAvatar = ({ host, isSelected, onClick }: HostAvatarProps): React.ReactElement => {
  const Icon = HOST_ICONS[host.type];
  const hostColor = getHostColor(host.color as HostColorId | undefined);

  return (
    <Tooltip label={host.name}>
      <div className="relative flex w-full items-center justify-center">
        {isSelected && (
          <div
            className="absolute left-0 h-9 w-[3px] rounded-r-[999px]"
            style={{ background: hostColor }}
          />
        )}
        <button
          type="button"
          onClick={onClick}
          aria-label={`Select host: ${host.name}`}
          aria-pressed={isSelected}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSelected ? "var(--bg-3)" : "var(--bg-2)",
            border: isSelected
              ? `1px solid color-mix(in oklch, ${hostColor} 60%, var(--border))`
              : `1px solid color-mix(in oklch, ${hostColor} 30%, var(--border))`,
            color: hostColor,
            transition: "background 0.08s, border 0.08s",
            cursor: "pointer",
          }}
        >
          <Icon />
        </button>
      </div>
    </Tooltip>
  );
};

/* ── AddHostModal ───────────────────────────────────────────── */
type AddHostModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const AddHostModal = ({ isOpen, onClose }: AddHostModalProps): React.ReactElement | null => {
  const createHost = useCreateHost();
  const defaultColorId = HOST_COLORS[0].id;

  const form = useForm<AddHostFormValues>({
    resolver: zodResolver(AddHostFormSchema),
    defaultValues: { name: "", type: "gitlab", base_url: "", token: "", colorId: defaultColorId },
  });

  const handleSubmit = ({ colorId, ...data }: AddHostFormValues): void => {
    createHost.mutate(
      { ...data, color: colorId },
      {
        onSuccess: () => {
          form.reset({
            name: "",
            type: "gitlab",
            base_url: "",
            token: "",
            colorId: defaultColorId,
          });
          onClose();
        },
      }
    );
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
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="card relative z-10 w-full max-w-md p-6"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <h2 style={{ color: "var(--fg-0)", fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
          Add Host
        </h2>

        <form
          onSubmit={(e) => {
            void form.handleSubmit(handleSubmit)(e);
          }}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {(
            [
              {
                id: "host-name",
                label: "Name",
                field: "name",
                type: "text",
                placeholder: "My GitLab",
              },
              {
                id: "host-url",
                label: "Base URL",
                field: "base_url",
                type: "url",
                placeholder: "https://gitlab.example.com",
              },
              {
                id: "host-token",
                label: "Access Token",
                field: "token",
                type: "password",
                placeholder: "glpat-xxxx",
              },
            ] as const
          ).map(({ id, label, field, type, placeholder }) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor={id}
                style={{
                  fontSize: 10,
                  color: "var(--fg-2)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {label}
              </label>
              <input
                id={id}
                type={type}
                {...form.register(field)}
                placeholder={placeholder}
                style={{
                  background: "var(--bg-2)",
                  border: `1px solid ${form.formState.errors[field] ? "var(--c-critical)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "var(--fg-0)",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  width: "100%",
                }}
              />
              {form.formState.errors[field] && (
                <p role="alert" style={{ fontSize: 11, color: "var(--c-critical)" }}>
                  {String(form.formState.errors[field].message)}
                </p>
              )}
            </div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="host-type"
              style={{
                fontSize: 10,
                color: "var(--fg-2)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Type
            </label>
            <select
              id="host-type"
              {...form.register("type")}
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 13,
                color: "var(--fg-0)",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
              <option value="gitea">Gitea</option>
              <option value="forgejo">Forgejo</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                color: "var(--fg-2)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Color
            </span>
            <Controller
              name="colorId"
              control={form.control}
              render={({ field }) => (
                <ColorPicker value={field.value as HostColorId} onChange={field.onChange} />
              )}
            />
          </div>

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn ghost"
              style={{ flex: 1, justifyContent: "center" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting || createHost.isPending}
              className="btn primary"
              style={{
                flex: 1,
                justifyContent: "center",
                opacity: form.formState.isSubmitting || createHost.isPending ? 0.5 : 1,
              }}
            >
              Add Host
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── HostsRail ──────────────────────────────────────────────── */
export const HostsRail = (): React.ReactElement => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: hosts } = useHosts();
  const { selectedHostId, setHost } = useNav();
  const navigate = useNavigate();
  const { historyOpen, toggleHistory } = useAppStore();

  return (
    <>
      <nav
        aria-label="Hosts"
        style={{
          width: 56,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-1)",
          paddingTop: 10,
          paddingBottom: 10,
          height: "100%",
          overflow: "visible",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Brand box */}
        <div style={{ marginBottom: 8, position: "relative" }}>
          <button
            type="button"
            aria-label="Home"
            title="Go to home"
            onClick={() => {
              void navigate("/");
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent-ink)",
              }}
            />
          </button>
        </div>

        <div style={{ width: 36, height: 1, background: "var(--border)", marginBottom: 4 }} />

        {/* Host avatars */}
        {hosts?.map((host) => (
          <HostAvatar
            key={host.id}
            host={host}
            isSelected={selectedHostId === host.id}
            onClick={() => {
              setHost(host.id);
            }}
          />
        ))}

        {/* Add host */}
        <button
          type="button"
          aria-label="Add host"
          onClick={() => {
            setIsModalOpen(true);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px dashed var(--border)",
            background: "transparent",
            color: "var(--fg-3)",
            cursor: "pointer",
            fontSize: 18,
            transition: "border-color 0.08s, color 0.08s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
            (e.currentTarget as HTMLElement).style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--fg-3)";
          }}
        >
          +
        </button>

        {/* Bottom icons */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            type="button"
            aria-label="History"
            className="icon-btn"
            title="Review history"
            onClick={toggleHistory}
            style={{
              background: historyOpen ? "var(--bg-3)" : undefined,
              color: historyOpen ? "var(--fg-0)" : undefined,
              borderRadius: 8,
            }}
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            aria-label="Settings"
            className="icon-btn"
            title="Settings"
            onClick={() => {
              void navigate("/settings");
            }}
          >
            <SettingsIcon />
          </button>
        </div>
      </nav>

      <AddHostModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
      />
    </>
  );
};
