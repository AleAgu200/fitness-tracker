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
