// "La línea del pulso" — one paused timeline shared by index.html (16:9) and
// vertical.html (9:16). Layout lives in each file's CSS; this file only reads the
// canvas size from the root and builds geometry + motion from it. Deterministic:
// every value below is a constant or derived from the root's data-width/height.
// Usage (inline, so the registration sits in the composition file itself):
//   window.__timelines["main"] = window.buildPulsoTimeline();
window.buildPulsoTimeline = function () {
  const root = document.querySelector("[data-composition-id]");
  const W = +root.dataset.width;
  const H = +root.dataset.height;
  const VERTICAL = H > W;

  // The monitor trace: scrolls left at SPEED px/s for the first 24 s.
  const SPEED = 360;
  const LINE_SECONDS = 24;
  const LINE_Y = VERTICAL ? 1500 : 820;
  const DOT_X = Math.round(W * 0.86);
  const SAMPLE = 6;

  // Each beat's spike crosses screen x = fx·W at time t. amp scales the R wave.
  const SPIKES = [
    { t: 2.25, fx: 0.64, amp: 1.0 }, // 02 — first beat
    { t: 4.6, fx: 0.73, amp: 0.85 }, // 03 — the set (under the card)
    { t: 8.15, fx: VERTICAL ? 0.5 : 0.4, amp: 1.6 }, // 04 — the record: tallest
    { t: 11.1, fx: 0.68, amp: 0.8 }, // 05 — meal + water
    { t: 19.0, fx: 0.78, amp: 0.75 }, // 07 — the coach's message lands
    { t: 22.2, fx: 0.52, amp: 0.9 }, // 08 — one pulse
  ].map((s) => ({ ...s, x: s.fx * W + SPEED * s.t }));
  // 06 — sleep: long slow waves between the meal spike and the coach spike.
  const WAVES = { from: SPIKES[3].x + 420, to: SPIKES[4].x - 320, amp: 34, length: 520 };

  const lerp = (a, b, k) => a + (b - a) * k;
  // PQRST as (dx, dy-per-amp) key points; P and T are rounded bumps.
  const QRS = [[-34, 0], [-20, 16], [0, -150], [16, 92], [32, 0]];
  function spikeAt(x, s) {
    const dx = x - s.x;
    if (dx > -130 && dx < -70) return -14 * s.amp * Math.sin(((dx + 130) / 60) * Math.PI);
    if (dx > 50 && dx < 120) return -22 * s.amp * Math.sin(((dx - 50) / 70) * Math.PI);
    for (let i = 0; i < QRS.length - 1; i++) {
      const [x0, y0] = QRS[i];
      const [x1, y1] = QRS[i + 1];
      if (dx >= x0 && dx <= x1) return lerp(y0, y1, (dx - x0) / (x1 - x0)) * s.amp;
    }
    return 0;
  }
  function wavesAt(x) {
    if (x <= WAVES.from || x >= WAVES.to) return 0;
    const k = (x - WAVES.from) / (WAVES.to - WAVES.from);
    const envelope = Math.sin(k * Math.PI); // eases in and out of the calm section
    return -WAVES.amp * envelope * Math.sin(((x - WAVES.from) / WAVES.length) * Math.PI * 2);
  }
  const offsetAt = (x) => SPIKES.reduce((sum, s) => sum + spikeAt(x, s), 0) + wavesAt(x);

  // Build the trace once (static geometry, sampled every SAMPLE px; spikes get exact key points).
  const length = SPEED * LINE_SECONDS + W;
  const xs = new Set();
  for (let x = 0; x <= length; x += SAMPLE) xs.add(x);
  for (const s of SPIKES) for (const [dx] of QRS) xs.add(s.x + dx);
  const points = [...xs].sort((a, b) => a - b).map((x) => `${x.toFixed(1)},${(LINE_Y + offsetAt(x)).toFixed(1)}`);
  const trace = document.getElementById("trace");
  trace.setAttribute("width", String(length));
  trace.setAttribute("height", String(H));
  trace.setAttribute("viewBox", `0 0 ${length} ${H}`);
  document.getElementById("trace-path").setAttribute("points", points.join(" "));

  const dot = document.getElementById("dot");
  // The trace's pen and the closing frame's dot share one spot: the loop's seam.
  document.querySelectorAll(".dot").forEach((el) => {
    el.style.left = `${DOT_X - 13}px`;
    el.style.top = `${LINE_Y - 13}px`;
  });
  // Like a real monitor, the trace exists only behind the pen: new beats are born at the dot.
  document.getElementById("line-layer-inner").style.clipPath = `inset(0px ${W - DOT_X}px 0px 0px)`;
  document.querySelectorAll(".flat-line").forEach((el) => {
    el.style.top = `${LINE_Y - 2.5}px`;
    el.style.width = `${DOT_X}px`;
  });

  const tl = gsap.timeline({ paused: true });
  const IN = "power3.out";
  const OUT = "power2.in";

  // ── the spine: trace scrolls, the dot rides it, the grid scrolls with it ─────────
  tl.fromTo("#trace", { x: 0 }, {
    x: -SPEED * LINE_SECONDS,
    duration: LINE_SECONDS,
    ease: "none",
    onUpdate() {
      const scrolled = -gsap.getProperty("#trace", "x");
      gsap.set(dot, { y: offsetAt(DOT_X + scrolled) });
    },
  }, 0);
  const GRID = 80;
  tl.fromTo("#grid", { x: 0 }, {
    x: -GRID, duration: GRID / SPEED, ease: "none",
    repeat: Math.max(0, Math.floor((LINE_SECONDS * SPEED) / GRID) - 1),
  }, 0);
  tl.to(["#line-layer-inner", "#dot", "#bg-inner"], { opacity: 0, duration: 0.3, ease: OUT }, 23.75);

  // Words enter from the right and leave to the left: one direction for the whole film.
  const enter = (sel, at, opts = {}) =>
    tl.fromTo(sel, { x: opts.x ?? 120, y: opts.y ?? 0, opacity: 0 }, {
      x: 0, y: 0, opacity: 1, duration: opts.d ?? 0.6, ease: IN, stagger: opts.stagger ?? 0,
    }, at);
  const leave = (sel, at) => tl.to(sel, { x: -140, opacity: 0, duration: 0.3, ease: OUT }, at);
  const count = (el, from, to, at, d, fmt) => {
    const node = document.querySelector(el);
    const state = { v: from };
    node.textContent = fmt(from);
    tl.to(state, { v: to, duration: d, ease: IN, onUpdate: () => { node.textContent = fmt(state.v); } }, at);
  };
  const one = (v) => v.toFixed(1);
  const int = (v) => String(Math.round(v));
  const thousands = (v) => {
    const n = Math.round(v);
    return n >= 1000 ? `${Math.floor(n / 1000)} ${String(n % 1000).padStart(3, "0")}` : String(n);
  };

  // 01 — flat line (already drawn: the loop's last frame drew it)
  tl.fromTo("#clock", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, 0.3);
  tl.to("#clock", { opacity: 0, duration: 0.3, ease: OUT }, 4.2);

  // 02 — one beat
  enter("#s02 .w", 2.4, { x: 0, y: 46, stagger: 0.12 });
  leave("#s02 .hl", 4.2);

  // 03 — the set
  enter("#s03 .card", 4.55, { x: 220, d: 0.7 });
  enter("#s03 .hl", 4.7);
  count("#s03-kg", 40, 62.5, 5.4, 1.4, one);
  count("#s03-reps", 0, 8, 5.4, 1.4, int);
  tl.fromTo("#s03-rpe", { borderColor: "#26262A", color: "#8A8A93" }, { borderColor: "#F49B35", color: "#F49B35", duration: 0.25, ease: "power1.out" }, 6.5);
  tl.to("#s03-btn", { scale: 0.95, duration: 0.12, ease: "power1.in" }, 7.05);
  tl.to("#s03-btn", { scale: 1, duration: 0.35, ease: IN }, 7.17);
  tl.fromTo("#s03-btn-label", { opacity: 1 }, { opacity: 0.55, duration: 0.12, yoyo: true, repeat: 1, ease: "none" }, 7.05);
  leave(["#s03 .card", "#s03 .hl"], 7.75);

  // 04 — the record
  enter("#s04-label", 8.25, { x: 60 });
  enter("#s04 .hl", 8.6);
  tl.fromTo("#s04-num", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, 8.4);
  count("#s04-num", 62.5, 79.2, 8.5, 1.5, one);
  tl.fromTo("#s04-num", { scale: 0.62 }, { scale: 1, duration: 1.5, ease: IN }, 8.5);
  tl.fromTo("#s04-unit", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: IN }, 10.0);
  tl.fromTo("#s04-pill", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: IN }, 10.05);
  tl.fromTo("#s04-glow", { opacity: 0 }, { opacity: 0.32, duration: 0.6, ease: "power1.out" }, 10.0);
  leave(["#s04-label", "#s04-numrow", "#s04-pill", "#s04 .hl"], 10.75);
  tl.to("#s04-glow", { opacity: 0, duration: 0.3, ease: OUT }, 10.75);

  // 05 — meal and water
  enter("#s05 .card", 11.1, { x: 220, d: 0.7 });
  enter("#s05 .hl", 11.2);
  count("#s05-kcal", 0, 1840, 11.7, 1.6, thousands);
  tl.fromTo("#s05 .fill", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: IN, stagger: 0.15 }, 12.2);
  enter("#s05-ring", 12.6, { x: 160, d: 0.6 });
  const ring = document.getElementById("s05-ring-arc");
  const ringLength = 2 * Math.PI * 42;
  ring.style.strokeDasharray = `${ringLength}`;
  tl.fromTo(ring, { strokeDashoffset: ringLength }, { strokeDashoffset: ringLength * 0.16, duration: 1.1, ease: "power2.out" }, 13.0);
  count("#s05-water", 0, 2.1, 13.0, 1.1, one);
  leave(["#s05 .card", "#s05 .hl", "#s05-ring"], 14.75);

  // 06 — rest: one entrance, then stillness
  enter("#s06 .hl", 15.15);
  tl.fromTo("#s06 .card", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: IN }, 15.35);
  leave(["#s06 .card", "#s06 .hl"], 17.75);

  // 07 — the coach
  enter("#s07 .card", 18.1, { x: 220, d: 0.7 });
  enter("#s07 .hl", 18.3);
  tl.fromTo("#s07-mine", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: IN }, 18.35);
  tl.fromTo("#s07-typing", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none" }, 18.55);
  document.querySelectorAll("#s07-typing i").forEach((dotEl, i) => {
    tl.fromTo(dotEl, { opacity: 0.25 }, { opacity: 1, duration: 0.18, yoyo: true, repeat: 1, ease: "none" }, 18.6 + i * 0.12);
  });
  tl.to("#s07-typing", { opacity: 0, duration: 0.15, ease: "none" }, 18.95);
  tl.fromTo("#s07-coach", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.55, ease: IN }, 19.0);
  tl.to(["#s07 .card", "#s07 .hl"], { opacity: 0, duration: 0.35, ease: OUT }, 21.15);

  // 08 — the held beat: one short rise, then only a tiny tremor of the line
  tl.fromTo("#s08 .hl-line", { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: IN, stagger: 0.18 }, 21.6);
  tl.fromTo("#line-layer-inner", { y: 0 }, { y: 2, duration: 0.22, ease: "sine.inOut", yoyo: true, repeat: 5 }, 22.4);
  tl.to("#s08 .hl", { opacity: 0, duration: 0.3, ease: OUT }, 23.7);

  // 09 — the runner: the line gathers into the logo's heartbeat, the mark reveals along it
  const logo = document.getElementById("s09-logo");
  const logoBox = { left: logo.offsetLeft, top: logo.offsetTop, w: logo.offsetWidth, h: logo.offsetHeight };
  const heartbeatY = logoBox.top + logoBox.h * 0.557; // the logo's line sits at 55.7% of its height
  tl.fromTo("#s09-gather", { scaleX: 1, x: 0, y: 0, opacity: 1 }, {
    scaleX: logoBox.w / DOT_X, x: W / 2 - DOT_X / 2, y: heartbeatY - LINE_Y, duration: 0.7, ease: "power3.inOut",
  }, 24.0);
  tl.fromTo(logo, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.85, ease: "power2.out" }, 24.55);
  tl.to("#s09-gather", { opacity: 0, duration: 0.3, ease: "power1.out" }, 24.65);
  tl.fromTo("#s09-glow", { opacity: 0 }, { opacity: 0.34, duration: 0.8, ease: "power1.out" }, 25.1);
  tl.fromTo("#s09 .letter", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: IN, stagger: 0.06 }, 25.5);
  tl.to(["#s09-logo", "#s09-word", "#s09-glow"], { opacity: 0, duration: 0.25, ease: OUT }, 27.75);

  // 10 — close, then the flat line draws back in: the last frame equals the first
  enter("#s10-logo", 28.05, { x: 60 });
  enter("#s10 .hl", 28.2);
  enter("#s10-url", 28.4);
  tl.to(["#s10-logo", "#s10 .hl", "#s10-url"], { opacity: 0, duration: 0.3, ease: OUT }, 29.65);
  tl.fromTo("#s10-line", { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power2.inOut" }, 29.75);
  tl.fromTo("#s10-dot", { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none" }, 30.3);
  // The monitor's grid comes back with the line, so the last frame matches the first.
  tl.fromTo("#bg-inner", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.inOut", immediateRender: false }, 29.75);

  return tl;
};
