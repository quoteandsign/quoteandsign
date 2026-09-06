import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv, Bindings } from "../env";
import { appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { requireAuth, requireOwner } from "../lib/session";
import { audit } from "../lib/audit";

// Plans are sold through Polar (merchant of record). We never see card details. Without a Polar
// token the routes answer honestly that upgrades are not open yet.

import { PLANS, effectivePlan, type PlanId, type Interval } from "../lib/plan";
export { PLANS, type PlanId };

const polarBase = (env: Bindings) => (env.POLAR_SERVER === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh");
const productFor = (env: Bindings, plan: "pro" | "business", interval: Interval) =>
  plan === "pro" ? (interval === "year" ? env.POLAR_PRODUCT_PRO_YEAR : env.POLAR_PRODUCT_PRO) : interval === "year" ? env.POLAR_PRODUCT_BUSINESS_YEAR : env.POLAR_PRODUCT_BUSINESS;
/** Which plan and interval a Polar product id stands for. */
function planForProduct(env: Bindings, productId: string | undefined): { plan: PlanId; interval: Interval } | null {
  if (!productId) return null;
  const table: [string | undefined, PlanId, Interval][] = [
    [env.POLAR_PRODUCT_PRO, "pro", "month"],
    [env.POLAR_PRODUCT_PRO_YEAR, "pro", "year"],
    [env.POLAR_PRODUCT_BUSINESS, "business", "month"],
    [env.POLAR_PRODUCT_BUSINESS_YEAR, "business", "year"],
  ];
  const hit = table.find(([id]) => id && id === productId);
  return hit ? { plan: hit[1], interval: hit[2] } : null;
}
const configured = (env: Bindings) => Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_PRO && env.POLAR_PRODUCT_BUSINESS);

export const billingRoutes = new Hono<AppEnv>();
billingRoutes.use("*", requireAuth);

billingRoutes.get("/", (c) => {
  const owner = c.get("owner");
  const eff = effectivePlan(owner);
  return c.json({ plan: eff.id, paidPlan: eff.paid, interval: owner.billingInterval ?? null, trial: eff.trial, trialEndsAt: eff.trialEndsAt, trialDaysLeft: eff.trialDaysLeft, plans: PLANS, checkoutAvailable: configured(c.env), yearlyAvailable: Boolean(c.env.POLAR_PRODUCT_PRO_YEAR && c.env.POLAR_PRODUCT_BUSINESS_YEAR), hasBilling: Boolean(owner.polarCustomerId), isOwner: c.get("user").id === owner.id });
});

// Start a checkout. Polar hosts the page; we only hand over which product and who is buying.
billingRoutes.post("/checkout", requireOwner, async (c) => {
  const user = c.get("user");
  const parsed = z.object({ plan: z.enum(["pro", "business"]), interval: z.enum(["month", "year"]).default("year") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a plan." }, 400);
  if (!configured(c.env)) return c.json({ error: "Upgrades open soon. Nothing to pay yet." }, 503);
  if (!productFor(c.env, parsed.data.plan, parsed.data.interval)) return c.json({ error: "Yearly billing is not set up yet. Choose monthly for now." }, 503);
  const res = await fetch(`${polarBase(c.env)}/v1/checkouts/`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.env.POLAR_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      products: [productFor(c.env, parsed.data.plan, parsed.data.interval)],
      customer_email: user.email,
      ...(user.polarCustomerId ? { customer_id: user.polarCustomerId } : {}),
      metadata: { userId: user.id, plan: parsed.data.plan, interval: parsed.data.interval },
      success_url: `${appUrl(c)}/app/brand?upgraded=1`,
    }),
  });
  if (!res.ok) {
    console.error("polar checkout", res.status, await res.text().catch(() => ""));
    return c.json({ error: "Could not start the checkout. Try again in a minute." }, 502);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) return c.json({ error: "Could not start the checkout." }, 502);
  await audit(getDb(c.env.DB), { userId: user.id, event: "billing.checkout", meta: { plan: parsed.data.plan, interval: parsed.data.interval } });
  return c.json({ url: data.url });
});

// Manage or cancel: Polar's customer portal.
billingRoutes.post("/portal", requireOwner, async (c) => {
  const user = c.get("user");
  if (!configured(c.env) || !user.polarCustomerId) return c.json({ error: "No billing to manage yet." }, 404);
  const res = await fetch(`${polarBase(c.env)}/v1/customer-sessions/`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.env.POLAR_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ customer_id: user.polarCustomerId }),
  });
  if (!res.ok) return c.json({ error: "Could not open billing. Try again in a minute." }, 502);
  const data = (await res.json()) as { customer_portal_url?: string };
  return c.json({ url: data.customer_portal_url });
});

// ---- Webhook (no session; verified by signature) --------------------------------------------

/** Standard Webhooks signature: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)). */
export async function verifyWebhook(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 5 * 60) return false; // five-minute window
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => {
    const [v, sig] = s.split(",");
    return v === "v1" && sig && timingSafeEqual(sig, expected);
  });
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

type PolarEvent = {
  type: string;
  data: {
    id?: string;
    status?: string;
    customer_id?: string;
    customer?: { id?: string; email?: string };
    product_id?: string;
    product?: { id?: string };
    metadata?: Record<string, string>;
  };
};

/** Turns a Polar event into a plan change for the right account. Exported for tests. */
export async function applyPolarEvent(env: Bindings, ev: PolarEvent): Promise<{ userId: string; plan: PlanId } | null> {
  const db = getDb(env.DB);
  const d = ev.data ?? {};
  const productId = d.product_id ?? d.product?.id;
  const known = planForProduct(env, productId);
  const planFromProduct: PlanId | null = known ? known.plan : d.metadata?.plan === "pro" || d.metadata?.plan === "business" ? d.metadata.plan : null;
  const interval: Interval | null = known ? known.interval : d.metadata?.interval === "year" || d.metadata?.interval === "month" ? d.metadata.interval : null;
  const customerId = d.customer_id ?? d.customer?.id ?? null;
  const userId = d.metadata?.userId;
  const email = d.customer?.email?.toLowerCase();

  let user = userId ? await db.select().from(schema.users).where(eq(schema.users.id, userId)).get() : undefined;
  if (!user && customerId) user = await db.select().from(schema.users).where(eq(schema.users.polarCustomerId, customerId)).get();
  if (!user && email) user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user) return null;

  const active = new Set(["subscription.active", "subscription.updated", "subscription.created", "order.paid", "checkout.updated"]);
  const ended = new Set(["subscription.canceled", "subscription.revoked"]);
  let plan: PlanId | null = null;
  if (ev.type === "subscription.updated" && d.status && d.status !== "active" && d.status !== "trialing") plan = "free";
  else if (active.has(ev.type) && planFromProduct && (!d.status || d.status === "active" || d.status === "trialing" || d.status === "paid" || d.status === "succeeded")) plan = planFromProduct;
  else if (ended.has(ev.type)) plan = ev.type === "subscription.revoked" || d.status === "revoked" ? "free" : null; // canceled keeps access until revoked
  if (ev.type === "checkout.updated") plan = null; // informational only

  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (customerId && customerId !== user.polarCustomerId) set.polarCustomerId = customerId;
  if (plan && plan !== user.plan) set.plan = plan;
  if (plan && plan !== "free" && interval && interval !== user.billingInterval) set.billingInterval = interval;
  if (plan === "free") set.billingInterval = null;
  if (Object.keys(set).length) await db.update(schema.users).set(set).where(eq(schema.users.id, user.id));
  if (plan) await audit(db, { userId: user.id, event: "billing.plan", meta: { plan, event: ev.type } });
  return { userId: user.id, plan: (plan ?? user.plan) as PlanId };
}

export const billingWebhook = new Hono<AppEnv>();
billingWebhook.post("/", async (c) => {
  if (!c.env.POLAR_WEBHOOK_SECRET) return c.json({ error: "not configured" }, 503);
  const body = await c.req.text();
  if (!(await verifyWebhook(c.env.POLAR_WEBHOOK_SECRET, c.req.raw.headers, body))) return c.json({ error: "bad signature" }, 401);
  let ev: PolarEvent;
  try {
    ev = JSON.parse(body);
  } catch {
    return c.json({ error: "bad json" }, 400);
  }
  // Same id again inside the signature window: already applied, nothing to do.
  const first = await getDb(c.env.DB).insert(schema.webhookEvents).values({ id: c.req.header("webhook-id")!, seenAt: new Date() }).onConflictDoNothing().returning({ id: schema.webhookEvents.id }).get();
  if (!first) return c.json({ ok: true, duplicate: true });
  await applyPolarEvent(c.env, ev);
  return c.json({ ok: true });
});
