import type { Metadata } from "next";

import { AccountShell } from "../shell";
import { RequestResetForm } from "./request-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

/** Request a recovery link from the web (the portal's "¿Olvidaste tu contraseña?"). */
export default function RecoverPasswordPage() {
  return (
    <AccountShell title="Recuperar contraseña">
      <RequestResetForm />
    </AccountShell>
  );
}
