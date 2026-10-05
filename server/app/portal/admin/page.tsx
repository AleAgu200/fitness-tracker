"use client";

import Link from "next/link";

import { ACTION_LABEL } from "./activity-labels";
import { AdminHeader, ErrorBanner, relativeTime, Stat, useAdminData } from "./ui";

interface Overview {
  users: { total: number; athletes: number; coaches: number; nutritionists: number; newLast7Days: number; newLast30Days: number; suspended: number };
  professionalsPending: number;
  reportsOpen: number;
  subscriptions: { entitled: number; active: number; inGracePeriod: number; billingIssue: number; cancelled: number; expired: number; sandbox: number };
}

interface ActivityEvent { id: string; action: string; subjectType: string; occurredAt: number; actorName: string | null; metadata: Record<string, unknown> | null }

export default function AdminOverviewPage() {
  const overview = useAdminData<Overview>("/api/admin/overview");
  const activity = useAdminData<{ events: ActivityEvent[] }>("/api/admin/activity?limit=8");
  const o = overview.data;

  return (
    <div>
      <AdminHeader
        eyebrow="RESUMEN"
        title="Estado de PULSO"
        description="Cuentas, profesionales y suscripciones. El panel no muestra datos de salud: entrenamientos, comidas y peso quedan entre cada atleta y sus profesionales."
      />
      <div className="space-y-8 px-5 py-6 md:px-8">
        {overview.error && <ErrorBanner message={overview.error} onRetry={overview.reload} />}

        {o && o.reportsOpen > 0 && (
          <Link href="/portal/admin/reportes" className="flex items-center justify-between gap-4 border border-danger/50 bg-danger/10 px-4 py-3.5 transition hover:bg-danger/15">
            <span>
              <span className="block font-mono-app text-[10px] tracking-[1.4px] text-danger">REPORTES ABIERTOS</span>
              <span className="text-sm text-fg">
                {o.reportsOpen === 1 ? "1 reporte de usuario espera revisión" : `${o.reportsOpen} reportes de usuarios esperan revisión`}
              </span>
            </span>
            <span className="font-mono-app text-[11px] text-danger">REVISAR →</span>
          </Link>
        )}

        {o && o.professionalsPending > 0 && (
          <Link href="/portal/admin/profesionales" className="flex items-center justify-between gap-4 border border-warn/50 bg-warn/10 px-4 py-3.5 transition hover:bg-warn/15">
            <span>
              <span className="block font-mono-app text-[10px] tracking-[1.4px] text-warn">REQUIERE TU REVISIÓN</span>
              <span className="text-sm text-fg">
                {o.professionalsPending === 1 ? "1 profesional espera aprobación" : `${o.professionalsPending} profesionales esperan aprobación`}
              </span>
            </span>
            <span className="font-mono-app text-[11px] text-warn">REVISAR →</span>
          </Link>
        )}

        <section aria-labelledby="users-heading">
          <h2 id="users-heading" className="mb-3 font-mono-app text-[11px] tracking-[1.6px] text-fg-sec">CUENTAS</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="TOTAL" value={o?.users.total ?? "—"} hint={o ? `+${o.users.newLast7Days} en 7 días · +${o.users.newLast30Days} en 30` : undefined} />
            <Stat label="ATLETAS" value={o?.users.athletes ?? "—"} />
            <Stat label="ENTRENADORES" value={o?.users.coaches ?? "—"} />
            <Stat label="NUTRICIONISTAS" value={o?.users.nutritionists ?? "—"} />
          </div>
          {o && o.users.suspended > 0 && (
            <p className="mt-2 text-xs text-fg-sec">
              {o.users.suspended} {o.users.suspended === 1 ? "cuenta suspendida" : "cuentas suspendidas"} ·{" "}
              <Link href="/portal/admin/usuarios?status=suspended" className="text-neon hover:underline">ver</Link>
            </p>
          )}
        </section>

        <section aria-labelledby="subs-heading">
          <h2 id="subs-heading" className="mb-3 font-mono-app text-[11px] tracking-[1.6px] text-fg-sec">PULSO PLUS</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="CON ACCESO" value={o?.subscriptions.entitled ?? "—"} tone="ok" hint="Activas, en gracia o con problema de cobro" />
            <Stat label="PROBLEMA DE COBRO" value={o ? o.subscriptions.billingIssue + o.subscriptions.inGracePeriod : "—"} tone={o && o.subscriptions.billingIssue + o.subscriptions.inGracePeriod > 0 ? "warn" : undefined} />
            <Stat label="NO RENOVARÁN" value={o?.subscriptions.cancelled ?? "—"} hint="Acceso hasta fin de período" />
            <Stat label="VENCIDAS" value={o?.subscriptions.expired ?? "—"} />
          </div>
          {o && o.subscriptions.sandbox > 0 && <p className="mt-2 text-xs text-fg-ter">{o.subscriptions.sandbox} de prueba (sandbox) excluidas.</p>}
        </section>

        <section aria-labelledby="activity-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="activity-heading" className="font-mono-app text-[11px] tracking-[1.6px] text-fg-sec">ÚLTIMAS ACCIONES DEL EQUIPO</h2>
            <Link href="/portal/admin/actividad" className="font-mono-app text-[10px] text-neon hover:underline">VER TODO</Link>
          </div>
          {activity.error && <ErrorBanner message={activity.error} onRetry={activity.reload} />}
          {activity.data && activity.data.events.length === 0 && <p className="text-sm text-fg-ter">Todavía no hay acciones registradas.</p>}
          <ul className="divide-y divide-line-soft border border-line">
            {activity.data?.events.map(event => (
              <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-fg">
                  {ACTION_LABEL[event.action] ?? event.action}
                  {typeof event.metadata?.name === "string" && <span className="text-fg-sec"> · {event.metadata.name}</span>}
                </span>
                <span className="shrink-0 font-mono-app text-[10px] text-fg-ter">{event.actorName ?? "—"} · {relativeTime(event.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
