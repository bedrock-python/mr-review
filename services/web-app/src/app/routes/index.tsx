import { lazy, Suspense } from "react";
import type React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Spinner } from "@shared/ui/Spinner";

const MainPage = lazy(() =>
  import("@pages/main").then((m) => ({ default: m.MainPage as React.ComponentType }))
);

const SettingsPage = lazy(() =>
  import("@pages/settings").then((m) => ({ default: m.SettingsPage as React.ComponentType }))
);

export const Router = (): React.ReactElement => {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<MainPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
