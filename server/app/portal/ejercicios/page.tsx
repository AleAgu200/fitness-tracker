"use client";

import { useCallback, useEffect, useState } from "react";

import { api, EQUIPMENT, LibraryExercise, MUSCLE_GROUPS } from "../lib";
import { usePortalUser } from "../portal-context";

interface WxResult {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl: string | null;
  muscleGroup: string;
  localEquipment: string;
}

function WorkoutXSearch({ canImport, onImported }: { canImport: boolean; onImported: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WxResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      setNote(null);
      try {
        const res = await api<{ exercises: WxResult[] }>(`/api/workoutx/exercises?q=${encodeURIComponent(q)}`);
        setResults(res.exercises);
        if (res.exercises.length === 0) setNote("Sin resultados en WorkoutX");
      } catch (e) {
        setNote(e instanceof Error && e.message === "429" ? "Cuota mensual de WorkoutX agotada" : "WorkoutX no disponible");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  async function importExercise(r: WxResult) {
    try {
      await api("/api/library/exercises", {
        method: "POST",
        body: JSON.stringify({ name: r.name, muscleGroup: r.muscleGroup, equipment: r.localEquipment }),
      });
      setNote(`✓ "${r.name}" importado a tu biblioteca`);
      onImported();
    } catch {
      setNote("No se pudo importar");
    }
  }

  return (
    <div className="mb-6 border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono-app text-[10px] tracking-[1.4px] text-neon">BUSCAR EN WORKOUTX · +1300 EJERCICIOS</span>
        {searching && <span className="font-mono-app text-[10px] text-fg-ter">buscando…</span>}
      </div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar ejercicio en la base global (ej: squat, curl, press)…"
        className="w-full border border-line bg-elev px-3 py-2 text-sm text-fg placeholder:text-fg-ter focus:border-neon focus:outline-none"
      />
      {note && <div className="mt-2 font-mono-app text-[11px] text-fg-sec">{note}</div>}
      {results.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 border border-line-soft bg-elev px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{r.name}</div>
                <div className="font-mono-app text-[10px] text-fg-ter">
                  {r.muscleGroup} · {r.localEquipment} · target: {r.target}
                </div>
              </div>
              {r.gifUrl && (
                <a href={r.gifUrl} target="_blank" rel="noreferrer" className="font-mono-app text-[10px] text-neon hover:underline">
                  VER GIF
                </a>
              )}
              {canImport && (
                <button
                  type="button"
                  onClick={() => importExercise(r)}
                  className="cursor-pointer border border-volt px-3 py-1 font-mono-app text-[10px] font-bold text-volt hover:bg-volt hover:text-ink"
                >
                  IMPORTAR
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY = { name: "", muscleGroup: "pecho", equipment: "barra" };

const GROUP_COLORS: Record<string, string> = {
  "pecho": "text-danger",
  "espalda": "text-neon",
  "piernas": "text-volt",
  "hombros": "text-warn",
  "brazos": "text-fg-mid",
  "core": "text-neon",
  "full body": "text-volt",
};

export default function EjerciciosPage() {
  const { user } = usePortalUser();
  const canEdit = user.role === "coach";
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q = "") => {
    try {
      const res = await api<{ exercises: LibraryExercise[] }>(`/api/library/exercises?q=${encodeURIComponent(q)}`);
      setExercises(res.exercises);
    } catch {
      setError("No se pudo cargar la biblioteca");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  function startEdit(ex: LibraryExercise) {
    setEditingId(ex.id);
    setForm({ name: ex.name, muscleGroup: ex.muscleGroup, equipment: ex.equipment });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    const body = JSON.stringify({ name: form.name.trim(), muscleGroup: form.muscleGroup, equipment: form.equipment });
    try {
      if (editingId) {
        await api(`/api/library/exercises/${editingId}`, { method: "PUT", body });
      } else {
        await api("/api/library/exercises", { method: "POST", body });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load(query);
    } catch {
      setError(editingId ? "Solo podés editar ejercicios propios" : "No se pudo guardar");
    }
  }

  async function remove(ex: LibraryExercise) {
    setError(null);
    try {
      await api(`/api/library/exercises/${ex.id}`, { method: "DELETE" });
      await load(query);
    } catch {
      setError("Solo podés eliminar ejercicios propios");
    }
  }

  const inputCls =
    "border border-line bg-elev px-3 py-2 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-fg">Biblioteca de ejercicios</h1>
      <p className="mb-6 font-mono-app text-[11px] tracking-[1.4px] text-fg-ter">
        {exercises.length} EJERCICIOS · BASE + PROPIOS
        {!canEdit && " · SOLO LECTURA (edición reservada a entrenadores)"}
      </p>

      {/* form */}
      {canEdit && (
      <form onSubmit={save} className="mb-6 border border-line bg-card p-4">
        <div className="mb-3 font-mono-app text-[10px] tracking-[1.4px] text-volt">
          {editingId ? "EDITAR EJERCICIO" : "NUEVO EJERCICIO"}
        </div>
        <div className="grid grid-cols-[2fr_1.2fr_1.2fr_auto] gap-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del ejercicio" className={inputCls} />
          <select aria-label="Grupo muscular" value={form.muscleGroup} onChange={e => setForm({ ...form, muscleGroup: e.target.value })} className={inputCls}>
            {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select aria-label="Equipamiento" value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} className={inputCls}>
            {EQUIPMENT.map(eq => <option key={eq} value={eq}>{eq}</option>)}
          </select>
          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(EMPTY); }}
                className="cursor-pointer border border-line px-3 font-mono-app text-[10px] text-fg-sec hover:text-fg"
              >
                CANCELAR
              </button>
            )}
            <button type="submit" className="cursor-pointer bg-volt px-4 py-2 font-mono-app text-[11px] font-extrabold text-ink transition hover:brightness-110">
              {editingId ? "GUARDAR" : "AGREGAR"}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 font-mono-app text-xs text-danger">{error}</div>}
      </form>
      )}

      {/* WorkoutX global database */}
      <WorkoutXSearch canImport={canEdit} onImported={() => load(query)} />

      {/* search */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar ejercicio…"
        className={`mb-4 w-full max-w-90 ${inputCls}`}
      />

      {/* table */}
      <div className="overflow-x-auto border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line font-mono-app text-[9px] tracking-[1.4px] text-fg-ter">
              <th className="px-4 py-3 text-left font-normal">EJERCICIO</th>
              <th className="px-4 py-3 text-left font-normal">GRUPO MUSCULAR</th>
              <th className="px-4 py-3 text-left font-normal">EQUIPAMIENTO</th>
              <th className="px-4 py-3 text-right font-normal">ORIGEN</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => (
              <tr key={ex.id} className="border-b border-line-soft hover:bg-elev">
                <td className="px-4 py-2.5 text-fg">{ex.name}</td>
                <td className={`px-4 py-2.5 font-mono-app text-[11px] ${GROUP_COLORS[ex.muscleGroup] ?? "text-fg-sec"}`}>
                  {ex.muscleGroup}
                </td>
                <td className="px-4 py-2.5 font-mono-app text-[11px] text-fg-mid">{ex.equipment}</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-[10px] text-fg-ter">
                  {ex.createdBy ? <span className="border border-neon px-1.5 py-0.5 text-neon">PROPIO</span> : "base"}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {canEdit && ex.createdBy && (
                    <>
                      <button type="button" onClick={() => startEdit(ex)} className="cursor-pointer font-mono-app text-[10px] text-fg-sec hover:text-volt">
                        EDITAR
                      </button>
                      <button type="button" onClick={() => remove(ex)} className="ml-3 cursor-pointer font-mono-app text-[10px] text-fg-sec hover:text-danger">
                        BORRAR
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {exercises.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center font-mono-app text-xs text-fg-ter">Sin resultados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
