import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@app";
import { env } from "@shared/config/env";
import { installStaleChunkReload } from "@shared/lib";
import "@app/styles/index.css";

// A tab opened before an upgrade asks for chunks the new build no longer has.
installStaleChunkReload();

async function enableMocking() {
  const mswInBundle = import.meta.env.VITE_ENABLE_MSW_BUNDLE === "true";
  if ((import.meta.env.DEV || mswInBundle) && env.VITE_USE_MOCKS) {
    // eslint-disable-next-line no-console
    console.log("[MSW] Enabling mocking...");
    const { worker } = await import("@shared/api/mocks/browser");

    return worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: {
        url: "/mockServiceWorker.js",
        options: { updateViaCache: "none" },
      },
    });
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

void enableMocking().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
