import type { Metadata } from "next";
import { themeKey } from "../lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACTA · Entre amigos",
  description: "Comparte gastos y salda deudas a vuestra manera.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initializeTheme = `try{if(localStorage.getItem(${JSON.stringify(themeKey)})==="dark")document.documentElement.dataset.theme="dark"}catch{}`;
  return <html lang="es" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: initializeTheme }} /></head>
    <body>{children}</body>
  </html>;
}
