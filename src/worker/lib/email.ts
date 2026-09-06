import type { Bindings } from "../env";

export type Mail = { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string; attachments?: { filename: string; content: Uint8Array }[] };

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Sends through Resend when RESEND_API_KEY is set. In development (no key) the message is
 * printed to the terminal instead, including any magic link, so the whole loop works offline.
 */
export async function sendEmail(env: Bindings, mail: Mail): Promise<void> {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (!to.length) return;
  if (!env.RESEND_API_KEY) {
    if (env.ENVIRONMENT !== "development") {
      // Refuse to run a production Worker with no email provider: nothing should be printed to logs.
      throw new Error("RESEND_API_KEY is not configured");
    }
    const line = "─".repeat(72);
    const files = (mail.attachments ?? []).map((a) => `\nAttachment: ${a.filename} (${Math.max(1, Math.round(a.content.length / 1024))} KB)`).join("");
    console.log(`\n${line}\n📧  DEV EMAIL (not sent)\nTo:      ${to.join(", ")}${mail.replyTo ? `\nReply-to: ${mail.replyTo}` : ""}\nSubject: ${mail.subject}${files}\n\n${mail.text}\n${line}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? textToHtml(mail.text, env.APP_URL),
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: base64(a.content) })) } : {}),
    }),
  });
  if (!res.ok) {
    console.error("resend error", res.status, await res.text().catch(() => ""));
  }
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isOurs(url: string, appUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function textToHtml(text: string, appUrl: string): string {
  // Only links on our own origin become clickable ("quoteandsign.com.evil.example" does not).
  // Anything a signer or client typed stays plain text.
  const body = text
    .split(/(https?:\/\/[^\s"<>]+)/g)
    .map((part, i) => (i % 2 === 1 && isOurs(part, appUrl) ? `<a href="${escape(part)}">${escape(part)}</a>` : escape(part)))
    .join("")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:560px"><p>${body}</p></div>`;
}
