"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../lib";

interface AttentionSignal {
  id: string;
  athleteId: string;
  athleteName: string;
  athleteEmail: string;
  discipline: "coach" | "nutritionist";
  reasonCode: string;
  evidence: Record<string, unknown>;
  severity: "info" | "attention" | "urgent";
  status: "open" | "acknowledged";
  suggestedAction: string | null;
  openedAt: number;
  permissions: { canOpenRecord: boolean; evidence: "granted" | "revoked" | "not_authorized" };
}

const REASON_LABELS: Record<string, string> = {
  checkin_submitted: "CHECK-IN POR REVISAR",
  checkin_overdue: "CHECK-IN VENCIDO",
  plan_ending: "PLAN POR TERMINAR",
  sync_stale: "SYNC DESACTUALIZADO",
  sync_missing: "SIN DATOS SINCRONIZADOS",
  message_unanswered: "MENSAJE SIN RESPONDER",
};

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function evidenceText(signal: AttentionSignal): string {
  if (signal.permissions.evidence !== "granted") return signal.permissions.evidence === "revoked"
    ? "El atleta revocó esta categoría; el contenido anterior permanece oculto."
    : "Esta categoría nunca fue autorizada para la organización.";
  const evidence = signal.evidence;
  if (signal.reasonCode === "checkin_submitted") {
    return `Dolor ${evidence.pain ?? "—"}/10 · energía ${evidence.energy ?? "—"}/10 · sueño ${evidence.sleep ?? "—"}/10.`;
  }
  if (signal.reasonCode === "checkin_overdue") return `Venció ${relativeTime(Number(evidence.dueAt ?? signal.openedAt))}.`;
  if (signal.reasonCode === "plan_ending") return `Versión ${evidence.version ?? "—"} · quedan ${evidence.daysRemaining ?? "—"} días.`;
  if (signal.reasonCode.startsWith("sync_")) return evidence.lastSeenAt ? `Último contacto ${relativeTime(Number(evidence.lastSeenAt))}.` : "Todavía no hay un dispositivo escritor registrado.";
  if (signal.reasonCode === "message_unanswered") return `El atleta espera respuesta desde ${relativeTime(Number(evidence.messageAt ?? signal.openedAt))}.`;
  return "Abrí el expediente para revisar la evidencia disponible.";
}

export default function AttentionPage() {
  const [signals, setSignals] = useState<AttentionSignal[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api<{ signals: AttentionSignal[] }>("/api/portal/attention");
      setSignals(result.signals);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    all: signals.length,
    checkins: signals.filter(signal => signal.reasonCode.startsWith("checkin_")).length,
    plans: signals.filter(signal => signal.reasonCode === "plan_ending").length,
    sync: signals.filter(signal => signal.reasonCode.startsWith("sync_")).length,
    messages: signals.filter(signal => signal.reasonCode === "message_unanswered").length,
  }), [signals]);
  const visible = signals.filter(signal => {
    if (filter === "checkins") return signal.reasonCode.startsWith("checkin_");
    if (filter === "plans") return signal.reasonCode === "plan_ending";
    if (filter === "sync") return signal.reasonCode.startsWith("sync_");
    if (filter === "messages") return signal.reasonCode === "message_unanswered";
    return true;
  });

  return (
    <div className="p-6">
      <header className="mb-7 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono-app text-[10px] tracking-[2px] text-volt">BANDEJA DE TRABAJO</div>
          <h1 className="text-2xl font-semibold text-fg">Atención</h1>
          <p className="mt-1 text-sm text-fg-sec">Señales explicables, con evidencia y una siguiente acción.</p>
        </div>
        <button type="button" onClick={load} className="cursor-pointer border border-line px-4 py-2 font-mono-app text-[10px] tracking-[1px] text-fg-sec hover:border-volt hover:text-volt">
          ACTUALIZAR
        </button>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["all", "NECESITAN ATENCIÓN", counts.all],
          ["checkins", "CHECK-INS", counts.checkins],
          ["plans", "PLAN POR TERMINAR", counts.plans],
          ["sync", "SINCRONIZACIÓN", counts.sync],
          ["messages", "MENSAJES", counts.messages],
        ].map(([key, label, count]) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => setFilter(String(key))}
            className={`cursor-pointer border px-3 py-2 font-mono-app text-[10px] tracking-[.8px] ${filter === key ? "border-volt bg-volt/10 text-volt" : "border-line text-fg-sec hover:text-fg"}`}
          >
            {label} <span className="ml-1 font-bold">{count}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between border border-warn/40 bg-warn/10 px-4 py-3 font-mono-app text-[11px] text-warn">
          <span>No se pudo actualizar la bandeja. Los datos visibles pueden estar desactualizados.</span>
          <button type="button" onClick={load} className="cursor-pointer underline">REINTENTAR</button>
        </div>
      )}

      <section className="border border-line bg-card">
        <div className="grid grid-cols-[minmax(180px,.9fr)_minmax(280px,2fr)_150px] gap-4 border-b border-line px-4 py-2.5 font-mono-app text-[9px] tracking-[1.3px] text-fg-ter">
          <span>ATLETA / EQUIPO</span><span>CAUSA Y EVIDENCIA</span><span>ACCIÓN</span>
        </div>
        {loading ? (
          <div className="p-10 text-center font-mono-app text-xs text-fg-ter">CALCULANDO PRIORIDAD…</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center">
            <div className="font-mono-app text-sm text-volt">SIN PENDIENTES EN ESTE FILTRO</div>
            <p className="mt-2 text-sm text-fg-sec">Las señales resueltas dejan de ocupar la bandeja.</p>
          </div>
        ) : visible.map(signal => (
          <article key={signal.id} className="grid grid-cols-[minmax(180px,.9fr)_minmax(280px,2fr)_150px] items-center gap-4 border-b border-line px-4 py-4 last:border-b-0 hover:bg-elev">
            <div className="min-w-0">
              <div className="truncate font-semibold text-fg">{signal.athleteName}</div>
              <div className="truncate font-mono-app text-[9px] text-fg-ter">{signal.athleteEmail}</div>
              <div className="mt-2 font-mono-app text-[9px] uppercase tracking-[1px] text-fg-sec">{signal.discipline === "coach" ? "Entrenamiento" : "Nutrición"}</div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-2 py-1 font-mono-app text-[9px] tracking-[.8px] ${signal.severity === "urgent" ? "border-danger/60 bg-danger/10 text-danger" : signal.severity === "attention" ? "border-warn/50 bg-warn/10 text-warn" : "border-neon/40 bg-neon/10 text-neon"}`}>
                  {REASON_LABELS[signal.reasonCode] ?? signal.reasonCode.toUpperCase()}
                </span>
                <span className="font-mono-app text-[9px] text-fg-ter">{relativeTime(signal.openedAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-fg-mid">{evidenceText(signal)}</p>
            </div>
            <Link href={`/portal/atletas/${encodeURIComponent(signal.athleteId)}`} className="border border-volt px-3 py-2.5 text-center font-mono-app text-[10px] font-bold tracking-[.7px] text-volt hover:bg-volt hover:text-ink">
              ABRIR EXPEDIENTE
            </Link>
          </article>
        ))}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="border border-line bg-card p-4">
          <div className="font-mono-app text-[9px] tracking-[1.2px] text-fg-ter">CRITERIO</div>
          <p className="mt-2 text-sm text-fg-sec">La prioridad muestra causas observables; PULSO no calcula un puntaje médico ni diagnostica.</p>
        </div>
        <div className="border border-line bg-card p-4">
          <div className="font-mono-app text-[9px] tracking-[1.2px] text-fg-ter">DATOS PARCIALES</div>
          <p className="mt-2 text-sm text-fg-sec">Revocado, sin autorización y sin datos son estados diferentes en todo el portal.</p>
        </div>
      </div>
    </div>
  );
}
