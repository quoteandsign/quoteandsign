import type { Bindings } from "../env";

export type Mail = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array }[];
  /** Who the message is from, as the reader sees it: the sender's business, or Quote and Sign. */
  brand?: string | null;
  /** The sender's accent colour, #rrggbb. Used for the button and the small mark. */
  accent?: string | null;
  /** A headline above the body. */
  heading?: string;
  /** Buttons under the body. Links on our own origin, or a payment link the sender configured. */
  buttons?: { label: string; url: string }[];
  /** Text a visitor wrote (a question, a reason). Shown as a quoted block, never made clickable. */
  quote?: string;
};

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
      html: mail.html ?? renderHtml(mail, env.APP_URL),
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

function accentOf(hex: string | null | undefined): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#2b3f8c";
}

/** Black or white, whichever reads on the colour. */
function readable(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? "#111111" : "#ffffff";
}

/**
 * The HTML side of every email. Plain text in, a tidy card out: the sender's name at the top,
 * a headline, the body with our own links made clickable, buttons, and a quiet footer.
 * Only links on our own origin become clickable ("quoteandsign.com.evil.example" does not);
 * anything a signer or client typed stays plain text. Buttons are ours or the sender's payment link.
 */
export function renderHtml(mail: Mail, appUrl: string): string {
  const accent = accentOf(mail.accent);
  const fg = readable(accent);
  const brand = (mail.brand ?? "").trim() || "Quote and Sign";
  // The text body already carries every link; in HTML the buttons say it better, so drop bare
  // duplicates of button URLs from the paragraphs.
  const buttonUrls = new Set((mail.buttons ?? []).map((b) => b.url));
  const linkify = (t: string) =>
    t
      .split(/(https?:\/\/[^\s"<>]+)/g)
      .map((part, i) => (i % 2 === 1 && isOurs(part, appUrl) ? `<a href="${escape(part)}" style="color:${accent};word-break:break-all">${escape(part)}</a>` : escape(part)))
      .join("");
  // Line by line: a link that is already a button is not repeated; "Label: our-link" reads as the
  // label; the content hash is set small. Everything else is escaped text with our links clickable.
  const line = (l: string): string | null => {
    const t = l.trim();
    if (!t) return null;
    if (buttonUrls.has(t)) return null;
    const labelled = /^([^:]{1,60}):\s*(https?:\/\/\S+)$/.exec(t);
    if (labelled) {
      const [, label, url] = labelled as unknown as [string, string, string];
      if (buttonUrls.has(url)) return null;
      if (isOurs(url, appUrl)) return `<a href="${escape(url)}" style="color:${accent}">${escape(label)}</a>`;
    }
    if (/^content hash:/i.test(t)) return `<span style="font-size:12px;color:#8a857d;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all">${escape(t)}</span>`;
    return linkify(t);
  };
  // Visitor-written text is lifted out before any linkifying and shown as a quoted block.
  const QUOTE = "\u0000quote\u0000";
  const source = mail.quote && mail.text.includes(mail.quote) ? mail.text.replace(mail.quote, QUOTE) : mail.text;
  const quoteHtml = mail.quote ? `<blockquote style="margin:4px 0 14px;padding:10px 14px;border-left:3px solid ${accent};background:#f7f6f2;border-radius:0 10px 10px 0;color:#2a2826;white-space:pre-wrap">${escape(mail.quote)}</blockquote>` : "";
  const paragraphs = source
    .split(/\n{2,}/)
    .map((p) => {
      if (p.includes(QUOTE)) return QUOTE;
      const raw = p.split("\n").map((l) => l.trim());
      const kept = raw.filter((l, i) => !(l.endsWith(":") && raw[i + 1] !== undefined && buttonUrls.has(raw[i + 1]!)));
      return kept.map(line).filter((x): x is string => x !== null).join("<br>");
    })
    .filter(Boolean);
  const buttons = (mail.buttons ?? [])
    .filter((b) => /^https?:\/\//.test(b.url))
    .map(
      (b, i) =>
        `<a href="${escape(b.url)}" style="display:inline-block;margin:${i ? "10px 10px 0 0" : "0 10px 0 0"};padding:12px 22px;border-radius:999px;background:${i ? "#f1efe9" : accent};color:${i ? "#191816" : fg};font-weight:600;font-size:15px;text-decoration:none">${escape(b.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f4f2ec">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ec"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#191816">
<tr><td style="height:5px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 0;font-size:13px;font-weight:600;letter-spacing:.02em;color:#5f5b55">${escape(brand)}</td></tr>
${mail.heading ? `<tr><td style="padding:10px 32px 0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-.01em">${escape(mail.heading)}</td></tr>` : ""}
<tr><td style="padding:16px 32px 0;font-size:15.5px;line-height:1.65;color:#2a2826">${paragraphs.map((p) => (p === QUOTE ? quoteHtml : `<p style="margin:0 0 14px">${p}</p>`)).join("")}</td></tr>
${buttons ? `<tr><td style="padding:8px 32px 0">${buttons}</td></tr><tr><td style="padding:14px 32px 0;font-size:12.5px;line-height:1.6;color:#8a857d">${(mail.buttons ?? []).filter((b) => /^https?:\/\//.test(b.url)).map((b) => `${escape(b.label)}: <a href="${escape(b.url)}" style="color:#8a857d;word-break:break-all">${escape(b.url)}</a>`).join("<br>")}</td></tr>` : ""}
<tr><td style="padding:28px 32px 26px;font-size:12.5px;line-height:1.6;color:#8a857d;border-top:1px solid #efece5;margin-top:24px">${mail.brand && mail.brand.trim() ? `Sent by ${escape(mail.brand.trim())} with ` : "Sent with "}<a href="${escape(appUrl)}" style="color:#8a857d">Quote and Sign</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
}
