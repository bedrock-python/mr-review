import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Spinner } from "@shared/ui";

const MainPage = lazy(() =>
  import("@pages/main").then((m) => ({ default: m.MainPage })),
);

const LoadingFallback = (): React.ReactElement => (
  <div className="flex h-screen items-center justify-center bg-bg">
    <Spinner size="lg" />
  </div>
);

export const AppRoutes = (): React.ReactElement => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<MainPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
