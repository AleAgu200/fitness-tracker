"use client";

import { useState } from "react";

type Status = { k: "idle" } | { k: "sending" } | { k: "sent"; email: string } | { k: "error"; message: string };

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ k: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ k: "sending" });
    const address = email.trim().toLowerCase();
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, redirectTo: "/cuenta/restablecer" }),
      });
      if (response.ok) {
        setStatus({ k: "sent", email: address });
        return;
      }
      setStatus({
        k: "error",
        message: response.status === 429
          ? "Pediste varios enlaces seguidos. Esperá unos minutos y revisá tu correo."
          : "No se pudo enviar el enlace. Probá de nuevo.",
      });
    } catch {
      setStatus({ k: "error", message: "No hay conexión. Probá de nuevo." });
    }
  }

  if (status.k === "sent") {
    return (
      <p className="leading-relaxed text-fg-mid">
        Si {status.email} tiene una cuenta con contraseña, le llega un enlace para elegir una nueva. Vence en una hora.
        Si entrás con Google o Apple, no necesitás contraseña.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="mb-5 leading-relaxed text-fg-mid">Escribí el correo de tu cuenta y te enviamos un enlace para elegir una contraseña nueva.</p>
      <input
        required
        type="email"
        autoComplete="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        placeholder="tu@email.com"
        className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none"
      />
      {status.k === "error" && <p role="alert" className="mb-3 text-sm text-danger">{status.message}</p>}
      <button type="submit" disabled={status.k === "sending"} className="w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60">
        {status.k === "sending" ? "ENVIANDO…" : "ENVIARME EL ENLACE"}
      </button>
    </form>
  );
}
