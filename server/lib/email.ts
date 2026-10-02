import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

/**
 * Transactional email (account verification and password recovery).
 *
 * The transport is chosen by EMAIL_TRANSPORT:
 * - unset: email is off. Recovery and verification stay disabled, so the app
 *   says they aren't available instead of claiming a message was sent.
 * - "ses": Amazon SES v2. Credentials come from the default chain — the EC2
 *   instance role in production (infra/ses-permission-stack.yaml), a local
 *   AWS profile in development. EMAIL_FROM must be on the verified domain;
 *   replies go to EMAIL_REPLY_TO, the support inbox.
 * - "log": prints the message to the server console. Development only — a
 *   recovery link in production logs would hand over the account.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Transport = (message: EmailMessage) => Promise<void>;

const logTransport: Transport = async message => {
  console.info(`[email:log] to=${message.to} subject="${message.subject}"\n${message.text}`);
};

function sesTransport(): Transport {
  const client = new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION || "us-east-2" });
  const from = process.env.EMAIL_FROM || "PULSO <no-reply@pulsofitness.tech>";
  const replyTo = process.env.EMAIL_REPLY_TO || "pulso@pulsofitness.tech";
  return async message => {
    await client.send(new SendEmailCommand({
      FromEmailAddress: from,
      ReplyToAddresses: [replyTo],
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            Html: { Data: message.html, Charset: "UTF-8" },
          },
        },
      },
    }));
  };
}

function resolveTransport(): Transport | null {
  const kind = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (!kind) return null;
  if (kind === "ses") return sesTransport();
  if (kind === "log") {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] EMAIL_TRANSPORT=log is refused in production; email stays disabled.");
      return null;
    }
    return logTransport;
  }
  console.error(`[email] Unknown EMAIL_TRANSPORT "${kind}"; email stays disabled.`);
  return null;
}

const transport = resolveTransport();

export function emailEnabled(): boolean {
  return transport != null;
}

/**
 * Sends and never throws: a failure is logged (without the message, which
 * carries a one-time link) and swallowed. Otherwise a recovery request would
 * fail only for addresses that have an account, revealing who uses PULSO.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!transport) {
    console.error("[email] send skipped: no transport configured");
    return;
  }
  try {
    await transport(message);
  } catch (error) {
    const e = error as { name?: string; message?: string };
    console.error(`[email] send failed subject="${message.subject}": ${e.name ?? "Error"} ${e.message ?? ""}`);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const SUPPORT_EMAIL = () => process.env.EMAIL_REPLY_TO || "pulso@pulsofitness.tech";

/** Everything a PULSO email is made of; `layout` renders it the same way every time. */
interface EmailContent {
  subject: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  /** Short labelled facts (plan, renewal date…), shown as a block. */
  details?: { label: string; value: string }[];
  action?: { label: string; url: string };
  /** Why this email arrived / what to do if it wasn't you. */
  note: string;
}

function greeting(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hola, ${first}.` : "Hola.";
}

/**
 * Branded, table-based HTML that survives Gmail, Outlook and Apple Mail, with
 * a plain-text twin. Links are also printed in full: some clients strip buttons.
 */
function render(to: string, content: EmailContent): EmailMessage {
  const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#D7D7DC">${escapeHtml(text)}</p>`;
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 18px;border:1px solid #26262B">${content.details.map(d =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #1B1B1E;font-size:11px;letter-spacing:1px;color:#8A8A90;text-transform:uppercase;font-family:Menlo,Consolas,monospace">${escapeHtml(d.label)}</td><td style="padding:10px 12px;border-bottom:1px solid #1B1B1E;font-size:14px;color:#F2F2F2;text-align:right">${escapeHtml(d.value)}</td></tr>`).join("")}</table>`
    : "";
  const action = content.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 14px"><tr><td style="background:#E8FF59"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:14px 22px;font-size:13px;letter-spacing:1px;font-weight:bold;color:#0A0A0B;text-decoration:none;font-family:Menlo,Consolas,monospace">${escapeHtml(content.action.label)}</a></td></tr></table>
<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#8A8A90">Si el botón no funciona, copiá este enlace:<br><a href="${escapeHtml(content.action.url)}" style="color:#3DDCFF;word-break:break-all">${escapeHtml(content.action.url)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#0A0A0B">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;max-width:0;overflow:hidden">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0A0A0B"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;font-family:Helvetica,Arial,sans-serif">
<tr><td style="padding:0 0 18px;font-family:Menlo,Consolas,monospace;font-size:12px;letter-spacing:4px;color:#E8FF59;font-weight:bold">PULSO</td></tr>
<tr><td style="background:#121214;border:1px solid #26262B;border-top:3px solid #E8FF59;padding:26px 24px">
<p style="margin:0 0 8px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:2px;color:#3DDCFF">${escapeHtml(content.eyebrow)}</p>
<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#F2F2F2">${escapeHtml(content.title)}</h1>
${content.paragraphs.map(p).join("")}
${details}
${action}
<p style="margin:12px 0 0;padding-top:14px;border-top:1px solid #26262B;font-size:12px;line-height:1.5;color:#8A8A90">${escapeHtml(content.note)}</p>
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:11px;line-height:1.6;color:#6B6B70">PULSO · Entrená y comé con un plan real.<br>¿Dudas? Escribinos a <a href="mailto:${escapeHtml(SUPPORT_EMAIL())}" style="color:#8A8A90">${escapeHtml(SUPPORT_EMAIL())}</a>.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.title,
    "",
    ...content.paragraphs,
    ...(content.details?.length ? ["", ...content.details.map(d => `${d.label}: ${d.value}`)] : []),
    ...(content.action ? ["", `${content.action.label}: ${content.action.url}`] : []),
    "",
    content.note,
    "",
    `PULSO · ${SUPPORT_EMAIL()}`,
  ].join("\n");
  return { to, subject: content.subject, text, html };
}

function formatDate(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Tegucigalpa" });
}

// ── account ──────────────────────────────────────────────────────────────────

/** Password recovery: one-time link, valid for an hour. */
export function passwordResetEmail(to: string, url: string, name?: string | null): EmailMessage {
  return render(to, {
    subject: "Restablecé tu contraseña de PULSO",
    preheader: "El enlace sirve una sola vez y vence en una hora.",
    eyebrow: "SEGURIDAD",
    title: "Elegí una nueva contraseña",
    paragraphs: [greeting(name), "Pediste restablecer la contraseña de tu cuenta PULSO. Al cambiarla se cierran las sesiones abiertas en otros dispositivos."],
    details: [{ label: "Vence", value: "en 1 hora" }, { label: "Uso", value: "una sola vez" }],
    action: { label: "ELEGIR NUEVA CONTRASEÑA", url },
    note: "Si no fuiste vos, ignorá este correo: tu contraseña no cambia.",
  });
}

/** Email verification: confirms the person owns the address. */
export function verificationEmail(to: string, url: string, name?: string | null): EmailMessage {
  return render(to, {
    subject: "Confirmá tu correo en PULSO",
    preheader: "Un toque y tu cuenta queda protegida.",
    eyebrow: "CONFIRMACIÓN",
    title: "Confirmá que este correo es tuyo",
    paragraphs: [greeting(name), "Así podés recuperar tu cuenta si olvidás la contraseña y entrar con un enlace mágico desde cualquier dispositivo."],
    details: [{ label: "Vence", value: "en 24 horas" }],
    action: { label: "CONFIRMAR CORREO", url },
    note: "Si no creaste una cuenta en PULSO, ignorá este correo.",
  });
}

/** Passwordless sign-in. In the app flow `url` opens a page that hands the link to the app. */
export function magicLinkEmail(to: string, url: string, forApp: boolean): EmailMessage {
  return render(to, {
    subject: "Tu enlace para entrar a PULSO",
    preheader: "Entrá sin contraseña. El enlace vence en 10 minutos.",
    eyebrow: "ACCESO",
    title: forApp ? "Abrí PULSO con un toque" : "Entrá al portal PULSO",
    paragraphs: [
      forApp
        ? "Tocá el botón desde el teléfono donde tenés PULSO instalado y la app se abre con tu sesión iniciada."
        : "Usá este enlace para entrar al portal profesional sin escribir tu contraseña.",
    ],
    details: [{ label: "Vence", value: "en 10 minutos" }, { label: "Uso", value: "una sola vez" }],
    action: { label: forApp ? "ABRIR PULSO" : "ENTRAR AL PORTAL", url },
    note: "Si no lo pediste, ignorá este correo: nadie puede entrar sin este enlace.",
  });
}

/** First email after creating an athlete account. */
export function welcomeEmail(to: string, name?: string | null): EmailMessage {
  return render(to, {
    subject: "Bienvenido a PULSO",
    preheader: "Tu plan, tu registro y tu equipo, en un solo lugar.",
    eyebrow: "BIENVENIDA",
    title: "Tu cuenta PULSO está lista",
    paragraphs: [
      greeting(name),
      "PULSO junta lo que entrenás y lo que comés con el plan que te armaste o que te asignó tu profesional. Todo funciona sin conexión y se sincroniza cuando vuelve la señal.",
      "Para empezar: completá tu perfil, generá o elegí un plan en Mis planes y registrá tu primera comida o tu primer entreno. Si trabajás con un coach o nutricionista, ingresá su código en Equipo.",
    ],
    note: "Recibís este correo porque creaste una cuenta en PULSO.",
  });
}

/** Sent when a coach or nutritionist signs up and approvals are on. */
export function professionalRequestEmail(to: string, name: string | null, discipline: "coach" | "nutritionist"): EmailMessage {
  return render(to, {
    subject: "Recibimos tu solicitud profesional en PULSO",
    preheader: "Te avisamos por correo apenas esté revisada.",
    eyebrow: "PORTAL PROFESIONAL",
    title: "Estamos revisando tu cuenta",
    paragraphs: [
      greeting(name),
      `Recibimos tu alta como ${discipline === "coach" ? "entrenador" : "nutricionista"}. Revisamos cada cuenta profesional a mano antes de habilitar el acceso a atletas.`,
      "Mientras tanto podés entrar al portal y completar tu perfil. Te escribimos cuando esté aprobada.",
    ],
    note: "Si no pediste una cuenta profesional, respondé este correo y la damos de baja.",
  });
}

export function professionalApprovedEmail(to: string, name: string | null, portalUrl: string): EmailMessage {
  return render(to, {
    subject: "Tu cuenta profesional en PULSO fue aprobada",
    preheader: "Ya podés invitar a tu primer atleta.",
    eyebrow: "PORTAL PROFESIONAL",
    title: "Ya tenés acceso completo",
    paragraphs: [
      greeting(name),
      "Tu cuenta profesional está aprobada. Desde el portal podés generar un código de invitación, asignar planes y revisar el progreso que tus atletas decidan compartir.",
    ],
    action: { label: "ABRIR EL PORTAL", url: portalUrl },
    note: "Recibís este correo porque pediste una cuenta profesional en PULSO.",
  });
}

export function professionalRejectedEmail(to: string, name: string | null, reason?: string | null): EmailMessage {
  return render(to, {
    subject: "Sobre tu solicitud profesional en PULSO",
    preheader: "No pudimos aprobar tu cuenta profesional por ahora.",
    eyebrow: "PORTAL PROFESIONAL",
    title: "No pudimos aprobar tu cuenta",
    paragraphs: [
      greeting(name),
      "Revisamos tu solicitud y por ahora no podemos habilitar el acceso profesional.",
      ...(reason?.trim() ? [`Motivo: ${reason.trim()}`] : []),
      "Tu cuenta sigue existiendo y podés usar PULSO como atleta. Si creés que es un error, respondé este correo.",
    ],
    note: "Recibís este correo porque pediste una cuenta profesional en PULSO.",
  });
}

export function accountSuspendedEmail(to: string, name: string | null): EmailMessage {
  return render(to, {
    subject: "Tu cuenta PULSO fue suspendida",
    preheader: "No podés iniciar sesión mientras dure la suspensión.",
    eyebrow: "CUENTA",
    title: "Suspendimos tu cuenta",
    paragraphs: [
      greeting(name),
      "Tu cuenta PULSO está suspendida y se cerraron sus sesiones. Tus datos no se borraron.",
      "Si querés saber el motivo o pedir que la revisemos, respondé este correo.",
    ],
    note: "Recibís este correo porque un administrador de PULSO cambió el estado de tu cuenta.",
  });
}

// ── subscription ─────────────────────────────────────────────────────────────

export function plusActivatedEmail(to: string, name: string | null, periodEndsAt: number | null, renewal: boolean): EmailMessage {
  const until = formatDate(periodEndsAt);
  return render(to, {
    subject: renewal ? "Tu PULSO Plus se renovó" : "Bienvenido a PULSO Plus",
    preheader: renewal ? "Seguís con todos los beneficios de Plus." : "Planes propios sin límite, sin anuncios y más.",
    eyebrow: "PULSO PLUS",
    title: renewal ? "Plus renovado" : "Plus está activo",
    paragraphs: [
      greeting(name),
      renewal
        ? "Tu suscripción se renovó sin problemas. Todo sigue igual en tu cuenta."
        : "Gracias por apoyar PULSO. Ya tenés: planes propios sin límite de entreno y dieta, generación con IA, lectura de etiquetas y una experiencia sin anuncios.",
    ],
    details: until ? [{ label: renewal ? "Próxima renovación" : "Período actual hasta", value: until }] : undefined,
    note: "Gestionás o cancelás la suscripción desde los ajustes de tu tienda (App Store o Google Play), no desde PULSO.",
  });
}

export function billingIssueEmail(to: string, name: string | null, periodEndsAt: number | null): EmailMessage {
  const until = formatDate(periodEndsAt);
  return render(to, {
    subject: "No pudimos cobrar tu PULSO Plus",
    preheader: "Actualizá tu método de pago para no perder Plus.",
    eyebrow: "PULSO PLUS",
    title: "Hubo un problema con el cobro",
    paragraphs: [
      greeting(name),
      "La tienda no pudo cobrar la renovación de tu suscripción. Plus sigue activo mientras la tienda vuelve a intentarlo.",
      "Revisá tu método de pago en los ajustes de App Store o Google Play para no perder los beneficios.",
    ],
    details: until ? [{ label: "Acceso asegurado hasta", value: until }] : undefined,
    note: "Tus datos y tus planes no se borran aunque Plus se interrumpa.",
  });
}

export function subscriptionEndedEmail(to: string, name: string | null, kind: "cancelled" | "expired", periodEndsAt: number | null): EmailMessage {
  const until = formatDate(periodEndsAt);
  const cancelled = kind === "cancelled";
  return render(to, {
    subject: cancelled ? "Cancelaste PULSO Plus" : "Tu PULSO Plus terminó",
    preheader: cancelled ? "Mantenés Plus hasta el fin del período pagado." : "Seguís usando PULSO con tu plan propio y tu historial.",
    eyebrow: "PULSO PLUS",
    title: cancelled ? "Tu suscripción no se va a renovar" : "Plus terminó",
    paragraphs: [
      greeting(name),
      cancelled
        ? "Recibimos la cancelación. Mantenés todos los beneficios hasta el final del período que ya pagaste."
        : "Tu suscripción a Plus terminó. Nada de lo tuyo se borra: tu historial, tus registros y tus planes siguen en la app.",
      "Sin Plus seguís usando tu plan propio más reciente; los demás planes propios quedan en solo lectura hasta que vuelvas.",
    ],
    details: until ? [{ label: cancelled ? "Plus activo hasta" : "Terminó el", value: until }] : undefined,
    note: "Podés volver a Plus cuando quieras desde la app.",
  });
}
