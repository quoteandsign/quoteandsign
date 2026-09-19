import { and, eq, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { schema, type Db } from "./db";
import { audit } from "./audit";
import { rateLimit } from "./ratelimit";

/**
 * Where sign-ups come from, and the give-a-month-get-a-month loop.
 *
 * Two cookies, both set server-side and read only when a sign-in link is requested:
 * - qs-src: the last `?ref=` the visitor arrived with (a proposal footer, a signed page, an email,
 *   a rate guide, an ad). Stored on the account as `source` so the founder can see which door works.
 * - qs-ref: the referral code from a /r/CODE link. On the first sign-in the new account gets a
 *   longer trial and the referrer gets thirty more days of Pro.
 */
export const SOURCE_COOKIE = "qs-src";
export const REFERRAL_COOKIE = "qs-ref";
const COOKIE_DAYS = 30;

const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;
const CODE_RE = /^[a-z2-9]{10}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

export const REFERRED_TRIAL_BONUS_DAYS = 7; // a referred account starts with 21 days instead of 14
export const REFERRER_REWARD_DAYS = 30;
const MAX_REWARD_DAYS = 365; // however many friends, a free account tops out at a year of Pro
export const MAX_REWARDS_PER_YEAR = 12; // the programme pays at most twelve months a year to one account
const REVERSAL_WINDOW_DAYS = 30; // a refund or chargeback inside this window takes the month back

export const isSource = (s: string | undefined | null): s is string => !!s && SOURCE_RE.test(s);
export const isCode = (s: string | undefined | null): s is string => !!s && CODE_RE.test(s);

export function newReferralCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Every account has a code; older accounts get one the first time it is needed. */
export async function ensureReferralCode(db: Db, user: { id: string; referralCode: string | null }): Promise<string> {
  if (user.referralCode) return user.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = newReferralCode();
    const done = await db.update(schema.users).set({ referralCode: code }).where(and(eq(schema.users.id, user.id), isNull(schema.users.referralCode))).returning({ code: schema.users.referralCode }).get();
    if (done?.code) return done.code;
    const now = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, user.id)).get();
    if (now?.code) return now.code;
  }
  throw new Error("could not assign a referral code");
}

const cookieOpts = (c: Context<AppEnv>) => ({ httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax" as const, path: "/", maxAge: COOKIE_DAYS * 24 * 60 * 60 });

/** Remember the `?ref=` a visitor arrived with. Returns true when a cookie was set. */
export function rememberSource(c: Context<AppEnv>): boolean {
  const ref = c.req.query("ref");
  if (!isSource(ref)) return false;
  setCookie(c, SOURCE_COOKIE, ref, cookieOpts(c));
  return true;
}

export function rememberReferral(c: Context<AppEnv>, code: string): void {
  if (isCode(getCookie(c, REFERRAL_COOKIE))) return; // first touch wins; a later link cannot steal the credit
  setCookie(c, REFERRAL_COOKIE, code, cookieOpts(c));
}

export function readAttribution(c: Context<AppEnv>): { source: string | null; referral: string | null } {
  const source = getCookie(c, SOURCE_COOKIE);
  const referral = getCookie(c, REFERRAL_COOKIE);
  return { source: isSource(source) ? source : null, referral: isCode(referral) ? referral : null };
}

/** Days to add to a brand-new account's trial when it came through a referral link. */
export async function referrerFor(db: Db, code: string | null): Promise<{ id: string; plan: string; trialEndsAt: Date | null } | null> {
  if (!isCode(code)) return null;
  const r = await db.select({ id: schema.users.id, plan: schema.users.plan, trialEndsAt: schema.users.trialEndsAt }).from(schema.users).where(and(eq(schema.users.referralCode, code), isNull(schema.users.deletedAt))).get();
  return r ?? null;
}

/** True when a sign-up comes from an address the referrer signed in from in the last thirty days: the same person. */
export async function isSelfReferral(db: Db, referrerId: string, ipHash: string | null, now: Date): Promise<boolean> {
  if (!ipHash) return false;
  const own = await db.select({ id: schema.auditLog.id }).from(schema.auditLog)
    .where(and(eq(schema.auditLog.userId, referrerId), eq(schema.auditLog.event, "login.success"), eq(schema.auditLog.ipHash, ipHash), sql`created_at > ${now.getTime() - 30 * 86_400_000}`))
    .get();
  return Boolean(own);
}

/**
 * Pay the referrer when the referred account's first paid subscription becomes active (the Polar
 * webhook is the only caller). A free or trial referrer gets thirty days of Pro added; a paying
 * referrer gets an audit row, "referral.credit_owed", which the People tab shows so the month can
 * be applied at Polar by hand. At most twelve rewards a year, one per referred account, ever.
 * Sign-ups and sends earn nothing, so a throwaway account is worth nothing to anyone.
 */
export async function rewardReferrerForPaidPlan(db: Db, referred: { id: string; referredBy: string | null; referralRewardedAt: Date | null }, now: Date): Promise<boolean> {
  if (!referred.referredBy || referred.referralRewardedAt) return false;
  // Claim first, so two webhook deliveries cannot pay twice.
  const claimed = await db.update(schema.users).set({ referralRewardedAt: now }).where(and(eq(schema.users.id, referred.id), isNull(schema.users.referralRewardedAt))).returning({ id: schema.users.id }).get();
  if (!claimed) return false;
  const referrer = await db.select({ id: schema.users.id, plan: schema.users.plan, trialEndsAt: schema.users.trialEndsAt, deletedAt: schema.users.deletedAt }).from(schema.users).where(eq(schema.users.id, referred.referredBy)).get();
  if (!referrer || referrer.deletedAt) return false;
  const year = (await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(and(eq(schema.users.referredBy, referrer.id), sql`referral_rewarded_at > ${now.getTime() - 365 * 86_400_000}`)).get())?.n ?? 0;
  if (year > MAX_REWARDS_PER_YEAR) { await audit(db, { userId: referrer.id, event: "referral.capped", meta: { referred: referred.id } }); return false; }
  if (referrer.plan === "free") {
    const base = referrer.trialEndsAt && referrer.trialEndsAt > now ? referrer.trialEndsAt : now;
    const cap = new Date(now.getTime() + MAX_REWARD_DAYS * 86_400_000);
    const next = new Date(Math.min(base.getTime() + REFERRER_REWARD_DAYS * 86_400_000, cap.getTime()));
    await db.update(schema.users).set({ trialEndsAt: next, trialWarned: 0 }).where(eq(schema.users.id, referrer.id));
    await audit(db, { userId: referrer.id, event: "referral.rewarded", meta: { referred: referred.id, days: REFERRER_REWARD_DAYS } });
  } else {
    await audit(db, { userId: referrer.id, event: "referral.credit_owed", meta: { referred: referred.id } });
  }
  return true;
}

/**
 * A refund, chargeback or revocation within thirty days of the reward takes the month back: a free
 * referrer loses the thirty days; a paying referrer's owed credit is marked withdrawn.
 */
export async function reverseReferralReward(db: Db, referred: { id: string; referredBy: string | null; referralRewardedAt: Date | null }, now: Date): Promise<boolean> {
  if (!referred.referredBy || !referred.referralRewardedAt) return false;
  if (now.getTime() - referred.referralRewardedAt.getTime() > REVERSAL_WINDOW_DAYS * 86_400_000) return false;
  const referrer = await db.select({ id: schema.users.id, plan: schema.users.plan, trialEndsAt: schema.users.trialEndsAt }).from(schema.users).where(eq(schema.users.id, referred.referredBy)).get();
  if (!referrer) return false;
  if (referrer.plan === "free" && referrer.trialEndsAt) {
    await db.update(schema.users).set({ trialEndsAt: new Date(Math.max(now.getTime(), referrer.trialEndsAt.getTime() - REFERRER_REWARD_DAYS * 86_400_000)) }).where(eq(schema.users.id, referrer.id));
  }
  await audit(db, { userId: referrer.id, event: "referral.reversed", meta: { referred: referred.id } });
  return true;
}

export async function referralCount(db: Db, userId: string): Promise<number> {
  const r = await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(eq(schema.users.referredBy, userId)).get();
  return r?.n ?? 0;
}
