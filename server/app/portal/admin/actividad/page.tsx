"use client";

import { ACTION_LABEL } from "../activity-labels";
import { AdminHeader, EmptyState, ErrorBanner, formatDateTime, ROLE_LABEL, useAdminData } from "../ui";

interface ActivityEvent {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
  occurredAt: number;
  actorName: string | null;
}

function detail(event: ActivityEvent): string | null {
  const m = event.metadata ?? {};
  if (typeof m.name === "string") return m.name;
  if (typeof m.from === "string" && typeof m.to === "string") return `${ROLE_LABEL[m.from] ?? m.from} → ${ROLE_LABEL[m.to] ?? m.to}`;
  if (typeof m.reason === "string") return `“${m.reason}”`;
  return null;
}

export default function AdminActivityPage() {
  const { data, error, reload } = useAdminData<{ events: ActivityEvent[] }>("/api/admin/activity?limit=200");
  return (
    <div>
      <AdminHeader eyebrow="ACTIVIDAD" title="Registro de acciones" description="Todo cambio hecho desde este panel queda registrado con quién lo hizo y cuándo." />
      <div className="space-y-4 px-5 py-6 md:px-8">
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && data.events.length === 0 && <EmptyState title="Todavía no hay acciones registradas" />}
        {data && data.events.length > 0 && (
          <ol className="divide-y divide-line-soft border border-line">
            {data.events.map(event => (
              <li key={event.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[180px_1fr_auto] md:items-center md:gap-4">
                <span className="font-mono-app text-[10.5px] text-fg-ter">{formatDateTime(event.occurredAt)}</span>
                <span className="text-fg">
                  {ACTION_LABEL[event.action] ?? event.action}
                  {detail(event) && <span className="text-fg-sec"> · {detail(event)}</span>}
                </span>
                <span className="font-mono-app text-[10.5px] text-fg-sec">{event.actorName ?? "Cuenta eliminada"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
