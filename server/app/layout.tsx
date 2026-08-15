import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "./fonts/Inter-400.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Inter-600.ttf",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-pulso-body",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "./fonts/JetBrainsMono-400.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/JetBrainsMono-700.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/JetBrainsMono-800.ttf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-pulso-mono",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: [
    {
      path: "./fonts/SpaceGrotesk-500.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/SpaceGrotesk-700.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pulso-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PULSO — Convierte disciplina en progreso",
    template: "%s | PULSO",
  },
  description:
    "Entrenamiento, nutrición, mediciones y guía profesional en un sistema local-first que funciona incluso sin conexión.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
