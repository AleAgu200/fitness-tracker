"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../lib";

type AccessStatus = "granted" | "revoked" | "not_authorized";

interface Overview {
  athlete: { id: string; name: string; email: string; profile: { goalWeightKg?: number | null } | null };
  organizations: { id: string; name: string; discipline: string }[];
  permissions: Record<string, { status: AccessStatus; canEdit: boolean }>;
  dataFreshness: Record<string, { status: AccessStatus; updatedAt: number | null }>;
  sync: { deviceId: string; lastSeenAt: number; status: string } | null;
  progress: {
    periodDays: number;
    training: { completed: number; scheduled: number; adherence: number | null; totalVolumeKg: number; daysWithData: number } | null;
    nutrition: { completed: number; substituted: number; pending: number; adherence: number | null; daysWithData: number } | null;
    metrics: { latestWeightKg: number | null; weightChangeKg: number | null; daysWithData: number } | null;
  };
  plans: { workout: Plan | null; mealPlan: Plan | null };
  checkins: Checkin[];
  signals: Signal[];
  tasks: Task[];
  team: { assignmentId: string; discipline: string; primary: boolean; professionalName: string; status: string }[];
  activity: { id: string; action: string; metadata: Record<string, unknown> | null; occurredAt: number }[];
}

interface Plan { id: string; version: number; effectiveAt: number | null; endsAt: number | null; createdAt: number }
interface Checkin { requestId: string; status: string; dueAt: number; submittedAt: number | null; reviewedAt: number | null; responseId: string | null; answers: Record<string, unknown> | null }
interface Signal { id: string; reasonCode: string; severity: string; status: string; evidence: Record<string, unknown>; openedAt: number }
interface Task { id: string; title: string; detail: string | null; dueAt: number | null; status: string; createdAt: number }

const TABS = ["Resumen", "Progreso", "Check-ins", "Plan", "Mensajes", "Notas y tareas", "Actividad"] as const;

interface Message { id: string; senderId: string; receiverId: string; content: string; sentAt: number }

function RecordChat({ athleteId }: { athleteId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api<{ messages: Message[] }>(`/api/messages?with=${encodeURIComponent(athleteId)}&since=0`);
      setMessages(result.messages);
      await api("/api/messages/read", { method: "POST", body: JSON.stringify({ with: athleteId }) });
    } catch { /* the next poll retries */ }
  }, [athleteId]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api("/api/messages", { method: "POST", body: JSON.stringify({ to: athleteId, content: draft.trim() }) });
      setDraft("");
      await load();
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="border border-line bg-card">
      <div className="flex h-105 flex-col gap-2 overflow-y-auto p-4">
        {messages.length ? messages.map(message => <div key={message.id} className="border border-line bg-elev p-3"><p className="whitespace-pre-wrap text-sm text-fg">{message.content}</p><div className="mt-2 font-mono-app text-[9px] text-fg-ter">{dateTime(message.sentAt)}</div></div>) : <div className="m-auto font-mono-app text-xs text-fg-ter">SIN MENSAJES TODAVÍA</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribí una respuesta contextual…" className="flex-1 border border-line bg-elev px-3 py-2.5 text-sm text-fg focus:border-neon focus:outline-none" />
        <button disabled={sending} className="cursor-pointer bg-neon px-5 font-mono-app text-[10px] font-bold text-ink disabled:opacity-50">ENVIAR</button>
      </form>
    </div>
  );
}

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function dateTime(value: number | null): string {
  return value == null ? "—" : new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function freshness(value: number | null): string {
  if (!value) return "sin datos";
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

function AccessCard({ label, state, updatedAt }: { label: string; state: AccessStatus; updatedAt: number | null }) {
  const copy = state === "granted" ? freshness(updatedAt) : state === "revoked" ? "acceso revocado" : "sin autorización";
  const color = state === "granted" ? "text-neon" : state === "revoked" ? "text-warn" : "text-fg-ter";
  return (
    <div className="border border-line bg-elev p-3">
      <div className="font-mono-app text-[9px] uppercase tracking-[1.2px] text-fg-ter">{label}</div>
      <div className={`mt-2 text-sm ${color}`}>{copy}</div>
    </div>
  );
}

export default function AthleteRecordPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumen");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>(`/api/portal/athletes/${encodeURIComponent(athleteId)}/overview`));
      setError(null);
    } catch {
      setError("No se pudo abrir el expediente o ya no tenés acceso.");
    } finally {
      setLoading(false);
    }
  }, [athleteId]);
  useEffect(() => { load(); }, [load]);

  const mainSignal = overview?.signals[0] ?? null;
  const pendingCheckin = overview?.checkins.find(checkin => checkin.status === "submitted") ?? null;
  const activeTasks = useMemo(() => overview?.tasks.filter(task => task.status === "open") ?? [], [overview]);

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy(true);
    try {
      await api(`/api/portal/athletes/${encodeURIComponent(athleteId)}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: taskTitle.trim(), attentionSignalId: mainSignal?.id }),
      });
      setTaskTitle("");
      setTaskOpen(false);
      await load();
    } catch {
      setError("No se pudo crear la tarea.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewCheckin(checkin: Checkin, action: "no_changes" | "task") {
    setBusy(true);
    try {
      await api(`/api/check-ins/${encodeURIComponent(checkin.requestId)}/review`, {
        method: "POST",
        body: JSON.stringify(action === "task"
          ? { action, note: "Seguimiento creado desde la revisión del check-in.", taskTitle: "Dar seguimiento al check-in" }
          : { action, note: "Revisado; no requiere cambios por ahora." }),
      });
      await load();
    } catch {
      setError("No se pudo registrar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  async function requestCheckin() {
    setBusy(true);
    try {
      await api("/api/check-ins/requests", {
        method: "POST",
        body: JSON.stringify({ athleteId, dueAt: Date.now() + 7 * 86_400_000 }),
      });
      setTab("Check-ins");
      await load();
    } catch {
      setError("No se pudo solicitar el check-in.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid min-h-full place-items-center font-mono-app text-xs text-fg-ter">ABRIENDO EXPEDIENTE…</div>;
  if (!overview) return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="max-w-md border border-danger/40 bg-danger/10 p-6 text-center">
        <p className="text-danger">{error}</p>
        <Link href="/portal/atencion" className="mt-4 inline-block font-mono-app text-xs text-fg underline">VOLVER A ATENCIÓN</Link>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Link href="/portal/atencion" className="grid h-9 w-9 place-items-center border border-line text-fg-sec hover:border-volt hover:text-volt" aria-label="Volver">←</Link>
        <div>
          <h1 className="text-2xl font-semibold text-fg">{overview.athlete.name}</h1>
          <div className="mt-1 font-mono-app text-[9px] text-fg-ter">
            ENTRENAMIENTO {freshness(overview.dataFreshness.training.updatedAt)} · NUTRICIÓN {freshness(overview.dataFreshness.nutrition.updatedAt)} · MÉTRICAS {freshness(overview.dataFreshness.metrics.updatedAt)}
          </div>
        </div>
        {mainSignal && <span className="border border-warn/50 bg-warn/10 px-2.5 py-1 font-mono-app text-[9px] text-warn">REQUIERE ATENCIÓN</span>}
        <div className="flex-1" />
        <button type="button" onClick={() => setTaskOpen(value => !value)} className="cursor-pointer border border-line px-3 py-2 font-mono-app text-[10px] text-fg-sec hover:border-neon hover:text-neon">CREAR TAREA</button>
        {overview.permissions.checkins.status === "granted" && !pendingCheckin && <button type="button" disabled={busy} onClick={requestCheckin} className="cursor-pointer border border-volt px-3 py-2 font-mono-app text-[10px] text-volt disabled:opacity-50">SOLICITAR CHECK-IN</button>}
        {pendingCheckin && <button type="button" onClick={() => setTab("Check-ins")} className="cursor-pointer bg-volt px-3 py-2 font-mono-app text-[10px] font-bold text-ink">REVISAR CHECK-IN</button>}
      </header>

      {error && <div className="mb-4 border border-warn/40 bg-warn/10 px-4 py-2 font-mono-app text-[10px] text-warn">{error}</div>}
      {taskOpen && (
        <form onSubmit={createTask} className="mb-4 flex gap-2 border border-neon/30 bg-neon/5 p-3">
          <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Próxima acción…" className="flex-1 border border-line bg-elev px-3 py-2 text-sm text-fg focus:border-neon focus:outline-none" />
          <button disabled={busy} className="cursor-pointer bg-neon px-4 font-mono-app text-[10px] font-bold text-ink disabled:opacity-50">GUARDAR</button>
        </form>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(item => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`cursor-pointer border-b-2 px-3 py-2.5 font-mono-app text-[10px] whitespace-nowrap ${tab === item ? "border-volt text-volt" : "border-transparent text-fg-ter hover:text-fg"}`}>
            {item.toUpperCase()}{item === "Check-ins" && pendingCheckin ? " · 1" : ""}
          </button>
        ))}
      </nav>

      {tab === "Resumen" && (
        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(230px,.8fr)] gap-4">
          <section className="flex min-w-0 flex-col gap-4">
            {mainSignal ? (
              <div className="border border-warn/40 bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-app text-[10px] tracking-[1px] text-warn">QUÉ REQUIERE ATENCIÓN</span>
                  <span className="font-mono-app text-[9px] text-fg-ter">{dateTime(mainSignal.openedAt)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-fg-mid">{mainSignal.reasonCode.replaceAll("_", " ")} · la evidencia completa está disponible en la pestaña correspondiente.</p>
              </div>
            ) : <div className="border border-line bg-card p-4 text-sm text-fg-sec">No hay señales activas para este atleta.</div>}
            <div className="border border-line bg-card p-4">
              <div className="mb-3 flex items-center justify-between"><span className="font-semibold text-fg">Últimos 28 días</span><button onClick={() => setTab("Progreso")} className="cursor-pointer font-mono-app text-[9px] text-neon">VER PROGRESO →</button></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-line bg-elev p-3"><div className="font-mono-app text-[9px] text-fg-ter">ENTRENAMIENTO</div><div className="mt-2 text-2xl font-semibold text-volt">{percent(overview.progress.training?.adherence ?? null)}</div><div className="mt-1 text-xs text-fg-sec">{overview.progress.training ? `${overview.progress.training.completed}/${overview.progress.training.scheduled} sesiones` : overview.permissions.training.status}</div></div>
                <div className="border border-line bg-elev p-3"><div className="font-mono-app text-[9px] text-fg-ter">NUTRICIÓN</div><div className="mt-2 text-2xl font-semibold text-neon">{percent(overview.progress.nutrition?.adherence ?? null)}</div><div className="mt-1 text-xs text-fg-sec">{overview.progress.nutrition ? `${overview.progress.nutrition.substituted} sustituidas` : overview.permissions.nutrition.status}</div></div>
                <div className="border border-line bg-elev p-3"><div className="font-mono-app text-[9px] text-fg-ter">PESO</div><div className="mt-2 text-2xl font-semibold text-fg">{overview.progress.metrics?.latestWeightKg ? `${overview.progress.metrics.latestWeightKg.toFixed(1)} kg` : "—"}</div><div className="mt-1 text-xs text-fg-sec">{overview.progress.metrics?.weightChangeKg != null ? `${overview.progress.metrics.weightChangeKg > 0 ? "+" : ""}${overview.progress.metrics.weightChangeKg.toFixed(1)} kg` : overview.permissions.metrics.status}</div></div>
              </div>
            </div>
            <div className="border border-line bg-card p-4">
              <div className="mb-3 font-semibold text-fg">Frescura y permisos</div>
              <div className="grid grid-cols-4 gap-2">
                {[["Entrenamiento", "training"], ["Nutrición", "nutrition"], ["Métricas", "metrics"], ["Check-ins", "checkins"]].map(([label, key]) => <AccessCard key={key} label={label} state={overview.dataFreshness[key].status} updatedAt={overview.dataFreshness[key].updatedAt} />)}
              </div>
            </div>
          </section>
          <aside className="flex flex-col gap-4">
            <div className="border border-line bg-card p-4"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">EQUIPO RESPONSABLE</div>{overview.team.map(member => <div key={member.assignmentId} className="mt-3 border-b border-line pb-3 last:border-0 last:pb-0"><div className="text-sm text-fg">{member.professionalName}</div><div className="font-mono-app text-[9px] text-fg-ter">{member.discipline === "coach" ? "COACH" : "NUTRICIÓN"}{member.primary ? " · PRINCIPAL" : " · COLABORADOR"}</div></div>)}</div>
            <div className="border border-line bg-card p-4"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">PRÓXIMA ACCIÓN</div>{activeTasks[0] ? <><p className="mt-3 text-sm text-fg">{activeTasks[0].title}</p><div className="mt-2 text-xs text-fg-ter">Vence {dateTime(activeTasks[0].dueAt)}</div></> : <p className="mt-3 text-sm text-fg-sec">Todavía no hay una tarea abierta.</p>}</div>
            <div className="border border-line bg-card p-4"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">PLAN VIGENTE</div><p className="mt-3 text-sm text-fg">{overview.plans.workout ? `Entrenamiento v${overview.plans.workout.version}` : overview.plans.mealPlan ? `Nutrición v${overview.plans.mealPlan.version}` : "Sin plan visible"}</p><button onClick={() => setTab("Plan")} className="mt-3 cursor-pointer font-mono-app text-[9px] text-neon">ABRIR PLAN →</button></div>
          </aside>
        </div>
      )}

      {tab === "Progreso" && <div className="grid grid-cols-3 gap-4">{([[
        "Entrenamiento", overview.progress.training, overview.permissions.training.status,
      ], [
        "Nutrición", overview.progress.nutrition, overview.permissions.nutrition.status,
      ], [
        "Métricas", overview.progress.metrics, overview.permissions.metrics.status,
      ]] as [string, object | null, AccessStatus][]).map(([label, data, state]) => <div key={label} className="border border-line bg-card p-4"><div className="font-mono-app text-[10px] text-fg-ter">{label}</div>{data ? <pre className="mt-4 overflow-auto whitespace-pre-wrap font-mono-app text-xs leading-6 text-fg-mid">{JSON.stringify(data, null, 2)}</pre> : <p className="mt-4 text-sm text-warn">{state === "revoked" ? "El acceso fue revocado; no se muestra como 0%." : "Sin autorización para esta categoría."}</p>}</div>)}</div>}

      {tab === "Check-ins" && <div className="flex flex-col gap-3">{overview.checkins.length ? overview.checkins.map(checkin => <div key={checkin.requestId} className="border border-line bg-card p-4"><div className="flex items-center justify-between"><div><span className="font-mono-app text-[10px] text-volt">{checkin.status.toUpperCase()}</span><div className="mt-1 text-xs text-fg-ter">Vence {dateTime(checkin.dueAt)} · enviado {dateTime(checkin.submittedAt)}</div></div>{checkin.status === "submitted" && <div className="flex gap-2"><button disabled={busy} onClick={() => reviewCheckin(checkin, "no_changes")} className="cursor-pointer border border-line px-3 py-2 font-mono-app text-[9px] text-fg-sec">SIN CAMBIOS</button><button disabled={busy} onClick={() => reviewCheckin(checkin, "task")} className="cursor-pointer bg-volt px-3 py-2 font-mono-app text-[9px] font-bold text-ink">REVISAR + TAREA</button></div>}</div>{checkin.answers && <div className="mt-4 grid grid-cols-5 gap-2">{["energy", "sleep", "pain", "stress", "motivation"].map(key => <div key={key} className="border border-line bg-elev p-3"><div className="font-mono-app text-[8px] uppercase text-fg-ter">{key}</div><div className="mt-1 text-xl text-fg">{String(checkin.answers?.[key] ?? "—")}</div></div>)}</div>}</div>) : <div className="border border-dashed border-line p-8 text-center text-sm text-fg-ter">No hay check-ins visibles.</div>}</div>}

      {tab === "Plan" && <div className="grid grid-cols-2 gap-4">{([[
        "Entrenamiento", overview.plans.workout, overview.permissions.training.status,
      ], [
        "Nutrición", overview.plans.mealPlan, overview.permissions.nutrition.status,
      ]] as [string, Plan | null, AccessStatus][]).map(([label, plan, state]) => <div key={label} className="border border-line bg-card p-4"><div className="font-mono-app text-[10px] text-fg-ter">{label}</div>{plan ? <><div className="mt-3 text-xl text-fg">Versión {plan.version}</div><div className="mt-2 text-sm text-fg-sec">Efectivo {dateTime(plan.effectiveAt)} · termina {dateTime(plan.endsAt)}</div><Link href="/portal/atletas" className="mt-5 inline-block border border-neon px-3 py-2 font-mono-app text-[9px] text-neon">ABRIR EDITOR ACTUAL</Link></> : <p className="mt-4 text-sm text-fg-sec">{state === "revoked" ? "Acceso revocado." : "No hay un plan vigente visible."}</p>}</div>)}</div>}

      {tab === "Mensajes" && <RecordChat athleteId={athleteId} />}

      {tab === "Notas y tareas" && <div className="flex flex-col gap-3">{overview.tasks.length ? overview.tasks.map(task => <div key={task.id} className="flex items-start justify-between border border-line bg-card p-4"><div><div className="text-sm text-fg">{task.title}</div>{task.detail && <p className="mt-2 text-sm text-fg-sec">{task.detail}</p>}</div><div className="text-right font-mono-app text-[9px] text-fg-ter">{task.status.toUpperCase()}<br />{dateTime(task.dueAt)}</div></div>) : <div className="border border-dashed border-line p-8 text-center text-sm text-fg-ter">Sin tareas registradas.</div>}</div>}

      {tab === "Actividad" && <div className="border border-line bg-card">{overview.activity.length ? overview.activity.map(item => <div key={item.id} className="flex gap-4 border-b border-line p-4 last:border-0"><div className="w-28 shrink-0 font-mono-app text-[9px] text-fg-ter">{dateTime(item.occurredAt)}</div><div><div className="text-sm text-fg">{item.action.replaceAll(".", " · ")}</div>{item.metadata && <div className="mt-1 font-mono-app text-[9px] text-fg-ter">{JSON.stringify(item.metadata)}</div>}</div></div>) : <div className="p-8 text-center text-sm text-fg-ter">La actividad auditada aparecerá aquí.</div>}</div>}
    </div>
  );
}
