import type { Metadata } from "next";

import { AccountShell } from "../shell";

export const metadata: Metadata = {
  title: "Correo confirmado",
  robots: { index: false, follow: false },
};

/** Where Better Auth sends the verification link after checking it. */
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  if (typeof params.error === "string") {
    return (
      <AccountShell title="No pudimos confirmar tu correo">
        <p className="text-fg-mid leading-relaxed">
          El enlace venció o ya se usó. Pedí otro desde la app.
        </p>
      </AccountShell>
    );
  }
  return (
    <AccountShell title="Correo confirmado">
      <p className="text-fg-mid leading-relaxed">Gracias. Ya podés volver a la app.</p>
    </AccountShell>
  );
}
