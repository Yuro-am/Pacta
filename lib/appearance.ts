export const themeKey = "pacta-theme";
export const accentKey = "pacta-accent";
export const accents = [
  { id: "purple", label: "Morado" },
  { id: "blue", label: "Azul" },
  { id: "green", label: "Verde" },
  { id: "rose", label: "Rosa" },
  { id: "amber", label: "Naranja" },
] as const;

export type Accent = typeof accents[number]["id"];
