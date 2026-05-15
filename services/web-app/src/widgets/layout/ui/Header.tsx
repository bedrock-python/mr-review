import { User as UserIcon, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@features/auth";

export const Header = () => {
  const { t } = useTranslation();
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    void navigate("/login");
  };

  return (
    <header className="bg-background flex h-16 items-center justify-between border-b px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-foreground text-sm font-semibold">
          {t("common.brand", "MR Review")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void navigate("/settings")}
          className="text-muted-foreground hover:text-foreground rounded-md p-2 transition-colors"
          title={t("nav.settings")}
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => void navigate("/profile")}
          className="text-muted-foreground hover:text-foreground rounded-md p-2 transition-colors"
          title={t("nav.profile")}
        >
          <UserIcon className="h-5 w-5" />
        </button>
        <button
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive rounded-md p-2 transition-colors"
          title={t("auth.logout")}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
};
