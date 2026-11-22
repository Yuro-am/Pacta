"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { accentKey, accents, themeKey, type Accent } from "../lib/appearance";

type Theme = "light" | "dark";

export function useAppearance() {
  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState<Accent>("purple");

  useEffect(() => {
    const preferences = document.documentElement.dataset;
    if (preferences.theme === "dark") setTheme("dark");
    const savedAccent = accents.find((item) => item.id === preferences.accent);
    if (savedAccent) setAccent(savedAccent.id);
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(themeKey, next); }
    catch { /* Keep the selection for the current visit. */ }
  }

  function changeAccent(next: string) {
    const choice = accents.find((item) => item.id === next);
    if (!choice) return;
    setAccent(choice.id);
    document.documentElement.dataset.accent = choice.id;
    try { localStorage.setItem(accentKey, choice.id); }
    catch { /* Keep the selection for the current visit. */ }
  }

  return { theme, changeTheme, accent, changeAccent };
}

export function AppearancePicker({ theme, changeTheme, accent, changeAccent }: ReturnType<typeof useAppearance>) {
  return <fieldset className="appearance-picker">
    <legend>Apariencia</legend>
    <div className="appearance-options">
      <button type="button" aria-pressed={theme === "light"} onClick={() => changeTheme("light")}><Sun size={16} /> Claro</button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}><Moon size={16} /> Oscuro</button>
    </div>
    <label className="accent-picker">Color<select value={accent} onChange={(event) => changeAccent(event.target.value)}>
      {accents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
  </fieldset>;
}
