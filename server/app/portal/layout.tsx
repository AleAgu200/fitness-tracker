"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, SessionUser } from "./lib";
import { PortalContext } from "./portal-context";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ── lightning background, reduced-motion fallback ───────────────────────────
// Four static bolts on a slow CSS fade loop, in a normalized 0–100 space.

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

// ── real lightning: procedurally-generated strikes on canvas ───────────────
// Midpoint-displacement bolts with branch forks, striking at random intervals.
// Points live in a normalized 0–100 space, scaled to the canvas each frame.

type Point = [number, number];
interface Strike { id: number; born: number; color: string; main: Point[]; branches: Point[][]; }

function displace(x1: number, y1: number, x2: number, y2: number, mag: number, depth: number, out: Point[]) {
  if (depth <= 0 || mag < 0.6) { out.push([x2, y2]); return; }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * mag;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * mag * 0.35;
  displace(x1, y1, mx, my, mag * 0.55, depth - 1, out);
  displace(mx, my, x2, y2, mag * 0.55, depth - 1, out);
}

function makeBolt(): { main: Point[]; branches: Point[][] } {
  const x1 = 10 + Math.random() * 80;
  const y1 = -8;
  const x2 = x1 + (Math.random() - 0.5) * 55;
  const y2 = 70 + Math.random() * 40;
  const main: Point[] = [[x1, y1]];
  displace(x1, y1, x2, y2, 14, 6, main);

  const branches: Point[][] = [];
  const branchCount = 1 + Math.floor(Math.random() * 2);
  for (let b = 0; b < branchCount; b++) {
    const startIdx = 3 + Math.floor(Math.random() * Math.max(1, main.length - 6));
    if (startIdx < 1 || startIdx >= main.length - 1) continue;
    const [sx, sy] = main[startIdx];
    const ex = sx + (Math.random() - 0.5) * 30;
    const ey = sy + 15 + Math.random() * 25;
    const branch: Point[] = [[sx, sy]];
    displace(sx, sy, ex, ey, 8, 4, branch);
    branches.push(branch);
  }
  return { main, branches };
}

/** Real branching lightning that strikes at random intervals, with a background-only shake. */
function LightningStrikes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0, height = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    const strikes: Strike[] = [];
    let nextId = 0;
    let nextStrikeAt = performance.now() + 900 + Math.random() * 1400;
    const shake = { x: 0, y: 0, mag: 0 };
    let rafId: number;

    function drawPath(pts: Point[], color: string, alpha: number, lineWidth: number) {
      if (pts.length < 2) return;
      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.strokeStyle = color;
      ctx!.lineWidth = lineWidth;
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 18;
      ctx!.beginPath();
      pts.forEach(([px, py], i) => {
        const x = (px / 100) * width;
        const y = (py / 100) * height;
        if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
      });
      ctx!.stroke();
      ctx!.restore();
    }

    function frame(now: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      if (now >= nextStrikeAt) {
        const { main, branches } = makeBolt();
        strikes.push({ id: nextId++, born: now, color: Math.random() < 0.5 ? "#E8FF59" : "#3DDCFF", main, branches });
        shake.mag = 3.2;
        nextStrikeAt = now + 1800 + Math.random() * 3400;
      }

      for (let i = strikes.length - 1; i >= 0; i--) {
        if (now - strikes[i].born > 620) strikes.splice(i, 1);
      }
      for (const s of strikes) {
        const age = now - s.born;
        let alpha: number;
        if (age < 40) alpha = age / 40;
        else if (age < 90) alpha = 1;
        else if (age < 160) alpha = 0.35 + Math.random() * 0.5; // flicker, like a real strike
        else alpha = Math.max(0, 1 - (age - 160) / 380) * 0.7;
        drawPath(s.main, s.color, alpha, 2.4);
        for (const br of s.branches) drawPath(br, s.color, alpha * 0.6, 1.3);
      }

      if (shake.mag > 0.02) {
        shake.x = (Math.random() - 0.5) * shake.mag;
        shake.y = (Math.random() - 0.5) * shake.mag * 0.6;
        shake.mag *= 0.82;
      } else {
        shake.x = 0; shake.y = 0; shake.mag = 0;
      }
      canvas!.style.transform = `translate(${shake.x}px, ${shake.y}px)`;

      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// ── login success: a bright flash masks the swap into the authenticated shell ──

function PowerSurgeFlash({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ background: "#E8FF59", animation: "surgeFlash 620ms ease-out forwards" }}
    />
  );
}

// ── login ────────────────────────────────────────────────────────────────────

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [charging, setCharging] = useState(false);
  const reducedMotion = useReducedMotion();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
      if (reducedMotion) {
        onDone();
      } else {
        setCharging(true);
        window.setTimeout(onDone, 320);
      }
    } catch {
      setError("Email o contraseña incorrectos");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {reducedMotion ? <LightningBg /> : <LightningStrikes />}
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
          className={`w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60 ${
            charging ? "animate-[chargeUp_320ms_ease-out_forwards]" : ""
          }`}
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
  const [surging, setSurging] = useState(false);
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const loadSession = useCallback(async () => {
    try {
      const data = await api<{ user?: SessionUser } | null>("/api/auth/get-session");
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  /** Bridges Login unmounting into the authenticated shell mounting: the flash
      (rendered here, outside either branch) survives the swap and masks the cut. */
  const completeLogin = useCallback(() => {
    if (reducedMotion) {
      loadSession();
      return;
    }
    setSurging(true);
    window.setTimeout(() => {
      const withNewSession = "startViewTransition" in document
        ? () => (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(loadSession)
        : loadSession;
      withNewSession();
    }, 160);
    window.setTimeout(() => setSurging(false), 700);
  }, [loadSession, reducedMotion]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/sign-out", { method: "POST", body: "{}" });
    } catch {
      // session may already be gone
    }
    setUser(null);
  }, []);

  let content: React.ReactNode = null;
  if (user === undefined) {
    content = null;
  } else if (!user) {
    content = <Login onDone={completeLogin} />;
  } else if (user.role !== "coach" && user.role !== "nutritionist") {
    content = (
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
  } else {
    content = (
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

  return (
    <>
      {content}
      <PowerSurgeFlash active={surging} />
    </>
  );
}
