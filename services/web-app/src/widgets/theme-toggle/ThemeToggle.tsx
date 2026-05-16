import { useTheme } from "next-themes";
import { Sun, Moon, Terminal } from "lucide-react";

const THEMES = [
  { value: "ink", icon: Moon, label: "Dark" },
  { value: "paper", icon: Sun, label: "Light" },
  { value: "phosphor", icon: Terminal, label: "Terminal" },
] as const;

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="border-border bg-bg-2 flex items-center gap-0.5 rounded-md border p-0.5">
      {THEMES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => {
            setTheme(value);
          }}
          title={label}
          className={
            theme === value
              ? "text-fg-0 bg-bg-3 rounded p-1.5"
              : "text-fg-2 hover:text-fg-0 hover:bg-bg-hover rounded p-1.5 transition-colors"
          }
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
};
