import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · PULSO",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "es_HN",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Todo tu día. Un solo pulso. — PULSO" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.jpg"],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  colorScheme: "dark",
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
