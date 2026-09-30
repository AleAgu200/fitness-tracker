/**
 * Transactional email (account verification and password recovery).
 *
 * The transport is chosen by EMAIL_TRANSPORT:
 * - unset: email is off. Recovery and verification stay disabled, so the app
 *   says they aren't available instead of claiming a message was sent.
 * - "log": prints the message to the server console. Development only — a
 *   recovery link in production logs would hand over the account.
 *
 * The SES transport is added once the sending domain is verified (see the
 * master plan, M1); until then nothing here reaches a real inbox.
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

function resolveTransport(): Transport | null {
  const kind = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (!kind) return null;
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

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!transport) throw new Error("email_disabled");
  await transport(message);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function layout(title: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
  const body = paragraphs.map(p => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#0A0A0B;color:#F2F2F2;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="font-size:11px;letter-spacing:2px;color:#E8FF59;margin:0 0 12px">PULSO</p>
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#E8FF59;color:#0A0A0B;padding:12px 18px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#9A9A9F;line-height:1.5">${escapeHtml(footer)}</p>
</div></body></html>`;
}

/** Password recovery: one-time link, valid for an hour. */
export function passwordResetEmail(to: string, url: string): EmailMessage {
  const subject = "Restablecé tu contraseña de PULSO";
  const intro = "Pediste restablecer la contraseña de tu cuenta PULSO. El enlace sirve una sola vez y vence en una hora.";
  const footer = "Si no fuiste vos, ignorá este correo: tu contraseña no cambia.";
  return {
    to,
    subject,
    text: `${intro}\n\n${url}\n\n${footer}`,
    html: layout(subject, [intro], { label: "ELEGIR NUEVA CONTRASEÑA", url }, footer),
  };
}

/** Email verification: confirms the athlete owns the address. */
export function verificationEmail(to: string, url: string): EmailMessage {
  const subject = "Confirmá tu correo en PULSO";
  const intro = "Confirmá que este correo es tuyo para poder recuperar tu cuenta si olvidás la contraseña. El enlace vence en 24 horas.";
  const footer = "Si no creaste una cuenta en PULSO, ignorá este correo.";
  return {
    to,
    subject,
    text: `${intro}\n\n${url}\n\n${footer}`,
    html: layout(subject, [intro], { label: "CONFIRMAR CORREO", url }, footer),
  };
}
