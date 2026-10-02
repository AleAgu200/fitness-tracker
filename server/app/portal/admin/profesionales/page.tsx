"use client";

import { useState } from "react";

import { api } from "../../lib";
import {
  AdminHeader,
  buttonDanger,
  buttonPrimary,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  formatDate,
  Notice,
  Pill,
  ROLE_LABEL,
  SegmentedFilter,
  useAdminData,
} from "../ui";

interface Professional {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  professionalStatus: "pending" | "approved" | "rejected";
  createdAt: number;
  organizationName: string | null;
}

type Filter = "pending" | "approved" | "rejected" | "all";

const STATUS: Record<Professional["professionalStatus"], { label: string; tone: "warn" | "ok" | "danger" }> = {
  pending: { label: "EN REVISIÓN", tone: "warn" },
  approved: { label: "APROBADO", tone: "ok" },
  rejected: { label: "RECHAZADO", tone: "danger" },
};

export default function AdminProfessionalsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const { data, error, reload } = useAdminData<{ professionals: Professional[] }>(`/api/admin/professionals?status=${filter}`);
  const [decision, setDecision] = useState<{ professional: Professional; kind: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(reason: string) {
    if (!decision) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/admin/professionals/${decision.professional.id}`, {
        method: "POST",
        body: JSON.stringify({ decision: decision.kind, reason }),
      });
      setNotice(decision.kind === "approve"
        ? `${decision.professional.name} ya puede usar el portal. Le avisamos por correo.`
        : `Solicitud de ${decision.professional.name} rechazada. Le enviamos el motivo.`);
      setDecision(null);
      await reload();
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo guardar la decisión. Intentá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const list = data?.professionals ?? [];

  return (
    <div>
      <AdminHeader
        eyebrow="PROFESIONALES"
        title="Altas de entrenadores y nutricionistas"
        description="Cada alta profesional espera tu revisión antes de ver atletas. Verificá identidad y credenciales; al aprobar o rechazar, la persona recibe un correo."
      />
      <div className="space-y-4 px-5 py-6 md:px-8">
        <SegmentedFilter label="Estado" value={filter} onChange={setFilter} options={[
          { value: "pending", label: "EN REVISIÓN" },
          { value: "approved", label: "APROBADOS" },
          { value: "rejected", label: "RECHAZADOS" },
          { value: "all", label: "TODOS" },
        ]} />

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && list.length === 0 && (
          <EmptyState
            title={filter === "pending" ? "No hay solicitudes pendientes" : "Sin resultados"}
            body={filter === "pending" ? "Cuando alguien cree una cuenta profesional aparecerá aquí." : undefined}
          />
        )}

        <ul className="space-y-2">
          {list.map(professional => (
            <li key={professional.id} className="flex flex-wrap items-center justify-between gap-4 border border-line bg-card px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{professional.name}</span>
                  <Pill tone={STATUS[professional.professionalStatus].tone}>{STATUS[professional.professionalStatus].label}</Pill>
                  {!professional.emailVerified && <Pill>CORREO SIN VERIFICAR</Pill>}
                </div>
                <div className="mt-0.5 font-mono-app text-[11px] text-fg-sec">{professional.email}</div>
                <div className="mt-1 text-xs text-fg-sec">
                  {ROLE_LABEL[professional.role] ?? professional.role}
                  {professional.organizationName && <> · {professional.organizationName}</>}
                  {" · "}solicitó el {formatDate(professional.createdAt)}
                </div>
              </div>
              <div className="flex gap-2">
                {professional.professionalStatus !== "approved" && (
                  <button type="button" onClick={() => { setActionError(null); setDecision({ professional, kind: "approve" }); }} className={buttonPrimary}>APROBAR</button>
                )}
                {professional.professionalStatus !== "rejected" && (
                  <button type="button" onClick={() => { setActionError(null); setDecision({ professional, kind: "reject" }); }} className={buttonDanger}>
                    {professional.professionalStatus === "approved" ? "REVOCAR" : "RECHAZAR"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {decision && (
        <ConfirmDialog
          title={decision.kind === "approve" ? `Aprobar a ${decision.professional.name}` : `Rechazar a ${decision.professional.name}`}
          body={decision.kind === "approve"
            ? <>Activa su espacio de trabajo y le da acceso al portal como {ROLE_LABEL[decision.professional.role]?.toLowerCase()}.{!decision.professional.emailVerified && <strong className="mt-2 block text-warn">Su correo todavía no está verificado.</strong>}</>
            : decision.professional.professionalStatus === "approved"
              ? "Pierde el acceso al portal y sus atletas dejan de verlo como profesional. Su cuenta sigue funcionando en la app."
              : "No tendrá acceso al portal. Su cuenta sigue funcionando en la app."}
          confirmLabel={decision.kind === "approve" ? "APROBAR" : "RECHAZAR"}
          danger={decision.kind === "reject"}
          reason={decision.kind === "reject" ? { label: "MOTIVO (SE INCLUYE EN EL CORREO)", required: true, placeholder: "Ej.: no pudimos verificar tu certificación. Respondé con una copia." } : undefined}
          busy={busy}
          error={actionError}
          onConfirm={reason => void decide(reason)}
          onCancel={() => setDecision(null)}
        />
      )}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
