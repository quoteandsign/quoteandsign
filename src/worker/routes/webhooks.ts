import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid } from "../lib/crypto";
import { requireAuth, requireOwner } from "../lib/session";
import { audit } from "../lib/audit";
import { capsOf } from "../lib/plan";
import { WEBHOOK_EVENTS, webhookUrlProblem, newWebhookSecret, emitWebhook } from "../lib/webhooks";
import { rateLimit } from "../lib/ratelimit";

// One webhook per workspace, managed by the owner on the Business plan. The secret is shown once,
// when it is created or rotated, and never again.

export const webhookRoutes = new Hono<AppEnv>();
webhookRoutes.use("*", requireAuth, requireOwner);
webhookRoutes.use("*", async (c, next) => {
  if (!capsOf(c.get("owner")).webhooks) return c.json({ error: "Webhooks are part of the Business plan.", code: "plan" }, 402);
  await next();
});

const shape = (h: typeof schema.webhooks.$inferSelect) => ({
  id: h.id,
  url: h.url,
  events: h.events,
  active: h.active,
  failures: h.failures,
  lastOkAt: h.lastOkAt?.getTime() ?? null,
  lastError: h.lastError,
  createdAt: h.createdAt.getTime(),
});

webhookRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const hook = await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, c.get("owner").id)).get();
  if (!hook) return c.json({ webhook: null, deliveries: [], events: WEBHOOK_EVENTS });
  const deliveries = await db
    .select({ id: schema.webhookDeliveries.id, event: schema.webhookDeliveries.event, status: schema.webhookDeliveries.status, attempts: schema.webhookDeliveries.attempts, responseCode: schema.webhookDeliveries.responseCode, createdAt: schema.webhookDeliveries.createdAt })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.webhookId, hook.id))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(20)
    .all();
  return c.json({ webhook: shape(hook), deliveries: deliveries.map((d) => ({ ...d, createdAt: d.createdAt.getTime() })), events: WEBHOOK_EVENTS });
});

const putSchema = z.object({
  url: z.string().trim().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length).optional(),
  active: z.boolean().optional(),
});

/** Create or update. A new webhook returns its secret once. */
webhookRoutes.put("/", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const parsed = putSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid data." }, 400);
  if (!(await rateLimit(db, `whcfg:${owner.id}`, 30, 60 * 60_000)).allowed) return c.json({ error: "Too many changes for now. Try again in an hour." }, 429);
  const problem = webhookUrlProblem(parsed.data.url);
  if (problem) return c.json({ error: problem }, 400);
  const existing = await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, owner.id)).get();
  const now = new Date();
  if (existing) {
    const urlChanged = existing.url !== parsed.data.url;
    await db
      .update(schema.webhooks)
      .set({ url: parsed.data.url, events: parsed.data.events ?? existing.events, active: parsed.data.active ?? existing.active, ...(urlChanged ? { lastError: null } : {}) })
      .where(eq(schema.webhooks.id, existing.id));
    await audit(db, { userId: owner.id, event: "webhook.updated", meta: { urlChanged } });
    const fresh = (await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, existing.id)).get())!;
    return c.json({ webhook: shape(fresh) });
  }
  const secret = newWebhookSecret();
  const row = { id: uuid(), userId: owner.id, url: parsed.data.url, secret, events: parsed.data.events ?? [...WEBHOOK_EVENTS], active: parsed.data.active ?? true, failures: 0, lastOkAt: null, lastError: null, createdAt: now };
  await db.insert(schema.webhooks).values(row);
  await audit(db, { userId: owner.id, event: "webhook.created" });
  return c.json({ webhook: shape({ ...row }), secret });
});

/** A fresh secret, shown once. Deliveries in flight were signed with the old one. */
webhookRoutes.post("/rotate", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const hook = await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, owner.id)).get();
  if (!hook) return c.json({ error: "No webhook yet." }, 404);
  const secret = newWebhookSecret();
  await db.update(schema.webhooks).set({ secret }).where(eq(schema.webhooks.id, hook.id));
  await audit(db, { userId: owner.id, event: "webhook.rotated" });
  return c.json({ secret });
});

/** A ping, so the receiving end can be checked before anything real happens. */
webhookRoutes.post("/test", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const hook = await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, owner.id)).get();
  if (!hook) return c.json({ error: "No webhook yet." }, 404);
  if (!hook.active) return c.json({ error: "Switch the webhook on first." }, 409);
  await emitWebhook(c, owner.id, "ping", null);
  return c.json({ ok: true });
});

webhookRoutes.delete("/", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  await db.delete(schema.webhooks).where(eq(schema.webhooks.userId, owner.id));
  await audit(db, { userId: owner.id, event: "webhook.deleted" });
  return c.json({ ok: true });
});
