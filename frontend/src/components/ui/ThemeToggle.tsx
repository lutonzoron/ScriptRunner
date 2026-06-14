import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/context/ThemeContext";

const labels: Record<Theme, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Escuro",
};

const icons: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export default function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const Icon = icons[theme];

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors duration-200"
      title={`Tema: ${labels[theme]}`}
      aria-label={`Tema atual: ${labels[theme]}. Clique para alternar.`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
