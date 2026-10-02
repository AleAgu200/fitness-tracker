import type { Metadata } from "next";

import { AccountShell } from "../shell";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false, follow: false },
};

/**
 * Where the recovery email lands. Better Auth checks the link first and sends
 * here either `?token=` (valid) or `?error=INVALID_TOKEN` (expired or used).
 * It works on any device: the password is changed on the server.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const error = typeof params.error === "string" ? params.error : null;

  if (!token || error) {
    return (
      <AccountShell title="El enlace ya no sirve">
        <p className="text-fg-mid leading-relaxed">
          Los enlaces para restablecer la contraseña se usan una sola vez y vencen en una hora.
          Pedí uno nuevo desde la app con «¿Olvidaste tu contraseña?» o en <a href="/cuenta/recuperar" className="text-volt underline">pulsofitness.tech/cuenta/recuperar</a>.
        </p>
      </AccountShell>
    );
  }

  return (
    <AccountShell title="Elegí una nueva contraseña">
      <ResetPasswordForm token={token} />
    </AccountShell>
  );
}
