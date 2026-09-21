"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "../../lib";

type Discipline = "coach" | "nutritionist";

interface Draft {
  id: string;
  discipline: Discipline;
  baseVersion: number;
  name: string | null;
  payload: Record<string, unknown>;
  effectiveAt: number | null;
  endsAt: number | null;
  sourceTemplateId: string | null;
  updatedAt: number;
  stale: boolean;
}

interface HistoryEntry {
  id: string;
  version: number;
  name: string | null;
  status: string;
  createdAt: number;
  effectiveAt: number | null;
  endsAt: number | null;
}

interface Scheduled { version: number; name: string | null; effectiveAt: number | null }
interface Template { id: string; name: string; discipline: Discipline }

interface Exercise {
  nombre: string;
  target: number;
  reps: number;
  peso: number;
  step: number;
  restSeconds: number;
}

interface Meal {
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

const BLANK_EXERCISE: Exercise = { nombre: "", target: 3, reps: 8, peso: 0, step: 2.5, restSeconds: 90 };
const BLANK_MEAL: Meal = { label: "DESAYUNO", time: "08:00", n: "", kcal: 0, p: 0, c: 0, g: 0 };

function toLocalInput(value: number | null): string {
  if (value == null) return "";
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function dateTime(value: number | null): string {
  return value == null ? "—" : new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const FIELD = "border border-line bg-elev px-2 py-1.5 text-sm text-fg focus:border-neon focus:outline-none";
const GHOST = "cursor-pointer border border-line px-3 py-2 font-mono-app text-[10px] text-fg-sec hover:border-neon hover:text-neon disabled:opacity-40";

export function PlanWorkspace({
  athleteId,
  disciplines,
  onPublished,
}: {
  athleteId: string;
  disciplines: Discipline[];
  onPublished: () => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>(disciplines[0] ?? "coach");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [scheduled, setScheduled] = useState<Scheduled | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;

  const query = `discipline=${discipline}`;
  const base = `/api/portal/athletes/${encodeURIComponent(athleteId)}/plan`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [draftResult, historyResult, templateResult] = await Promise.all([
        api<{ draft: Draft }>(`${base}/draft?${query}`),
        api<{ history: HistoryEntry[]; activeVersion: number | null; scheduled: Scheduled | null }>(`${base}/history?${query}`),
        api<{ templates: Template[] }>(`/api/portal/plan-templates?${query}`),
      ]);
      setDraft(draftResult.draft);
      setHistory(historyResult.history);
      setActiveVersion(historyResult.activeVersion);
      setScheduled(historyResult.scheduled);
      setTemplates(templateResult.templates);
      setNotice(null);
    } catch {
      setNotice("No se pudo abrir el plan para esta disciplina.");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [base, query]);

  useEffect(() => { load(); }, [load]);

  const exercises = useMemo(
    () => (Array.isArray(draft?.payload.exercises) ? draft.payload.exercises as Exercise[] : []),
    [draft],
  );
  const meals = useMemo(
    () => (Array.isArray(draft?.payload.meals) ? draft.payload.meals as Meal[] : []),
    [draft],
  );

  function patchLocal(changes: Partial<Draft>) {
    setDraft(current => (current ? { ...current, ...changes } : current));
  }

  const save = useCallback(async (changes: Record<string, unknown>) => {
    setBusy(true);
    try {
      const result = await api<{ draft: Draft }>(`${base}/draft?${query}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setDraft(result.draft);
      setNotice("Borrador guardado.");
    } catch {
      setNotice("No se pudo guardar el borrador.");
    } finally {
      setBusy(false);
    }
  }, [base, query]);

  async function saveRows(rows: Exercise[] | Meal[]) {
    const payload = discipline === "coach"
      ? { ...draft?.payload, exercises: rows }
      : { ...draft?.payload, meals: rows };
    await save({ payload });
  }

  /**
   * Commit whatever is in the draft right now. Field edits update state and
   * only persist on blur, so this reads the ref rather than a value captured
   * when the handler was created.
   */
  async function commitRows() {
    const current = draftRef.current;
    if (current) await save({ payload: current.payload });
  }

  async function publish() {
    setBusy(true);
    setConflict(null);
    try {
      const result = await api<{ version: number; effectiveAt: number }>(`${base}/publish?${query}`, { method: "POST" });
      setNotice(result.effectiveAt > Date.now()
        ? `Publicado como v${result.version}. Entra en vigor el ${dateTime(result.effectiveAt)}.`
        : `Publicado como v${result.version} y ya está vigente.`);
      await load();
      onPublished();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(typeof error.body?.currentVersion === "number" ? error.body.currentVersion : null);
        setNotice(null);
      } else {
        setNotice("No se pudo publicar el plan.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api(`${base}/${path}?${query}`, { method: "POST", body: JSON.stringify(body) });
      setNotice(message);
      await load();
    } catch {
      setNotice("No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await api(`${base}/draft?${query}`, { method: "DELETE" });
      setNotice("Borrador descartado.");
      await load();
    } catch {
      setNotice("No se pudo descartar el borrador.");
    } finally {
      setBusy(false);
    }
  }

  if (!disciplines.length) {
    return <div className="border border-line bg-card p-8 text-center text-sm text-fg-sec">No tenés permisos de edición de planes para este atleta.</div>;
  }

  const rows: (Exercise | Meal)[] = discipline === "coach" ? exercises : meals;
  const empty = rows.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {disciplines.length > 1 && (
        <div className="flex gap-1">
          {disciplines.map(item => (
            <button key={item} type="button" onClick={() => setDiscipline(item)}
              className={`cursor-pointer border px-3 py-2 font-mono-app text-[10px] ${discipline === item ? "border-volt text-volt" : "border-line text-fg-ter hover:text-fg"}`}>
              {item === "coach" ? "ENTRENAMIENTO" : "NUTRICIÓN"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-line bg-elev p-3">
          <div className="font-mono-app text-[9px] text-fg-ter">VIGENTE</div>
          <div className="mt-2 text-xl text-fg">{activeVersion ? `v${activeVersion}` : "sin plan"}</div>
        </div>
        <div className="border border-line bg-elev p-3">
          <div className="font-mono-app text-[9px] text-fg-ter">PROGRAMADO</div>
          <div className="mt-2 text-sm text-fg">{scheduled ? `v${scheduled.version} · ${dateTime(scheduled.effectiveAt)}` : "—"}</div>
          {scheduled && (
            <button type="button" disabled={busy} onClick={() => act("revert", { withdrawVersion: scheduled.version }, "Programación cancelada.")}
              className="mt-2 cursor-pointer font-mono-app text-[9px] text-warn underline disabled:opacity-40">CANCELAR</button>
          )}
        </div>
        <div className="border border-line bg-elev p-3">
          <div className="font-mono-app text-[9px] text-fg-ter">BORRADOR</div>
          <div className="mt-2 text-sm text-fg">{draft ? `base v${draft.baseVersion}` : "—"}</div>
          {draft?.stale && <div className="mt-1 font-mono-app text-[9px] text-warn">DESACTUALIZADO</div>}
        </div>
      </div>

      {conflict != null && (
        <div className="border border-warn/50 bg-warn/10 p-4">
          <p className="text-sm text-warn">
            Alguien publicó la versión {conflict} mientras editabas. Tu borrador se conservó intacto.
          </p>
          <button type="button" disabled={busy} onClick={() => act("revert", { version: conflict }, "Borrador actualizado desde la versión publicada.")}
            className="mt-3 cursor-pointer border border-warn px-3 py-2 font-mono-app text-[10px] text-warn disabled:opacity-40">
            CARGAR LA VERSIÓN PUBLICADA
          </button>
        </div>
      )}

      {notice && <div className="border border-line bg-elev px-4 py-2 font-mono-app text-[10px] text-fg-sec">{notice}</div>}

      {loading ? (
        <div className="border border-line bg-card p-8 text-center font-mono-app text-xs text-fg-ter">CARGANDO PLAN…</div>
      ) : draft && (
        <>
          <div className="border border-line bg-card p-4">
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono-app text-[9px] text-fg-ter">NOMBRE DE LA FASE</span>
                <input value={draft.name ?? ""} onChange={event => patchLocal({ name: event.target.value })}
                  onBlur={event => save({ name: event.target.value })} placeholder="Fase 2 — Fuerza" className={FIELD} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono-app text-[9px] text-fg-ter">ENTRA EN VIGOR</span>
                <input type="datetime-local" value={toLocalInput(draft.effectiveAt)}
                  onChange={event => { const value = fromLocalInput(event.target.value); patchLocal({ effectiveAt: value }); save({ effectiveAt: value }); }}
                  className={FIELD} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono-app text-[9px] text-fg-ter">TERMINA (OPCIONAL)</span>
                <input type="datetime-local" value={toLocalInput(draft.endsAt)}
                  onChange={event => { const value = fromLocalInput(event.target.value); patchLocal({ endsAt: value }); save({ endsAt: value }); }}
                  className={FIELD} />
              </label>
            </div>
            <p className="mt-3 font-mono-app text-[9px] leading-5 text-fg-ter">
              Si la fecha de vigencia es futura, el atleta sigue entrenando el plan actual y solo ve cuándo cambia.
              Definir el final activa la señal “plan por terminar” en Atención.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border border-line bg-card p-3">
            <span className="font-mono-app text-[9px] text-fg-ter">PLANTILLAS</span>
            <select disabled={busy || !templates.length} defaultValue=""
              onChange={event => { if (event.target.value) act("apply-template", { templateId: event.target.value }, "Plantilla cargada en el borrador."); }}
              className={`${FIELD} min-w-52`}>
              <option value="">{templates.length ? "Cargar plantilla…" : "Sin plantillas"}</option>
              {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <button type="button" disabled={busy || empty} className={GHOST}
              onClick={() => {
                const name = window.prompt("Nombre de la plantilla");
                if (name?.trim()) act("apply-template", { saveAs: name.trim() }, "Plantilla guardada en la organización.");
              }}>
              GUARDAR COMO PLANTILLA
            </button>
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={discard} className={GHOST}>DESCARTAR BORRADOR</button>
            <button type="button" disabled={busy || empty} onClick={publish}
              className="cursor-pointer bg-neon px-4 py-2 font-mono-app text-[10px] font-bold text-ink disabled:opacity-40">
              PUBLICAR
            </button>
          </div>

          <div className="border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line p-3">
              <span className="font-semibold text-fg">{discipline === "coach" ? "Ejercicios" : "Comidas"}</span>
              <button type="button" disabled={busy} className={GHOST}
                onClick={() => saveRows(discipline === "coach"
                  ? [...exercises, { ...BLANK_EXERCISE }]
                  : [...meals, { ...BLANK_MEAL }])}>
                AÑADIR
              </button>
            </div>

            {empty ? (
              <div className="p-8 text-center text-sm text-fg-ter">
                El borrador está vacío. Añadí {discipline === "coach" ? "un ejercicio" : "una comida"} o cargá una plantilla.
              </div>
            ) : discipline === "coach" ? (
              <div className="flex flex-col">
                {exercises.map((exercise, index) => (
                  <div key={index} className="grid grid-cols-[2fr_repeat(4,minmax(0,.55fr))_auto] items-end gap-2 border-b border-line p-3 last:border-0">
                    <Field label="EJERCICIO" value={exercise.nombre}
                      onChange={value => patchRow(index, { nombre: value })}
                      onCommit={commitRows} />
                    <Field label="SERIES" type="number" value={exercise.target}
                      onChange={value => patchRow(index, { target: Number(value) })} onCommit={commitRows} />
                    <Field label="REPS" type="number" value={exercise.reps}
                      onChange={value => patchRow(index, { reps: Number(value) })} onCommit={commitRows} />
                    <Field label="PESO KG" type="number" value={exercise.peso}
                      onChange={value => patchRow(index, { peso: Number(value) })} onCommit={commitRows} />
                    <Field label="DESCANSO S" type="number" value={exercise.restSeconds}
                      onChange={value => patchRow(index, { restSeconds: Number(value) })} onCommit={commitRows} />
                    <button type="button" disabled={busy} onClick={() => saveRows(exercises.filter((_, i) => i !== index))}
                      className="cursor-pointer border border-line px-2 py-1.5 font-mono-app text-[10px] text-fg-ter hover:border-danger hover:text-danger">✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {meals.map((meal, index) => (
                  <div key={index} className="grid grid-cols-[.8fr_.6fr_2fr_repeat(4,minmax(0,.5fr))_auto] items-end gap-2 border-b border-line p-3 last:border-0">
                    <Field label="MOMENTO" value={meal.label} onChange={value => patchRow(index, { label: value })} onCommit={commitRows} />
                    <Field label="HORA" value={meal.time} onChange={value => patchRow(index, { time: value })} onCommit={commitRows} />
                    <Field label="DESCRIPCIÓN" value={meal.n} onChange={value => patchRow(index, { n: value })} onCommit={commitRows} />
                    <Field label="KCAL" type="number" value={meal.kcal} onChange={value => patchRow(index, { kcal: Number(value) })} onCommit={commitRows} />
                    <Field label="P" type="number" value={meal.p} onChange={value => patchRow(index, { p: Number(value) })} onCommit={commitRows} />
                    <Field label="C" type="number" value={meal.c} onChange={value => patchRow(index, { c: Number(value) })} onCommit={commitRows} />
                    <Field label="G" type="number" value={meal.g} onChange={value => patchRow(index, { g: Number(value) })} onCommit={commitRows} />
                    <button type="button" disabled={busy} onClick={() => saveRows(meals.filter((_, i) => i !== index))}
                      className="cursor-pointer border border-line px-2 py-1.5 font-mono-app text-[10px] text-fg-ter hover:border-danger hover:text-danger">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-line bg-card">
            <div className="border-b border-line p-3 font-semibold text-fg">Historial</div>
            {history.length ? history.map(entry => {
              const isActive = entry.version === activeVersion;
              const isScheduled = scheduled?.version === entry.version;
              return (
                <div key={entry.id} className="flex items-center gap-3 border-b border-line p-3 last:border-0">
                  <div className="w-16 font-mono-app text-[11px] text-fg">v{entry.version}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">{entry.name ?? "Sin nombre"}</div>
                    <div className="font-mono-app text-[9px] text-fg-ter">
                      {dateTime(entry.effectiveAt)} → {entry.endsAt ? dateTime(entry.endsAt) : "sin fin"}
                    </div>
                  </div>
                  <span className={`font-mono-app text-[9px] ${isActive ? "text-neon" : isScheduled ? "text-volt" : entry.status === "archived" ? "text-fg-ter" : "text-fg-sec"}`}>
                    {isActive ? "VIGENTE" : isScheduled ? "PROGRAMADO" : entry.status === "archived" ? "ARCHIVADO" : "HISTÓRICO"}
                  </span>
                  {!isActive && (
                    <button type="button" disabled={busy} className={GHOST}
                      onClick={() => act("revert", { version: entry.version }, `Versión ${entry.version} cargada en el borrador para revisar.`)}>
                      CARGAR
                    </button>
                  )}
                </div>
              );
            }) : <div className="p-8 text-center text-sm text-fg-ter">Todavía no se publicó ninguna versión.</div>}
          </div>
        </>
      )}
    </div>
  );

  function patchRow(index: number, changes: Record<string, unknown>) {
    setDraft(current => {
      if (!current) return current;
      const key = discipline === "coach" ? "exercises" : "meals";
      const list = [...(current.payload[key] as Record<string, unknown>[])];
      list[index] = { ...list[index], ...changes };
      return { ...current, payload: { ...current.payload, [key]: list } };
    });
  }
}

function Field({
  label,
  value,
  type = "text",
  onChange,
  onCommit,
}: {
  label: string;
  value: string | number;
  type?: "text" | "number";
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-mono-app text-[8px] text-fg-ter">{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} onBlur={onCommit} className={FIELD} />
    </label>
  );
}
