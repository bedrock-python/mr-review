import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "@app/providers";
import { AppRoutes } from "@app/routes";
import "./app/styles/globals.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element #root not found in document");
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <AppRoutes />
    </Providers>
  </StrictMode>,
);
