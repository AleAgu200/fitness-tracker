"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../../lib";
import {
  AdminHeader,
  buttonGhost,
  buttonPrimary,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  inputClass,
  Notice,
  Pager,
  Pill,
  relativeTime,
  useAdminData,
  useDebounced,
} from "../ui";

interface CatalogRow {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string;
  gifPath: string;
  edited?: boolean;
  custom: boolean;
  hidden: boolean;
  updatedAt?: number;
}

interface SearchResult {
  exercises: CatalogRow[];
  total: number;
  page: number;
  pageCount: number;
  changes: CatalogRow[];
}

const MUSCLE_GROUPS = ["pecho", "espalda", "piernas", "hombros", "brazos", "core", "full body"];
const EQUIPMENT = ["barra", "mancuernas", "polea", "máquina", "peso corporal", "otro"];
const TARGETS: Record<string, string> = {
  abs: "Abdominales", quads: "Cuádriceps", lats: "Dorsales", calves: "Pantorrillas", pectorals: "Pectorales",
  glutes: "Glúteos", hamstrings: "Isquiotibiales", adductors: "Aductores", triceps: "Tríceps",
  "cardiovascular system": "Sistema cardiovascular", spine: "Espalda baja", "upper back": "Espalda alta",
  biceps: "Bíceps", delts: "Deltoides", forearms: "Antebrazos", traps: "Trapecios",
  "serratus anterior": "Serrato anterior", abductors: "Abductores", "levator scapulae": "Elevador de la escápula",
};

interface Draft {
  id: string | null;
  name: string;
  muscleGroup: string;
  equipment: string;
  target: string;
  secondaryMuscles: string;
  instructions: string;
  mediaPath: string;
  custom: boolean;
}

const EMPTY: Draft = { id: null, name: "", muscleGroup: "pecho", equipment: "barra", target: "pectorals", secondaryMuscles: "", instructions: "", mediaPath: "", custom: true };

function toDraft(row: CatalogRow): Draft {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    target: row.target,
    secondaryMuscles: row.secondaryMuscles.join(", "),
    instructions: row.instructions,
    mediaPath: row.gifPath,
    custom: row.custom,
  };
}

function Media({ path, alt, className }: { path: string; alt: string; className: string }) {
  if (!path) return <div className={`${className} flex items-center justify-center bg-elev font-mono-app text-[9px] text-fg-ter`}>SIN ANIMACIÓN</div>;
  if (!path.endsWith(".mp4")) return <img src={path} alt={alt} loading="lazy" className={`${className} bg-white object-contain`} />;
  return <video src={path} muted loop autoPlay playsInline aria-label={alt} className={`${className} bg-white object-contain`} />;
}

function Editor({ draft, onCancel, onSaved, onDirty }: { draft: Draft; onCancel: () => void; onSaved: (message: string) => void; onDirty: (dirty: boolean) => void }) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(draft);

  useEffect(() => { setForm(draft); setError(null); }, [draft]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      // Not api(): the browser must set the multipart boundary itself.
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const result = await response.json().catch(() => null) as { path?: string; error?: string } | null;
      if (!response.ok || !result?.path) {
        setError(errorMessage(new ApiError(response.status, result), "No se pudo subir el archivo."));
        return;
      }
      set("mediaPath", result.path);
    } catch {
      setError("No se pudo subir el archivo. Revisá tu conexión.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      name: form.name,
      muscleGroup: form.muscleGroup,
      equipment: form.equipment,
      target: form.target,
      secondaryMuscles: form.secondaryMuscles.split(",").map(m => m.trim()).filter(Boolean),
      instructions: form.instructions,
      mediaPath: form.mediaPath || null,
    });
    try {
      if (form.id) await api(`/api/admin/exercises/${form.id}`, { method: "PUT", body });
      else await api("/api/admin/exercises", { method: "POST", body });
      onSaved(form.id ? `“${form.name}” actualizado` : `“${form.name}” agregado al catálogo`);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar. Intentá de nuevo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="food-panel-enter space-y-4 border border-neon/40 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono-app text-[11px] tracking-[1.4px] text-neon">{form.id ? (form.custom ? "EDITAR EJERCICIO PROPIO" : "EDITAR EJERCICIO DEL CATÁLOGO") : "NUEVO EJERCICIO"}</h2>
        {!form.custom && <span className="text-xs text-fg-sec">Los cambios se guardan aparte; podés restaurar el original.</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <div>
          <Media path={form.mediaPath} alt={form.name || "Animación"} className="aspect-square w-full border border-line" />
          <input ref={fileRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg,video/mp4" className="sr-only" id="exercise-media" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          <label htmlFor="exercise-media" className={`${buttonGhost} mt-2 block text-center ${uploading ? "pointer-events-none opacity-50" : ""}`}>
            {uploading ? "SUBIENDO…" : form.mediaPath ? "CAMBIAR ANIMACIÓN" : "SUBIR ANIMACIÓN"}
          </label>
          <p className="mt-1.5 text-[11px] leading-4 text-fg-ter">GIF, WebP, MP4, PNG o JPG · hasta 15 MB · fondo claro, el movimiento completo en bucle.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">NOMBRE *</span>
            <input required maxLength={120} value={form.name} onChange={event => set("name", event.target.value)} className={inputClass} placeholder="Ej.: Sentadilla búlgara con mancuernas" />
          </label>
          <label>
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">GRUPO MUSCULAR *</span>
            <select value={form.muscleGroup} onChange={event => set("muscleGroup", event.target.value)} className={inputClass}>
              {MUSCLE_GROUPS.map(group => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">EQUIPO *</span>
            <select value={form.equipment} onChange={event => set("equipment", event.target.value)} className={inputClass}>
              {EQUIPMENT.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">MÚSCULO PRINCIPAL</span>
            <select value={form.target} onChange={event => set("target", event.target.value)} className={inputClass}>
              {Object.entries(TARGETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">MÚSCULOS SECUNDARIOS</span>
            <input value={form.secondaryMuscles} onChange={event => set("secondaryMuscles", event.target.value)} className={inputClass} placeholder="glutes, hamstrings" />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">TÉCNICA (LA VE EL ATLETA)</span>
            <textarea rows={5} maxLength={4000} value={form.instructions} onChange={event => set("instructions", event.target.value)} className={inputClass} placeholder="Posición inicial, ejecución, respiración y errores comunes." />
          </label>
        </div>
      </div>
      {error && <div role="alert" className="text-sm text-danger">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonGhost}>{dirty ? "DESCARTAR CAMBIOS" : "CERRAR"}</button>
        <button type="submit" disabled={saving || uploading || !dirty} className={buttonPrimary}>{saving ? "GUARDANDO…" : form.id ? "GUARDAR CAMBIOS" : "AGREGAR AL CATÁLOGO"}</button>
      </div>
    </form>
  );
}

export default function AdminExercisesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ row: CatalogRow; kind: "hide" | "show" | "revert" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorDirty = useRef(false);
  const query = useDebounced(q);
  useEffect(() => { setPage(1); }, [query]);

  const { data, error, loading, reload } = useAdminData<SearchResult>(`/api/admin/exercises?${new URLSearchParams({ q: query, page: String(page) })}`);

  async function applyConfirm() {
    if (!confirm) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/admin/exercises/${confirm.row.id}`, {
        method: "PATCH",
        body: JSON.stringify(confirm.kind === "revert" ? { revert: true } : { hidden: confirm.kind === "hide" }),
      });
      setNotice(confirm.kind === "hide" ? "Ejercicio oculto del catálogo" : confirm.kind === "show" ? "Ejercicio visible de nuevo" : "Ejercicio restaurado al original");
      setConfirm(null);
      await reload();
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo aplicar el cambio."));
    } finally {
      setBusy(false);
    }
  }

  const setEditorDirty = useCallback((dirty: boolean) => { editorDirty.current = dirty; }, []);

  function openEditor(next: Draft) {
    if (draft && editorDirty.current && !window.confirm("Tenés cambios sin guardar en el ejercicio abierto. ¿Descartarlos?")) return;
    setDraft(next);
  }

  const searching = query.trim().length >= 2;

  return (
    <div>
      <AdminHeader
        eyebrow="CATÁLOGO"
        title="Catálogo de ejercicios"
        description="El catálogo con animación que usan los profesionales y la generación de planes. Editá, ocultá o agregá ejercicios; los planes ya asignados conservan su copia."
        actions={<button type="button" onClick={() => openEditor(EMPTY)} className={buttonPrimary}>+ NUEVO EJERCICIO</button>}
      />
      <div className="space-y-5 px-5 py-6 md:px-8">
        {draft && <Editor draft={draft} onDirty={setEditorDirty} onCancel={() => setDraft(null)} onSaved={message => { setDraft(null); setNotice(message); void reload(); }} />}

        <input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar en 1300+ ejercicios: “sentadilla”, “tríceps polea”…" aria-label="Buscar ejercicios" className={`${inputClass} max-w-xl`} />
        {error && <ErrorBanner message={error} onRetry={reload} />}

        {searching && data && (
          <section aria-label="Resultados">
            <div className="mb-2 font-mono-app text-[10px] text-fg-ter">{data.total} RESULTADOS{loading ? " · BUSCANDO…" : ""}</div>
            {data.exercises.length === 0 ? <EmptyState title="Sin resultados" body="Probá con otro término o creá el ejercicio." /> : (
              <ul className="grid gap-2 md:grid-cols-2">
                {data.exercises.map(row => (
                  <li key={row.id} className="flex gap-3 border border-line bg-card p-2.5">
                    <Media path={row.gifPath} alt={row.name} className="h-20 w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-fg">{row.name}</span>
                        {row.custom && <Pill tone="info">PROPIO</Pill>}
                        {row.edited && !row.custom && <Pill tone="warn">EDITADO</Pill>}
                      </div>
                      <div className="mt-0.5 text-xs text-fg-sec">{row.muscleGroup} · {row.equipment} · {TARGETS[row.target] ?? row.target}</div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => openEditor(toDraft(row))} className="cursor-pointer font-mono-app text-[10px] text-neon hover:underline">EDITAR</button>
                        <button type="button" onClick={() => { setActionError(null); setConfirm({ row, kind: "hide" }); }} className="cursor-pointer font-mono-app text-[10px] text-fg-sec hover:text-danger">OCULTAR</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} />
          </section>
        )}

        <section aria-labelledby="changes-heading">
          <h2 id="changes-heading" className="mb-2 font-mono-app text-[11px] tracking-[1.6px] text-fg-sec">CAMBIOS DEL EQUIPO PULSO</h2>
          {data && data.changes.length === 0 && <p className="text-sm text-fg-ter">El catálogo está como se importó. Lo que agregues, edites u ocultes aparece aquí.</p>}
          {data && data.changes.length > 0 && (
            <ul className="divide-y divide-line-soft border border-line">
              {data.changes.map(row => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Media path={row.gifPath} alt={row.name} className={`h-12 w-12 shrink-0 ${row.hidden ? "opacity-40" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-sm ${row.hidden ? "text-fg-ter line-through" : "text-fg"}`}>{row.name}</span>
                      {row.custom ? <Pill tone="info">PROPIO</Pill> : row.hidden ? <Pill tone="danger">OCULTO</Pill> : <Pill tone="warn">EDITADO</Pill>}
                    </div>
                    <div className="text-xs text-fg-sec">{row.muscleGroup} · {row.equipment} · {relativeTime(row.updatedAt)}</div>
                  </div>
                  <div className="flex gap-3 font-mono-app text-[10px]">
                    {!row.hidden && <button type="button" onClick={() => openEditor(toDraft(row))} className="cursor-pointer text-neon hover:underline">EDITAR</button>}
                    <button type="button" onClick={() => { setActionError(null); setConfirm({ row, kind: row.hidden ? "show" : "hide" }); }} className="cursor-pointer text-fg-sec hover:text-fg">{row.hidden ? "MOSTRAR" : "OCULTAR"}</button>
                    {!row.custom && <button type="button" onClick={() => { setActionError(null); setConfirm({ row, kind: "revert" }); }} className="cursor-pointer text-fg-sec hover:text-warn">RESTAURAR</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "hide" ? `Ocultar “${confirm.row.name}”` : confirm.kind === "show" ? `Mostrar “${confirm.row.name}”` : `Restaurar “${confirm.row.name}”`}
          body={confirm.kind === "hide"
            ? "Deja de aparecer en la búsqueda de los profesionales y en los planes generados. Los planes que ya lo usan no cambian."
            : confirm.kind === "show" ? "Vuelve a aparecer en la búsqueda y en la generación de planes."
              : "Se descartan tus cambios y vuelve el nombre, la técnica y la animación originales."}
          confirmLabel={confirm.kind === "hide" ? "OCULTAR" : confirm.kind === "show" ? "MOSTRAR" : "RESTAURAR"}
          danger={confirm.kind !== "show"}
          busy={busy}
          error={actionError}
          onConfirm={() => void applyConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
