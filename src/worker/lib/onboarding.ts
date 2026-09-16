import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";
import type { Bindings } from "../env";
import { getDb, schema } from "./db";
import { sendEmail, escape } from "./email";
import { getSetting } from "./analytics";
import { isAdmin } from "../routes/support";

// Two service emails for a new account: a welcome the moment the account exists, and one nudge
// after three days without a sent proposal. Both are about the account itself, so they go out
// regardless of the marketing opt-in; admins and deleted accounts never get them. A single switch
// in the settings table turns the whole sequence on, and users.onboarding_sent records the stage
// (0 none, 1 welcome, 2 nudge) so nothing goes out twice.

export const ONBOARDING_KEY = "onboarding_emails";
export const DAY3_AFTER_DAYS = 3;
const TRIAL_DAYS = 14;
const DAY = 86_400_000;

export type OnboardingKind = "welcome" | "day3";
export type OnboardingVars = { appUrl: string; firstName?: string | null; templateSlug: string; supportEmail: string };

type User = typeof schema.users.$inferSelect;

export async function onboardingEnabled(env: Bindings): Promise<boolean> {
  return (await getSetting(getDb(env.DB), ONBOARDING_KEY)) === "1";
}

export function supportAddress(env: Bindings): string {
  return env.SUPPORT_EMAIL || env.EMAIL_FROM.replace(/^.*<|>$/g, "");
}

const firstNameOf = (name: string | null | undefined): string | null => {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{0,30}$/u.test(w) ? w : null;
};

/* ---- The template ------------------------------------------------------------------------- */

const NAVY = "#2b3f8c";
const INK = "#191816";
const MUTED = "#5f5b55";
const LINE = "#e6e2da";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const button = (label: string, url: string): string => `
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(url)}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="50%" stroke="f" fillcolor="${NAVY}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escape(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${escape(url)}" style="display:inline-block;background:${NAVY};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;line-height:52px;text-align:center;text-decoration:none;width:280px;border-radius:26px;-webkit-text-size-adjust:none;mso-hide:all">${escape(label)}</a><!--<![endif]-->`;

const step = (n: number, title: string, body: string): string => `
<tr><td style="padding:0 0 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td width="34" valign="top" style="padding:2px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="width:26px;height:26px;border-radius:13px;background:#eef0f7;color:${NAVY};font-family:${FONT};font-size:13px;font-weight:700;line-height:26px">${n}</td></tr></table></td>
<td valign="top" style="padding:0 0 0 12px;font-family:${FONT};font-size:15.5px;line-height:1.55;color:${INK}"><strong style="font-weight:600">${escape(title)}</strong><br><span style="color:${MUTED}">${escape(body)}</span></td>
</tr></table>
</td></tr>`;

type Content = { subject: string; preheader: string; greeting: string; headline: string; intro: string; steps?: [number, string, string][]; button: [string, string]; note: string; image: [string, string]; text: string };

function content(kind: OnboardingKind, v: OnboardingVars): Content {
  const hi = v.firstName ? `Hi ${v.firstName},` : "Hello,";
  if (kind === "welcome") {
    const url = `${v.appUrl}/app/templates`;
    return {
      subject: "Welcome to Quote and Sign",
      preheader: "Your first proposal takes about ten minutes. Here is the way in.",
      greeting: hi,
      headline: "Your first proposal, in about ten minutes.",
      intro: "Thanks for signing up. Every proposal here is a page your client opens on any device, changes the options on, and signs with their name. Here is the fastest route to your first one.",
      steps: [
        [1, "Pick a template", "Seven starting points that are already pages. Every word and price is yours to change."],
        [2, "Set your prices", "Add the lines, mark what is optional, and decide which quantities the client may change."],
        [3, "Send the link", "Your client toggles, sees the total, taps Accept. You both get the signed PDF."],
      ],
      button: ["Make your first proposal", url],
      note: `Your ${TRIAL_DAYS}-day Pro trial is on: your logo and colour on every page, reminders, and PDF export are all unlocked. No card needed. Reply to this email with any question; it lands with a person.`,
      image: [`${v.appUrl}/img/step-template.jpg`, "The template picker: seven proposals ready to send"],
      text: `${hi}

Thanks for signing up. Every proposal here is a page your client opens on any device, changes the options on, and signs with their name. The fastest route to your first one:

1. Pick a template. Seven starting points that are already pages; every word and price is yours to change.
2. Set your prices. Add the lines, mark what is optional, and decide which quantities the client may change.
3. Send the link. Your client toggles, sees the total, taps Accept. You both get the signed PDF.

Make your first proposal: ${url}

Your ${TRIAL_DAYS}-day Pro trial is on: your logo and colour on every page, reminders, and PDF export are all unlocked. No card needed. Reply to this email with any question; it lands with a person.`,
    };
  }
  const left = TRIAL_DAYS - DAY3_AFTER_DAYS;
  const url = `${v.appUrl}/templates/${v.templateSlug}`;
  return {
    subject: `Your trial has ${left} days left`,
    preheader: "The fastest way to send a proposal today, from a page that is already written.",
    greeting: hi,
    headline: `${left} days of Pro left. Send one today.`,
    intro: "You have not sent a proposal yet, and that is fine; most people send their first from a template they barely change. Open the one below, put your prices in, and send the link to a client you are already talking to.",
    button: ["Start from this template", url],
    note: "Sending is free on every plan, and the client needs no account: they open the link, choose, sign. If something is in the way, reply to this email and say what; it goes straight to us.",
    image: [`${v.appUrl}/img/step-editor.jpg`, "The editor: the proposal as a page, pricing lines beside it"],
    text: `${hi}

You have ${left} days of Pro left and no proposal sent yet, and that is fine; most people send their first from a template they barely change. Open the one below, put your prices in, and send the link to a client you are already talking to.

Start from this template: ${url}

Sending is free on every plan, and the client needs no account: they open the link, choose, sign. If something is in the way, reply to this email and say what; it goes straight to us.`,
  };
}

/** The two onboarding emails: a 600px card that renders in Gmail, Outlook and Apple Mail, with a plain-text twin. */
export function renderOnboardingHtml(kind: OnboardingKind, v: OnboardingVars): { subject: string; text: string; html: string } {
  const c = content(kind, v);
  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escape(c.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f2ee;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f2ee">${escape(c.preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f2ee"><tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px">
<tr><td style="padding:0 6px 14px;font-family:${FONT};font-size:14px;font-weight:600;color:${NAVY}"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${NAVY};vertical-align:middle;margin:0 8px 2px 0"></span>Quote <span style="font-weight:400;color:${MUTED}">and</span> Sign</td></tr>
<tr><td style="background:#ffffff;border-radius:20px;border:1px solid ${LINE}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:8px 8px 0"><img src="${escape(c.image[0])}" width="582" alt="${escape(c.image[1])}" style="display:block;width:100%;max-width:582px;height:auto;border-radius:14px;border:1px solid ${LINE}"></td></tr>
<tr><td style="padding:30px 36px 0;font-family:${FONT};font-size:15px;color:${MUTED}">${escape(c.greeting)}</td></tr>
<tr><td style="padding:8px 36px 0;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:400;letter-spacing:-.01em;color:${INK}">${escape(c.headline)}</td></tr>
<tr><td style="padding:16px 36px 0;font-family:${FONT};font-size:16px;line-height:1.6;color:#2a2826">${escape(c.intro)}</td></tr>
${c.steps ? `<tr><td style="padding:26px 36px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${c.steps.map(([n, t, b]) => step(n, t, b)).join("")}</table></td></tr>` : ""}
<tr><td align="left" style="padding:${c.steps ? 14 : 28}px 36px 0">${button(c.button[0], c.button[1])}</td></tr>
<tr><td style="padding:10px 36px 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:#8a857d">Or open <a href="${escape(c.button[1])}" style="color:#8a857d">${escape(c.button[1])}</a></td></tr>
<tr><td style="padding:26px 36px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:18px 36px 34px;font-family:${FONT};font-size:14.5px;line-height:1.65;color:${MUTED}">${escape(c.note)}</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 6px 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:#8a857d">Sent with <a href="${escape(v.appUrl)}" style="color:#8a857d">Quote and Sign</a> because you opened an account. Questions: <a href="mailto:${escape(v.supportEmail)}" style="color:#8a857d">${escape(v.supportEmail)}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject: c.subject, text: `${c.text}\n\nSent with Quote and Sign because you opened an account. Questions: ${v.supportEmail}`, html };
}

/* ---- Sending ------------------------------------------------------------------------------ */

const vars = (env: Bindings, name: string | null | undefined): OnboardingVars => ({ appUrl: env.APP_URL, firstName: firstNameOf(name), templateSlug: "website-proposal-template", supportEmail: supportAddress(env) });

async function deliver(env: Bindings, kind: OnboardingKind, to: string, name: string | null | undefined, subjectPrefix = ""): Promise<void> {
  const m = renderOnboardingHtml(kind, vars(env, name));
  await sendEmail(env, { to, subject: subjectPrefix + m.subject, text: m.text, html: m.html, replyTo: supportAddress(env) });
}

/** The welcome, once, right after the account exists. Never throws: sign-in must not fail over an email. */
export async function sendWelcome(env: Bindings, user: Pick<User, "id" | "email" | "name" | "deletedAt">): Promise<boolean> {
  try {
    if (user.deletedAt || isAdmin(env, user.email) || !(await onboardingEnabled(env))) return false;
    const db = getDb(env.DB);
    const claimed = await db.update(schema.users).set({ onboardingSent: 1 }).where(and(eq(schema.users.id, user.id), lt(schema.users.onboardingSent, 1))).returning({ id: schema.users.id }).get();
    if (!claimed) return false;
    await deliver(env, "welcome", user.email, user.name);
    return true;
  } catch (e) {
    console.error("welcome email failed", e);
    return false;
  }
}

/** Daily: one nudge to accounts three or more days old with nothing sent yet. Returns how many went out. */
export async function sendDay3Nudges(env: Bindings, now = new Date()): Promise<number> {
  if (!(await onboardingEnabled(env))) return 0;
  const db = getDb(env.DB);
  const cutoff = new Date(now.getTime() - DAY3_AFTER_DAYS * DAY);
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(and(isNull(schema.users.deletedAt), lt(schema.users.onboardingSent, 2), lte(schema.users.createdAt, cutoff), sql`not exists (select 1 from proposals p where p.user_id = ${schema.users.id} and p.status <> 'draft')`))
    .all();
  let sent = 0;
  for (const u of rows) {
    if (isAdmin(env, u.email)) continue;
    const claimed = await db.update(schema.users).set({ onboardingSent: 2 }).where(and(eq(schema.users.id, u.id), lt(schema.users.onboardingSent, 2))).returning({ id: schema.users.id }).get();
    if (!claimed) continue;
    try {
      await deliver(env, "day3", u.email, u.name);
      sent++;
    } catch (e) {
      console.error("day-3 email failed", e);
    }
  }
  return sent;
}

/** An admin sends either email to their own address, switch or no switch, without touching any stage. */
export async function sendOnboardingTest(env: Bindings, kind: OnboardingKind, to: string, name?: string | null): Promise<void> {
  await deliver(env, kind, to, name ?? "Alex", "[Test] ");
}
