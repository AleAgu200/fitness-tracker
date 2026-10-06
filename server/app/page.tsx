import Link from "next/link";

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
          <p className={styles.note}>
            Llega pronto a Google Play. Registrar es gratis; PULSO Plus es opcional.
          </p>
        </div>

        <div className={styles.heroVisual} aria-label="Vista previa de la pantalla Hoy de la app PULSO">
          <svg className={styles.heroPulse} viewBox="0 0 720 280" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <path d="M0 156h170l14 0 12-30 16 64 14-150 18 120 12-20 14 16h110l10-14 12 22 10-8h298" />
          </svg>

          <div className={styles.phone}>
            <div className={styles.phoneTop}>
              <span>06:12</span>
              <span className={styles.island} />
              <span>84%</span>
            </div>
            <div className={styles.phoneHeader}>
              <div>
                <small>LUN 6 OCT</small>
                <strong>Hola, Alex</strong>
              </div>
              <span className={styles.avatar}>AL</span>
            </div>

            <div className={styles.sessionCard}>
              <small>SESIÓN DE HOY · PIERNA A</small>
              <strong>Sentadilla</strong>
              <div className={styles.setLine}>
                <span>Serie 3 de 3</span>
                <b>62.5 kg × 8</b>
              </div>
              <div className={styles.track}><span /></div>
              <div className={styles.sessionFoot}>
                <span>3 de 7 ejercicios</span>
                <span className={styles.continue}>CONTINUAR</span>
              </div>
            </div>

            <div className={styles.metricRow}>
              <div><small>CARGA 7D</small><strong>Media</strong></div>
              <div><small>NUTRICIÓN</small><strong>1 840</strong></div>
              <div><small>RACHA</small><strong>11 días</strong></div>
            </div>

            <div className={styles.miniCard}>
              <div><small>LÍQUIDOS</small><strong>2.1 L</strong></div>
              <div className={styles.miniTrack}><span /></div>
            </div>
            <div className={styles.miniCard}>
              <div><small>SUEÑO · ANOCHE</small><strong>7 h 12 min</strong></div>
            </div>

            <nav className={styles.tabBar} aria-hidden="true">
              <span className={styles.tabActive}>HOY</span>
              <span>DIETA</span>
              <span>ENTRENO</span>
              <span>PERFIL</span>
            </nav>
          </div>

          <div className={styles.heroNotes}>
          <div className={styles.coachNote}>
            <div className={styles.coachHead}>
              <span className={styles.coachAvatar}>D</span>
              <div><strong>Diego · Coach</strong><small>Hoy, 07:14</small></div>
            </div>
            <p>¡Nuevo récord! La semana que viene probamos 65 kg.</p>
          </div>

          <div className={styles.offlineTag}>
            <span aria-hidden="true">↯</span>
            <div><strong>Sin señal</strong><small>Todo se guarda en tu teléfono</small></div>
          </div>
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
        <p className={styles.finalNote}>
          PULSO llega pronto a Google Play. Si sos entrenador o nutricionista, ya podés crear tu espacio.
        </p>
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
