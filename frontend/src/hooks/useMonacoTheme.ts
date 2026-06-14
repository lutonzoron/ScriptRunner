import { useTheme } from "@/hooks/useTheme";

export function useMonacoTheme() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "vs-dark" : "vs-light";
}
