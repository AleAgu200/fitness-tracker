"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { api, Athlete, LibraryExercise } from "./lib";

interface Row {
  nombre: string;
  target: string;
  reps: string;
  peso: string;
  step: string;
  restSeconds: string;
  instructions: string | null;
  gifPath: string | null;
}

interface ExerciseOption {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  instructions: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  origin: "catalog" | "library" | "assigned";
}

interface CatalogExerciseResult {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  instructions: string;
  imagePath: string;
  gifPath: string;
}

interface CatalogSearchResponse {
  exercises: CatalogExerciseResult[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface WorkoutAssignment {
  version: number;
  payload: { coachName: string; exercises: { nombre: string; target: number; reps: number; peso: number; step: number; restSeconds: number; instructions?: string | null; gifPath?: string | null }[] };
  createdAt: number;
}

const NEW_ROW: Row = {
  nombre: "",
  target: "3",
  reps: "8",
  peso: "0",
  step: "2.5",
  restSeconds: "90",
  instructions: null,
  gifPath: null,
};

const RESULTS_PER_PAGE = 5;

const inputCls =
  "w-full min-w-0 border border-line bg-elev px-2 py-1.5 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function instructionSteps(value: string | null): string[] {
  if (!value?.trim()) return [];
  return (value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value])
    .map(step => step.trim())
    .filter(Boolean);
}

function ExerciseCombobox({ value, instructions, gifPath, exercises, onChange, rowIndex }: {
  value: string;
  instructions: string | null;
  gifPath: string | null;
  exercises: LibraryExercise[];
  onChange: (exercise: ExerciseOption | null) => void;
  rowIndex: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalogResults, setCatalogResults] = useState<CatalogExerciseResult[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPageCount, setCatalogPageCount] = useState(0);
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const selected = exercises.find(exercise => exercise.name === value) ?? null;
  const options = useMemo(() => {
    const term = normalized(query.trim());
    const visibleCatalogResults = catalogQuery === query.trim() ? catalogResults : [];
    const catalogOptions: ExerciseOption[] = visibleCatalogResults.map(exercise => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      instructions: exercise.instructions,
      mediaUrl: exercise.gifPath,
      thumbnailUrl: exercise.imagePath,
      origin: "catalog",
    }));
    const libraryOptions: ExerciseOption[] = exercises
      .filter(exercise => !term || normalized(
        `${exercise.name} ${exercise.muscleGroup} ${exercise.equipment} ${exercise.instructions ?? ""}`,
      ).includes(term))
      .map(exercise => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        instructions: exercise.instructions ?? (exercise.name === value ? instructions : null),
        mediaUrl: exercise.mediaUrl ?? (exercise.name === value ? gifPath : null),
        thumbnailUrl: null,
        origin: "library",
      }));
    const searchedCatalog = query.trim().length >= 2 && catalogQuery === query.trim() && catalogTotal > 0;
    const candidates = searchedCatalog
      ? catalogOptions
      : [...catalogOptions, ...libraryOptions];
    const seen = new Set<string>();
    const combined = candidates.filter(exercise => {
      const key = normalized(exercise.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!searchedCatalog && value && !exercises.some(exercise => exercise.name === value) && (!term || normalized(value).includes(term))) {
      const alreadyIncluded = combined.some(exercise => normalized(exercise.name) === normalized(value));
      if (!alreadyIncluded) {
        combined.unshift({ id: `assigned-${value}`, name: value, muscleGroup: "plan actual", equipment: "sin datos", instructions, mediaUrl: gifPath, thumbnailUrl: null, origin: "assigned" });
      }
    }
    return combined;
  }, [catalogQuery, catalogResults, catalogTotal, exercises, gifPath, instructions, query, value]);
  const activeOption = options[Math.min(activeIndex, Math.max(0, options.length - 1))] ?? null;
  const safeActiveIndex = activeOption ? options.indexOf(activeOption) : 0;
  const steps = instructionSteps(activeOption?.instructions ?? null);
  const serverPaginated = query.trim().length >= 2 && catalogQuery === query.trim() && catalogTotal > 0;
  const pageCount = serverPaginated ? catalogPageCount : Math.max(1, Math.ceil(options.length / RESULTS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = serverPaginated ? 0 : safePage * RESULTS_PER_PAGE;
  const visibleOptions = serverPaginated ? options : options.slice(pageStart, pageStart + RESULTS_PER_PAGE);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      setCatalogResults([]);
      setCatalogQuery("");
      setCatalogLoading(false);
      setCatalogError(false);
      setCatalogTotal(0);
      setCatalogPageCount(0);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      setCatalogError(false);
      api<CatalogSearchResponse>(`/api/exercise-catalog/search?q=${encodeURIComponent(term)}&page=${page + 1}&pageSize=${RESULTS_PER_PAGE}`, { signal: controller.signal })
        .then(response => {
          setCatalogResults(response.exercises);
          setCatalogQuery(term);
          setCatalogTotal(response.total);
          setCatalogPageCount(response.pageCount);
          if (response.page - 1 !== page) setPage(response.page - 1);
          setActiveIndex(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCatalogResults([]);
            setCatalogQuery(term);
            setCatalogTotal(0);
            setCatalogPageCount(0);
            setCatalogError(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, page, query]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function reveal(index: number) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`${listId}-option-${index}`)?.scrollIntoView({ block: "nearest" });
      });
    });
  }

  function choose(exercise: ExerciseOption | null) {
    onChange(exercise);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setPage(0);
    setFailedMediaId(null);
  }

  function openSearch() {
    setOpen(true);
    setQuery(value);
    const selectedIndex = exercises.findIndex(exercise => exercise.name === value);
    setActiveIndex(Math.max(0, selectedIndex));
    setPage(0);
    setFailedMediaId(null);
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${open ? "z-30" : "z-0"}`}>
      <label htmlFor={inputId} className="sr-only">Ejercicio de la fila {rowIndex + 1}</label>
      <div className={`group flex h-[38px] items-center border bg-elev transition-colors duration-150 motion-reduce:transition-none ${open ? "border-volt" : "border-line hover:border-fg-ter"}`}>
        <svg aria-hidden viewBox="0 0 20 20" className={`ml-2.5 h-4 w-4 shrink-0 ${open ? "text-volt" : "text-fg-ter"}`} fill="none">
          <circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeOption ? `${listId}-option-${safeActiveIndex}` : undefined}
          value={open ? query : value}
          placeholder="Buscar ejercicio…"
          autoComplete="off"
          onFocus={openSearch}
          onClick={() => { if (!open) openSearch(); }}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); setPage(0); }}
          onBlur={event => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
              setOpen(false);
              setQuery("");
            }
          }}
          onKeyDown={event => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (serverPaginated && safeActiveIndex >= options.length - 1 && safePage < pageCount - 1) {
                setPage(safePage + 1);
                setActiveIndex(0);
                setFailedMediaId(null);
                return;
              }
              const next = Math.min(safeActiveIndex + 1, options.length - 1);
              const safeNext = Math.max(0, next);
              setOpen(true); setActiveIndex(safeNext);
              if (!serverPaginated) setPage(Math.floor(safeNext / RESULTS_PER_PAGE));
              reveal(safeNext);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (serverPaginated && safeActiveIndex === 0 && safePage > 0) {
                setPage(safePage - 1);
                setActiveIndex(RESULTS_PER_PAGE - 1);
                setFailedMediaId(null);
                return;
              }
              const next = Math.max(safeActiveIndex - 1, 0);
              setOpen(true); setActiveIndex(next);
              if (!serverPaginated) setPage(Math.floor(next / RESULTS_PER_PAGE));
              reveal(next);
            } else if (event.key === "Enter" && open && activeOption) {
              event.preventDefault(); choose(activeOption);
            } else if (event.key === "Escape") {
              event.preventDefault(); setOpen(false); setQuery("");
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-fg placeholder:text-fg-sec focus:outline-none"
        />
        {value && !open ? (
          <button
            type="button"
            onClick={() => choose(null)}
            className="mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-fg-ter transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-danger motion-reduce:transition-none"
            aria-label={`Quitar ${value}`}
          >
            <span aria-hidden>×</span>
          </button>
        ) : (
          <svg aria-hidden viewBox="0 0 16 16" className={`mr-2.5 h-4 w-4 shrink-0 text-fg-ter transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {open && (
        <div className="exercise-combobox-enter absolute left-0 top-[calc(100%+4px)] w-[min(740px,calc(100vw-2rem))] overflow-hidden border border-line bg-card max-md:max-h-[70vh] max-md:overflow-y-auto">
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2 font-mono-app text-[9px] tracking-[0.8px] text-fg-sec">
            <span>{catalogLoading ? "BUSCANDO EN EL CATÁLOGO…" : `${serverPaginated ? catalogTotal : options.length} ${(serverPaginated ? catalogTotal : options.length) === 1 ? "RESULTADO" : "RESULTADOS"}`}</span>
            {query && <span className="max-w-[55%] truncate text-fg-sec">“{query}”</span>}
          </div>

          <div className="grid h-[440px] grid-cols-[300px_minmax(380px,1fr)] overflow-hidden max-md:h-auto max-md:grid-cols-1 max-md:overflow-visible">
            <div className="flex h-full min-h-0 flex-col border-r border-line-soft max-md:border-r-0 max-md:border-b">
              <div className="border-b border-line-soft px-3 py-2 text-[11px] leading-4 text-fg-sec">
                Elegí un resultado para revisar su técnica.
              </div>
              <div id={listId} role="listbox" aria-label="Ejercicios disponibles" className="min-h-0 flex-1 overflow-hidden py-1">
                {options.length ? visibleOptions.map((exercise, pageIndex) => {
                  const index = serverPaginated ? pageIndex : pageStart + pageIndex;
                  const active = index === safeActiveIndex;
                  const isSelected = exercise.name === value;
                  return (
                    <div
                      key={`${exercise.origin}-${exercise.id}`}
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => { setActiveIndex(index); setFailedMediaId(null); }}
                      className={`flex min-h-16 w-full cursor-pointer items-center gap-3 px-2.5 py-2 text-left transition-colors duration-150 focus:outline-none motion-reduce:transition-none ${active ? "bg-elev" : "hover:bg-elev/60"}`}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-ink">
                        {exercise.thumbnailUrl ? (
                          // Static thumbnails keep list navigation stable; only the chosen preview plays a GIF.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={exercise.thumbnailUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : (
                          <span className={`flex h-6 w-6 items-center justify-center border font-mono-app text-[9px] ${isSelected ? "border-volt bg-volt text-ink" : active ? "border-neon text-neon" : "border-line text-fg-ter"}`} aria-hidden>
                            {isSelected ? "✓" : "▶"}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-medium ${active ? "text-fg" : "text-fg-mid"}`}>{exercise.name}</span>
                        <span className="mt-0.5 flex items-center gap-2 font-mono-app text-[8px] uppercase text-fg-sec">
                          <span className="truncate">{exercise.equipment}</span>
                          {exercise.mediaUrl && <span className="shrink-0 text-neon">GIF</span>}
                        </span>
                      </span>
                      <span className={`h-2 w-2 shrink-0 ${active ? "bg-neon" : isSelected ? "bg-volt" : "bg-line"}`} aria-hidden />
                    </div>
                  );
                }) : (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-fg-sec">{catalogError ? "No pudimos consultar el catálogo" : "No encontramos ese ejercicio"}</p>
                    <p className="mt-1.5 font-mono-app text-[9px] leading-4 text-fg-sec">
                      {catalogError ? "REVISÁ TU CONEXIÓN E INTENTÁ DE NUEVO" : "PROBÁ CON OTRO NOMBRE, GRUPO O EQUIPO"}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex min-h-10 items-center justify-between gap-2 border-t border-line-soft px-2.5 font-mono-app text-[8px] text-fg-sec">
                <button
                  type="button"
                  disabled={safePage === 0 || options.length === 0}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    const nextPage = Math.max(0, safePage - 1);
                    const nextIndex = serverPaginated ? 0 : nextPage * RESULTS_PER_PAGE;
                    setPage(nextPage);
                    setActiveIndex(nextIndex);
                    setFailedMediaId(null);
                  }}
                  className="min-h-7 cursor-pointer px-1.5 text-fg-mid transition-colors hover:text-volt focus-visible:outline-1 focus-visible:outline-volt disabled:cursor-not-allowed disabled:text-fg-ter motion-reduce:transition-none"
                >
                  ← ANTERIOR
                </button>
                <span aria-live="polite">PÁG. {safePage + 1}/{pageCount}</span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1 || options.length === 0}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    const nextPage = Math.min(pageCount - 1, safePage + 1);
                    const nextIndex = serverPaginated ? 0 : nextPage * RESULTS_PER_PAGE;
                    setPage(nextPage);
                    setActiveIndex(nextIndex);
                    setFailedMediaId(null);
                  }}
                  className="min-h-7 cursor-pointer px-1.5 text-fg-mid transition-colors hover:text-volt focus-visible:outline-1 focus-visible:outline-volt disabled:cursor-not-allowed disabled:text-fg-ter motion-reduce:transition-none"
                >
                  SIGUIENTE →
                </button>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden bg-elev">
              {activeOption ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-[64px] items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-5 text-fg">{activeOption.name}</h3>
                      <p className="mt-1 font-mono-app text-[8px] uppercase text-fg-sec">{activeOption.muscleGroup} · {activeOption.equipment}</p>
                    </div>
                    <span className="shrink-0 border border-line px-2 py-1 font-mono-app text-[7px] uppercase text-fg-sec">
                      {activeOption.origin === "catalog" ? "CATÁLOGO" : activeOption.origin === "library" ? "BIBLIOTECA" : "PLAN ACTUAL"}
                    </span>
                  </div>

                  <div className="relative flex h-[190px] shrink-0 items-center justify-center overflow-hidden bg-ink">
                    {activeOption.mediaUrl && failedMediaId !== activeOption.id ? (
                      // Animated exercise media is intentionally rendered as a native img:
                      // Next/Image optimization does not preserve GIF playback reliably.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={activeOption.id}
                        src={activeOption.mediaUrl}
                        alt={`Demostración animada de ${activeOption.name}`}
                        className="exercise-media-enter h-full w-full object-contain"
                        onError={() => setFailedMediaId(activeOption.id)}
                      />
                    ) : (
                      <div className="max-w-[28ch] px-5 text-center">
                        <div className="font-mono-app text-[9px] text-fg-ter">GIF NO DISPONIBLE</div>
                        <p className="mt-2 text-xs leading-5 text-fg-sec">Podés revisar las indicaciones técnicas antes de usarlo.</p>
                      </div>
                    )}
                    {activeOption.mediaUrl && failedMediaId !== activeOption.id && (
                      <div className="absolute right-2 bottom-2 bg-ink/85 px-2 py-1.5 font-mono-app text-[8px] text-fg-sec">
                        GIF · REPETICIÓN AUTOMÁTICA
                      </div>
                    )}
                  </div>

                  <div
                    role="region"
                    aria-label={`Instrucciones de ${activeOption.name}`}
                    tabIndex={0}
                    className="min-h-0 max-h-52 flex-1 overflow-y-auto overscroll-contain border-t border-line-soft px-4 py-3 [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-volt md:max-h-none"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono-app text-[8px] tracking-[1px] text-volt">INSTRUCCIONES</div>
                      <span className="font-mono-app text-[8px] text-fg-ter">{steps.length} {steps.length === 1 ? "PASO" : "PASOS"}</span>
                    </div>
                    {steps.length ? (
                      <ol className="mt-2.5 space-y-2">
                        {steps.map((step, index) => (
                          <li key={`${index}-${step.slice(0, 16)}`} className="flex items-start gap-2.5 text-xs leading-5 text-fg-mid">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-line-soft font-mono-app text-[8px] text-neon">{index + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-fg-sec">Este ejercicio todavía no tiene indicaciones técnicas.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-card px-4 py-3">
                    <span className="text-[11px] text-fg-sec">¿Es el movimiento correcto?</span>
                    <button
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => choose(activeOption)}
                      className="min-h-9 cursor-pointer bg-volt px-4 py-2 font-mono-app text-[9px] font-bold tracking-[0.7px] text-ink transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt motion-reduce:transition-none"
                    >
                      USAR EN EL PLAN →
                    </button>
                  </div>
                </div>
              ) : (
                catalogLoading ? (
                  <div aria-label="Cargando vista previa" className="grid h-full grid-cols-2 gap-4 p-4 motion-reduce:animate-none">
                    <div className="animate-pulse bg-line-soft motion-reduce:animate-none" />
                    <div className="space-y-3 py-2">
                      <div className="h-4 w-4/5 animate-pulse bg-line motion-reduce:animate-none" />
                      <div className="h-3 w-2/5 animate-pulse bg-line-soft motion-reduce:animate-none" />
                      <div className="mt-6 h-3 w-full animate-pulse bg-line-soft motion-reduce:animate-none" />
                      <div className="h-3 w-5/6 animate-pulse bg-line-soft motion-reduce:animate-none" />
                      <div className="h-3 w-3/4 animate-pulse bg-line-soft motion-reduce:animate-none" />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[440px] items-center justify-center px-8 text-center text-sm text-fg-sec max-md:min-h-0">
                    Escribí al menos dos letras para explorar el catálogo visual.
                  </div>
                )
              )}
            </div>
          </div>
          {catalogQuery && catalogQuery !== query.trim() && <span className="sr-only">Actualizando resultados</span>}
        </div>
      )}
      {!open && selected && <span className="sr-only">Seleccionado: {selected.name}, {selected.muscleGroup}, {selected.equipment}</span>}
    </div>
  );
}

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
              instructions: e.instructions ?? null,
              gifPath: e.gifPath ?? null,
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

  function selectExercise(i: number, exercise: ExerciseOption | null) {
    setRows(currentRows => currentRows.map((row, index) => index === i ? {
      ...row,
      nombre: exercise?.name ?? "",
      instructions: exercise?.instructions ?? null,
      gifPath: exercise?.mediaUrl ?? null,
    } : row));
    setConfirmingOverwrite(false);
  }

  async function assign() {
    const exercises = rows
      .filter(r => r.nombre.trim())
      .map(r => {
        const libraryExercise = library.find(exercise => exercise.name === r.nombre.trim());
        return {
          nombre: r.nombre.trim(),
          target: Number(r.target) || 3,
          reps: Number(r.reps) || 8,
          peso: Number(r.peso) || 0,
          step: Number(r.step) || 2.5,
          restSeconds: Number(r.restSeconds) || 90,
          instructions: r.instructions ?? libraryExercise?.instructions ?? null,
          gifPath: r.gifPath ?? libraryExercise?.mediaUrl ?? null,
        };
      });
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
        body: JSON.stringify({ athleteId: athlete.userId, exercises, baseVersion: current?.version ?? 0 }),
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
            <ExerciseCombobox
              value={row.nombre}
              instructions={row.instructions}
              gifPath={row.gifPath}
              exercises={library}
              onChange={exercise => selectExercise(i, exercise)}
              rowIndex={i}
            />
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
