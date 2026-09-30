"use client";

import { useState } from "react";

const MIN_LENGTH = 6;

type Status = { k: "idle" } | { k: "saving" } | { k: "done" } | { k: "error"; message: string };

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ k: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH) {
      setStatus({ k: "error", message: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.` });
      return;
    }
    if (password !== confirm) {
      setStatus({ k: "error", message: "Las dos contraseñas no coinciden." });
      return;
    }
    setStatus({ k: "saving" });
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (response.ok) {
        setStatus({ k: "done" });
        return;
      }
      const body = await response.json().catch(() => null) as { code?: string } | null;
      setStatus({
        k: "error",
        message: body?.code === "INVALID_TOKEN"
          ? "El enlace venció o ya se usó. Pedí uno nuevo desde la app."
          : response.status === 429
            ? "Demasiados intentos. Esperá unos minutos."
            : "No se pudo guardar. Probá de nuevo.",
      });
    } catch {
      setStatus({ k: "error", message: "Sin conexión. Revisá tu internet y probá de nuevo." });
    }
  }

  if (status.k === "done") {
    return (
      <p role="status" className="text-fg-mid leading-relaxed">
        Listo: tu contraseña cambió y cerramos las demás sesiones. Volvé a la app e ingresá con la nueva.
      </p>
    );
  }

  const input = "w-full bg-elev border border-line px-3 py-3 text-fg outline-none focus:border-volt";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="font-mono-app text-[10px] tracking-[0.14em] text-fg-sec">NUEVA CONTRASEÑA</span>
        <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={input} required minLength={MIN_LENGTH} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-mono-app text-[10px] tracking-[0.14em] text-fg-sec">REPETILA</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={input} required minLength={MIN_LENGTH} />
      </label>
      {status.k === "error" && <p role="alert" className="text-danger text-sm">{status.message}</p>}
      <button
        type="submit"
        disabled={status.k === "saving"}
        className="bg-volt text-ink font-mono-app font-bold text-xs tracking-[0.08em] py-4 disabled:opacity-60"
      >
        {status.k === "saving" ? "GUARDANDO…" : "GUARDAR CONTRASEÑA"}
      </button>
    </form>
  );
}
