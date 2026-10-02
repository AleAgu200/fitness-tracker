"use client";

import { useEffect, useState } from "react";

import { api } from "../../lib";
import { usePortalUser } from "../../portal-context";
import { ACTION_LABEL } from "../activity-labels";
import {
  AdminHeader,
  buttonDanger,
  buttonGhost,
  buttonPrimary,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  formatDate,
  formatDateTime,
  inputClass,
  Notice,
  Pager,
  Pill,
  relativeTime,
  ROLE_LABEL,
  SegmentedFilter,
  SUBSCRIPTION_LABEL,
  subscriptionTone,
  useAdminData,
  useDebounced,
} from "../ui";

interface UserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  professionalStatus: string | null;
  suspendedAt: number | null;
  superAdmin: boolean;
  createdAt: number;
  lastSeenAt: number | null;
  subscriptionStatus: string | null;
}

interface UserDetail extends Omit<UserRow, "subscriptionStatus"> {
  image: string | null;
  signInMethods: string[];
  activeSessions: number;
  organizations: { organizationId: string; organizationName: string; orgRole: string; status: string }[];
  activeAthletes: number;
  subscription: { status: string; productId: string | null; store: string | null; isSandbox: boolean; currentPeriodEndsAt: number | null; willRenew: boolean } | null;
  history: { action: string; occurredAt: number; metadata: Record<string, unknown> | null }[];
}

type StatusFilter = "all" | "suspended" | "pending" | "unverified";
type RoleFilter = "all" | "athlete" | "coach" | "nutritionist";

const METHOD_LABEL: Record<string, string> = { credential: "Email y contraseña", google: "Google", apple: "Apple" };

function StatusPills({ row }: { row: Pick<UserRow, "suspendedAt" | "superAdmin" | "professionalStatus" | "emailVerified" | "role"> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {row.superAdmin && <Pill tone="info">SUPER ADMIN</Pill>}
      {row.suspendedAt && <Pill tone="danger">SUSPENDIDA</Pill>}
      {row.professionalStatus === "pending" && <Pill tone="warn">EN REVISIÓN</Pill>}
      {row.professionalStatus === "rejected" && <Pill tone="danger">RECHAZADO</Pill>}
      {!row.emailVerified && <Pill>SIN VERIFICAR</Pill>}
    </span>
  );
}

type PendingAction = { kind: "suspend" } | { kind: "reactivate" } | { kind: "role"; role: string };

function UserDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (message: string) => void }) {
  const { user: me } = usePortalUser();
  const { data, error, reload } = useAdminData<UserDetail>(`/api/admin/users/${id}`);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleChoice, setRoleChoice] = useState<string>("");

  useEffect(() => { if (data) setRoleChoice(data.role); }, [data]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function apply(reason: string) {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    const body = pending.kind === "role" ? { action: "set_role", role: pending.role }
      : pending.kind === "suspend" ? { action: "suspend", reason } : { action: "reactivate" };
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setPending(null);
      onChanged(pending.kind === "suspend" ? "Cuenta suspendida y sesiones cerradas"
        : pending.kind === "reactivate" ? "Cuenta reactivada" : "Rol actualizado");
      await reload();
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo aplicar el cambio. Intentá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const locked = data ? data.superAdmin || data.id === me.id : true;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/60" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Detalle de la cuenta" className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-ink">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-ink px-5 py-4">
          <span className="font-mono-app text-[10px] tracking-[1.6px] text-neon">CUENTA</span>
          <button type="button" onClick={onClose} className="cursor-pointer font-mono-app text-[11px] text-fg-sec hover:text-fg">CERRAR ✕</button>
        </div>
        <div className="space-y-6 px-5 py-5">
          {error && <ErrorBanner message={error} onRetry={reload} />}
          {!data && !error && <div className="font-mono-app text-xs text-fg-ter">CARGANDO…</div>}
          {data && (
            <>
              <div>
                <div className="text-xl font-semibold text-fg">{data.name}</div>
                <div className="font-mono-app text-xs text-fg-sec">{data.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill tone="muted">{(ROLE_LABEL[data.role] ?? data.role).toUpperCase()}</Pill>
                  <StatusPills row={data} />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">ALTA</dt><dd className="text-fg">{formatDate(data.createdAt)}</dd></div>
                <div><dt className="font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">ÚLTIMA ACTIVIDAD</dt><dd className="text-fg">{relativeTime(data.lastSeenAt)}</dd></div>
                <div><dt className="font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">ACCESO CON</dt><dd className="text-fg">{data.signInMethods.map(m => METHOD_LABEL[m] ?? m).join(", ") || "Enlace por correo"}</dd></div>
                <div><dt className="font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">SESIONES ABIERTAS</dt><dd className="text-fg tabular-nums">{data.activeSessions}</dd></div>
                {data.role !== "athlete" && (
                  <div><dt className="font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">ATLETAS A CARGO</dt><dd className="text-fg tabular-nums">{data.activeAthletes}</dd></div>
                )}
              </dl>

              <section>
                <h3 className="mb-2 font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">PULSO PLUS</h3>
                {data.subscription ? (
                  <div className="border border-line px-3.5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Pill tone={subscriptionTone(data.subscription.status)}>{(SUBSCRIPTION_LABEL[data.subscription.status] ?? data.subscription.status).toUpperCase()}</Pill>
                      {data.subscription.isSandbox && <Pill>SANDBOX</Pill>}
                    </div>
                    <div className="mt-2 text-fg-sec">
                      {data.subscription.productId ?? "—"} · {data.subscription.store ?? "—"}
                      <br />
                      {data.subscription.willRenew ? "Renueva" : "Acceso hasta"} el {formatDate(data.subscription.currentPeriodEndsAt)}
                    </div>
                  </div>
                ) : <p className="text-sm text-fg-ter">Sin suscripción.</p>}
              </section>

              {data.organizations.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">ORGANIZACIONES</h3>
                  <ul className="divide-y divide-line-soft border border-line text-sm">
                    {data.organizations.map(org => (
                      <li key={org.organizationId} className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-fg">{org.organizationName}</span>
                        <span className="font-mono-app text-[10px] text-fg-sec">{org.orgRole} · {org.status}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">ACCIONES</h3>
                {locked ? (
                  <p className="text-sm text-fg-ter">{data.id === me.id ? "Es tu cuenta: no podés suspenderte ni cambiar tu rol desde aquí." : "Los super admins se gestionan desde el servidor."}</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-40 flex-1">
                        <span className="mb-1.5 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">ROL</span>
                        <select value={roleChoice} onChange={event => setRoleChoice(event.target.value)} className={inputClass}>
                          {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <button type="button" disabled={roleChoice === data.role} onClick={() => { setActionError(null); setPending({ kind: "role", role: roleChoice }); }} className={buttonPrimary}>
                        CAMBIAR ROL
                      </button>
                    </div>
                    {data.suspendedAt ? (
                      <button type="button" onClick={() => { setActionError(null); setPending({ kind: "reactivate" }); }} className={buttonGhost}>REACTIVAR CUENTA</button>
                    ) : (
                      <button type="button" onClick={() => { setActionError(null); setPending({ kind: "suspend" }); }} className={buttonDanger}>SUSPENDER CUENTA</button>
                    )}
                    {data.suspendedAt && <p className="text-xs text-fg-sec">Suspendida el {formatDateTime(data.suspendedAt)}.</p>}
                  </div>
                )}
              </section>

              {data.history.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">HISTORIAL ADMINISTRATIVO</h3>
                  <ul className="space-y-1.5 text-sm">
                    {data.history.map((event, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="text-fg">
                          {ACTION_LABEL[event.action] ?? event.action}
                          {typeof event.metadata?.to === "string" && ` → ${ROLE_LABEL[event.metadata.to] ?? event.metadata.to}`}
                          {typeof event.metadata?.reason === "string" && <span className="block text-xs text-fg-sec">“{event.metadata.reason}”</span>}
                        </span>
                        <span className="shrink-0 font-mono-app text-[10px] text-fg-ter">{formatDateTime(event.occurredAt)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </aside>

      {pending && data && (
        <ConfirmDialog
          title={pending.kind === "suspend" ? `Suspender a ${data.name}` : pending.kind === "reactivate" ? `Reactivar a ${data.name}` : `Cambiar rol a ${ROLE_LABEL[pending.role]}`}
          body={pending.kind === "suspend"
            ? "Se cierran todas sus sesiones y no podrá ingresar en la app ni en el portal. Sus datos se conservan y le avisamos por correo."
            : pending.kind === "reactivate"
              ? "Podrá volver a ingresar con sus métodos de acceso habituales."
              : pending.role === "athlete"
                ? "Pierde el acceso al portal y sus membresías profesionales se revocan. Sus atletas dejan de verlo como profesional."
                : "Obtiene acceso al portal como profesional aprobado, con su propio espacio de trabajo."}
          confirmLabel={pending.kind === "suspend" ? "SUSPENDER" : pending.kind === "reactivate" ? "REACTIVAR" : "CAMBIAR ROL"}
          danger={pending.kind === "suspend" || (pending.kind === "role" && pending.role === "athlete")}
          reason={pending.kind === "suspend" ? { label: "MOTIVO (QUEDA EN EL HISTORIAL)", placeholder: "Ej.: reporte de abuso en mensajes" } : undefined}
          busy={busy}
          error={actionError}
          onConfirm={reason => void apply(reason)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useDebounced(q);

  // Deep links from the overview (?status=suspended). Read once, client-side.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("status");
    if (initial === "suspended" || initial === "pending" || initial === "unverified") setStatus(initial);
  }, []);
  useEffect(() => { setPage(1); }, [query, role, status]);

  const params = new URLSearchParams({ q: query, role, status, page: String(page) });
  const { data, error, loading, reload } = useAdminData<{ users: UserRow[]; total: number; page: number; pageCount: number }>(`/api/admin/users?${params}`);

  return (
    <div>
      <AdminHeader eyebrow="USUARIOS" title="Cuentas" description="Buscá por nombre o correo. Abrí una cuenta para ver su acceso, suscripción y organizaciones, o para suspenderla o cambiar su rol." />
      <div className="space-y-4 px-5 py-6 md:px-8">
        <div className="flex flex-wrap gap-3">
          <input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Nombre o correo…" aria-label="Buscar cuentas" className={`${inputClass} max-w-sm`} />
          <SegmentedFilter label="Rol" value={role} onChange={setRole} options={[
            { value: "all", label: "TODOS" },
            { value: "athlete", label: "ATLETAS" },
            { value: "coach", label: "ENTRENADORES" },
            { value: "nutritionist", label: "NUTRICIONISTAS" },
          ]} />
          <SegmentedFilter label="Estado" value={status} onChange={setStatus} options={[
            { value: "all", label: "CUALQUIER ESTADO" },
            { value: "suspended", label: "SUSPENDIDAS" },
            { value: "pending", label: "EN REVISIÓN" },
            { value: "unverified", label: "SIN VERIFICAR" },
          ]} />
        </div>

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && <div className="font-mono-app text-[10px] text-fg-ter">{data.total} {data.total === 1 ? "CUENTA" : "CUENTAS"}{loading ? " · ACTUALIZANDO…" : ""}</div>}

        {data && data.users.length === 0 ? (
          <EmptyState title="Ninguna cuenta coincide" body="Probá con otro nombre, correo o filtro." />
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">
                <tr>
                  <th className="px-4 py-2.5 font-normal">CUENTA</th>
                  <th className="px-4 py-2.5 font-normal">ROL</th>
                  <th className="px-4 py-2.5 font-normal">ESTADO</th>
                  <th className="px-4 py-2.5 font-normal">PLUS</th>
                  <th className="px-4 py-2.5 font-normal">ÚLTIMA ACTIVIDAD</th>
                  <th className="px-4 py-2.5 font-normal">ALTA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.users.map(row => (
                  <tr key={row.id} className="cursor-pointer transition hover:bg-card" onClick={() => setSelected(row.id)}>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={event => { event.stopPropagation(); setSelected(row.id); }} className="cursor-pointer text-left">
                        <span className="block text-fg">{row.name}</span>
                        <span className="block font-mono-app text-[10.5px] text-fg-sec">{row.email}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-fg-mid">{ROLE_LABEL[row.role] ?? row.role}</td>
                    <td className="px-4 py-2.5"><StatusPills row={row} /></td>
                    <td className="px-4 py-2.5">
                      {row.subscriptionStatus ? <Pill tone={subscriptionTone(row.subscriptionStatus)}>{(SUBSCRIPTION_LABEL[row.subscriptionStatus] ?? row.subscriptionStatus).toUpperCase()}</Pill> : <span className="text-fg-ter">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-fg-sec">{relativeTime(row.lastSeenAt)}</td>
                    <td className="px-4 py-2.5 text-fg-sec">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} />}
      </div>

      {selected && <UserDrawer id={selected} onClose={() => setSelected(null)} onChanged={message => { setNotice(message); void reload(); }} />}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
