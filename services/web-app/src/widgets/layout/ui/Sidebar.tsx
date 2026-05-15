import { Server, GitBranch, Star, Settings, Home } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib";
import { RouteMap } from "@shared/config/routes";

type NavItem = {
  label: string;
  icon: React.ReactNode;
  path: string;
};

export const Sidebar = () => {
  const { t } = useTranslation();

  const navItems: NavItem[] = [
    {
      label: t("nav.home"),
      icon: <Home className="h-4 w-4" />,
      path: RouteMap.home,
    },
    {
      label: t("nav.hosts"),
      icon: <Server className="h-4 w-4" />,
      path: RouteMap.hosts,
    },
    {
      label: t("nav.repos"),
      icon: <GitBranch className="h-4 w-4" />,
      path: RouteMap.repos,
    },
    {
      label: t("nav.reviews"),
      icon: <Star className="h-4 w-4" />,
      path: RouteMap.reviews,
    },
    {
      label: t("nav.settings"),
      icon: <Settings className="h-4 w-4" />,
      path: RouteMap.settings,
    },
  ];

  return (
    <div className="bg-background md:bg-muted/40 flex h-full w-60 flex-col border-r shadow-sm">
      <div className="flex h-16 items-center border-b px-4">
        <span className="text-foreground text-sm font-semibold">MR Review</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === RouteMap.home}
            className={({ isActive }) =>
              cn(
                "hover:bg-accent hover:text-accent-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
