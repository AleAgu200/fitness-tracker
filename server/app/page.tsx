import type { Metadata } from "next";
import Link from "next/link";

import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

import { DemoVideo } from "./demo-video";
import styles from "./page.module.css";

/** The real logo (runner + heartbeat): draws in on load, then beats now and then. */
function LogoMark({ large = false }: { large?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain
  return <img className={large ? styles.logoLarge : styles.logoMark} src="/brand/pulso-mark.svg" alt="" width={large ? 240 : 36} height={large ? 161 : 24} />;
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m3 8 3 3 7-7" />
    </svg>
  );
}

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** What search engines read about PULSO: the publisher, the site, the app and the demo video. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "PULSO",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      email: "pulso@pulsofitness.tech",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "PULSO",
      inLanguage: "es",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "MobileApplication",
      name: "PULSO",
      operatingSystem: "Android, iOS",
      applicationCategory: "HealthApplication",
      description: SITE_DESCRIPTION,
      inLanguage: "es",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "VideoObject",
      name: "PULSO en 30 segundos",
      description: "Series, récords, comidas, agua, sueño y los mensajes de tu entrenador, en el mismo lugar.",
      thumbnailUrl: `${SITE_URL}/media/pulso-demo-16x9.jpg`,
      contentUrl: `${SITE_URL}/media/pulso-demo-16x9.mp4`,
      uploadDate: "2026-10-06",
      duration: "PT30S",
      inLanguage: "es",
    },
  ],
};

/** Store listings. Fill in each URL when the app is published; until then the badge is not a link. */
const STORE_LINKS: { googlePlay: string | null; appStore: string | null } = { googlePlay: null, appStore: null };

function GooglePlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function StoreBadges() {
  const badges = [
    { key: "googlePlay", href: STORE_LINKS.googlePlay, store: "Google Play", icon: <GooglePlayIcon /> },
    { key: "appStore", href: STORE_LINKS.appStore, store: "App Store", icon: <AppleIcon /> },
  ];
  return (
    <div className={styles.storeBadges}>
      {badges.map(({ key, href, store, icon }) => href ? (
        <a key={key} className={styles.storeBadge} href={href} target="_blank" rel="noopener noreferrer">
          {icon}<span>{store}</span>
        </a>
      ) : (
        <span key={key} className={styles.storeBadge} aria-label={`${store}, próximamente`}>
          {icon}<span aria-hidden="true">{store}</span>
        </span>
      ))}
    </div>
  );
}

const capabilities = ["Entrenamiento", "Nutrición", "Agua y sueño", "Récords", "Tu equipo"];

const daySteps = [
  {
    time: "06:10",
    title: "Entrená con intención",
    copy: "Series, cargas y descansos en segundos. Tus récords y tu 1RM estimado se calculan solos.",
  },
  {
    time: "13:00",
    title: "Comé dentro del plan",
    copy: "Buscá el alimento, escaneá el código de barras o la tabla nutricional y sumá el agua del día.",
  },
  {
    time: "22:30",
    title: "Cerrá el día con evidencia",
    copy: "Sueño, peso y check-in semanal. Menos memoria selectiva, más contexto para ajustar mañana.",
  },
];

const professionalTools = [
  ["Planes", "Armá entrenamientos y planes de comida, y asignalos sin rehacer el trabajo."],
  ["Check-ins", "Revisá las respuestas de cada semana y decidí el próximo ajuste."],
  ["Atención", "Lo que importa primero: quién necesita una mirada hoy."],
  ["Mensajes", "Hablá con tu atleta en el mismo sistema donde entrena y come."],
];

const portalNav = ["Atención", "Atletas", "Equipo", "Alimentos", "Ejercicios"];

export default function Home() {
  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>

      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="PULSO, inicio">
          <LogoMark />
          <span>PULSO</span>
        </Link>

        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#demo">Demo</a>
          <a href="#sistema">Cómo funciona</a>
          <a href="#privacidad">Tus datos</a>
          <a href="#profesionales">Profesionales</a>
        </nav>

        <Link className={styles.headerCta} href="/portal">
          Portal profesional
          <ArrowIcon />
        </Link>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={styles.hero} id="contenido">
        <div className={styles.heroCopy}>
          <h1>
            Entrená como la persona que dijiste que <em>serías.</em>
          </h1>
          <p className={styles.lede}>
            PULSO junta tu entrenamiento, tu nutrición, tu descanso y la guía de tu entrenador en una
            sola app. Funciona sin señal y tus datos se quedan en tu teléfono.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryCta} href="#demo">
              Ver la demo
              <ArrowIcon />
            </a>
            <Link className={styles.textCta} href="/portal">
              Soy profesional
            </Link>
          </div>
          <StoreBadges />
        </div>

        <div className={styles.deviceStage} aria-label="Vista previa de la app PULSO">
          <div className={styles.stagePulse} aria-hidden="true">
            <svg viewBox="0 0 720 280" preserveAspectRatio="none" fill="none">
              <path className={styles.pulseGlow} d="M0 156h108l20-46 34 92 42-136 34 90h86l16-31 30 59 34-28h316" />
              <path className={styles.pulseCore} d="M0 156h108l20-46 34 92 42-136 34 90h86l16-31 30 59 34-28h316" />
            </svg>
          </div>

          <div className={styles.phone}>
            <div className={styles.phoneTop}>
              <span>06:08</span>
              <span className={styles.dynamicIsland} />
              <span>84%</span>
            </div>
            <div className={styles.phoneHeader}>
              <div>
                <span>HOY · SÁB 15</span>
                <strong>Buenos días, Alex.</strong>
              </div>
              <span className={styles.avatar}>AL</span>
            </div>

            <div className={styles.readinessRow}>
              <div className={styles.readinessScore}>
                <span className={styles.scoreRing}>82</span>
                <div>
                  <small>DISPOSICIÓN</small>
                  <strong>Listo para entrenar</strong>
                </div>
              </div>
              <span className={styles.liveDot}>EN LÍNEA</span>
            </div>

            <div className={styles.workoutPanel}>
              <div className={styles.panelMeta}>
                <span>FUERZA · PIERNA A</span>
                <span>55 MIN</span>
              </div>
              <strong>El trabajo de hoy</strong>
              <div className={styles.exerciseLine}>
                <span>Sentadilla trasera</span>
                <b>4 × 6</b>
              </div>
              <div className={styles.progressTrack}><span /></div>
              <div className={styles.panelFooter}>
                <span>2 de 7 ejercicios</span>
                <span>Continuar →</span>
              </div>
            </div>

            <div className={styles.dailyStats}>
              <div><span>COMIDAS</span><strong>2 / 4</strong></div>
              <div><span>AGUA</span><strong>1.8 L</strong></div>
              <div><span>RACHA</span><strong>11 días</strong></div>
            </div>

            <div className={styles.phoneNav}>
              <span className={styles.activeNav}><i />Hoy</span>
              <span><i />Dieta</span>
              <span><i />Entreno</span>
              <span><i />Perfil</span>
            </div>
          </div>

          <div className={styles.coachNote}>
            <div className={styles.noteTop}>
              <span className={styles.noteAvatar}>C</span>
              <div><strong>Tu coach</strong><small>Hoy, 07:14</small></div>
              <span className={styles.noteStatus} />
            </div>
            <p>Controlá la bajada. No regales la última repetición.</p>
            <span className={styles.sampleLabel}>EJEMPLO DE MENSAJE</span>
          </div>

          <div className={styles.offlineTag}>
            <span className={styles.offlineIcon}>↯</span>
            <div><strong>Sin señal</strong><small>Todo sigue guardándose</small></div>
          </div>
        </div>
      </section>

      <div className={styles.rail} aria-label="Lo que reúne PULSO">
        {capabilities.map((item) => <span key={item}>{item}</span>)}
      </div>

      {/* ── Demo ─────────────────────────────────────────────────────────── */}
      <section className={styles.demoSection} id="demo" aria-labelledby="demo-heading">
        <div className={styles.sectionIntro}>
          <h2 id="demo-heading">Todo tu día. <em>Un solo pulso.</em></h2>
          <p>Series, récords, comidas, agua, sueño y los mensajes de tu entrenador, en el mismo lugar. Treinta segundos, sin sonido.</p>
        </div>
        <DemoVideo />
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className={styles.systemSection} id="sistema" aria-label="Cómo funciona PULSO">
        <div className={styles.comparison}>
          <svg className={styles.comparisonPulse} viewBox="0 0 1400 160" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <path className={styles.brokenPulse} d="M0 84h94m34 0h118m42 0h76m52 0h126m46 0h112" />
            <path className={styles.strongPulse} d="M700 84h78l20-20 22 43 31-91 34 68h54l18-28 24 54 30-94 33 68h64l17-18 19 36 25-66 27 48h204" />
            <circle className={styles.pulseSwitch} cx="700" cy="84" r="6" />
          </svg>

          <article className={styles.comparisonSide}>
            <p className={styles.sideLabel}><span /> Sin un sistema</p>
            <h2>Todo queda suelto.</h2>
            <p>La rutina en una app, las comidas en otra y el seguimiento perdido entre chats, notas y memoria.</p>
          </article>

          <article className={`${styles.comparisonSide} ${styles.solutionSide}`}>
            <p className={styles.sideLabel}><span /> Con PULSO</p>
            <h2>Todo tiene su lugar.</h2>
            <p>Entreno, comidas, agua, sueño, check-ins y tu entrenador, conectados en un solo sistema.</p>
          </article>
        </div>

        <div className={styles.dayLayout}>
          <div className={styles.dayStatement}>
            <span className={styles.giantDay} aria-hidden="true">24H</span>
            <p>Un día completo, conectado. Cada registro suma a una imagen honesta de tu progreso.</p>
          </div>

          <ol className={styles.dayTimeline}>
            {daySteps.map((step) => (
              <li key={step.time}>
                <time>{step.time}</time>
                <span className={styles.timelineMarker} aria-hidden="true" />
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────────────── */}
      <section className={styles.privacySection} id="privacidad" aria-labelledby="privacy-heading">
        <div className={styles.sectionIntro}>
          <span className={styles.lockBadge}><LockIcon /></span>
          <h2 id="privacy-heading">Tu esfuerzo es personal. <em>Tus datos también.</em></h2>
          <p>
            PULSO es local-first: el detalle de tus entrenamientos, comidas y medidas vive en tu teléfono.
            Vos decidís qué ve tu equipo, y lo podés revocar cuando quieras.
          </p>
        </div>

        <div className={styles.dataFlow} aria-label="Qué queda en tu teléfono y qué ve tu equipo">
          <div className={styles.dataNode}>
            <small>EN TU TELÉFONO</small>
            <strong>El registro completo</strong>
            <ul>
              <li><CheckIcon /> Series y cargas</li>
              <li><CheckIcon /> Comidas y agua</li>
              <li><CheckIcon /> Peso, medidas y sueño</li>
            </ul>
          </div>

          <div className={styles.transfer}>
            <strong>Solo lo que autorizás</strong>
            <div className={styles.transferDots} aria-hidden="true"><i /><i /><i /></div>
            <small>Por categoría. Revocable en cualquier momento.</small>
          </div>

          <div className={`${styles.dataNode} ${styles.dataNodeTeam}`}>
            <small>CON TU EQUIPO</small>
            <strong>Lo que elegís compartir</strong>
            <ul>
              <li><CheckIcon /> Entrenamiento</li>
              <li><CheckIcon /> Nutrición</li>
              <li><CheckIcon /> Medidas y check-ins</li>
            </ul>
          </div>
        </div>
        <p className={styles.privacyFoot}>
          El respaldo en la nube y la sincronización entre dispositivos son opcionales y tienen su propio permiso.{" "}
          <Link href="/privacidad">Leé la política de privacidad</Link>.
        </p>
      </section>

      {/* ── Offline ──────────────────────────────────────────────────────── */}
      <section className={styles.offlineSection} aria-labelledby="offline-heading">
        <svg className={styles.ecgBackdrop} viewBox="0 0 1600 420" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path
            className={styles.ecgTrace}
            d="M0 235H90l30-15 22 35 23-60 25 40h35l25-85 25 165L330 52l55 183h90l25-25 22 50 28-110 35 85h90l25-17 24 32 26-70 30 55h85l23-11 22 21 22-40 23 30h85l15-6 15 12 18-23 17 17h95l10-3 10 6 12-12 13 9h95l6-1 8 2 6-5 10 4h230"
          />
        </svg>

        <h2 id="offline-heading">
          <span>Sin wi-fi. Sin datos.</span>
          <em>PULSO sigue funcionando.</em>
        </h2>
        <p>
          Aunque no tengas conexión, abrís tu rutina, registrás cada serie y consultás tu plan de comidas.
          Todo se guarda en tu teléfono y se sincroniza cuando vuelve la señal.
        </p>
      </section>

      {/* ── Professionals ────────────────────────────────────────────────── */}
      <section className={styles.professionalSection} id="profesionales" aria-labelledby="pro-heading">
        <div className={styles.professionalIntro}>
          <h2 id="pro-heading">Menos hilos perdidos. <em>Más contexto para decidir.</em></h2>
          <div>
            <p>
              Para entrenadores y nutricionistas: planes, check-ins y mensajes en un portal pensado para
              acompañar personas reales, no para administrar números anónimos.
            </p>
            <Link className={styles.primaryCta} href="/portal">
              Crear cuenta profesional
              <ArrowIcon />
            </Link>
          </div>
        </div>

        <div className={styles.portalWindow} aria-label="Vista previa del portal profesional">
          <div className={styles.windowBar}>
            <div aria-hidden="true"><i /><i /><i /></div>
            <span>pulsofitness.tech/portal</span>
          </div>
          <div className={styles.portalBody}>
            <aside>
              <div className={styles.portalLogo}><LogoMark /> PULSO</div>
              {portalNav.map((item, index) => (
                <span key={item} className={index === 0 ? styles.portalActive : undefined}>{item}</span>
              ))}
            </aside>
            <div className={styles.portalContent}>
              <div className={styles.portalHeader}>
                <div><small>ATLETA</small><strong>Alex R.</strong></div>
                <span>Últimos 7 días</span>
              </div>
              <div className={styles.adherence}>
                <div><small>ADHERENCIA</small><strong>86%</strong></div>
                <div className={styles.weekBars} aria-hidden="true">
                  {[72, 90, 84, 100, 62, 88, 94].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              <div className={styles.portalLower}>
                <div className={styles.trendPanel}>
                  <small>VOLUMEN SEMANAL</small>
                  <svg viewBox="0 0 360 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <path d="M2 83C42 84 42 61 81 64s49 15 81 2 43-37 80-29 46 20 65 5 31-17 51-21" />
                  </svg>
                </div>
                <div className={styles.alertPanel}>
                  <small>LISTO PARA REVISAR</small>
                  <strong>Check-in semanal</strong>
                  <span>Enviado hace 18 min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <dl className={styles.toolList}>
          {professionalTools.map(([title, copy]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{copy}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Close ────────────────────────────────────────────────────────── */}
      <section className={styles.finalCta} aria-labelledby="final-heading">
        <LogoMark large />
        <p>El cambio no necesita otro lunes.</p>
        <h2 id="final-heading">Necesita tu <em>siguiente repetición.</em></h2>
        <StoreBadges />
        <p className={styles.finalNote}>Si sos entrenador o nutricionista, ya podés crear tu espacio.</p>
        <div className={styles.actions}>
          <Link className={styles.primaryCta} href="/portal">
            Crear cuenta profesional
            <ArrowIcon />
          </Link>
          <a className={styles.textCta} href="mailto:pulso@pulsofitness.tech">Escribinos</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.wordmark} href="/" aria-label="PULSO, inicio">
          <LogoMark />
          <span>PULSO</span>
        </Link>
        <p>Entreno, nutrición y descanso. Un solo pulso.</p>
        <div>
          <Link href="/portal">Portal profesional</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/eliminar-cuenta">Borrar mi cuenta</Link>
        </div>
      </footer>
    </main>
  );
}
