export const themeKey = "pacta-theme";
export const accentKey = "pacta-accent";
export const accents = [
  { id: "red", label: "Rojo" },
  { id: "blue", label: "Azul" },
  { id: "green", label: "Verde" },
  { id: "yellow", label: "Amarillo" },
] as const;

export type Accent = typeof accents[number]["id"];

export const defaultAccent: Accent = "blue";
export const previousAccents: Record<string, Accent> = { purple: "blue", rose: "red", amber: "yellow" };
