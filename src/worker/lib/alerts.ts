import { and, eq, gt, sql } from "drizzle-orm";
import type { Bindings } from "../env";
import { getDb, schema } from "./db";
import { sendEmail } from "./email";
import { getSetting, setSetting } from "./analytics";

/**
 * Suspicious-activity alert, once a day at most, from the audit log. Nothing here is a block;
 * blocking happens at the rate limiters. This is the "someone should look" email: a burst of
 * sign-ups, one address creating many accounts, a sending spike, or an open abuse report.
 */
const DAY = 86_400_000;
const LIMITS = { signups: 15, sameIpSignups: 4, sends: 150, accepts: 100, referrals: 10 };

export async function sendSuspiciousActivityAlert(env: Bindings, now = new Date()): Promise<boolean> {
  const db = getDb(env.DB);
  const since = new Date(now.getTime() - DAY);
  const count = async (event: string) => (await db.select({ n: sql<number>`count(*)` }).from(schema.auditLog).where(and(eq(schema.auditLog.event, event), gt(schema.auditLog.createdAt, since))).get())?.n ?? 0;
  const signups = await count("user.created");
  const sends = await count("proposal.sent");
  const accepts = await count("proposal.accepted");
  const referrals = await count("referral.rewarded");
  const disabled = await count("admin.user_disabled");
  const takedowns = await count("admin.proposal_takedown");
  const busiestIp = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.event, "user.created"), gt(schema.auditLog.createdAt, since), sql`ip_hash is not null`))
    .groupBy(schema.auditLog.ipHash)
    .orderBy(sql`count(*) desc`)
    .limit(1)
    .get();
  const abuse = (await db.select({ n: sql<number>`count(*)` }).from(schema.tickets).where(and(eq(schema.tickets.kind, "abuse"), eq(schema.tickets.status, "open"))).get())?.n ?? 0;

  const flags: string[] = [];
  if (signups > LIMITS.signups) flags.push(`${signups} new accounts in 24 hours`);
  if ((busiestIp?.n ?? 0) > LIMITS.sameIpSignups) flags.push(`${busiestIp!.n} accounts created from one address`);
  if (sends > LIMITS.sends) flags.push(`${sends} proposals sent in 24 hours`);
  if (accepts > LIMITS.accepts) flags.push(`${accepts} acceptances in 24 hours`);
  if (referrals > LIMITS.referrals) flags.push(`${referrals} referral rewards paid in 24 hours`);
  if (abuse > 0) flags.push(`${abuse} open abuse ${abuse === 1 ? "report" : "reports"}`);
  if (!flags.length) return false;

  const day = now.toISOString().slice(0, 10);
  if ((await getSetting(db, "alert_sent")) === day) return false; // one a day at most
  const to = env.SUPPORT_EMAIL || env.EMAIL_FROM.replace(/^.*<|>$/g, "");
  await sendEmail(env, {
    to,
    subject: `Quote and Sign: ${flags[0]}${flags.length > 1 ? ` and ${flags.length - 1} more` : ""}`,
    heading: "Something is worth a look",
    buttons: [{ label: "Open the admin", url: `${env.APP_URL}/app/admin` }],
    text: `In the last 24 hours:\n\n${flags.map((f) => `- ${f}`).join("\n")}\n\nAll of it: ${signups} sign-ups, ${sends} sends, ${accepts} acceptances, ${referrals} referral rewards, ${disabled} accounts disabled, ${takedowns} pages taken down.\n\nNothing was blocked by this email; the limiters do that. Use the People tab to disable an account or take a page down.\n\nSent at most once a day.`,
    uncounted: true,
  });
  await setSetting(db, "alert_sent", day);
  return true;
}
