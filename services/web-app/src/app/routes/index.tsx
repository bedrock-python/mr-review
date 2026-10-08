import { lazy, Suspense } from "react";
import type React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { reloadOnStaleChunk } from "@shared/lib";
// Straight from the module: the shared/ui barrel would pull every primitive into the entry chunk.
import { StageLoading } from "@shared/ui/loading";

const MainPage = lazy(
  reloadOnStaleChunk(() =>
    import("@pages/main").then((m) => ({ default: m.MainPage as React.ComponentType }))
  )
);

const SettingsPage = lazy(
  reloadOnStaleChunk(() =>
    import("@pages/settings").then((m) => ({ default: m.SettingsPage as React.ComponentType }))
  )
);

export const Router = (): React.ReactElement => {
  return (
    <BrowserRouter>
      <Suspense fallback={<StageLoading />}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<MainPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
