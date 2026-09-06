import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sun, Moon } from "@phosphor-icons/react";

// Light by default. The toggle is remembered in this browser (localStorage), so the
// choice sticks per device without a round-trip to the server.

type Theme = "light" | "dark";
const KEY = "op-theme";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="grid h-9 w-9 place-items-center rounded-full text-stone-600 transition-colors hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]"
    >
      {theme === "dark" ? <Sun size={18} weight="light" /> : <Moon size={18} weight="light" />}
    </button>
  );
}
