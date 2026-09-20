/**
 * Partner programme: a company or association gets a link and a code. Members who sign up through
 * it get an extra month of Pro; the partner earns a share of what those accounts pay in their first
 * year, recorded from real Polar orders, and can watch it on a private stats page.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { schema, type Db } from "./db";
import { uuid, randomToken } from "./crypto";
import { audit } from "./audit";
import { shell, SITE_URL } from "./legal";
import { esc } from "./render";
import { formatMoney } from "../../shared/pricing";

export const PARTNER_COOKIE = "qs-partner";
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
const FIRST_YEAR_MS = 365 * 86_400_000;
export const isPartnerCode = (s: string | undefined | null): s is string => !!s && CODE_RE.test(s);

export type Partner = typeof schema.partners.$inferSelect;

const cookieOpts = (c: Context<AppEnv>) => ({ httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 });

/** First touch wins, unless the earlier code no longer belongs to an active partner. */
export async function rememberPartner(c: Context<AppEnv>, db: Db, code: string): Promise<void> {
  const existing = getCookie(c, PARTNER_COOKIE);
  if (isPartnerCode(existing) && existing !== code && (await partnerByCode(db, existing))) return;
  setCookie(c, PARTNER_COOKIE, code, cookieOpts(c));
}
export function readPartnerCookie(c: Context<AppEnv>): string | null {
  const v = getCookie(c, PARTNER_COOKIE);
  return isPartnerCode(v) ? v : null;
}

export async function partnerByCode(db: Db, code: string | null | undefined): Promise<Partner | null> {
  if (!isPartnerCode(code)) return null;
  return (await db.select().from(schema.partners).where(and(eq(schema.partners.code, code), eq(schema.partners.active, true))).get()) ?? null;
}

export async function createPartner(db: Db, o: { name: string; code: string; contactEmail: string | null; sharePct: number; bonusDays: number }): Promise<Partner> {
  const id = uuid();
  await db.insert(schema.partners).values({ id, name: o.name, code: o.code, contactEmail: o.contactEmail, sharePct: o.sharePct, bonusDays: o.bonusDays, viewToken: randomToken(24), active: true, createdAt: new Date() });
  return (await db.select().from(schema.partners).where(eq(schema.partners.id, id)).get())!;
}

/**
 * A paid Polar order from an account that came through a partner, inside its first year: the
 * partner's share is recorded. The order id makes a replayed webhook harmless.
 */
export async function recordPartnerOrder(db: Db, user: { id: string; partnerId: string | null; createdAt: Date }, order: { id: string; amount: number; currency: string }, now: Date): Promise<boolean> {
  if (!user.partnerId || !order.id || !(order.amount > 0)) return false;
  if (now.getTime() - user.createdAt.getTime() > FIRST_YEAR_MS) return false;
  const partner = await db.select().from(schema.partners).where(eq(schema.partners.id, user.partnerId)).get();
  if (!partner || !partner.active) return false; // a paused partnership stops earning; history stays
  const commission = Math.round((order.amount * partner.sharePct) / 100);
  const inserted = await db.insert(schema.partnerConversions).values({ id: uuid(), partnerId: partner.id, userId: user.id, orderId: order.id, amount: order.amount, currency: order.currency.toUpperCase(), commission, createdAt: now }).onConflictDoNothing().returning({ id: schema.partnerConversions.id }).get();
  if (!inserted) return false;
  await audit(db, { userId: user.id, event: "partner.commission", meta: { partner: partner.code, order: order.id, commission } });
  return true;
}

/** A refund takes the share back: all of it, or the refunded part of it when the amount is known. */
export async function reversePartnerOrder(db: Db, orderId: string, now: Date, refunded?: number): Promise<boolean> {
  const row = await db.select().from(schema.partnerConversions).where(and(eq(schema.partnerConversions.orderId, orderId), isNull(schema.partnerConversions.reversedAt))).get();
  if (!row) return false;
  if (refunded && refunded > 0 && refunded < row.amount) {
    const cut = Math.round((row.commission * refunded) / row.amount);
    await db.update(schema.partnerConversions).set({ amount: row.amount - refunded, commission: row.commission - cut }).where(eq(schema.partnerConversions.id, row.id));
    await audit(db, { userId: row.userId, event: "partner.commission_reduced", meta: { order: orderId, refunded, cut } });
    return true;
  }
  await db.update(schema.partnerConversions).set({ reversedAt: now }).where(eq(schema.partnerConversions.id, row.id));
  await audit(db, { userId: row.userId, event: "partner.commission_reversed", meta: { order: orderId } });
  return true;
}

export type PartnerStats = { signups: number; paid: number; earned: number; reversed: number; paidOut: number; owed: number; currency: string };

export async function partnerStats(db: Db, partnerId: string): Promise<PartnerStats> {
  const signups = (await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(eq(schema.users.partnerId, partnerId)).get())?.n ?? 0;
  const paid = (await db.select({ n: sql<number>`count(distinct user_id)` }).from(schema.partnerConversions).where(and(eq(schema.partnerConversions.partnerId, partnerId), isNull(schema.partnerConversions.reversedAt))).get())?.n ?? 0;
  const earned = (await db.select({ n: sql<number>`coalesce(sum(commission), 0)` }).from(schema.partnerConversions).where(and(eq(schema.partnerConversions.partnerId, partnerId), isNull(schema.partnerConversions.reversedAt))).get())?.n ?? 0;
  const reversed = (await db.select({ n: sql<number>`coalesce(sum(commission), 0)` }).from(schema.partnerConversions).where(and(eq(schema.partnerConversions.partnerId, partnerId), sql`reversed_at is not null`)).get())?.n ?? 0;
  const paidOut = (await db.select({ n: sql<number>`coalesce(sum(amount), 0)` }).from(schema.partnerPayouts).where(eq(schema.partnerPayouts.partnerId, partnerId)).get())?.n ?? 0;
  const cur = await db.select({ c: schema.partnerConversions.currency }).from(schema.partnerConversions).where(eq(schema.partnerConversions.partnerId, partnerId)).orderBy(desc(schema.partnerConversions.createdAt)).get();
  // Owed can go negative after a refund that follows a payout; the admin sees it, the partner page shows zero.
  return { signups, paid, earned, reversed, paidOut, owed: earned - paidOut, currency: cur?.c ?? "USD" };
}

const money = (cents: number, cur: string) => formatMoney(cents, cur);

/** The private page a partner can watch. No names or emails of the accounts, only counts and money. */
export function renderPartnerStatsPage(nonce: string, p: Partner, s: PartnerStats, appUrl: string, payouts: { amount: number; paidAt: Date; note: string | null }[]): string {
  const body = `
<h1>${esc(p.name)} and Quote and Sign</h1>
<p class="eff">What your link has brought in, updated live. This page is private to the address it was sent to; there are no names or emails of the accounts on it, only counts and amounts.</p>
${p.active ? "" : `<p class="muted"><strong>This partnership is paused.</strong> New sign-ups through the link are not tied to it and no new shares are recorded; what was earned before stays on this page.</p>`}
<h2>Your link and code</h2>
<p><code>${esc(appUrl)}/go/${esc(p.code)}</code><br>Code at sign-up: <code>${esc(p.code)}</code></p>
<p>Anyone who starts an account through either gets ${p.bonusDays} extra days of Pro on top of the fourteen-day trial. You receive ${p.sharePct} percent of what those accounts pay in their first year, on every Polar order as it happens. A refund or chargeback takes that order's share back.</p>
<h2>The numbers</h2>
<table class="pt"><tbody>
<tr><td>Accounts created through your link or code</td><td class="num">${s.signups}</td></tr>
<tr><td>Of which paying</td><td class="num">${s.paid}</td></tr>
<tr><td>Your share earned</td><td class="num">${esc(money(s.earned, s.currency))}</td></tr>
<tr><td>Paid to you so far</td><td class="num">${esc(money(s.paidOut, s.currency))}</td></tr>
<tr><td><strong>Owed</strong></td><td class="num"><strong>${esc(money(Math.max(0, s.owed), s.currency))}</strong></td></tr>
</tbody></table>
<p class="muted">Payouts go out quarterly once at least ${esc(money(5000, s.currency))} is owed, by Wise or PayPal to the details you gave us.${s.reversed ? ` ${esc(money(s.reversed, s.currency))} was reversed after refunds and is not counted.` : ""}</p>
${payouts.length ? `<h2>Payouts</h2><table class="pt"><tbody>${payouts.map((x) => `<tr><td>${esc(x.paidAt.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }))}${x.note ? ` · ${esc(x.note)}` : ""}</td><td class="num">${esc(money(x.amount, s.currency))}</td></tr>`).join("")}</tbody></table>` : ""}
<p class="muted">Questions: reply to the email this page came with, or use the <a href="/contact">contact form</a>. The programme terms are on the <a href="/partners">partner page</a>.</p>`;
  return shell(`${p.name}: partner stats`, body, nonce, `<meta name="robots" content="noindex,nofollow">
<style nonce="${nonce}">table.pt{width:100%;max-width:560px;border-collapse:collapse;margin:12px 0}table.pt td{padding:10px 12px 10px 0;border-bottom:1px solid var(--line)}table.pt td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}code{background:#f4f2ec;padding:2px 6px;border-radius:6px}</style>`, null, { noindex: true });
}

/** The public page the partner emails point to: the offer, in the open. */
export function renderPartnersPage(nonce: string, analytics: string | null = null): string {
  const body = `
<h1>Partner programme</h1>
<p class="eff">For companies, associations and communities whose members send quotes and proposals. You give them a better way to get to "yes"; we share what they pay us.</p>
<h2>What your members get</h2>
<ul>
<li>Quote and Sign turns a quote into a page the client adjusts and signs on their phone. Both sides get a signed PDF and a record of exactly what was agreed. Thirty-six templates by trade, open source, flat pricing, a free plan.</li>
<li>Through your link or code, a new account starts with 30 extra days of Pro on top of the fourteen-day trial. No card is asked for.</li>
</ul>
<h2>What you get</h2>
<ul>
<li>25 percent of everything those accounts pay in their first twelve months, on every order, recorded automatically from our payment provider. A refund or chargeback takes that order's share back.</li>
<li>A private stats page, updated live: accounts created, paying accounts, your share earned, paid out, and owed. No member names or emails are on it.</li>
<li>Payouts quarterly by Wise or PayPal once at least 50 USD is owed. Commissions are a business expense on our side; you receive them as income where you are.</li>
<li>For tools that invoice or track time: an accepted proposal can create the record in your product through our signed webhooks, directly or through Zapier, Make or n8n.</li>
</ul>
<h2>How it works</h2>
<ol>
<li>We create your partner record and send you a link (quoteandsign.com/go/yourcode), a code members can type at sign-up, and your private stats page.</li>
<li>You list Quote and Sign as a member benefit however you like: a perks page, a newsletter, a directory entry.</li>
<li>Every account created through the link or code is tied to you for its first year. Nothing else is required from you.</li>
</ol>
<h2>The rules, in plain words</h2>
<ul>
<li>No unsolicited email or messages promoting the link, no paid search on our brand name, no self-referral of your own accounts. Doing so ends the partnership and forfeits unpaid shares.</li>
<li>We may change the share for new sign-ups with thirty days' notice; accounts already tied to you keep the share they came in under.</li>
<li>Either side may end the partnership at any time; shares already earned are still paid.</li>
</ul>
<p>The product is new and improves most weeks; the <a href="https://github.com/quoteandsign/quoteandsign/blob/main/CHANGELOG.md" rel="noopener">changelog</a> is public. To become a partner, write to us through the <a href="/contact?kind=question">contact form</a> with the name of your organisation and roughly how many members send proposals.</p>`;
  return shell("Partner programme", body, nonce, "", analytics, {
    path: "/partners",
    description: "Offer your members proposals their clients sign on a phone, with 30 extra days of Pro, and receive 25 percent of what they pay in their first year, tracked on a private stats page.",
  });
}

export { SITE_URL };
