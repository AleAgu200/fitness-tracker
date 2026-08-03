"use client";

import { useEffect, useState } from "react";

import { api, Athlete, LibraryExercise } from "./lib";

interface Row {
  nombre: string;
  target: string;
  reps: string;
  peso: string;
  step: string;
  restSeconds: string;
}

interface WorkoutAssignment {
  version: number;
  payload: { coachName: string; exercises: { nombre: string; target: number; reps: number; peso: number; step: number; restSeconds: number }[] };
  createdAt: number;
}

const NEW_ROW: Row = { nombre: "", target: "3", reps: "8", peso: "0", step: "2.5", restSeconds: "90" };

const inputCls =
  "w-full min-w-0 border border-line bg-elev px-2 py-1.5 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

/** Exposes unsaved-edit state to the parent so it can guard against losing work on athlete switch. */
export function AssignWorkout({ athlete, onDirtyChange }: { athlete: Athlete; onDirtyChange?: (dirty: boolean) => void }) {
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [rows, setRows] = useState<Row[]>([NEW_ROW]);
  const [baseline, setBaseline] = useState<Row[]>([NEW_ROW]);
  const [current, setCurrent] = useState<WorkoutAssignment | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const dirty = JSON.stringify(rows) !== JSON.stringify(baseline);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const lib = await api<{ exercises: LibraryExercise[] }>("/api/library/exercises");
        const asg = await api<{ workout: WorkoutAssignment | null }>(`/api/assignments?athleteId=${encodeURIComponent(athlete.userId)}`);
        if (!alive) return;
        setLibrary(lib.exercises);
        setCurrent(asg.workout);
        const loaded = asg.workout
          ? asg.workout.payload.exercises.map(e => ({
              nombre: e.nombre,
              target: String(e.target),
              reps: String(e.reps),
              peso: String(e.peso),
              step: String(e.step),
              restSeconds: String(e.restSeconds),
            }))
          : [NEW_ROW];
        setRows(loaded);
        setBaseline(loaded);
        setStatus(null);
        setError(null);
        setConfirmingOverwrite(false);
        setLoadFailed(false);
      } catch {
        if (alive) setLoadFailed(true);
      }
    };
    load();
    return () => { alive = false; };
  }, [athlete.userId]);

  function patch(i: number, field: keyof Row, value: string) {
    setRows(r => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
    setConfirmingOverwrite(false);
  }

  async function assign() {
    const exercises = rows
      .filter(r => r.nombre.trim())
      .map(r => ({
        nombre: r.nombre.trim(),
        target: Number(r.target) || 3,
        reps: Number(r.reps) || 8,
        peso: Number(r.peso) || 0,
        step: Number(r.step) || 2.5,
        restSeconds: Number(r.restSeconds) || 90,
      }));
    if (exercises.length === 0) {
      setError("Agregá al menos un ejercicio antes de asignar");
      return;
    }
    setConfirmingOverwrite(false);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ version: number }>("/api/assignments/workout", {
        method: "POST",
        body: JSON.stringify({ athleteId: athlete.userId, exercises }),
      });
      setStatus(`✓ Plan v${res.version} asignado — ${athlete.name.split(" ")[0]} lo recibe al abrir la app`);
      setCurrent({ version: res.version, payload: { coachName: "", exercises }, createdAt: Date.now() });
      setBaseline(rows);
    } catch {
      setError("No se pudo asignar el plan — revisá tu conexión e intentá de nuevo");
    } finally {
      setBusy(false);
    }
  }

  function handleAssignClick() {
    if (current) {
      setConfirmingOverwrite(true);
    } else {
      assign();
    }
  }

  return (
    <div className="border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono-app text-[10px] tracking-[1.4px] text-fg-ter">
          PLAN DE ENTRENO ASIGNADO
        </span>
        {current && (
          <span className="font-mono-app text-[10px] text-volt">
            v{current.version} · {new Date(current.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      <div className="p-4">
        {loadFailed && (
          <div className="mb-3 flex items-center justify-between border border-warn/40 bg-warn/10 px-3 py-2 font-mono-app text-[11px] text-warn">
            <span>No se pudo cargar el plan actual — puede que estés viendo datos desactualizados</span>
            <button
              type="button"
              onClick={() => setLoadFailed(false)}
              className="cursor-pointer underline hover:text-fg"
            >
              CERRAR
            </button>
          </div>
        )}

        {/* header row — groups the fields a coach edits every session (series/reps/peso) apart from
            the ones set once and rarely touched (step/descanso), with a spacer track between them */}
        <div className="mb-1 grid grid-cols-[2.4fr_repeat(3,1fr)_0.3fr_repeat(2,1fr)_28px] gap-2 font-mono-app text-[9px] tracking-[1px] text-fg-ter">
          <span>EJERCICIO</span><span>SERIES</span><span>REPS</span><span>PESO kg</span><span />
          <span className="text-fg-ter/70" title="Incremento de peso por serie superada">STEP kg</span>
          <span className="text-fg-ter/70" title="Descanso entre series, en segundos">DESC. s</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="mb-2 grid grid-cols-[2.4fr_repeat(3,1fr)_0.3fr_repeat(2,1fr)_28px] gap-2">
            <select
              aria-label="Ejercicio"
              value={row.nombre}
              onChange={e => patch(i, "nombre", e.target.value)}
              className={inputCls}
            >
              <option value="">— elegir —</option>
              {row.nombre && !library.some(x => x.name === row.nombre) && (
                <option value={row.nombre}>{row.nombre}</option>
              )}
              {library.map(x => (
                <option key={x.id} value={x.name}>{x.name} ({x.muscleGroup})</option>
              ))}
            </select>
            <input aria-label="Series" type="number" min="1" value={row.target} onChange={e => patch(i, "target", e.target.value)} className={inputCls} />
            <input aria-label="Reps" type="number" min="1" value={row.reps} onChange={e => patch(i, "reps", e.target.value)} className={inputCls} />
            <input aria-label="Peso" type="number" min="0" step="0.5" value={row.peso} onChange={e => patch(i, "peso", e.target.value)} className={inputCls} />
            <span />
            <input aria-label="Step" type="number" min="0.5" step="0.5" value={row.step} onChange={e => patch(i, "step", e.target.value)} className={`${inputCls} text-fg-sec`} />
            <input aria-label="Descanso" type="number" min="15" step="15" value={row.restSeconds} onChange={e => patch(i, "restSeconds", e.target.value)} className={`${inputCls} text-fg-sec`} />
            <button
              type="button"
              onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
              className="cursor-pointer text-fg-ter hover:text-danger"
              aria-label="Quitar ejercicio"
            >
              ✕
            </button>
          </div>
        ))}

        {confirmingOverwrite && current && (
          <div className="mb-3 flex items-center justify-between border border-warn/40 bg-warn/10 px-3 py-2 font-mono-app text-[11px] text-warn">
            <span>Reemplazás el plan v{current.version} ({current.payload.exercises.length} ejercicios) — ¿confirmar?</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmingOverwrite(false)} className="cursor-pointer text-fg-sec hover:text-fg">
                CANCELAR
              </button>
              <button type="button" onClick={assign} className="cursor-pointer font-bold text-warn hover:text-fg">
                SÍ, REEMPLAZAR →
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRows(r => [...r, NEW_ROW])}
            className="cursor-pointer border border-dashed border-line px-4 py-2 font-mono-app text-[10px] tracking-[1px] text-fg-sec hover:text-fg"
          >
            + EJERCICIO
          </button>
          <button
            type="button"
            onClick={handleAssignClick}
            disabled={busy}
            className="cursor-pointer bg-volt px-5 py-2 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "..." : "ASIGNAR PLAN →"}
          </button>
          {status && <span className="font-mono-app text-[11px] text-volt">{status}</span>}
          {error && (
            <span className="font-mono-app text-[11px] text-danger">
              {error}{" "}
              <button type="button" onClick={assign} className="cursor-pointer underline hover:text-fg">
                Reintentar
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
