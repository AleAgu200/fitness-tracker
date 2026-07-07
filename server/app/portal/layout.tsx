"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api, SessionUser } from "./lib";
import { PortalContext } from "./portal-context";

// ── lightning background (login only) ────────────────────────────────────────
// Full-screen bolts in a normalized 0–100 space, stretched to the viewport.

const BOLTS = [
  { points: "16,-5 30,20 23,27 44,52 37,59 62,86 55,105", color: "#E8FF59", delay: 0,   period: 4.6, peak: 0.65 },
  { points: "84,-5 68,22 76,30 50,56 58,64 30,90 36,105", color: "#3DDCFF", delay: 1.4, period: 5.4, peak: 0.5 },
  { points: "46,-5 56,24 47,32 60,58 51,66 63,105",       color: "#E8FF59", delay: 2.6, period: 6.2, peak: 0.45 },
  { points: "4,-5 14,30 8,38 20,70 13,78 22,105",         color: "#3DDCFF", delay: 3.4, period: 5.8, peak: 0.4 },
];

function LightningBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {BOLTS.map((b, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-0"
          style={{
            animation: `boltFlash ${b.period}s linear ${b.delay}s infinite`,
            filter: `drop-shadow(0 0 14px ${b.color})`,
            ["--bolt-peak" as string]: b.peak,
          }}
        >
          <polyline
            points={b.points}
            stroke={b.color}
            strokeOpacity={0.2}
            strokeWidth={10}
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={b.points}
            stroke={b.color}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
  );
}

// ── login ────────────────────────────────────────────────────────────────────

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
      onDone();
    } catch {
      setError("Email o contraseña incorrectos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <LightningBg />
      <form onSubmit={submit} className="relative z-10 mx-auto mt-[12vh] max-w-90 px-5">
        <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">
          PULSO · PORTAL PROFESIONAL
        </div>
        <h1 className="mb-6 text-[28px] font-semibold text-fg">Ingresar</h1>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          placeholder="tu@email.com"
          className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña"
          className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none"
        />
        {error && <div className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "..." : "INGRESAR"}
        </button>
      </form>
    </div>
  );
}

// ── nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/portal", label: "ATLETAS", icon: "◆" },
  { href: "/portal/alimentos", label: "ALIMENTOS", icon: "✚" },
  { href: "/portal/ejercicios", label: "EJERCICIOS", icon: "▲" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const pathname = usePathname();

  const loadSession = useCallback(async () => {
    try {
      const data = await api<{ user?: SessionUser } | null>("/api/auth/get-session");
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/sign-out", { method: "POST", body: "{}" });
    } catch {
      // session may already be gone
    }
    setUser(null);
  }, []);

  if (user === undefined) return null;
  if (!user) return <Login onDone={loadSession} />;

  const isProfessional = user.role === "coach" || user.role === "nutritionist";
  if (!isProfessional) {
    return (
      <div className="mx-auto mt-[16vh] max-w-115 px-5 text-center font-mono-app text-[13px] leading-7 text-fg-sec">
        <p>Tu cuenta ({user.email}) no es de profesional.</p>
        <p>
          Pedile al admin que ejecute:{" "}
          <code className="text-volt">node scripts/set-role.mjs {user.email} coach</code>
        </p>
        <button type="button" onClick={logout} className="mt-6 cursor-pointer border border-line px-5 py-2.5 text-xs text-fg-sec hover:border-danger hover:text-danger">
          CERRAR SESIÓN
        </button>
      </div>
    );
  }

  return (
    <PortalContext.Provider value={{ user, logout }}>
      <div className="flex h-screen">
        {/* sidebar */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-line">
          <div className="border-b border-line p-4.5">
            <div className="mb-1.5 font-mono-app text-[10px] tracking-[2px] text-volt">
              PULSO · {user.role === "coach" ? "ENTRENADOR" : "NUTRICIONISTA"}
            </div>
            <div className="font-semibold text-fg">{user.name}</div>
            <div className="font-mono-app text-[10px] text-fg-ter">{user.email}</div>
          </div>

          <nav className="flex-1 py-2">
            {NAV.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 border-l-3 px-4.5 py-3 font-mono-app text-[11px] tracking-[1.4px] transition ${
                    active
                      ? "border-volt bg-card text-volt"
                      : "border-transparent text-fg-sec hover:bg-card hover:text-fg"
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={logout}
            className="m-3.5 cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[11px] tracking-[1px] text-fg-sec transition hover:border-danger hover:text-danger"
          >
            CERRAR SESIÓN →
          </button>
        </aside>

        {/* content */}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </PortalContext.Provider>
  );
}
