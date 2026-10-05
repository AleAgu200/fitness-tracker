"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "../../lib";
import {
  AdminHeader,
  buttonDanger,
  buttonGhost,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  formatDateTime,
  Notice,
  Pill,
  ROLE_LABEL,
  SegmentedFilter,
  useAdminData,
} from "../ui";

interface Report {
  id: string;
  reason: "harassment" | "inappropriate" | "spam" | "unsafe_advice" | "other";
  detail: string | null;
  evidence: { messages?: { from: "reporter" | "reported"; content: string; sentAt: number }[] } | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: number;
  resolvedAt: number | null;
  resolutionNote: string | null;
  reporter: { id: string; name: string; email: string };
  reported: { id: string; name: string; email: string; role: string; suspendedAt: string | null };
}

type Filter = "open" | "resolved" | "dismissed" | "all";

const REASON: Record<Report["reason"], string> = {
  harassment: "ACOSO O AMENAZAS",
  inappropriate: "CONTENIDO INAPROPIADO",
  spam: "SPAM O ESTAFA",
  unsafe_advice: "CONSEJOS PELIGROSOS",
  other: "OTRO",
};

const STATUS: Record<Report["status"], { label: string; tone: "warn" | "ok" | "muted" }> = {
  open: { label: "ABIERTO", tone: "warn" },
  resolved: { label: "RESUELTO", tone: "ok" },
  dismissed: { label: "DESCARTADO", tone: "muted" },
};

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<Filter>("open");
  const { data, error, reload } = useAdminData<{ reports: Report[] }>(`/api/admin/reports?status=${filter}`);
  const [decision, setDecision] = useState<{ report: Report; kind: "resolved" | "dismissed" } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(note: string) {
    if (!decision) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/admin/reports/${decision.report.id}`, {
        method: "POST",
        body: JSON.stringify({ decision: decision.kind, note }),
      });
      setNotice(decision.kind === "resolved" ? "Reporte marcado como resuelto." : "Reporte descartado.");
      setDecision(null);
      await reload();
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo guardar. Intentá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const list = data?.reports ?? [];

  return (
    <div>
      <AdminHeader
        eyebrow="REPORTES"
        title="Reportes de usuarios"
        description="Lo que los atletas reportan desde la app, con los últimos mensajes de la conversación al momento del reporte. Si corresponde, suspendé la cuenta desde Usuarios y después cerrá el reporte."
      />
      <div className="space-y-4 px-5 py-6 md:px-8">
        <SegmentedFilter label="Estado" value={filter} onChange={setFilter} options={[
          { value: "open", label: "ABIERTOS" },
          { value: "resolved", label: "RESUELTOS" },
          { value: "dismissed", label: "DESCARTADOS" },
          { value: "all", label: "TODOS" },
        ]} />

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && list.length === 0 && (
          <EmptyState
            title={filter === "open" ? "No hay reportes abiertos" : "Sin resultados"}
            body={filter === "open" ? "Cuando alguien reporte a otro usuario desde la app aparecerá aquí." : undefined}
          />
        )}

        <ul className="space-y-2">
          {list.map(report => {
            const messages = report.evidence?.messages ?? [];
            const open = expanded === report.id;
            return (
              <li key={report.id} className="border border-line bg-card px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="danger">{REASON[report.reason]}</Pill>
                      <Pill tone={STATUS[report.status].tone}>{STATUS[report.status].label}</Pill>
                      {report.reported.suspendedAt && <Pill>CUENTA SUSPENDIDA</Pill>}
                    </div>
                    <div className="mt-2 text-sm text-fg">
                      <span className="font-semibold">{report.reported.name}</span>
                      <span className="text-fg-sec"> · {ROLE_LABEL[report.reported.role] ?? report.reported.role} · {report.reported.email}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-fg-sec">
                      Reportado por {report.reporter.name} ({report.reporter.email}) · {formatDateTime(report.createdAt)}
                    </div>
                    {report.detail && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-fg-mid">“{report.detail}”</p>}
                    {report.resolutionNote && <p className="mt-2 text-xs text-fg-sec">Nota: {report.resolutionNote}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/portal/admin/usuarios?q=${encodeURIComponent(report.reported.email)}`} className={buttonGhost}>VER CUENTA</Link>
                    {report.status === "open" && (
                      <>
                        <button type="button" onClick={() => { setActionError(null); setDecision({ report, kind: "resolved" }); }} className={buttonDanger}>RESOLVER</button>
                        <button type="button" onClick={() => { setActionError(null); setDecision({ report, kind: "dismissed" }); }} className={buttonGhost}>DESCARTAR</button>
                      </>
                    )}
                  </div>
                </div>

                {messages.length > 0 && (
                  <div className="mt-3">
                    <button type="button" onClick={() => setExpanded(open ? null : report.id)} className="font-mono-app text-[10px] tracking-[1px] text-neon hover:underline">
                      {open ? "OCULTAR MENSAJES" : `VER ${messages.length} MENSAJES`}
                    </button>
                    {open && (
                      <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
                        {messages.map((message, index) => (
                          <li key={index} className="text-sm">
                            <span className={`font-mono-app text-[10px] ${message.from === "reported" ? "text-danger" : "text-fg-ter"}`}>
                              {message.from === "reported" ? report.reported.name : report.reporter.name} · {formatDateTime(message.sentAt)}
                            </span>
                            <div className="whitespace-pre-wrap text-fg-mid">{message.content}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {decision && (
        <ConfirmDialog
          title={decision.kind === "resolved" ? "Marcar como resuelto" : "Descartar reporte"}
          body={decision.kind === "resolved"
            ? "Usalo cuando ya actuaste: suspendiste la cuenta, hablaste con el profesional o el atleta salió del equipo."
            : "Usalo cuando el reporte no muestra una infracción."}
          confirmLabel={decision.kind === "resolved" ? "RESOLVER" : "DESCARTAR"}
          danger={decision.kind === "resolved"}
          reason={{ label: "NOTA INTERNA (OPCIONAL)", placeholder: "Ej.: cuenta suspendida por mensajes ofensivos." }}
          busy={busy}
          error={actionError}
          onConfirm={note => void decide(note)}
          onCancel={() => setDecision(null)}
        />
      )}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
