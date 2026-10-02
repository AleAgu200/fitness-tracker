"use client";

import { useEffect, useState } from "react";

/** Try the deep link once on load; the button stays for when the browser blocks it. */
export function OpenApp({ href }: { href: string }) {
  const [tried, setTried] = useState(false);
  useEffect(() => {
    window.location.href = href;
    const id = window.setTimeout(() => setTried(true), 1500);
    return () => window.clearTimeout(id);
  }, [href]);

  return (
    <>
      <a
        href={href}
        className="block w-full bg-volt p-3.5 text-center font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110"
      >
        ABRIR PULSO
      </a>
      {tried && (
        <p className="mt-4 text-sm leading-relaxed text-fg-sec">
          ¿No se abrió? Abrí este correo desde el teléfono donde tenés la app instalada. Si estás en una computadora, pedí el enlace
          de nuevo desde la app del teléfono.
        </p>
      )}
    </>
  );
}
