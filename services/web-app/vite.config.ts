import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, writeFileSync } from "fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

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
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            "query-vendor": ["@tanstack/react-query"],
            "table-vendor": ["@tanstack/react-table", "@tanstack/react-virtual"],
            "radix-vendor": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-select",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
            "chart-vendor": ["recharts"],
            "icons-vendor": ["lucide-react"],
            "command-palette": ["cmdk"],
          },
        },
      },
    },
  };
});
