import nodemailer from "nodemailer";

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Sends an application email via SMTP. Works with any SMTP provider —
 * for Gmail use smtp.gmail.com:465 with an app password. Per-user Gmail
 * OAuth sending is a later phase.
 */
export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP is not configured (set SMTP_HOST and friends)");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? user ?? "jobbiq@localhost",
    to: options.to,
    subject: options.subject,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments,
  });
}
