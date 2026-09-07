// Outbound webhooks for Business accounts: one https address per workspace that receives a signed
// JSON message when a proposal is sent, first opened, accepted, declined or countersigned. Nothing
// personal travels in the message (no client email, no content, no IP); the receiver can fetch what
// it needs from the app with a person signed in. Deliveries leave from the same request that already
// sends the email, and the nightly job retries what failed.

import { and, eq, lt, lte, sql } from "drizzle-orm";
import type { Context } from "hono";
import type { AppEnv, Bindings } from "../env";
import { getDb, schema } from "./db";
import { hmacHex, randomToken, uuid } from "./crypto";
import { rateLimit } from "./ratelimit";
import { sendEmail } from "./email";
import { audit } from "./audit";
import { capsOf } from "./plan";

export const WEBHOOK_EVENTS = ["proposal.sent", "proposal.opened", "proposal.accepted", "proposal.declined", "proposal.countersigned"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "ping";

/** Per workspace, per hour. Far above real use; a runaway integration cannot become a flood. */
export const DELIVERIES_PER_HOUR = 60;
/** Attempts before a delivery is given up on: two right away, then one a night. */
export const MAX_ATTEMPTS = 5;
/** Consecutive failures before the webhook is switched off and the owner told. */
export const DISABLE_AFTER = 20;
const TIMEOUT_MS = 5000;

/**
 * Why an address is refused, or null when it is fine. Only public https on port 443, no credentials,
 * no IP literals, nothing local, nothing on our own or Cloudflare's hosts. Workers cannot reach private
 * networks anyway; the rule states the intent and keeps a misconfigured self-host honest too.
 */
export function webhookUrlProblem(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 500) return "That address is too long.";
  let u: URL;
  try { u = new URL(raw); } catch { return "Enter a full address starting with https://."; }
  if (u.protocol !== "https:") return "Webhook addresses must start with https://.";
  if (u.username || u.password) return "Leave credentials out of the address.";
  if (u.port && u.port !== "443") return "Only the standard https port is allowed.";
  const h = u.hostname.toLowerCase();
  const blocked = !h.includes(".") || /^[\d.]+$/.test(h) || h.startsWith("[") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".") || h.endsWith(".workers.dev") || h.endsWith(".pages.dev") || h.endsWith(".r2.dev") || h.endsWith(".cloudflare.com") || h === "cloudflare.com" || h.endsWith("quoteandsign.com");
  if (blocked) return "That address is not allowed.";
  return null;
}

export type WebhookProposal = {
  id: string;
  publicId: string;
  title: string;
  status: string;
  clientName: string | null;
  currency: string;
  sentAt: Date | null;
};

/** The message body. Ids, names and amounts only: what a pipeline needs and nothing a person would mind. */
export function webhookPayload(o: { deliveryId: string; event: WebhookEvent; at: Date; appUrl: string; proposal: WebhookProposal | null; total?: number | null; acceptedAt?: Date | null }): string {
  const p = o.proposal;
  return JSON.stringify({
    id: o.deliveryId,
    event: o.event,
    at: o.at.toISOString(),
    proposal: p
      ? {
          id: p.id,
          publicId: p.publicId,
          title: p.title,
          status: o.event === "proposal.accepted" || o.event === "proposal.countersigned" ? "accepted" : o.event === "proposal.declined" ? "declined" : o.event === "proposal.opened" ? "viewed" : p.status,
          clientName: p.clientName,
          currency: p.currency,
          total: o.total ?? null,
          sentAt: p.sentAt ? p.sentAt.toISOString() : null,
          acceptedAt: o.acceptedAt ? o.acceptedAt.toISOString() : null,
        }
      : null,
    links: p ? { app: `${o.appUrl}/app/p/${p.id}`, page: `${o.appUrl}/p/${p.publicId}` } : null,
  });
}

/** The signature the receiver checks: HMAC-SHA256 over "<timestamp>.<body>" with the shared secret. */
export async function signWebhook(secret: string, timestamp: string, body: string): Promise<string> {
  return `v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

type Delivery = typeof schema.webhookDeliveries.$inferSelect;
type Hook = typeof schema.webhooks.$inferSelect;

/** One attempt. Returns the status code, or 0 when the request never completed. */
async function attempt(hook: Hook, delivery: Delivery): Promise<{ code: number; error: string | null }> {
  if (webhookUrlProblem(hook.url)) return { code: 0, error: "address no longer allowed" };
  const ts = String(Date.now());
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "QuoteAndSign-Webhooks/1",
        "x-qs-event": delivery.event,
        "x-qs-delivery": delivery.id,
        "x-qs-timestamp": ts,
        "x-qs-signature": await signWebhook(hook.secret, ts, delivery.payload),
      },
      body: delivery.payload,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // The body is never read: the receiver's reply is not our concern beyond the status.
    return { code: res.status, error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { code: 0, error: (e as Error).name === "TimeoutError" ? "timed out after 5 s" : "could not connect" };
  }
}

/** Records one attempt's outcome and decides what happens next. Returns true on success. */
async function settle(env: Bindings, hook: Hook, delivery: Delivery, r: { code: number; error: string | null }, now: Date): Promise<boolean> {
  const db = getDb(env.DB);
  const attempts = delivery.attempts + 1;
  if (!r.error) {
    await db.update(schema.webhookDeliveries).set({ attempts, status: "ok", responseCode: r.code, nextAt: null, updatedAt: now }).where(eq(schema.webhookDeliveries.id, delivery.id));
    await db.update(schema.webhooks).set({ failures: 0, lastOkAt: now, lastError: null }).where(eq(schema.webhooks.id, hook.id));
    return true;
  }
  const giveUp = attempts >= MAX_ATTEMPTS;
  await db
    .update(schema.webhookDeliveries)
    .set({ attempts, status: giveUp ? "failed" : "pending", responseCode: r.code || null, nextAt: giveUp ? null : new Date(now.getTime() + 24 * 60 * 60_000), updatedAt: now })
    .where(eq(schema.webhookDeliveries.id, delivery.id));
  // Counted in the database, not from a row read earlier, so many failures in one run add up.
  const after = await db.update(schema.webhooks).set({ failures: sql`${schema.webhooks.failures} + 1`, lastError: r.error }).where(eq(schema.webhooks.id, hook.id)).returning({ failures: schema.webhooks.failures }).get();
  const switchedOff = (after?.failures ?? 0) >= DISABLE_AFTER
    ? await db.update(schema.webhooks).set({ active: false }).where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.active, true))).returning({ id: schema.webhooks.id }).get()
    : null;
  if (switchedOff) {
    const owner = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, hook.userId)).get();
    if (owner) {
      await sendEmail(env, {
        to: owner.email,
        subject: "Your webhook has been switched off",
        heading: "Webhook switched off after repeated failures",
        buttons: [{ label: "Open Settings", url: `${env.APP_URL}/app/brand#advanced` }],
        text: `Deliveries to your webhook address failed ${DISABLE_AFTER} times in a row (last error: ${r.error}). It has been switched off so we stop knocking on a closed door.\n\nFix the receiving end, then switch it back on under Settings, Advanced. Failed deliveries are not resent.`,
      });
    }
    await audit(db, { userId: hook.userId, event: "webhook.disabled", meta: { error: r.error } });
  }
  return false;
}

/**
 * Queue and send one event for a workspace. Runs after the response when an execution context is
 * available (production), inline otherwise (tests). Silently does nothing for accounts without a
 * webhook, an inactive one, or one not subscribed to this event.
 */
export async function emitWebhook(c: Context<AppEnv>, ownerId: string, event: WebhookEvent, proposal: WebhookProposal | null, extra: { total?: number | null; acceptedAt?: Date | null } = {}): Promise<void> {
  const env = c.env;
  const appUrl = env.ENVIRONMENT === "development" ? new URL(c.req.url).origin : env.APP_URL;
  const job = deliverNew(env, ownerId, event, proposal, extra, appUrl).catch((e) => console.error("webhook", e));
  let ctx: { waitUntil(p: Promise<unknown>): void } | null = null;
  try { ctx = c.executionCtx; } catch { ctx = null; }
  if (ctx) ctx.waitUntil(job); else await job;
}

async function deliverNew(env: Bindings, ownerId: string, event: WebhookEvent, proposal: WebhookProposal | null, extra: { total?: number | null; acceptedAt?: Date | null }, appUrl: string): Promise<void> {
  const db = getDb(env.DB);
  const hook = await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, ownerId)).get();
  if (!hook || !hook.active) return;
  if (event !== "ping" && !(hook.events as string[]).includes(event)) return;
  // The plan is checked when something is sent, not only when the webhook was set up.
  const owner = await db.select({ plan: schema.users.plan, trialEndsAt: schema.users.trialEndsAt }).from(schema.users).where(eq(schema.users.id, ownerId)).get();
  if (!owner || !capsOf(owner).webhooks) return;
  if (!(await rateLimit(db, `wh:${ownerId}`, DELIVERIES_PER_HOUR, 60 * 60_000)).allowed) return;
  const now = new Date();
  const id = uuid();
  const delivery: Delivery = {
    id,
    webhookId: hook.id,
    event,
    payload: webhookPayload({ deliveryId: id, event, at: now, appUrl, proposal, total: extra.total, acceptedAt: extra.acceptedAt }),
    attempts: 0,
    status: "pending",
    responseCode: null,
    nextAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.webhookDeliveries).values(delivery);
  if (await settle(env, hook, delivery, await attempt(hook, delivery), now)) return;
  // One quick retry for a blip, then the nightly job takes over.
  await new Promise((r) => setTimeout(r, env.ENVIRONMENT === "production" ? 5000 : 0));
  const fresh = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, hook.id)).get();
  const d2 = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id)).get();
  if (fresh && fresh.active && d2 && d2.status === "pending") await settle(env, fresh, d2, await attempt(fresh, d2), new Date());
}

/** Per webhook per night, so one dead endpoint cannot use up the whole run. */
export const RETRIES_PER_HOOK_PER_NIGHT = 20;
const RETRY_BUDGET_MS = 8 * 60_000;

/**
 * Nightly: pending deliveries whose time has come, a fair share per webhook, inside a time budget.
 * Old rows are pruned first so the table never grows because a run was cut short.
 */
const HOOK_SLICE_MS = 45_000;

export async function retryWebhooks(env: Bindings, now = new Date()): Promise<number> {
  const db = getDb(env.DB);
  await db.delete(schema.webhookDeliveries).where(lt(schema.webhookDeliveries.createdAt, new Date(now.getTime() - 30 * 24 * 60 * 60_000)));
  // Which hooks have something due, then a bounded slice per hook, in a random order, so no one
  // account's backlog can stand in front of everyone else's.
  const hooksDue = await db
    .selectDistinct({ id: schema.webhooks.id })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .where(and(eq(schema.webhookDeliveries.status, "pending"), lte(schema.webhookDeliveries.nextAt, now), eq(schema.webhooks.active, true)))
    .limit(500)
    .all();
  for (let i = hooksDue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [hooksDue[i], hooksDue[j]] = [hooksDue[j]!, hooksDue[i]!]; }
  const started = Date.now();
  let sent = 0;
  for (const { id: hookId } of hooksDue) {
    if (Date.now() - started > RETRY_BUDGET_MS) break;
    const sliceStart = Date.now();
    const list = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(and(eq(schema.webhookDeliveries.webhookId, hookId), eq(schema.webhookDeliveries.status, "pending"), lte(schema.webhookDeliveries.nextAt, now)))
      .orderBy(schema.webhookDeliveries.createdAt)
      .limit(RETRIES_PER_HOOK_PER_NIGHT)
      .all();
    for (const d of list) {
      if (Date.now() - sliceStart > HOOK_SLICE_MS) break;
      const h = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, hookId)).get();
      if (!h || !h.active) break;
      if (await settle(env, h, d, await attempt(h, d), now)) sent++;
    }
  }
  return sent;
}

/** Kept for symmetry with other libs that expose their counting helpers. */
export const deliveryCount = (db: ReturnType<typeof getDb>, webhookId: string) =>
  db.select({ n: sql<number>`count(*)` }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.webhookId, webhookId)).get();
