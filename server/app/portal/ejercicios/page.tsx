"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, EQUIPMENT, LibraryExercise, MUSCLE_GROUPS } from "../lib";
import { usePortalUser } from "../portal-context";

interface CatalogResult {
  id: string; name: string; target: string; equipment: string; muscleGroup: string;
  instructions: string; imagePath: string; gifPath: string;
}
interface CatalogResponse {
  exercises: CatalogResult[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
interface ExerciseForm { name: string; muscleGroup: string; equipment: string; instructions: string }

const EMPTY: ExerciseForm = { name: "", muscleGroup: "pecho", equipment: "barra", instructions: "" };
const inputClass = "border border-line bg-elev px-3 py-2.5 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";
const GROUP_COLORS: Record<string, string> = {
  pecho: "text-danger", espalda: "text-neon", piernas: "text-volt", hombros: "text-warn",
  brazos: "text-fg-mid", core: "text-neon", "full body": "text-volt",
};

export default function EjerciciosPage() {
  const { user } = usePortalUser();
  const canEdit = user.role === "coach";
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"library" | "catalog">("library");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [source, setSource] = useState("all");
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ exercises: LibraryExercise[] }>("/api/library/exercises");
      setExercises(result.exercises);
    } catch { setMessage("No se pudo cargar la biblioteca"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => exercises.filter(exercise => {
    const text = query.trim().toLocaleLowerCase("es");
    return (!text || `${exercise.name} ${exercise.instructions ?? ""}`.toLocaleLowerCase("es").includes(text))
      && (group === "all" || exercise.muscleGroup === group)
      && (equipment === "all" || exercise.equipment === equipment)
      && (source === "all" || exercise.source === source);
  }), [exercises, query, group, equipment, source]);
  const stats = useMemo(() => ({
    total: exercises.length,
    own: exercises.filter(exercise => exercise.createdBy === user.id).length,
    imported: exercises.filter(exercise => exercise.source === "workoutx").length,
    groups: new Set(exercises.map(exercise => exercise.muscleGroup)).size,
  }), [exercises, user.id]);

  function startCreate() { setEditingId(null); setForm(EMPTY); setShowForm(true); setMessage(null); }
  function startEdit(exercise: LibraryExercise) {
    setEditingId(exercise.id);
    setForm({ name: exercise.name, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment, instructions: exercise.instructions ?? "" });
    setShowForm(true); setMessage(null); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setMessage(null);
    try {
      const body = JSON.stringify({ ...form, name: form.name.trim() });
      if (editingId) await api(`/api/library/exercises/${editingId}`, { method: "PUT", body });
      else await api("/api/library/exercises", { method: "POST", body });
      const wasEditing = Boolean(editingId);
      setShowForm(false); setEditingId(null); setForm(EMPTY);
      await load(); setMessage(wasEditing ? "Ejercicio actualizado" : "Ejercicio agregado a tu biblioteca");
    } catch { setMessage(editingId ? "Solo podés editar ejercicios creados por vos" : "No se pudo guardar el ejercicio"); }
    finally { setSaving(false); }
  }
  async function remove(exercise: LibraryExercise) {
    setMessage(null);
    try {
      await api(`/api/library/exercises/${exercise.id}`, { method: "DELETE" });
      setPendingDeleteId(null); await load(); setMessage("Ejercicio eliminado");
    } catch { setMessage("Solo podés eliminar ejercicios creados por vos"); }
  }

  const hasFilters = Boolean(query || group !== "all" || equipment !== "all" || source !== "all");
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 font-mono-app text-[10px] tracking-[1.8px] text-volt">CATÁLOGO DE ENTRENAMIENTO</div><h1 className="text-2xl font-semibold text-fg">Biblioteca de ejercicios</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-fg-sec">Organizá movimientos base, variantes propias e importaciones sin perder instrucciones ni procedencia.</p></div>
        {canEdit && <button type="button" onClick={startCreate} className="w-fit cursor-pointer bg-volt px-5 py-3 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink hover:brightness-110">+ NUEVO EJERCICIO</button>}
      </header>

      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="TOTAL" value={stats.total} /><Stat label="PROPIOS" value={stats.own} /><Stat label="WORKOUTX" value={stats.imported} /><Stat label="GRUPOS" value={stats.groups} />
      </div>

      {showForm && canEdit && <ExerciseEditor form={form} editing={Boolean(editingId)} saving={saving} onChange={setForm} onSave={save} onCancel={() => { setShowForm(false); setEditingId(null); }} />}

      <div className="mb-4 flex border-b border-line" role="tablist" aria-label="Fuente de ejercicios">
        <Tab active={view === "library"} onClick={() => setView("library")}>MI BIBLIOTECA</Tab>
        <Tab active={view === "catalog"} onClick={() => setView("catalog")}>EXPLORAR CATÁLOGO</Tab>
      </div>
      {message && <div role="status" className={`mb-4 border px-4 py-3 font-mono-app text-[11px] ${message.startsWith("No") || message.startsWith("Solo") ? "border-danger/50 text-danger" : "border-neon/40 text-neon"}`}>{message}</div>}

      {view === "catalog" ? <CatalogExplorer canImport={canEdit} onImported={load} /> : <>
        <div className="mb-4 grid gap-2 border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto]">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o indicación…" className={inputClass} />
          <Filter label="Grupo" value={group} onChange={setGroup} options={MUSCLE_GROUPS} />
          <Filter label="Equipo" value={equipment} onChange={setEquipment} options={EQUIPMENT} />
          <Filter label="Origen" value={source} onChange={setSource} options={["base", "custom", "workoutx"]} />
          {hasFilters && <button type="button" onClick={() => { setQuery(""); setGroup("all"); setEquipment("all"); setSource("all"); }} className="cursor-pointer px-3 font-mono-app text-[9px] text-fg-ter hover:text-volt">LIMPIAR</button>}
        </div>
        <div className="mb-2 flex justify-between font-mono-app text-[9px] tracking-[1px] text-fg-ter"><span>{filtered.length} RESULTADOS</span>{!canEdit && <span>SOLO LECTURA PARA NUTRICIÓN</span>}</div>
        {loading ? <ExerciseSkeleton /> : <ExerciseList exercises={filtered} userId={user.id} canEdit={canEdit} expandedId={expandedId} pendingDeleteId={pendingDeleteId} onExpand={id => setExpandedId(expandedId === id ? null : id)} onEdit={startEdit} onAskDelete={setPendingDeleteId} onDelete={remove} />}
      </>}
    </div>
  );
}

function ExerciseEditor({ form, editing, saving, onChange, onSave, onCancel }: { form: ExerciseForm; editing: boolean; saving: boolean; onChange: (form: ExerciseForm) => void; onSave: (event: React.FormEvent) => void; onCancel: () => void }) {
  return <form onSubmit={onSave} className="mb-6 border border-volt/50 bg-card p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between"><div><div className="font-mono-app text-[10px] tracking-[1.4px] text-volt">{editing ? "EDITAR EJERCICIO" : "CREAR EJERCICIO PROPIO"}</div><p className="mt-1 text-xs text-fg-ter">Incluí una indicación breve para reutilizar el movimiento al armar planes.</p></div><button type="button" onClick={onCancel} className="cursor-pointer px-2 py-1 text-fg-ter hover:text-fg" aria-label="Cerrar formulario">×</button></div>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <label><FieldLabel>NOMBRE</FieldLabel><input autoFocus required maxLength={120} value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="Ej. Sentadilla goblet con pausa" className={`w-full ${inputClass}`} /></label>
      <label><FieldLabel>GRUPO</FieldLabel><select value={form.muscleGroup} onChange={event => onChange({ ...form, muscleGroup: event.target.value })} className={`w-full ${inputClass}`}>{MUSCLE_GROUPS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><FieldLabel>EQUIPAMIENTO</FieldLabel><select value={form.equipment} onChange={event => onChange({ ...form, equipment: event.target.value })} className={`w-full ${inputClass}`}>{EQUIPMENT.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="md:col-span-2 lg:col-span-3"><FieldLabel>INDICACIONES TÉCNICAS</FieldLabel><textarea rows={3} maxLength={2000} value={form.instructions} onChange={event => onChange({ ...form, instructions: event.target.value })} placeholder="Posición inicial, recorrido, respiración y errores a evitar." className={`w-full resize-y ${inputClass}`} /></label>
    </div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className="cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[10px] text-fg-sec hover:text-fg">CANCELAR</button><button type="submit" disabled={saving} className="cursor-pointer bg-volt px-5 py-2.5 font-mono-app text-[10px] font-extrabold text-ink disabled:opacity-60">{saving ? "GUARDANDO…" : editing ? "GUARDAR CAMBIOS" : "AGREGAR A BIBLIOTECA"}</button></div>
  </form>;
}

const CATALOG_PAGE_SIZE = 10;

function CatalogExplorer({ canImport, onImported }: { canImport: boolean; onImported: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [note, setNote] = useState("Escribí al menos 2 caracteres. Podés buscar por nombre, músculo u equipo.");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setTotal(0);
      setPageCount(0);
      setNote("Escribí al menos 2 caracteres. Podés buscar por nombre, músculo u equipo.");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setNote("");
      try {
        const response = await api<CatalogResponse>(`/api/exercise-catalog/search?q=${encodeURIComponent(term)}&page=${page}&pageSize=${CATALOG_PAGE_SIZE}`, { signal: controller.signal });
        setResults(response.exercises);
        setTotal(response.total);
        setPage(response.page);
        setPageCount(response.pageCount);
        if (!response.total) setNote("No encontramos movimientos con esa búsqueda.");
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setTotal(0);
          setPageCount(0);
          setNote("El catálogo visual no está disponible en este momento.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, query]);

  async function importExercise(result: CatalogResult) {
    setImportingId(result.id);
    setNote("");
    try {
      const response = await api<{ duplicate?: boolean }>("/api/library/exercises", {
        method: "POST",
        body: JSON.stringify({
          name: result.name,
          muscleGroup: result.muscleGroup,
          equipment: result.equipment,
          instructions: result.instructions,
          source: "workoutx",
          externalId: `catalog:${result.id}`,
          mediaUrl: result.gifPath,
        }),
      });
      await onImported();
      setNote(response.duplicate ? `“${result.name}” ya estaba en tu biblioteca.` : `“${result.name}” se agregó con su GIF e instrucciones.`);
    } catch {
      setNote("No se pudo importar el ejercicio.");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="border border-line bg-card p-4 sm:p-5">
      <div className="mb-4">
        <div className="font-mono-app text-[10px] tracking-[1.3px] text-neon">PULSO · CATÁLOGO VISUAL</div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-sec">Buscá por movimiento, músculo o equipo. Los resultados incluyen GIF e instrucciones y se pueden importar a tu biblioteca.</p>
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={event => { setQuery(event.target.value); setPage(1); }}
          placeholder="Ej. tríceps, polea, press de banca…"
          className={`w-full pr-24 ${inputClass}`}
        />
        {searching && <span className="absolute right-3 top-3 font-mono-app text-[9px] text-fg-ter">BUSCANDO…</span>}
      </div>
      {note && <div role="status" className="mt-3 font-mono-app text-[10px] leading-5 text-fg-sec">{note}</div>}
      {total > 0 && (
        <div className="mt-3 flex items-center justify-between font-mono-app text-[9px] tracking-[0.8px] text-fg-ter">
          <span>{total} RESULTADOS</span>
          <span>PÁGINA {page} DE {pageCount}</span>
        </div>
      )}
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {results.map(result => (
          <article key={result.id} className="flex flex-col justify-between gap-4 border border-line-soft bg-elev p-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-fg">{result.name}</h3>
              <p className="mt-1 font-mono-app text-[9px] text-fg-ter">{result.muscleGroup.toUpperCase()} · {result.equipment.toUpperCase()} · {result.target}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a href={result.gifPath} target="_blank" rel="noreferrer" className="border border-line px-3 py-2 font-mono-app text-[9px] text-fg-sec transition-colors duration-150 hover:border-neon hover:text-neon motion-reduce:transition-none">VISTA PREVIA</a>
              {canImport && <button type="button" disabled={importingId === result.id} onClick={() => importExercise(result)} className="cursor-pointer border border-volt px-3 py-2 font-mono-app text-[9px] font-bold text-volt transition-colors duration-150 hover:bg-volt hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">{importingId === result.id ? "IMPORTANDO…" : "IMPORTAR"}</button>}
            </div>
          </article>
        ))}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Páginas de resultados" className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
          <button type="button" disabled={page === 1 || searching} onClick={() => setPage(current => Math.max(1, current - 1))} className="cursor-pointer border border-line px-4 py-2 font-mono-app text-[9px] text-fg-mid transition-colors duration-150 hover:border-volt hover:text-volt disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">← ANTERIOR</button>
          <span className="font-mono-app text-[9px] text-fg-ter">{(page - 1) * CATALOG_PAGE_SIZE + 1}–{Math.min(page * CATALOG_PAGE_SIZE, total)} DE {total}</span>
          <button type="button" disabled={page === pageCount || searching} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="cursor-pointer border border-line px-4 py-2 font-mono-app text-[9px] text-fg-mid transition-colors duration-150 hover:border-volt hover:text-volt disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">SIGUIENTE →</button>
        </nav>
      )}
    </div>
  );
}

type ListProps = { exercises: LibraryExercise[]; userId: string; canEdit: boolean; expandedId: string | null; pendingDeleteId: string | null; onExpand: (id: string) => void; onEdit: (exercise: LibraryExercise) => void; onAskDelete: (id: string | null) => void; onDelete: (exercise: LibraryExercise) => void };
function ExerciseList(props: ListProps) {
  if (!props.exercises.length) return <div className="border border-dashed border-line p-10 text-center"><div className="text-sm text-fg-sec">No hay ejercicios que coincidan.</div><div className="mt-2 font-mono-app text-[10px] text-fg-ter">AJUSTÁ LOS FILTROS O CREÁ UNA VARIANTE PROPIA</div></div>;
  return <div className="overflow-hidden border border-line bg-card">{props.exercises.map(exercise => {
    const own = exercise.createdBy === props.userId; const expanded = props.expandedId === exercise.id;
    return <article key={exercise.id} className="border-b border-line-soft last:border-b-0"><div className="grid items-center gap-3 p-3 sm:grid-cols-[minmax(180px,2fr)_1fr_1fr_auto] sm:px-4"><button type="button" onClick={() => props.onExpand(exercise.id)} className="min-w-0 cursor-pointer text-left"><span className="block truncate text-sm font-medium text-fg">{exercise.name}</span><span className="mt-1 block font-mono-app text-[9px] text-fg-ter">{sourceLabel(exercise.source, own)}</span></button><span className={`font-mono-app text-[10px] ${GROUP_COLORS[exercise.muscleGroup] ?? "text-fg-sec"}`}>{exercise.muscleGroup.toUpperCase()}</span><span className="font-mono-app text-[10px] text-fg-mid">{exercise.equipment.toUpperCase()}</span><div className="flex justify-end gap-3">{props.canEdit && own && <><button type="button" onClick={() => props.onEdit(exercise)} className="cursor-pointer font-mono-app text-[9px] text-fg-sec hover:text-volt">EDITAR</button><button type="button" onClick={() => props.onAskDelete(exercise.id)} className="cursor-pointer font-mono-app text-[9px] text-fg-sec hover:text-danger">BORRAR</button></>}<button type="button" onClick={() => props.onExpand(exercise.id)} aria-expanded={expanded} className="cursor-pointer font-mono-app text-[9px] text-fg-ter hover:text-fg">{expanded ? "CERRAR" : "DETALLE"}</button></div></div>{props.pendingDeleteId === exercise.id && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-danger/30 bg-danger/5 px-4 py-3"><span className="text-xs text-danger">¿Eliminar “{exercise.name}”? Esta acción no se puede deshacer.</span><div className="flex gap-2"><button type="button" onClick={() => props.onAskDelete(null)} className="cursor-pointer px-3 py-1.5 font-mono-app text-[9px] text-fg-sec">CANCELAR</button><button type="button" onClick={() => props.onDelete(exercise)} className="cursor-pointer bg-danger px-3 py-1.5 font-mono-app text-[9px] font-bold text-ink">CONFIRMAR</button></div></div>}{expanded && <div className="grid gap-4 border-t border-line-soft bg-elev px-4 py-4 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">INDICACIONES</div><p role="region" aria-label={`Indicaciones de ${exercise.name}`} tabIndex={0} className="mt-2 max-h-48 max-w-3xl overflow-y-auto overscroll-contain whitespace-pre-wrap pr-3 text-sm leading-6 text-fg-sec [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt">{exercise.instructions || "Todavía no hay indicaciones técnicas para este movimiento."}</p></div>{exercise.mediaUrl && <a href={exercise.mediaUrl} target="_blank" rel="noreferrer" className="h-fit border border-neon px-3 py-2 font-mono-app text-[9px] text-neon">VER REFERENCIA VISUAL ↗</a>}</div>}</article>;
  })}</div>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="border border-line bg-card p-4"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">{label}</div><div className="mt-2 text-2xl font-semibold text-fg">{value}</div></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`cursor-pointer border-b-2 px-4 py-3 font-mono-app text-[10px] tracking-[1px] ${active ? "border-volt text-volt" : "border-transparent text-fg-ter hover:text-fg"}`}>{children}</button>; }
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[] }) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className={inputClass}><option value="all">{label}: todos</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>; }
function FieldLabel({ children }: { children: React.ReactNode }) { return <span className="mb-1.5 block font-mono-app text-[9px] text-fg-ter">{children}</span>; }
function sourceLabel(source: string, own: boolean) { if (source === "workoutx") return "WORKOUTX · IMPORTADO"; if (own) return "PROPIO · EDITABLE"; return "CATÁLOGO BASE"; }
function ExerciseSkeleton() { return <div className="animate-pulse border border-line bg-card">{[1, 2, 3, 4, 5].map(value => <div key={value} className="grid grid-cols-4 gap-4 border-b border-line-soft p-4"><span className="h-4 bg-elev" /><span className="h-4 bg-elev" /><span className="h-4 bg-elev" /><span className="h-4 bg-elev" /></div>)}</div>; }
