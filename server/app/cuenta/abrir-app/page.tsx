import type { Metadata } from "next";

import { appDeepLink, APP_SCHEMES, type AppScheme } from "@/lib/magic-link";

import { AccountShell } from "../shell";
import { OpenApp } from "./open-app";

export const metadata: Metadata = {
  title: "Abrir PULSO",
  robots: { index: false, follow: false },
  // The URL carries a one-time sign-in token; never hand it to another site.
  referrer: "no-referrer",
};

/**
 * Hand-off for magic links requested from the app. Mail clients drop custom
 * schemes, so the email links here and this page opens pulso://auth/magic.
 * The token is not redeemed here: the app does it, so the session lands there.
 */
export default async function OpenAppPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && /^[\w-]{16,200}$/.test(params.token) ? params.token : null;
  const scheme = APP_SCHEMES.includes(params.scheme as AppScheme) ? params.scheme as AppScheme : "pulso";

  if (!token) {
    return (
      <AccountShell title="Enlace no válido">
        <p className="leading-relaxed text-fg-mid">El enlace está incompleto. Pedí uno nuevo desde la app.</p>
      </AccountShell>
    );
  }

  return (
    <AccountShell title="Entrá a PULSO">
      <p className="mb-6 leading-relaxed text-fg-mid">
        Tocá el botón para abrir la app con tu cuenta. El enlace sirve una sola vez y vence en 10 minutos.
      </p>
      <OpenApp href={appDeepLink(scheme, token)} />
    </AccountShell>
  );
}
