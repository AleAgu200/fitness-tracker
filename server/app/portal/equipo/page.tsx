"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, api } from "../lib";

type Discipline = "coach" | "nutritionist";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  orgRole: "owner" | "admin" | "professional";
  status: "invited" | "active" | "revoked";
  disciplines: Discipline[];
  load: { discipline: Discipline; athletes: number }[];
}

interface RosterEntry {
  organizationClientId: string;
  athleteId: string;
  athleteName: string;
  athleteEmail: string;
  team: { assignmentId: string; membershipId: string; discipline: Discipline; primary: boolean; professionalName: string }[];
}

interface Gap { athleteId: string; athleteName: string; discipline: Discipline; reason: string }

interface Organization {
  organizationId: string;
  organizationName: string;
  orgRole: "owner" | "admin";
  members: Member[];
  roster: RosterEntry[];
  gaps: Gap[];
}

const ERROR_COPY: Record<string, string> = {
  last_owner: "No podés desactivar al último propietario: la organización quedaría sin administración.",
  discipline_has_active_assignments: "Esa disciplina tiene atletas asignados. Reasignalos antes de quitarla.",
  professional_must_register_first: "Esa persona todavía no tiene cuenta profesional en PULSO.",
  organization_manage_denied: "No tenés permisos para administrar este equipo.",
  professional_capability_missing: "Ese profesional no tiene esa disciplina habilitada.",
};

const DISCIPLINE_LABEL: Record<Discipline, string> = { coach: "ENTRENAMIENTO", nutritionist: "NUTRICIÓN" };

const GHOST = "cursor-pointer border border-line px-3 py-2 font-mono-app text-[10px] text-fg-sec hover:border-neon hover:text-neon disabled:opacity-40";
const FIELD = "border border-line bg-elev px-3 py-2 text-sm text-fg focus:border-neon focus:outline-none";

export default function TeamPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisciplines, setInviteDisciplines] = useState<Discipline[]>(["coach"]);

  const load = useCallback(async () => {
    try {
      const result = await api<{ organizations: Organization[] }>("/api/portal/team");
      setOrganizations(result.organizations);
    } catch {
      setOrganizations([]);
      setNotice("No se pudo cargar el equipo.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (error) {
      const code = error instanceof ApiError ? String(error.body?.error ?? "") : "";
      setNotice(ERROR_COPY[code] ?? "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  if (organizations === null) {
    return <div className="grid min-h-full place-items-center font-mono-app text-xs text-fg-ter">CARGANDO EQUIPO…</div>;
  }

  if (!organizations.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-fg">Equipo</h1>
        <div className="mt-5 border border-line bg-card p-8 text-center text-sm text-fg-sec">
          Solo los propietarios y administradores de una organización pueden gestionar el equipo.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-fg">Equipo</h1>
      <p className="mt-1 font-mono-app text-[9px] text-fg-ter">
        DESACTIVAR O TRANSFERIR NUNCA BORRA PLANES, NOTAS NI AUDITORÍA
      </p>

      {notice && <div className="mt-4 border border-line bg-elev px-4 py-2 font-mono-app text-[10px] text-fg-sec">{notice}</div>}

      {organizations.map(organization => (
        <section key={organization.organizationId} className="mt-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-fg">{organization.organizationName}</h2>
            <span className="font-mono-app text-[9px] text-fg-ter">{organization.orgRole.toUpperCase()}</span>
          </div>

          {organization.gaps.length > 0 && (
            <div className="border border-warn/50 bg-warn/10 p-4">
              <div className="font-mono-app text-[10px] tracking-[1px] text-warn">SIN RESPONSABLE PRINCIPAL</div>
              <ul className="mt-2 flex flex-col gap-1">
                {organization.gaps.map(gap => (
                  <li key={`${gap.athleteId}:${gap.discipline}`} className="text-sm text-fg-mid">
                    {gap.athleteName} · {DISCIPLINE_LABEL[gap.discipline]} — asigná un principal para que alguien reciba sus señales.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-line bg-card">
            <div className="border-b border-line p-3 font-semibold text-fg">Profesionales</div>
            {organization.members.map(member => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 border-b border-line p-3 last:border-0">
                <div className="min-w-50 flex-1">
                  <div className="text-sm text-fg">
                    {member.name}
                    {member.status === "revoked" && <span className="ml-2 font-mono-app text-[9px] text-fg-ter">DESACTIVADO</span>}
                  </div>
                  <div className="font-mono-app text-[9px] text-fg-ter">{member.email} · {member.orgRole.toUpperCase()}</div>
                </div>

                <div className="flex gap-1">
                  {(["coach", "nutritionist"] as Discipline[]).map(discipline => {
                    const has = member.disciplines.includes(discipline);
                    const load = member.load.find(entry => entry.discipline === discipline)?.athletes ?? 0;
                    return (
                      <button
                        key={discipline}
                        type="button"
                        disabled={busy || member.status === "revoked"}
                        onClick={() => {
                          const next = has
                            ? member.disciplines.filter(item => item !== discipline)
                            : [...member.disciplines, discipline];
                          if (!next.length) {
                            setNotice("Un profesional necesita al menos una disciplina.");
                            return;
                          }
                          run(
                            () => api(`/api/organizations/${encodeURIComponent(organization.organizationId)}/members/${encodeURIComponent(member.id)}`, {
                              method: "PATCH",
                              body: JSON.stringify({ disciplines: next }),
                            }),
                            "Disciplinas actualizadas.",
                          );
                        }}
                        className={`cursor-pointer border px-2.5 py-1.5 font-mono-app text-[9px] disabled:opacity-40 ${
                          has ? "border-neon text-neon" : "border-line text-fg-ter hover:text-fg"
                        }`}
                      >
                        {DISCIPLINE_LABEL[discipline]}{has && load > 0 ? ` · ${load}` : ""}
                      </button>
                    );
                  })}
                </div>

                {member.status !== "revoked" && (
                  <button
                    type="button"
                    disabled={busy}
                    className="cursor-pointer border border-line px-3 py-2 font-mono-app text-[10px] text-fg-ter hover:border-danger hover:text-danger disabled:opacity-40"
                    onClick={() => {
                      if (!window.confirm(`¿Desactivar a ${member.name}? Sus atletas quedan liberados para reasignar; su historial se conserva.`)) return;
                      run(
                        () => api(`/api/organizations/${encodeURIComponent(organization.organizationId)}/members/${encodeURIComponent(member.id)}`, { method: "DELETE" }),
                        "Profesional desactivado. Revisá los atletas sin responsable.",
                      );
                    }}
                  >
                    DESACTIVAR
                  </button>
                )}
              </div>
            ))}

            <form
              className="flex flex-wrap items-center gap-2 border-t border-line p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!inviteEmail.trim()) return;
                run(
                  () => api(`/api/organizations/${encodeURIComponent(organization.organizationId)}/members`, {
                    method: "POST",
                    body: JSON.stringify({ email: inviteEmail.trim(), disciplines: inviteDisciplines }),
                  }),
                  "Profesional añadido al equipo.",
                ).then(() => setInviteEmail(""));
              }}
            >
              <input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} type="email"
                placeholder="email@profesional.com" className={`${FIELD} min-w-60 flex-1`} />
              {(["coach", "nutritionist"] as Discipline[]).map(discipline => (
                <button key={discipline} type="button"
                  onClick={() => setInviteDisciplines(current => current.includes(discipline)
                    ? (current.length > 1 ? current.filter(item => item !== discipline) : current)
                    : [...current, discipline])}
                  className={`cursor-pointer border px-2.5 py-2 font-mono-app text-[9px] ${
                    inviteDisciplines.includes(discipline) ? "border-neon text-neon" : "border-line text-fg-ter"
                  }`}>
                  {DISCIPLINE_LABEL[discipline]}
                </button>
              ))}
              <button disabled={busy} className="cursor-pointer bg-neon px-4 py-2 font-mono-app text-[10px] font-bold text-ink disabled:opacity-40">
                AÑADIR
              </button>
            </form>
          </div>

          <div className="border border-line bg-card">
            <div className="border-b border-line p-3 font-semibold text-fg">Atletas y cobertura</div>
            {organization.roster.length ? organization.roster.map(entry => (
              <div key={entry.organizationClientId} className="border-b border-line p-3 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">{entry.athleteName}</div>
                    <div className="font-mono-app text-[9px] text-fg-ter">{entry.athleteEmail}</div>
                  </div>
                  <AssignControl
                    organization={organization}
                    athleteId={entry.athleteId}
                    busy={busy}
                    onAssign={(membershipId, discipline, primary) => run(
                      () => api("/api/care-assignments", {
                        method: "POST",
                        body: JSON.stringify({
                          organizationId: organization.organizationId,
                          athleteId: entry.athleteId,
                          professionalMembershipId: membershipId,
                          discipline,
                          primary,
                        }),
                      }),
                      "Asignación actualizada.",
                    )}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.team.length ? entry.team.map(assignment => (
                    <span key={assignment.assignmentId}
                      className={`flex items-center gap-2 border px-2.5 py-1.5 font-mono-app text-[9px] ${
                        assignment.primary ? "border-neon text-neon" : "border-line text-fg-sec"
                      }`}>
                      {assignment.professionalName} · {DISCIPLINE_LABEL[assignment.discipline]}
                      {assignment.primary ? " · PRINCIPAL" : " · COLAB."}
                      <button type="button" disabled={busy} title="Quitar del atleta"
                        className="cursor-pointer text-fg-ter hover:text-danger disabled:opacity-40"
                        onClick={() => run(
                          () => api("/api/care-assignments", {
                            method: "DELETE",
                            body: JSON.stringify({ organizationId: organization.organizationId, assignmentId: assignment.assignmentId }),
                          }),
                          "Profesional quitado del atleta.",
                        )}>
                        ✕
                      </button>
                    </span>
                  )) : <span className="font-mono-app text-[9px] text-fg-ter">SIN EQUIPO ASIGNADO</span>}
                </div>
              </div>
            )) : <div className="p-8 text-center text-sm text-fg-ter">Todavía no hay atletas en esta organización.</div>}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssignControl({
  organization,
  busy,
  onAssign,
}: {
  organization: Organization;
  athleteId: string;
  busy: boolean;
  onAssign: (membershipId: string, discipline: Discipline, primary: boolean) => void;
}) {
  const [membershipId, setMembershipId] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("coach");
  const [primary, setPrimary] = useState(true);

  const eligible = organization.members.filter(
    member => member.status === "active" && member.disciplines.includes(discipline),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={discipline} onChange={event => setDiscipline(event.target.value as Discipline)} className={FIELD}>
        <option value="coach">Entrenamiento</option>
        <option value="nutritionist">Nutrición</option>
      </select>
      <select value={membershipId} onChange={event => setMembershipId(event.target.value)} className={`${FIELD} min-w-44`}>
        <option value="">Elegir profesional…</option>
        {eligible.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <label className="flex items-center gap-1.5 font-mono-app text-[9px] text-fg-ter">
        <input type="checkbox" checked={primary} onChange={event => setPrimary(event.target.checked)} />
        PRINCIPAL
      </label>
      <button type="button" disabled={busy || !membershipId} className={GHOST}
        onClick={() => onAssign(membershipId, discipline, primary)}>
        ASIGNAR
      </button>
    </div>
  );
}
