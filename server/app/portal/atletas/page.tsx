"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AssignMeals } from "../assign-meals";
import { AssignWorkout } from "../assign-workout";
import { api, Athlete, Msg } from "../lib";
import { usePortalUser } from "../portal-context";

// ── chat panel ───────────────────────────────────────────────────────────────

function Chat({ meId, athlete }: { meId: string; athlete: Athlete }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const lastRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const { messages: incoming } = await api<{ messages: Msg[] }>(
        `/api/messages?with=${encodeURIComponent(athlete.userId)}&since=${lastRef.current}`,
      );
      if (incoming.length) {
        setMessages(m => {
          const seen = new Set(m.map(x => x.id));
          return [...m, ...incoming.filter(x => !seen.has(x.id))];
        });
        lastRef.current = Math.max(lastRef.current, ...incoming.map(m => m.sentAt));
        await api("/api/messages/read", { method: "POST", body: JSON.stringify({ with: athlete.userId }) });
      }
    } catch {
      // retried on next tick
    }
  }, [athlete.userId]);

  useEffect(() => {
    setMessages([]);
    lastRef.current = 0;
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    try {
      const { message } = await api<{ message: Msg }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({ to: athlete.userId, content }),
      });
      setMessages(m => [...m, message]);
      lastRef.current = Math.max(lastRef.current, message.sentAt);
    } catch {
      setDraft(content);
    }
  }

  return (
    <div className="flex h-105 flex-col border border-line bg-card">
      <div className="border-b border-line px-4 py-2.5 font-mono-app text-[10px] tracking-[1.4px] text-fg-ter">
        MENSAJES
      </div>
      <div ref={boxRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-10 text-center font-mono-app text-xs text-fg-ter">
            Sin mensajes todavía — escribí el primero
          </div>
        )}
        {messages.map(m => {
          const mine = m.senderId === meId;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] border px-3 py-2 ${
                mine ? "self-end border-volt bg-volt/10" : "self-start border-line bg-elev"
              }`}
            >
              <div className="text-sm whitespace-pre-wrap text-fg">{m.content}</div>
              <div className="mt-1 text-right font-mono-app text-[9px] text-fg-ter">
                {new Date(m.sentAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Escribí un mensaje…"
          className="flex-1 border border-line bg-elev px-3 py-2.5 text-sm text-fg placeholder:text-fg-ter focus:border-neon focus:outline-none"
        />
        <button type="submit" className="cursor-pointer bg-neon px-5 font-mono-app text-xs font-extrabold text-ink transition hover:brightness-110">
          ENVIAR
        </button>
      </form>
    </div>
  );
}

// ── last-activity helpers ───────────────────────────────────────────────────

const STALE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days with no message either direction

function relTime(ts: number | null): string {
  if (ts == null) return "sin mensajes";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return min === 1 ? "hace 1 min" : `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "hace 1 h" : `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "hace 1 día" : `hace ${day} días`;
}

function isStale(ts: number | null): boolean {
  return ts == null || Date.now() - ts > STALE_MS;
}

// ── dashboard ────────────────────────────────────────────────────────────────

export default function AthletesPage() {
  const { user } = usePortalUser();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Athlete | null>(null);
  const [query, setQuery] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [listError, setListError] = useState(false);
  const [assignDirty, setAssignDirty] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<Athlete | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<{ athletes: Athlete[] }>("/api/links");
      const u = await api<{ bySender: Record<string, number> }>("/api/messages/unread");
      if (!aliveRef.current) return;
      setAthletes(res.athletes ?? []);
      setUnread(u.bySender);
      setListError(false);
    } catch {
      if (aliveRef.current) setListError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function generateCode() {
    setInviteError(null);
    try {
      const { code } = await api<{ code: string }>("/api/links/invite", { method: "POST", body: "{}" });
      setInviteCode(code);
    } catch {
      setInviteCode(null);
      setInviteError("No se pudo generar el código — intentá de nuevo");
    }
  }

  /** Routes athlete selection through an unsaved-changes guard when a plan edit is in progress. */
  function selectAthlete(a: Athlete) {
    if (selected?.linkId === a.linkId) return;
    if (assignDirty && selected) {
      setPendingSelect(a);
      return;
    }
    setSelected(a);
    setAssignDirty(false);
    setPendingSelect(null);
  }

  function confirmDiscardAndSwitch() {
    if (!pendingSelect) return;
    setSelected(pendingSelect);
    setAssignDirty(false);
    setPendingSelect(null);
  }

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const filtered = athletes
    .filter(a => a.name.toLowerCase().includes(query.toLowerCase()) || a.email.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (a.lastMessageAt ?? -Infinity) - (b.lastMessageAt ?? -Infinity));
  const mostRecentLink = athletes.length ? Math.max(...athletes.map(a => a.since)) : null;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-fg">Mis atletas</h1>
      <p className="mb-8 font-mono-app text-[11px] tracking-[1.4px] text-fg-ter">
        DASHBOARD · {user.role === "coach" ? "ENTRENADOR" : "NUTRICIONISTA"}
      </p>

      {listError && (
        <div className="mb-4 flex items-center justify-between border border-warn/40 bg-warn/10 px-4 py-2.5 font-mono-app text-[11px] text-warn">
          <span>No se pudo actualizar la lista de atletas — puede que estés viendo datos desactualizados</span>
          <button type="button" onClick={load} className="cursor-pointer underline hover:text-fg">
            Reintentar
          </button>
        </div>
      )}

      {/* at-a-glance + invite: a tight cluster, separated from the main workspace below */}
      <div className="mb-8">
        <div className="mb-3 grid grid-cols-3 gap-3">
          {[
            { label: "ATLETAS ACTIVOS", value: athletes.length, accent: "text-volt" },
            { label: "MENSAJES SIN LEER", value: totalUnread, accent: "text-danger" },
            {
              label: "ÚLTIMO VÍNCULO",
              value: mostRecentLink ? new Date(mostRecentLink).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—",
              accent: "text-neon",
            },
          ].map(s => (
            <div key={s.label} className="border border-line bg-card p-4">
              <div className={`font-mono-app text-2xl font-extrabold ${s.accent}`}>{s.value}</div>
              <div className="mt-1.5 font-mono-app text-[9px] tracking-[1.4px] text-fg-ter">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border border-line bg-card p-4">
          <button
            type="button"
            onClick={generateCode}
            className="cursor-pointer border border-volt px-4 py-2.5 font-mono-app text-[11px] font-bold tracking-[1px] text-volt transition hover:bg-volt hover:text-ink"
          >
            + GENERAR CÓDIGO DE INVITACIÓN
          </button>
          {inviteCode && (
            <div className="font-mono-app">
              <span className="text-xl font-extrabold tracking-[6px] text-fg">{inviteCode}</span>
              <span className="ml-3 text-[10px] text-fg-ter">el atleta lo ingresa en PERFIL → EQUIPO</span>
            </div>
          )}
          {inviteError && <span className="font-mono-app text-[11px] text-danger">{inviteError}</span>}
        </div>
      </div>

      {pendingSelect && selected && (
        <div className="mb-4 flex items-center justify-between border border-warn/40 bg-warn/10 px-4 py-2.5 font-mono-app text-[11px] text-warn">
          <span>
            Tenés cambios sin asignar para {selected.name.split(" ")[0]}. ¿Descartarlos y pasar a {pendingSelect.name.split(" ")[0]}?
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={() => setPendingSelect(null)} className="cursor-pointer text-fg-sec hover:text-fg">
              SEGUIR EDITANDO
            </button>
            <button type="button" onClick={confirmDiscardAndSwitch} className="cursor-pointer font-bold text-warn hover:text-fg">
              DESCARTAR Y CAMBIAR →
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(280px,360px)_1fr] gap-4">
        {/* list */}
        <div className="border border-line bg-card">
          <div className="border-b border-line p-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar atleta…"
              className="w-full border border-line bg-elev px-3 py-2 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none"
            />
          </div>
          <div className="max-h-130 overflow-y-auto">
            {filtered.map(a => (
              <button
                type="button"
                key={a.linkId}
                onClick={() => selectAthlete(a)}
                className={`flex w-full cursor-pointer items-center justify-between border-l-3 px-4 py-3 text-left transition ${
                  selected?.linkId === a.linkId
                    ? "border-volt bg-elev"
                    : "border-transparent hover:bg-elev"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-fg">{a.name}</div>
                  <div className="font-mono-app text-[10px] text-fg-ter">{a.email}</div>
                  <div className={`mt-0.5 font-mono-app text-[9px] tracking-[0.5px] ${isStale(a.lastMessageAt) ? "text-warn" : "text-fg-ter"}`}>
                    {isStale(a.lastMessageAt) && "● "}{relTime(a.lastMessageAt)}
                  </div>
                </div>
                {unread[a.userId] > 0 && (
                  <span className="rounded-full bg-danger px-2 py-0.5 font-mono-app text-[10px] font-bold text-fg">
                    {unread[a.userId]}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 font-mono-app text-[11px] text-fg-ter">
                {athletes.length === 0 ? "Sin atletas vinculados. Generá un código y compartilo." : "Sin resultados."}
              </div>
            )}
          </div>
        </div>

        {/* detail */}
        <div className="min-w-0">
          {selected ? (
            <div className="flex flex-col gap-6">
              {/* gestionar: who they are + their current plan, one connected task */}
              <div className="flex flex-col gap-3">
                <div className="border border-line bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-fg">{selected.name}</div>
                      <div className="font-mono-app text-[11px] text-fg-ter">{selected.email}</div>
                    </div>
                    <div className="text-right font-mono-app text-[10px] text-fg-sec">
                      vinculado desde
                      <div className="text-fg">
                        {new Date(selected.since).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                </div>

                {user.role === "coach" && <AssignWorkout athlete={selected} onDirtyChange={setAssignDirty} />}
                {user.role === "nutritionist" && <AssignMeals athlete={selected} onDirtyChange={setAssignDirty} />}
              </div>

              {/* seguimiento: checking in on them, a separate mode from editing their plan */}
              <div className="flex flex-col gap-3">
                <Chat meId={user.id} athlete={selected} />

                <div className="border border-dashed border-line p-4 text-center font-mono-app text-[11px] text-fg-ter">
                  Progreso del atleta (adherencia, peso, PRs) — disponible cuando la app suba snapshots (fase 5)
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-60 place-items-center border border-dashed border-line font-mono-app text-xs text-fg-ter">
              Elegí un atleta para ver su detalle y chatear
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
