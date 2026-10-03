"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../lib";

// Shared pieces of the super-admin panel. Dense, monospace labels and flat
// surfaces like the rest of the portal; cyan marks admin context so it never
// reads as the clinical workspace.

export const ROLE_LABEL: Record<string, string> = {
  athlete: "Atleta",
  coach: "Entrenador/a",
  nutritionist: "Nutricionista",
};

export const SUBSCRIPTION_LABEL: Record<string, string> = {
  active: "Activa",
  in_grace_period: "Período de gracia",
  billing_issue: "Problema de cobro",
  cancelled: "Cancelada (sin renovar)",
  expired: "Vencida",
  paused: "Pausada",
};

export const ERROR_LABEL: Record<string, string> = {
  cannot_modify_self: "No podés aplicar esta acción a tu propia cuenta.",
  cannot_modify_super_admin: "Los super admins solo se gestionan desde el servidor (SUPERADMIN_EMAILS o el script).",
  already_suspended: "La cuenta ya estaba suspendida.",
  not_suspended: "La cuenta no está suspendida.",
  role_unchanged: "La cuenta ya tiene ese rol.",
  plus_not_active: "La cuenta no tiene PULSO Plus activo.",
  plus_until_in_past: "La fecha de vencimiento ya pasó.",
  user_not_found: "La cuenta ya no existe.",
  not_a_professional: "La cuenta ya no es de profesional.",
  missing_fields: "Completá los campos obligatorios.",
  invalid_media: "La animación debe subirse desde este panel.",
  invalid_values: "Los valores deben estar entre 0 y 1000.",
  macros_over_100g: "Proteína + carbohidratos + grasa no pueden superar 100 g por cada 100 g.",
  duplicate_name: "Ya existe un alimento con ese nombre.",
  too_large: "El archivo supera los 15 MB.",
  unsupported_type: "Formato no admitido. Usá GIF, WebP, PNG, JPG o MP4.",
};

export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) {
    const code = typeof cause.body?.error === "string" ? cause.body.error : "";
    if (ERROR_LABEL[code]) return ERROR_LABEL[code];
    if (cause.status === 403) return "Tu sesión ya no tiene permisos de super admin.";
  }
  return fallback;
}

const dateFormat = new Intl.DateTimeFormat("es-HN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-HN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function formatDate(ms: number | null | undefined): string {
  return ms ? dateFormat.format(new Date(ms)) : "—";
}

export function formatDateTime(ms: number | null | undefined): string {
  return ms ? dateTimeFormat.format(new Date(ms)) : "—";
}

export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "nunca";
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 2) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDate(ms);
}

/** Fetch an admin endpoint, keeping the last good data visible while it reloads. */
export function useAdminData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const latest = useRef(url);

  const load = useCallback(async () => {
    if (!url) return;
    latest.current = url;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(url);
      if (latest.current === url) setData(result);
    } catch (cause) {
      if (latest.current === url) setError(errorMessage(cause, "No se pudo cargar. Revisá tu conexión e intentá de nuevo."));
    } finally {
      if (latest.current === url) setLoading(false);
    }
  }, [url]);

  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export function AdminHeader({ eyebrow, title, description, actions }: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-6 md:px-8">
      <div className="max-w-2xl">
        <div className="mb-1.5 font-mono-app text-[10px] tracking-[2px] text-neon">ADMIN · {eyebrow}</div>
        <h1 className="text-[24px] font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-6 text-fg-sec">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-fg">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 cursor-pointer border border-danger/60 px-3 py-1.5 font-mono-app text-[10px] tracking-[1px] text-danger hover:bg-danger/10">
          REINTENTAR
        </button>
      )}
    </div>
  );
}

export function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(id);
  }, [message, onClose]);
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 border border-volt/50 bg-card px-4 py-3 text-sm text-fg shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {message}
    </div>
  );
}

const PILL_TONES = {
  ok: "border-volt/40 text-volt",
  info: "border-neon/40 text-neon",
  warn: "border-warn/50 text-warn",
  danger: "border-danger/50 text-danger",
  muted: "border-line text-fg-sec",
} as const;

export function Pill({ tone = "muted", children }: { tone?: keyof typeof PILL_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 font-mono-app text-[9.5px] tracking-[0.8px] ${PILL_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function subscriptionTone(status: string | null | undefined): keyof typeof PILL_TONES {
  if (status === "active") return "ok";
  if (status === "in_grace_period" || status === "billing_issue") return "warn";
  if (status === "cancelled") return "info";
  return "muted";
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" | "danger" | "ok" }) {
  const color = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-volt" : "text-fg";
  return (
    <div className="border border-line bg-card px-4 py-3.5">
      <div className="font-mono-app text-[9.5px] tracking-[1.4px] text-fg-ter">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-fg-sec">{hint}</div>}
    </div>
  );
}

export const inputClass = "w-full border border-line bg-elev px-3 py-2.5 text-sm text-fg placeholder:text-fg-ter focus:border-neon focus:outline-none";
export const buttonPrimary = "cursor-pointer bg-volt px-4 py-2.5 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:cursor-default disabled:opacity-50";
export const buttonGhost = "cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[11px] tracking-[1px] text-fg-sec transition hover:border-fg-ter hover:text-fg disabled:cursor-default disabled:opacity-50";
export const buttonDanger = "cursor-pointer border border-danger/60 px-4 py-2.5 font-mono-app text-[11px] tracking-[1px] text-danger transition hover:bg-danger/10 disabled:cursor-default disabled:opacity-50";

export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 py-3 font-mono-app text-[11px] text-fg-sec">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={buttonGhost}>← ANTERIOR</button>
      <span className="tabular-nums">{page} / {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={buttonGhost}>SIGUIENTE →</button>
    </div>
  );
}

/**
 * Modal for consequential actions. Focus lands on the safe choice, Escape
 * cancels, and an optional text field collects a reason that goes in the email.
 */
export function ConfirmDialog({ title, body, confirmLabel, danger, reason, busy, error, onConfirm, onCancel }: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const blocked = Boolean(reason?.required && text.trim().length < 5);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md border border-line bg-card p-5">
        <h2 id="confirm-title" className="text-lg font-semibold text-fg">{title}</h2>
        <div className="mt-2 text-sm leading-6 text-fg-sec">{body}</div>
        {reason && (
          <label className="mt-4 block">
            <span className="mb-1.5 block font-mono-app text-[10px] tracking-[1.2px] text-fg-ter">{reason.label}</span>
            <textarea value={text} onChange={event => setText(event.target.value)} rows={3} maxLength={1000} placeholder={reason.placeholder} className={inputClass} />
          </label>
        )}
        {error && <div className="mt-3 text-sm text-danger">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={buttonGhost}>CANCELAR</button>
          <button type="button" onClick={() => onConfirm(text.trim())} disabled={busy || blocked} className={danger ? buttonDanger : buttonPrimary}>
            {busy ? "APLICANDO…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="border border-dashed border-line px-5 py-10 text-center">
      <div className="text-sm font-semibold text-fg">{title}</div>
      {body && <div className="mt-1 text-sm text-fg-sec">{body}</div>}
    </div>
  );
}

export function SegmentedFilter<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap border border-line">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`cursor-pointer px-3 py-2 font-mono-app text-[10px] tracking-[1px] transition ${value === option.value ? "bg-card text-neon" : "text-fg-sec hover:text-fg"}`}
        >
          {option.label}{option.count != null ? ` · ${option.count}` : ""}
        </button>
      ))}
    </div>
  );
}

/** Debounce a search box so typing doesn't fire a request per keystroke. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
