import { and, eq, gt, inArray, isNull, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import type { Bindings } from "../env";
import { getDb, schema } from "./db";
import { sendEmail } from "./email";
import { businessName } from "../../shared/names";
import { capsOf, effectivePlan } from "./plan";
import { getSetting, setSetting } from "./analytics";
import { STORAGE_LIMIT, STORAGE_WARN } from "../routes/support";

export const REMIND_DAYS_BEFORE = 3;
// A proposal nobody has opened gets one gentle nudge after this many days.
export const NUDGE_DAYS_UNOPENED = 3;

/**
 * Runs daily from the cron trigger. A proposal that is out, unanswered and expiring within a
 * few days gets one friendly reminder to the client, once. The sender can switch it off per
 * proposal. Returns how many were sent.
 */
/**
 * Trial notices: three days before the end, on the last day, and once it has ended. Each stage
 * goes out once, tracked in users.trial_warned. Returns how many emails went out.
 */
export async function sendTrialNotices(env: Bindings, now = new Date()): Promise<number> {
  const db = getDb(env.DB);
  const day = 24 * 60 * 60_000;
  const users = await db.select().from(schema.users).where(and(eq(schema.users.plan, "free"), isNull(schema.users.deletedAt), isNotNull(schema.users.trialEndsAt), lt(schema.users.trialWarned, 3))).all();
  let sent = 0;
  for (const u of users) {
    const ends = u.trialEndsAt!.getTime();
    const left = ends - now.getTime();
    let stage = 0;
    if (left <= 0 && left > -7 * day) stage = 3;
    else if (left <= day) stage = 2;
    else if (left <= 3 * day) stage = 1;
    if (stage === 0 || u.trialWarned >= stage) continue;
    const brandUrl = `${env.APP_URL}/app/brand`;
    const text =
      stage === 3
        ? `Your 14-day Pro trial has ended, so your account is on Free: three live proposals at a time, the standard look, and no PDF export of drafts.\n\nEverything you made is still there. Signed proposals stay online for your clients.\n\nTo keep unlimited proposals, your logo and color, passwords and reminders, choose a plan:\n${brandUrl}`
        : stage === 2
          ? `Your Pro trial ends today.\n\nAfter that, your account moves to Free: three live proposals at a time and the standard look. Nothing is deleted.\n\nKeep everything you have been using, from ${PLANS_YEARLY_PRO} a month billed yearly:\n${brandUrl}`
          : `Your Pro trial ends in 3 days.\n\nAfter that, your account moves to Free: three live proposals at a time and the standard look. Nothing is deleted.\n\nKeep unlimited proposals, your logo and color, passwords, reminders and PDF export from ${PLANS_YEARLY_PRO} a month billed yearly:\n${brandUrl}`;
    const claimed = await db.update(schema.users).set({ trialWarned: stage }).where(and(eq(schema.users.id, u.id), lt(schema.users.trialWarned, stage))).returning({ id: schema.users.id }).get();
    if (!claimed) continue;
    await sendEmail(env, { to: u.email, subject: stage === 3 ? "Your Pro trial has ended" : stage === 2 ? "Your Pro trial ends today" : "Your Pro trial ends in 3 days", text });
    sent++;
  }
  return sent;
}
const PLANS_YEARLY_PRO = 19;

const DAY = 24 * 60 * 60_000;
/** How long the security log is kept. The privacy policy states this number; change both together. */
export const AUDIT_DAYS = 365; // also closed contact-form tickets

/**
 * Daily housekeeping, so the retention periods in the privacy policy are what actually happens:
 * rate-limit windows older than a day, webhook ids older than a week, sign-in links and sessions a
 * day past their expiry, and security-log rows older than AUDIT_DAYS.
 */
/** Emails support once when images in the database pass the warning line, so the paid tier is switched on in time. */
export async function warnOnStorage(env: Bindings): Promise<boolean> {
  const db = getDb(env.DB);
  const row = await db.select({ bytes: sql<number>`coalesce(sum(bytes), 0)` }).from(schema.files).get();
  const bytes = row?.bytes ?? 0;
  if (bytes < STORAGE_WARN) {
    if (await getSetting(db, "storage_warned")) await setSetting(db, "storage_warned", null);
    return false;
  }
  if (await getSetting(db, "storage_warned")) return false;
  const to = env.SUPPORT_EMAIL || env.EMAIL_FROM.replace(/^.*<|>$/g, "");
  await sendEmail(env, {
    to,
    subject: "Quote and Sign: image storage is past the warning line",
    heading: "Time to move the database to the paid tier",
    text: `Images in the database now take ${Math.round(bytes / 1048576)} MB. The free database tier stops at ${Math.round(STORAGE_LIMIT / 1048576)} MB and uploads would start failing there.\n\nIn the Cloudflare dashboard, Workers & Pages, Plans: choose Workers Paid (5 USD a month). That raises the database to 10 GB. Nothing else changes.\n\nThis email is sent once; it is sent again only if storage drops below the line and passes it again.`,
  });
  await setSetting(db, "storage_warned", new Date().toISOString());
  return true;
}

export async function pruneOldRows(env: Bindings, now = new Date()): Promise<void> {
  const db = getDb(env.DB);
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, new Date(now.getTime() - DAY)));
  await db.delete(schema.webhookEvents).where(lt(schema.webhookEvents.seenAt, new Date(now.getTime() - 7 * DAY)));
  await db.delete(schema.magicTokens).where(lt(schema.magicTokens.expiresAt, new Date(now.getTime() - DAY)));
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date(now.getTime() - DAY)));
  await db.delete(schema.auditLog).where(lt(schema.auditLog.createdAt, new Date(now.getTime() - AUDIT_DAYS * DAY)));
  // Contact-form conversations a year after they closed (their messages go with them).
  await db.delete(schema.tickets).where(and(eq(schema.tickets.status, "closed"), lt(schema.tickets.updatedAt, new Date(now.getTime() - AUDIT_DAYS * DAY))));
}

export async function sendExpiryReminders(env: Bindings, now = new Date()): Promise<number> {
  const db = getDb(env.DB);
  const horizon = new Date(now.getTime() + REMIND_DAYS_BEFORE * 24 * 60 * 60_000);
  const due = await db
    .select({ proposal: schema.proposals, user: schema.users })
    .from(schema.proposals)
    .innerJoin(schema.users, eq(schema.users.id, schema.proposals.userId))
    .where(
      and(
        inArray(schema.proposals.status, ["sent", "viewed"]),
        eq(schema.proposals.remind, true),
        isNull(schema.proposals.reminderSentAt),
        gt(schema.proposals.expiresAt, now),
        lte(schema.proposals.expiresAt, horizon),
        isNull(schema.users.deletedAt),
      ),
    )
    .all();

  let sent = 0;
  for (const { proposal, user } of due) {
    if (!capsOf(user, now).protect) continue; // reminders are part of Pro
    const to = [...new Set([proposal.clientEmail, ...(proposal.ccEmails ?? [])].filter((e): e is string => Boolean(e)))];
    // Claim it first so two overlapping runs can never both send.
    const claimed = await db
      .update(schema.proposals)
      .set({ reminderSentAt: now })
      .where(and(eq(schema.proposals.id, proposal.id), isNull(schema.proposals.reminderSentAt)))
      .returning({ id: schema.proposals.id })
      .get();
    if (!claimed || !to.length) continue;
    const from = (proposal.senderName || businessName(user.brandName, user.name, user.email)).replace(/[\r\n\t]+/g, " ").trim();
    const title = proposal.title.replace(/[\r\n\t]+/g, " ").trim();
    const when = proposal.expiresAt!.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
    await sendEmail(env, {
      to,
      replyTo: user.email,
      subject: `Reminder: "${title}" is valid until ${when}`,
      text: `A quick reminder from ${from}.\n\nThe proposal "${title}" can be accepted until ${when}. After that the pricing is no longer held.\n\nOpen it here:\n${env.APP_URL}/p/${proposal.publicId}\n\nReply to this email if you have a question.`,
    });
    sent++;
  }

  // Sent, never opened, three days on: one nudge. Uses the same "one reminder per proposal" claim,
  // so a proposal either gets the nudge or the expiry reminder, never both.
  const quiet = await db
    .select({ proposal: schema.proposals, user: schema.users })
    .from(schema.proposals)
    .innerJoin(schema.users, eq(schema.users.id, schema.proposals.userId))
    .where(
      and(
        eq(schema.proposals.status, "sent"),
        eq(schema.proposals.remind, true),
        isNull(schema.proposals.reminderSentAt),
        lte(schema.proposals.sentAt, new Date(now.getTime() - NUDGE_DAYS_UNOPENED * 24 * 60 * 60_000)),
        or(isNull(schema.proposals.expiresAt), gt(schema.proposals.expiresAt, now)),
        isNull(schema.users.deletedAt),
      ),
    )
    .all();
  for (const { proposal, user } of quiet) {
    if (!capsOf(user, now).protect) continue;
    const to = [...new Set([proposal.clientEmail, ...(proposal.ccEmails ?? [])].filter((e): e is string => Boolean(e)))];
    const claimed = await db
      .update(schema.proposals)
      .set({ reminderSentAt: now })
      .where(and(eq(schema.proposals.id, proposal.id), isNull(schema.proposals.reminderSentAt)))
      .returning({ id: schema.proposals.id })
      .get();
    if (!claimed || !to.length) continue;
    const from = (proposal.senderName || businessName(user.brandName, user.name, user.email)).replace(/[\r\n\t]+/g, " ").trim();
    const title = proposal.title.replace(/[\r\n\t]+/g, " ").trim();
    await sendEmail(env, {
      to,
      replyTo: user.email,
      subject: `Did you get a chance to look? "${title}"`,
      text: `A quick note from ${from}.

The proposal "${title}" is waiting for you. It takes a few minutes to read and you can accept it online.

Open it here:
${env.APP_URL}/p/${proposal.publicId}

Reply to this email if anything is unclear.`,
    });
    sent++;
  }
  return sent;
}
