"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface TourStep {
  eyebrow: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    eyebrow: "BIENVENIDA",
    title: "Tu espacio de trabajo está listo",
    body: "En dos minutos te mostramos dónde está cada cosa. Podés volver a ver este recorrido desde Configuración.",
  },
  {
    eyebrow: "⚡ ATENCIÓN",
    title: "Lo que necesita tu respuesta hoy",
    body: "Mensajes sin contestar, atletas que dejaron de registrar y planes por vencer, ordenados por urgencia. Empezá el día por aquí.",
  },
  {
    eyebrow: "◆ ATLETAS",
    title: "Cada atleta, su plan y su progreso",
    body: "Invitás con un código de un solo uso. El atleta decide qué compartir con vos: entrenamiento, nutrición o medidas. Desde su ficha editás y publicás el plan.",
  },
  {
    eyebrow: "⬡ EQUIPO",
    title: "Trabajá con colegas",
    body: "Sumá entrenadores o nutricionistas a tu organización y repartí atletas. Cada colega ve solo a quienes atiende.",
  },
  {
    eyebrow: "LIBRARY",
    title: "Tu biblioteca",
    body: "",
  },
  {
    eyebrow: "PRIMER PASO",
    title: "Invitá a tu primer atleta",
    body: "Generá un código, compartilo por WhatsApp o correo, y el atleta lo ingresa en la app de PULSO. Aparece en tu lista apenas acepte.",
  },
];

function storageKey(userId: string) {
  return `pulso.portalTour.v1.${userId}`;
}

export function resetPortalTour(userId: string) {
  try { window.localStorage.removeItem(storageKey(userId)); } catch { /* storage unavailable */ }
}

/**
 * First-use walkthrough for professionals. Shown once per account on this
 * browser; a modal rather than spotlights so it works on every layout.
 */
function stepsFor(role: string): TourStep[] {
  return STEPS.map(step => step.eyebrow !== "LIBRARY" ? step : role === "nutritionist"
    ? { ...step, eyebrow: "✚ ALIMENTOS", body: "Alimentos con macros por 100 g, de la base PULSO y los tuyos. Con ellos armás planes y plantillas reutilizables." }
    : { ...step, eyebrow: "✚ ALIMENTOS · ▲ EJERCICIOS", body: "Más de 1300 ejercicios con animación y técnica, y alimentos con macros. Agregá los tuyos y armá plantillas reutilizables." });
}

export function PortalTour({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const steps = stepsFor(role);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey(userId))) setIndex(0);
    } catch {
      // No storage (private mode): skip the tour rather than show it every visit.
    }
  }, [userId]);

  useEffect(() => { primaryRef.current?.focus(); }, [index]);

  function finish(goTo?: string) {
    try { window.localStorage.setItem(storageKey(userId), String(Date.now())); } catch { /* storage unavailable */ }
    setIndex(null);
    if (goTo) router.push(goTo);
  }

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" && index < steps.length - 1) setIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (index === null) return null;
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 px-4 pb-6 sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="food-panel-enter w-full max-w-md border border-line bg-card">
        <div className="flex gap-1 p-4 pb-0" aria-hidden>
          {steps.map((_, i) => <span key={i} className={`h-0.5 flex-1 ${i <= index ? "bg-volt" : "bg-line"}`} />)}
        </div>
        <div className="p-5">
          <div className="font-mono-app text-[10px] tracking-[1.6px] text-volt">{step.eyebrow}</div>
          <h2 id="tour-title" className="mt-2 text-xl font-semibold text-fg">{step.title}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-sec">{step.body}</p>
          <div className="mt-6 flex items-center justify-between gap-2">
            <button type="button" onClick={() => finish()} className="cursor-pointer py-2 font-mono-app text-[11px] text-fg-ter hover:text-fg-sec">
              {last ? "AHORA NO" : "SALTAR"}
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <button type="button" onClick={() => setIndex(index - 1)} className="cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[11px] text-fg-sec hover:text-fg">ATRÁS</button>
              )}
              <button
                ref={primaryRef}
                type="button"
                onClick={() => (last ? finish("/portal/atletas") : setIndex(index + 1))}
                className="cursor-pointer bg-volt px-4 py-2.5 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink hover:brightness-110"
              >
                {last ? "INVITAR ATLETA" : index === 0 ? "EMPEZAR" : "SIGUIENTE"}
              </button>
            </div>
          </div>
          <div className="mt-3 text-right font-mono-app text-[9.5px] text-fg-ter">{index + 1} / {steps.length}</div>
        </div>
      </div>
    </div>
  );
}
