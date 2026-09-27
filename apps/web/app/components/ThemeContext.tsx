"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "wms_theme_preference";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "dark" || stored === "light") {
        setThemeState(stored);
        applyTheme(stored);
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setThemeState("dark");
        applyTheme("dark");
      }
    } catch {
      // Fallback default
    }
  }, []);

  const applyTheme = (t: Theme) => {
    if (typeof document !== "undefined") {
      if (t === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === "dark", toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "light" as Theme,
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs sm:text-sm font-medium transition shadow-xs cursor-pointer ${
        isDark
          ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      } ${className}`}
      title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Industrial Oscuro"}
      aria-label="Alternar tema visual"
    >
      {isDark ? (
        <Sun size={15} className="text-amber-400" />
      ) : (
        <Moon size={15} className="text-slate-600" />
      )}
      <span className="hidden sm:inline">{isDark ? "Claro" : "Oscuro"}</span>
    </button>
  );
}
