import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { systemApi } from "@shared/api";
import { copyFolderPath } from "@shared/lib";

import {
  useAIProviders,
  useCreateAIProvider,
  useUpdateAIProvider,
  useDeleteAIProvider,
  aiProviderApi,
  CreateAIProviderSchema,
  UpdateAIProviderSchema,
} from "@entities/ai-provider";
import type { AIProvider, CreateAIProvider, UpdateAIProvider } from "@entities/ai-provider";
import {
  useHosts,
  useCreateHost,
  useUpdateHost,
  useDeleteHost,
  CreateHostSchema,
  UpdateHostSchema,
} from "@entities/host";
import type { CreateHost, Host, UpdateHost } from "@entities/host";

/* ── Icons ──────────────────────────────────────────────────────────── */
const BackIcon = (): React.ReactElement => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const TrashIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const PlusIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const GitLabIcon = (): React.ReactElement => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
  </svg>
);

const GitHubIcon = (): React.ReactElement => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const KeyIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const ServerIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

const CpuIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);

const PencilIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/* ── Reusable field components ──────────────────────────────────────── */
type FieldProps = {
  label: string;
  hint?: string;
  icon?: React.ReactElement;
  error?: string | undefined;
  children: React.ReactNode;
};

const Field = ({ label, hint, icon, error, children }: FieldProps): React.ReactElement => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {icon && <span style={{ color: "var(--fg-3)" }}>{icon}</span>}
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--fg-2)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
    </div>
    {children}
    {hint && !error && <p style={{ margin: 0, fontSize: 11, color: "var(--fg-3)" }}>{hint}</p>}
    {error && <p style={{ margin: 0, fontSize: 11, color: "var(--c-critical)" }}>{error}</p>}
  </div>
);

const inputCss: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--fg-0)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color 0.1s",
};

/* ── Section wrapper ────────────────────────────────────────────────── */
type SectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const Section = ({ title, description, children }: SectionProps): React.ReactElement => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "200px 1fr",
      gap: 24,
      paddingBottom: 32,
      borderBottom: "1px solid var(--border)",
      marginBottom: 32,
    }}
  >
    <div>
      <h2
        style={{
          margin: "0 0 6px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--fg-0)",
        }}
      >
        {title}
      </h2>
      {description && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--fg-3)", lineHeight: 1.5 }}>
          {description}
        </p>
      )}
    </div>

    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  </div>
);

/* ── HostRow ─────────────────────────────────────────────────────────── */
type HostRowProps = { host: Host };

const HostRow = ({ host }: HostRowProps): React.ReactElement => {
  const deleteHost = useDeleteHost();
  const updateHost = useUpdateHost();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  const form = useForm<UpdateHost>({
    resolver: zodResolver(UpdateHostSchema),
    defaultValues: { name: host.name, base_url: host.base_url, token: "" },
  });

  const providerIconMap: Record<string, () => React.ReactElement> = {
    gitlab: GitLabIcon,
    github: GitHubIcon,
    gitea: GitHubIcon,
    forgejo: GitHubIcon,
    bitbucket: GitHubIcon,
  };
  const providerColorMap: Record<string, string> = {
    gitlab: "#fc6d26",
    github: "var(--fg-2)",
    gitea: "#609926",
    forgejo: "#fb923c",
    bitbucket: "#0052cc",
  };
  const ProviderIcon = providerIconMap[host.type] ?? GitHubIcon;
  const providerColor = providerColorMap[host.type] ?? "var(--fg-2)";

  const handleDelete = (): void => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    deleteHost.mutate(host.id);
  };

  const handleEdit = (): void => {
    form.reset({ name: host.name, base_url: host.base_url, token: "" });
    setEditing(true);
  };

  const handleSave = (data: UpdateHost): void => {
    const payload: UpdateHost = {};
    if (data.name !== host.name) payload.name = data.name;
    if (data.base_url !== host.base_url) payload.base_url = data.base_url;
    if (data.token) payload.token = data.token;

    updateHost.mutate(
      { id: host.id, data: payload },
      {
        onSuccess: () => {
          setEditing(false);
        },
      }
    );
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          void form.handleSubmit(handleSave)(e);
        }}
        noValidate
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-0)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: providerColor }}>
            <ProviderIcon />
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-2)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Edit Host
          </span>
          <span
            className="chip"
            style={{
              fontSize: 10,
              color: providerColor,
              borderColor: `color-mix(in oklch, ${providerColor} 30%, transparent)`,
              marginLeft: "auto",
            }}
          >
            {host.type}
          </span>
        </div>

        <Field label="Name" error={form.formState.errors.name?.message}>
          <input type="text" {...form.register("name")} placeholder="My GitLab" style={inputCss} />
        </Field>

        <Field label="Base URL" error={form.formState.errors.base_url?.message}>
          <input
            type="url"
            {...form.register("base_url")}
            placeholder="https://gitlab.example.com"
            style={inputCss}
          />
        </Field>

        <Field
          label="Access Token"
          hint="Leave blank to keep the existing token."
          error={form.formState.errors.token?.message}
        >
          <input
            type="password"
            {...form.register("token")}
            placeholder="New token (optional)"
            style={inputCss}
          />
        </Field>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "5px 14px" }}
            onClick={() => {
              setEditing(false);
              form.reset();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            style={{ padding: "5px 14px", opacity: updateHost.isPending ? 0.6 : 1 }}
            disabled={updateHost.isPending}
          >
            {updateHost.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ color: providerColor, flexShrink: 0 }}>
        <ProviderIcon />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-0)", marginBottom: 2 }}>
          {host.name}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--fg-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {host.base_url}
        </div>
      </div>

      <span
        className="chip"
        style={{
          fontSize: 10,
          color: providerColor,
          borderColor: `color-mix(in oklch, ${providerColor} 30%, transparent)`,
        }}
      >
        {host.type}
      </span>

      <button
        type="button"
        className="btn ghost"
        style={{ padding: "4px 8px", gap: 5, fontSize: 11, color: "var(--fg-3)" }}
        onClick={handleEdit}
        title="Edit host"
      >
        <PencilIcon />
        Edit
      </button>

      <button
        type="button"
        className="btn ghost"
        style={{
          padding: "4px 10px",
          gap: 5,
          fontSize: 11,
          color: confirming ? "var(--c-critical)" : "var(--fg-3)",
          border: confirming
            ? "1px solid color-mix(in oklch, var(--c-critical) 40%, transparent)"
            : "1px solid transparent",
          borderRadius: 6,
        }}
        onClick={handleDelete}
        onBlur={() => {
          setConfirming(false);
        }}
        disabled={deleteHost.isPending}
      >
        <TrashIcon />
        {confirming ? "Confirm" : "Remove"}
      </button>
    </div>
  );
};

/* ── AddHostForm ─────────────────────────────────────────────────────── */
const AddHostForm = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const createHost = useCreateHost();
  const form = useForm<CreateHost>({
    resolver: zodResolver(CreateHostSchema),
    defaultValues: { name: "", type: "gitlab", base_url: "", token: "" },
  });

  const handleSubmit = (data: CreateHost): void => {
    createHost.mutate(data, {
      onSuccess: () => {
        form.reset();
        setIsOpen(false);
      },
    });
  };

  if (!isOpen) {
    return (
      <div style={{ padding: "10px 16px" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 10px", gap: 6, fontSize: 12 }}
          onClick={() => {
            setIsOpen(true);
          }}
        >
          <PlusIcon />
          Add Host
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void form.handleSubmit(handleSubmit)(e);
      }}
      noValidate
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderTop: "1px solid var(--border)",
        background: "var(--bg-0)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--fg-2)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        New Host
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
        <Field label="Name" error={form.formState.errors.name?.message}>
          <input type="text" {...form.register("name")} placeholder="My GitLab" style={inputCss} />
        </Field>
        <Field label="Type">
          <select
            {...form.register("type")}
            style={{ ...inputCss, cursor: "pointer", width: "auto", minWidth: 110 }}
          >
            <option value="gitlab">GitLab</option>
            <option value="github">GitHub</option>
            <option value="gitea">Gitea</option>
            <option value="forgejo">Forgejo</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
        </Field>
      </div>

      <Field label="Base URL" error={form.formState.errors.base_url?.message}>
        <input
          type="url"
          {...form.register("base_url")}
          placeholder="https://gitlab.example.com"
          style={inputCss}
        />
      </Field>

      <Field
        label="Access Token"
        hint="Token is stored on the server, never exposed to the browser."
        error={form.formState.errors.token?.message}
      >
        <input
          type="password"
          {...form.register("token")}
          placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
          style={inputCss}
        />
      </Field>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 14px" }}
          onClick={() => {
            setIsOpen(false);
            form.reset();
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn primary"
          style={{ padding: "5px 14px", opacity: createHost.isPending ? 0.6 : 1 }}
          disabled={createHost.isPending}
        >
          {createHost.isPending ? "Adding…" : "Add Host"}
        </button>
      </div>
    </form>
  );
};

/* ── AIProviderRow ────────────────────────────────────────────────────── */
type FetchModelsState = "idle" | "loading" | "error";

type AIProviderRowProps = { provider: AIProvider };

const AIProviderRow = ({ provider }: AIProviderRowProps): React.ReactElement => {
  const deleteProvider = useDeleteAIProvider();
  const updateProvider = useUpdateAIProvider();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [fetchState, setFetchState] = useState<FetchModelsState>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const newModelRef = useRef<HTMLInputElement>(null);

  const form = useForm<UpdateAIProvider>({
    resolver: zodResolver(UpdateAIProviderSchema),
    defaultValues: {
      name: provider.name,
      api_key: "",
      base_url: provider.base_url,
      models: provider.models,
      ssl_verify: provider.ssl_verify,
      timeout: provider.timeout,
    },
  });

  const watchedModels: string[] =
    useWatch({ control: form.control, name: "models" }) ?? provider.models;

  const typeLabel: Record<AIProvider["type"], string> = {
    claude: "Claude",
    openai: "OpenAI",
    openai_compat: "OpenAI-compat",
  };

  const handleDelete = (): void => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    deleteProvider.mutate(provider.id);
  };

  const handleEdit = (): void => {
    form.reset({
      name: provider.name,
      api_key: "",
      base_url: provider.base_url,
      models: [...provider.models],
    });
    setEditing(true);
  };

  const handleAddModel = (): void => {
    const trimmed = newModel.trim();
    if (!trimmed) return;
    const current = form.getValues("models") ?? [];
    if (!current.includes(trimmed)) {
      form.setValue("models", [...current, trimmed]);
    }
    setNewModel("");
    newModelRef.current?.focus();
  };

  const handleRemoveModel = (m: string): void => {
    const current = form.getValues("models") ?? [];
    form.setValue(
      "models",
      current.filter((x) => x !== m)
    );
  };

  const handleFetchModels = async (): Promise<void> => {
    setFetchState("loading");
    setFetchError(null);
    try {
      const fetched = await aiProviderApi.fetchModels(provider.id);
      if (fetched.length === 0) throw new Error("No models returned");
      form.setValue("models", fetched);
      setFetchState("idle");
    } catch (err) {
      setFetchError((err as Error).message);
      setFetchState("error");
    }
  };

  const handleSave = (data: UpdateAIProvider): void => {
    const payload: UpdateAIProvider = {};
    if (data.name !== provider.name) payload.name = data.name;
    if (data.api_key) payload.api_key = data.api_key;
    if (data.base_url !== provider.base_url) payload.base_url = data.base_url;
    payload.models = data.models;
    if (data.ssl_verify !== provider.ssl_verify) payload.ssl_verify = data.ssl_verify;
    if (data.timeout !== provider.timeout) payload.timeout = data.timeout;

    updateProvider.mutate(
      { id: provider.id, data: payload },
      {
        onSuccess: () => {
          setEditing(false);
        },
      }
    );
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          void form.handleSubmit(handleSave)(e);
        }}
        noValidate
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-0)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-2)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Edit Provider
          </span>
          <span className="chip" style={{ fontSize: 10, marginLeft: "auto" }}>
            {typeLabel[provider.type]}
          </span>
        </div>

        <Field label="Name" error={form.formState.errors.name?.message}>
          <input type="text" {...form.register("name")} placeholder="My Claude" style={inputCss} />
        </Field>

        <Field
          label="API Key"
          icon={<KeyIcon />}
          hint="Leave blank to keep the existing key."
          error={form.formState.errors.api_key?.message}
        >
          <input
            type="password"
            {...form.register("api_key")}
            placeholder="New API key (optional)"
            style={inputCss}
          />
        </Field>

        {provider.type !== "claude" && (
          <Field
            label="Base URL"
            icon={<ServerIcon />}
            hint="Leave blank for the default endpoint."
          >
            <input
              type="url"
              {...form.register("base_url")}
              placeholder="https://api.openai.com/v1"
              style={inputCss}
            />
          </Field>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Timeout (s)" error={form.formState.errors.timeout?.message}>
            <input
              type="number"
              {...form.register("timeout", { valueAsNumber: true })}
              min={1}
              max={600}
              style={inputCss}
            />
          </Field>
          <Field label="SSL verify">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 34,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                {...form.register("ssl_verify")}
                style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 12, color: "var(--fg-1)" }}>Verify TLS certificate</span>
            </label>
          </Field>
        </div>

        <Field label="Models" icon={<CpuIcon />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {watchedModels.map((m) => (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-0)",
                }}
              >
                <span
                  className="mono"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "var(--fg-1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveModel(m);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-3)",
                    padding: "0 2px",
                    lineHeight: 1,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              ref={newModelRef}
              type="text"
              value={newModel}
              onChange={(e) => {
                setNewModel(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddModel();
                }
              }}
              placeholder="Model ID (e.g. gpt-4o)"
              style={{ ...inputCss, flex: 1 }}
            />
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0, gap: 4 }}
              onClick={handleAddModel}
              disabled={!newModel.trim()}
            >
              <PlusIcon />
              Add
            </button>
          </div>

          {provider.type !== "claude" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: "5px 12px", fontSize: 11, gap: 5 }}
                onClick={() => {
                  void handleFetchModels();
                }}
                disabled={fetchState === "loading"}
              >
                {fetchState === "loading" ? "Fetching…" : "Fetch from API"}
              </button>
              {fetchState === "error" && fetchError && (
                <span style={{ fontSize: 11, color: "var(--c-critical)" }}>{fetchError}</span>
              )}
            </div>
          )}
        </Field>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "5px 14px" }}
            onClick={() => {
              setEditing(false);
              form.reset();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            style={{ padding: "5px 14px", opacity: updateProvider.isPending ? 0.6 : 1 }}
            disabled={updateProvider.isPending}
          >
            {updateProvider.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-0)", marginBottom: 2 }}>
          {provider.name}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {provider.models.length > 0 ? provider.models.join(", ") : "No models configured"}
        </div>
      </div>

      <span className="chip" style={{ fontSize: 10 }}>
        {typeLabel[provider.type]}
      </span>

      <button
        type="button"
        className="btn ghost"
        style={{ padding: "4px 8px", gap: 5, fontSize: 11, color: "var(--fg-3)" }}
        onClick={handleEdit}
        title="Edit provider"
      >
        <PencilIcon />
        Edit
      </button>

      <button
        type="button"
        className="btn ghost"
        style={{
          padding: "4px 10px",
          gap: 5,
          fontSize: 11,
          color: confirming ? "var(--c-critical)" : "var(--fg-3)",
          border: confirming
            ? "1px solid color-mix(in oklch, var(--c-critical) 40%, transparent)"
            : "1px solid transparent",
          borderRadius: 6,
        }}
        onClick={handleDelete}
        onBlur={() => {
          setConfirming(false);
        }}
        disabled={deleteProvider.isPending}
      >
        <TrashIcon />
        {confirming ? "Confirm" : "Remove"}
      </button>
    </div>
  );
};

/* ── AddAIProviderForm ──────────────────────────────────────────────── */
const AddAIProviderForm = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const createProvider = useCreateAIProvider();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const resolver = zodResolver(CreateAIProviderSchema);
  const form = useForm<CreateAIProvider, unknown, CreateAIProvider>({
    resolver,
    defaultValues: { name: "", type: "claude", api_key: "", base_url: "", models: [] },
  });

  const providerType = useWatch({ control: form.control, name: "type" });

  const handleSubmit = (data: CreateAIProvider): void => {
    createProvider.mutate(data, {
      onSuccess: () => {
        form.reset();
        setIsOpen(false);
      },
    });
  };

  if (!isOpen) {
    return (
      <div style={{ padding: "10px 16px" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 10px", gap: 6, fontSize: 12 }}
          onClick={() => {
            setIsOpen(true);
          }}
        >
          <PlusIcon />
          Add Provider
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void form.handleSubmit(handleSubmit)(e);
      }}
      noValidate
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderTop: "1px solid var(--border)",
        background: "var(--bg-0)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--fg-2)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        New AI Provider
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
        <Field label="Name" error={form.formState.errors.name?.message}>
          <input type="text" {...form.register("name")} placeholder="My Claude" style={inputCss} />
        </Field>
        <Field label="Type">
          <select
            {...form.register("type")}
            style={{ ...inputCss, cursor: "pointer", width: "auto", minWidth: 140 }}
          >
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
            <option value="openai_compat">OpenAI-compat</option>
          </select>
        </Field>
      </div>

      <Field
        label="API Key"
        icon={<KeyIcon />}
        hint="Stored on the server, never exposed to the browser."
        error={form.formState.errors.api_key?.message}
      >
        <input
          type="password"
          {...form.register("api_key")}
          placeholder={providerType === "claude" ? "sk-ant-api03-…" : "sk-…"}
          style={inputCss}
        />
      </Field>

      {providerType !== "claude" && (
        <Field label="Base URL" icon={<ServerIcon />} hint="Leave blank for the default endpoint.">
          <input
            type="url"
            {...form.register("base_url")}
            placeholder="https://api.openai.com/v1"
            style={inputCss}
          />
        </Field>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Timeout (s)" error={form.formState.errors.timeout?.message}>
          <input
            type="number"
            {...form.register("timeout", { valueAsNumber: true })}
            min={1}
            max={600}
            style={inputCss}
          />
        </Field>
        <Field label="SSL verify">
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, height: 34, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              {...form.register("ssl_verify")}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 12, color: "var(--fg-1)" }}>Verify TLS certificate</span>
          </label>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 14px" }}
          onClick={() => {
            setIsOpen(false);
            form.reset();
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn primary"
          style={{ padding: "5px 14px", opacity: createProvider.isPending ? 0.6 : 1 }}
          disabled={createProvider.isPending}
        >
          {createProvider.isPending ? "Adding…" : "Add Provider"}
        </button>
      </div>
    </form>
  );
};

/* ── StorageSection ──────────────────────────────────────────────────── */
const StorageSection = (): React.ReactElement => {
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

  const copyLabel =
    info?.os === "Windows"
      ? "Copy Explorer path"
      : info?.os === "Darwin"
        ? "Copy Finder path"
        : "Copy folder path";

  const folderIcon = (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <Section
      title="Storage"
      description="Location of local data files (hosts, providers, reviews)."
    >
      <div style={{ padding: "14px 16px" }}>
        {isLoading ? (
          <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <code
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--fg-1)",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "7px 10px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={info?.data_dir}
            >
              {info?.data_dir ?? "—"}
            </code>
            <button
              type="button"
              className="btn ghost"
              disabled={!info?.data_dir}
              onClick={() => void handleCopyPath()}
              title={copyLabel}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
            >
              {folderIcon}
              {copyLabel}
            </button>
          </div>
        )}
        {info && (
          <div
            style={{ marginTop: 8, fontSize: 11, color: "var(--fg-3)", display: "flex", gap: 16 }}
          >
            <span>
              {info.os} {info.os_version.split(" ")[0]}
            </span>
            <span>Python {info.python_version}</span>
          </div>
        )}
      </div>
    </Section>
  );
};

/* ── SettingsPage ────────────────────────────────────────────────────── */
export const SettingsPage = (): React.ReactElement => {
  const navigate = useNavigate();
  const { data: hosts, isLoading: hostsLoading } = useHosts();
  const { data: aiProviders, isLoading: providersLoading } = useAIProviders();

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "column",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          height: 48,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            void navigate("/");
          }}
          title="Back"
        >
          <BackIcon />
        </button>
        <div style={{ width: 1, height: 16, background: "var(--border)" }} />
        <h1 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", margin: 0 }}>Settings</h1>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "32px 24px",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Hosts section */}
          <Section
            title="Git Hosts"
            description="Add GitLab, GitHub, Gitea, Forgejo or Bitbucket instances to browse their merge requests."
          >
            {hostsLoading && (
              <div style={{ padding: "12px 16px", color: "var(--fg-3)", fontSize: 12 }}>
                Loading…
              </div>
            )}

            {hosts?.length === 0 && !hostsLoading && (
              <div
                style={{
                  padding: "16px",
                  fontSize: 12,
                  color: "var(--fg-3)",
                  fontStyle: "italic",
                }}
              >
                No hosts configured yet.
              </div>
            )}

            {hosts?.map((host) => (
              <HostRow key={host.id} host={host} />
            ))}
            <AddHostForm />
          </Section>

          {/* AI Providers section */}
          <Section
            title="AI Providers"
            description="Configure language models used to generate code review comments."
          >
            {providersLoading && (
              <div style={{ padding: "12px 16px", color: "var(--fg-3)", fontSize: 12 }}>
                Loading…
              </div>
            )}

            {aiProviders?.length === 0 && !providersLoading && (
              <div
                style={{
                  padding: "16px",
                  fontSize: 12,
                  color: "var(--fg-3)",
                  fontStyle: "italic",
                }}
              >
                No AI providers configured yet.
              </div>
            )}

            {aiProviders?.map((p) => (
              <AIProviderRow key={p.id} provider={p} />
            ))}
            <AddAIProviderForm />
          </Section>

          {/* Storage section */}
          <StorageSection />
        </div>
      </div>
    </div>
  );
};
