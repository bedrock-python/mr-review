import { Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./ui/Sidebar";
import { Header } from "./ui/Header";
import { cn } from "@shared/lib";

export const MainLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => {
            setIsMobileMenuOpen(false);
          }}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 transform shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Menu Button */}
        <div className="flex h-16 items-center border-b px-4 md:hidden">
          <button
            className="rounded-xl p-2"
            onClick={() => {
              setIsMobileMenuOpen(!isMobileMenuOpen);
            }}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <Header />

        <main className="bg-background-subtle/30 flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-(--breakpoint-2xl)">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
