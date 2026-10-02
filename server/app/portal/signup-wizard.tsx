"use client";

import { useState } from "react";

import { api, ApiError } from "./lib";

type Discipline = "coach" | "nutritionist";

const DISCIPLINES: { value: Discipline; eyebrow: string; title: string; points: string[] }[] = [
  {
    value: "coach",
    eyebrow: "ENTRENAMIENTO",
    title: "Entrenador/a",
    points: [
      "Armás rutinas con más de 1300 ejercicios con animación.",
      "Ves series, cargas y récords que tus atletas registran.",
      "Ajustás el plan y lo publicás al instante en su app.",
    ],
  },
  {
    value: "nutritionist",
    eyebrow: "NUTRICIÓN",
    title: "Nutricionista",
    points: [
      "Planes de comidas con macros calculados y alimentos de la región.",
      "Ves lo que tus atletas comen y cuánto se acercan a sus metas.",
      "Biblioteca propia de alimentos y plantillas reutilizables.",
    ],
  },
];

const STEPS = ["DISCIPLINA", "TU CUENTA", "TU ESPACIO"] as const;

const field = "w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

/**
 * Professional sign-up in three short steps: what kind of professional, the
 * account, and the workspace, ending with what happens next (review).
 */
export function ProfessionalSignupWizard({ requiresCode, requiresApproval, googleEnabled, onDone, onGoogle, onBack }: {
  requiresCode: boolean;
  requiresApproval: boolean;
  googleEnabled: boolean;
  onDone: () => void;
  onGoogle: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 1) {
      if (password.length < 8) return setError("Usá al menos 8 caracteres.");
      if (password !== confirmPassword) return setError("Las contraseñas no coinciden.");
    }
    setStep(step + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!discipline) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/portal/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, discipline, organizationName, signupCode }),
      });
      onDone();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      if (status === 422) {
        setError("Ya existe una cuenta con ese correo. Ingresá con ella o usá otro.");
        setStep(1);
      } else {
        setError(status === 403 ? "El código de registro no es válido." : "No se pudo crear la cuenta. Revisá los datos e intentá de nuevo.");
      }
      setBusy(false);
    }
  }

  const selected = DISCIPLINES.find(d => d.value === discipline);

  return (
    <form onSubmit={step === 2 ? submit : next} className="relative z-10 mx-auto max-w-115 px-5 py-[7vh]">
      <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · ALTA PROFESIONAL</div>
      <ol className="mb-6 flex gap-1.5" aria-label="Pasos">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1" aria-current={index === step ? "step" : undefined}>
            <div className={`h-0.5 ${index <= step ? "bg-volt" : "bg-line"}`} />
            <div className={`mt-1.5 font-mono-app text-[9px] tracking-[1px] ${index === step ? "text-fg" : "text-fg-ter"}`}>{index + 1} · {label}</div>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="food-panel-enter">
          <h1 className="mb-2 text-[26px] font-semibold text-fg">¿Con qué acompañás a tus atletas?</h1>
          <p className="mb-5 text-sm leading-6 text-fg-sec">Define tus herramientas en el portal. Si trabajás en ambas áreas, creá una cuenta por disciplina o sumá colegas a tu equipo después.</p>
          <div className="space-y-2" role="radiogroup" aria-label="Disciplina">
            {DISCIPLINES.map(option => {
              const active = discipline === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDiscipline(option.value)}
                  className={`w-full cursor-pointer border p-4 text-left transition ${active ? "border-volt bg-card" : "border-line bg-elev hover:border-fg-ter"}`}
                >
                  <span className="block font-mono-app text-[10px] tracking-[1px] text-volt">{option.eyebrow}</span>
                  <span className="mt-1 block text-[15px] font-semibold text-fg">{option.title}</span>
                  {active && (
                    <ul className="mt-2.5 space-y-1 text-[13px] leading-5 text-fg-mid">
                      {option.points.map(point => <li key={point}>· {point}</li>)}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
          <button type="submit" disabled={!discipline} className="mt-5 w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:cursor-default disabled:opacity-40">
            CONTINUAR
          </button>
          {googleEnabled && (
            <>
              <div className="my-4 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="font-mono-app text-[9px] tracking-[1.4px] text-fg-ter">O</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <button type="button" onClick={onGoogle} className="flex w-full cursor-pointer items-center justify-center gap-2.5 border border-[#747775] bg-white p-3 text-sm font-semibold text-[#1F1F1F] transition hover:bg-[#f2f2f2]">
                <span aria-hidden className="text-base font-bold">G</span>
                Crear cuenta con Google
              </button>
              <p className="mt-2 text-center text-[11px] leading-4 text-fg-ter">Después de Google elegís tu disciplina.</p>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="food-panel-enter">
          <h1 className="mb-2 text-[26px] font-semibold text-fg">Tus datos de acceso</h1>
          <p className="mb-5 text-sm leading-6 text-fg-sec">Tu nombre es el que verán tus atletas. Usá un correo que revises: te avisamos por ahí cuando tu cuenta esté aprobada.</p>
          <input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" className={`${field} mb-3`} />
          <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className={`${field} mb-3`} />
          <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña (mínimo 8 caracteres)" className={`${field} mb-3`} />
          <input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repetí la contraseña" className={`${field} mb-3`} />
          {error && <div role="alert" className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setError(null); setStep(0); }} className="cursor-pointer border border-line px-4 py-3 font-mono-app text-xs text-fg-sec hover:text-fg">ATRÁS</button>
            <button type="submit" className="flex-1 cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110">CONTINUAR</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="food-panel-enter">
          <h1 className="mb-2 text-[26px] font-semibold text-fg">Tu espacio de trabajo</h1>
          <p className="mb-5 text-sm leading-6 text-fg-sec">Es privado: solo vos y los colegas que invites ven a tus atletas. Podés cambiar el nombre después.</p>
          <input value={organizationName} onChange={e => setOrganizationName(e.target.value)} maxLength={100} placeholder={`Ej.: ${selected?.value === "nutritionist" ? "Consultorio Nutrición Vital" : "Team Fuerza Tegus"} (opcional)`} className={`${field} mb-3`} />
          {requiresCode && <input required value={signupCode} onChange={e => setSignupCode(e.target.value)} placeholder="Código de registro profesional" className={`${field} mb-3`} />}

          <div className="mb-4 border border-line bg-card p-4">
            <div className="font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">QUÉ PASA DESPUÉS</div>
            <ol className="mt-2 space-y-1.5 text-[13px] leading-5 text-fg-mid">
              {requiresApproval ? (
                <>
                  <li>1. Confirmás tu correo con el enlace que te enviamos.</li>
                  <li>2. Completás tu perfil profesional (titular, presentación, credenciales).</li>
                  <li>3. El equipo PULSO revisa tu cuenta, normalmente en menos de un día hábil.</li>
                  <li>4. Te avisamos por correo y empezás a invitar atletas.</li>
                </>
              ) : (
                <>
                  <li>1. Completás tu perfil profesional.</li>
                  <li>2. Generás un código de invitación para tus atletas.</li>
                  <li>3. Armás su primer plan desde una plantilla o desde cero.</li>
                </>
              )}
            </ol>
          </div>

          <label className="mb-4 flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-fg-sec">
            <input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1 accent-[#e8ff59]" />
            <span>Voy a usar los datos de salud de mis atletas solo para acompañarlos, con su consentimiento, y respetando lo que decidan compartir.</span>
          </label>

          {error && <div role="alert" className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { setError(null); setStep(1); }} className="cursor-pointer border border-line px-4 py-3 font-mono-app text-xs text-fg-sec hover:text-fg">ATRÁS</button>
            <button type="submit" disabled={busy || !accepted} className="flex-1 cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:cursor-default disabled:opacity-50">
              {busy ? "CREANDO…" : "CREAR MI ESPACIO"}
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onBack} className="mt-5 w-full cursor-pointer py-2 text-sm text-fg-sec hover:text-volt">Ya tengo una cuenta · Ingresar</button>
      <p className="mt-2 text-center font-mono-app text-[9px] leading-4 text-fg-ter">EL ALTA CREA UN ESPACIO PRIVADO. NO OTORGA PERMISOS ADMINISTRATIVOS GLOBALES.</p>
    </form>
  );
}
