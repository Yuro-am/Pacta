import type { Metadata } from "next";
import { accentKey, accents, previousAccents, themeKey } from "../lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACTA · Entre amigos",
  icons: { apple: "/app-icon/180" },
  appleWebApp: { capable: true, title: "PACTA" },
  description: "Comparte gastos y salda deudas a vuestra manera.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initializeAppearance = `try{
    const root=document.documentElement.dataset;
    if(localStorage.getItem(${JSON.stringify(themeKey)})==="dark")root.theme="dark";
    const stored=localStorage.getItem(${JSON.stringify(accentKey)});
    const previous=${JSON.stringify(previousAccents)};
    const accent=Object.hasOwn(previous,stored)?previous[stored]:stored;
    if(${JSON.stringify(accents.map(({ id }) => id))}.includes(accent))root.accent=accent
  }catch{}`;
  return <html lang="es" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: initializeAppearance }} /></head>
    <body>{children}</body>
  </html>;
}
