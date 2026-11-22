import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACTA · Entre amigos",
  description: "Comparte gastos y salda deudas a vuestra manera.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
