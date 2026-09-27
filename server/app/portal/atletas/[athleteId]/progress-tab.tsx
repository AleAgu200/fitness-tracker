"use client";

import type { ReactNode } from "react";

import { freshness, kg, percent, shortDate } from "./format";

export type Period = 7 | 28 | 90;
export type ProgressState = "ok" | "empty" | "revoked" | "not_authorized";

export interface SharedCard {
  id: string;
  type: "new_pulse" | "control" | "return" | "consistency";
  metric: {
    exerciseName: string | null; weightKg: number | null; reps: number | null; deltaPct: number | null;
    rpeDrop: number | null; daysAway: number | null; completedSets: number; targetSets: number | null; volumeKg: number;
  };
  earnedAt: number;
  sharedAt: number;
}

export interface ProgressData {
  periodDays: Period;
  states: Record<"training" | "nutrition" | "metrics", ProgressState>;
  training: { completed: number; scheduled: number; adherence: number | null; totalVolumeKg: number; daysWithData: number; coverage: number } | null;
  nutrition: { completed: number; substituted: number; pending: number; adherence: number | null; daysWithData: number; coverage: number } | null;
  metrics: { latestWeightKg: number | null; weightChangeKg: number | null; daysWithData: number; coverage: number } | null;
}

const PERIODS: Period[] = [7, 28, 90];

const CARD_FAMILIES: Record<SharedCard["type"], { label: string; border: string; text: string }> = {
  new_pulse: { label: "NUEVO PULSO", border: "border-danger", text: "text-danger" },
  control: { label: "CONTROL", border: "border-neon", text: "text-neon" },
  return: { label: "REGRESO", border: "border-warn", text: "text-warn" },
  consistency: { label: "CONSISTENCIA", border: "border-volt", text: "text-volt" },
};

function cardCopy(card: SharedCard): { headline: string; detail: string } {
  const m = card.metric;
  const lift = m.weightKg ? `${kg(m.weightKg)} × ${m.reps}` : `${m.reps ?? 0} reps`;
  switch (card.type) {
    case "new_pulse": return { headline: `${m.exerciseName ?? "Récord"} · ${lift}`, detail: `+${(m.deltaPct ?? 0).toLocaleString("es-AR")}% sobre su mejor marca anterior` };
    case "control": return { headline: `${m.exerciseName ?? "Control"} · ${lift}`, detail: `Mismo trabajo con ${(m.rpeDrop ?? 0).toLocaleString("es-AR")} puntos menos de RPE` };
    case "return": return { headline: `Volvió tras ${m.daysAway} días`, detail: "Primera sesión después de una pausa" };
    default: return { headline: `${m.completedSets}/${m.targetSets ?? m.completedSets} series`, detail: "Completó la sesión planificada" };
  }
}

/** Days with data over the period: tells the reader how much a number can be trusted. */
function Coverage({ days, period }: { days: number; period: number }) {
  const ratio = Math.min(1, days / period);
  return (
    <div className="mt-4">
      <div className="flex justify-between font-mono-app text-[9px] text-fg-ter">
        <span>COBERTURA</span>
        <span>{days} de {period} días con datos</span>
      </div>
      <div className="mt-1.5 h-1.5 border border-line bg-elev" role="img" aria-label={`${days} de ${period} días con datos`}>
        <div className="h-full bg-neon" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <div className="font-mono-app text-[9px] text-fg-ter">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-fg">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-fg-sec">{detail}</div>}
    </div>
  );
}

/** A category panel that never draws zeros in place of a missing permission. */
function CategoryPanel({ title, state, period, updatedAt, children }: {
  title: string;
  state: ProgressState;
  period: number;
  updatedAt: number | null;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono-app text-[10px] tracking-[1px] text-fg-ter">{title.toUpperCase()}</h3>
        {state === "ok" && <span className="font-mono-app text-[9px] text-fg-ter">actualizado {freshness(updatedAt)}</span>}
      </div>
      {state === "ok" && children}
      {state === "empty" && <p className="mt-4 text-sm text-fg-sec">Sin registros en los últimos {period} días. Con permiso concedido, esto significa que el atleta no sincronizó datos en el período.</p>}
      {state === "revoked" && <p className="mt-4 text-sm text-warn">El atleta revocó el acceso a esta categoría. No se muestra como 0%.</p>}
      {state === "not_authorized" && <p className="mt-4 text-sm text-fg-ter">Esta categoría no corresponde a tu disciplina o el atleta no la compartió.</p>}
    </section>
  );
}

export function ProgressTab({ progress, freshnessAt, sharedCards, planSelection, isCoach, period, onPeriodChange, loading }: {
  progress: ProgressData;
  freshnessAt: Record<"training" | "nutrition" | "metrics", number | null>;
  sharedCards: SharedCard[];
  planSelection: { coachPlanSelected: boolean; selectedAt: number } | null;
  isCoach: boolean;
  period: Period;
  onPeriodChange: (period: Period) => void;
  loading: boolean;
}) {
  const { training, nutrition, metrics, states } = progress;
  const trainingVisible = states.training !== "revoked" && states.training !== "not_authorized";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-sec">Cada número muestra su denominador y cuántos días tienen datos.</p>
        <div className="flex border border-line" role="tablist" aria-label="Período">
          {PERIODS.map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={period === value}
              disabled={loading}
              onClick={() => onPeriodChange(value)}
              className={`cursor-pointer px-3 py-2 font-mono-app text-[10px] disabled:opacity-60 ${period === value ? "bg-volt font-bold text-ink" : "text-fg-sec hover:text-fg"}`}
            >
              {value} DÍAS
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CategoryPanel title="Entrenamiento" state={states.training} period={period} updatedAt={freshnessAt.training}>
          {training && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Stat label="SESIONES" value={`${training.completed}/${training.scheduled}`} detail={training.scheduled ? `${percent(training.adherence)} completadas` : "sin sesiones programadas"} />
                <Stat label="VOLUMEN" value={kg(Math.round(training.totalVolumeKg), 0)} detail={`en ${period} días`} />
              </div>
              <Coverage days={training.daysWithData} period={period} />
            </>
          )}
        </CategoryPanel>

        <CategoryPanel title="Nutrición" state={states.nutrition} period={period} updatedAt={freshnessAt.nutrition}>
          {nutrition && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Stat
                  label="COMIDAS CUMPLIDAS"
                  value={`${nutrition.completed}/${nutrition.completed + nutrition.substituted + nutrition.pending}`}
                  detail={`${percent(nutrition.adherence)} del total`}
                />
                <Stat label="SUSTITUIDAS · PENDIENTES" value={`${nutrition.substituted} · ${nutrition.pending}`} />
              </div>
              <Coverage days={nutrition.daysWithData} period={period} />
            </>
          )}
        </CategoryPanel>

        <CategoryPanel title="Métricas" state={states.metrics} period={period} updatedAt={freshnessAt.metrics}>
          {metrics && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Stat label="ÚLTIMO PESO" value={metrics.latestWeightKg != null ? kg(metrics.latestWeightKg) : "—"} />
                <Stat
                  label="CAMBIO EN EL PERÍODO"
                  value={metrics.weightChangeKg != null ? `${metrics.weightChangeKg > 0 ? "+" : ""}${kg(metrics.weightChangeKg)}` : "—"}
                  detail={metrics.weightChangeKg == null ? "hace falta más de un registro" : undefined}
                />
              </div>
              <Coverage days={metrics.daysWithData} period={period} />
            </>
          )}
        </CategoryPanel>
      </div>

      {isCoach && trainingVisible && (
        <section className="border border-line bg-card p-4">
          <h3 className="font-mono-app text-[10px] tracking-[1px] text-fg-ter">PLAN EN USO</h3>
          {planSelection ? (
            <p className={`mt-3 text-sm ${planSelection.coachPlanSelected ? "text-fg" : "text-warn"}`}>
              {planSelection.coachPlanSelected
                ? `Entrena con tu plan desde el ${shortDate(planSelection.selectedAt)}.`
                : `Desde el ${shortDate(planSelection.selectedAt)} eligió temporalmente otro plan. Tu plan sigue disponible en su app; el contenido del otro plan no se comparte.`}
            </p>
          ) : (
            <p className="mt-3 text-sm text-fg-sec">Todavía no hay datos de qué plan usa (llegan con la próxima sincronización de su app).</p>
          )}
        </section>
      )}

      {trainingVisible && (
        <section className="border border-line bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono-app text-[10px] tracking-[1px] text-fg-ter">TARJETAS COMPARTIDAS</h3>
            <span className="text-xs text-fg-ter">El atleta elige cuáles compartir</span>
          </div>
          {sharedCards.length ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sharedCards.map(card => {
                const family = CARD_FAMILIES[card.type];
                const copy = cardCopy(card);
                return (
                  <article key={card.id} className={`border-l-2 bg-elev p-3 ${family.border}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono-app text-[9px] font-bold tracking-[1px] ${family.text}`}>{family.label}</span>
                      <span className="font-mono-app text-[9px] text-fg-ter">{shortDate(card.earnedAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-fg">{copy.headline}</p>
                    <p className="mt-1 text-xs text-fg-sec">{copy.detail}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-fg-sec">El atleta todavía no compartió tarjetas de sesión.</p>
          )}
        </section>
      )}
    </div>
  );
}
