import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, writeFileSync } from "fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

const REACT_PACKAGES = new Set([
  "react",
  "react-dom",
  "scheduler",
  "react-router",
  "react-router-dom",
  "cookie",
  "set-cookie-parser",
]);

/** The npm package a module id belongs to (`@scope/name` or `name`), or null for app code. */
const vendorPackageOf = (id: string): string | null => {
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  if (at === -1) return null;
  const [first, second] = id.slice(at + marker.length).split("/");
  if (!first) return null;
  return first.startsWith("@") && second ? `${first}/${second}` : first;
};

const emitVersionJson = (): Plugin => ({
  name: "emit-version-json",
  writeBundle(options) {
    const outDir = options.dir ?? "dist";
    writeFileSync(path.join(outDir, "version.json"), JSON.stringify({ version }));
  },
});

export default defineConfig(({ mode }) => {
  const env = mode === "development" ? loadEnv(mode, process.cwd(), "") : {};
  const rawProxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() ?? "";
  const devProxyTarget = rawProxyTarget !== "" ? rawProxyTarget : "http://localhost:8000";

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },

    plugins: [react(), emitVersionJson()],

    optimizeDeps: {
      entries: ["./index.html"],
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@app": path.resolve(__dirname, "./src/app"),
        "@pages": path.resolve(__dirname, "./src/pages"),
        "@widgets": path.resolve(__dirname, "./src/widgets"),
        "@features": path.resolve(__dirname, "./src/features"),
        "@entities": path.resolve(__dirname, "./src/entities"),
        "@shared": path.resolve(__dirname, "./src/shared"),
      },
    },

    server: {
      port: 3000,
      host: "0.0.0.0",
      proxy:
        mode === "development"
          ? {
              "/api": {
                target: devProxyTarget,
                changeOrigin: true,
                secure: devProxyTarget.startsWith("https:"),
              },
            }
          : {},
    },

    preview: {
      port: 3000,
      host: "0.0.0.0",
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
      },
    },

    build: {
      target: "ES2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          // Only the libraries every page runs at start-up get a chunk of their own, so
          // they stay cached across releases. Everything else follows the lazy imports:
          // the stages, the Markdown renderer and the dialogs load when first shown.
          manualChunks: (id) => {
            const pkg = vendorPackageOf(id);
            if (pkg === null) return undefined;
            if (REACT_PACKAGES.has(pkg)) return "react-vendor";
            if (pkg.startsWith("@tanstack/") && pkg.includes("query")) return "query-vendor";
            return undefined;
          },
        },
      },
    },
  };
});
