"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { themeKey } from "../lib/appearance";

type Theme = "light" | "dark";

export function useAppearance() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    if (document.documentElement.dataset.theme === "dark") setTheme("dark");
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(themeKey, next); }
    catch { /* Keep the selection for the current visit. */ }
  }

  return { theme, changeTheme };
}

export function AppearancePicker({ theme, changeTheme }: ReturnType<typeof useAppearance>) {
  return <fieldset className="appearance-picker">
    <legend>Apariencia</legend>
    <div className="appearance-options">
      <button type="button" aria-pressed={theme === "light"} onClick={() => changeTheme("light")}><Sun size={16} /> Claro</button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}><Moon size={16} /> Oscuro</button>
    </div>
  </fieldset>;
}
