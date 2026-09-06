import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import type { AppEnv } from "../env";
import { clientIp, appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid, ipHash } from "../lib/crypto";
import { rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/email";
import { audit } from "../lib/audit";
import { getSessionUser, requireAuth } from "../lib/session";
import { effectivePlan } from "../lib/plan";
import { turnstileOk } from "./auth";

// Contact form → ticket → email to support and an acknowledgement to the sender.
// Admin area: overview, people, tickets with replies, and the opted-in email list.

export const KINDS = ["question", "billing", "bug", "abuse", "other"] as const;
const oneLine = (t: string) => t.replace(/[\r\n\t]+/g, " ").trim();

export const isAdmin = (env: { ADMIN_EMAILS?: string }, email: string) =>
  (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

export const contactRoutes = new Hono<AppEnv>();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  kind: z.enum(KINDS).default("question"),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(5).max(5000),
  website: z.string().max(500).optional(), // honeypot: anything here means a bot, answered with a quiet yes
  turnstile: z.string().max(4096).optional(),
});

contactRoutes.post("/", async (c) => {
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site");
  if ((origin && origin !== new URL(c.req.url).origin) || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) return c.json({ error: "Please send from the contact page." }, 400);
  const parsed = contactSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Add your name, a working email and a message." }, 400);
  const d = parsed.data;
  if (d.website) return c.json({ ok: true }); // bots get a quiet yes
  const ip = clientIp(c.req.raw);
  if (!(await turnstileOk(c.env, d.turnstile, ip))) return c.json({ error: "Please complete the check and try again.", code: "turnstile" }, 400);
  const db = getDb(c.env.DB);
  const hash = await ipHash(c.env.SESSION_SECRET, ip);
  const perIp = await rateLimit(db, `contact:${hash}`, 5, 60 * 60_000);
  const perEmail = await rateLimit(db, `contact:e:${d.email}`, 5, 24 * 60 * 60_000);
  if (!perIp.allowed || !perEmail.allowed) return c.json({ error: "Too many messages for now. Try again later." }, 429);
  const viewer = await getSessionUser(c);
  const now = new Date();
  const id = uuid();
  await db.insert(schema.tickets).values({ id, kind: d.kind, name: d.name, email: d.email, subject: d.subject, userId: viewer?.id ?? null, status: "open", ipHash: hash, createdAt: now, updatedAt: now });
  await db.insert(schema.ticketMessages).values({ id: uuid(), ticketId: id, from: "customer", body: d.message, createdAt: now });
  const ref = id.slice(0, 8).toUpperCase();
  await sendEmail(c.env, {
    to: c.env.SUPPORT_EMAIL || c.env.EMAIL_FROM.replace(/^.*<|>$/g, ""),
    replyTo: d.email,
    subject: `[${d.kind}] ${oneLine(d.subject)} (#${ref})`,
    text: `From: ${oneLine(d.name)} <${d.email}>${viewer ? ` (account ${viewer.email}, ${effectivePlan(viewer).id})` : ""}\n\n${d.message}\n\nAnswer from the admin area:\n${appUrl(c)}/app/admin?ticket=${id}`,
  });
  await sendEmail(c.env, {
    to: d.email,
    subject: `We got your message (#${ref})`,
    text: `Hi ${oneLine(d.name)},\n\nThanks for writing to Quote and Sign. Your message about "${oneLine(d.subject)}" is with us and you will hear back by email, usually within one business day.\n\nYour reference is #${ref}.`,
  });
  await audit(db, { userId: viewer?.id ?? null, event: "ticket.opened", ipHash: hash, meta: { id, kind: d.kind } });
  return c.json({ ok: true, ref });
});

// ---- Admin ------------------------------------------------------------------------------------

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAuth);
adminRoutes.use("*", async (c, next) => {
  if (!isAdmin(c.env, c.get("user").email)) return c.json({ error: "not found" }, 404); // admins are not advertised
  await next();
});

adminRoutes.get("/overview", async (c) => {
  const db = getDb(c.env.DB);
  const day = 24 * 60 * 60_000;
  const since30 = new Date(Date.now() - 30 * day);
  const [users, byPlan, trials, newUsers, proposals, sent30, accepted30, openTickets, subscribers] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.users).where(sql`deleted_at is null`).get(),
    db.select({ plan: schema.users.plan, n: sql<number>`count(*)` }).from(schema.users).where(sql`deleted_at is null`).groupBy(schema.users.plan).all(),
    db.select({ n: sql<number>`count(*)` }).from(schema.users).where(sql`deleted_at is null and plan = 'free' and trial_ends_at > ${Date.now()}`).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.users).where(sql`deleted_at is null and created_at > ${since30.getTime()}`).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.proposals).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.proposals).where(sql`sent_at > ${since30.getTime()}`).get(),
    db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(total_amount), 0)` }).from(schema.acceptances).where(sql`accepted_at > ${since30.getTime()}`).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.tickets).where(eq(schema.tickets.status, "open")).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.users).where(sql`deleted_at is null and marketing_opt_in = 1`).get(),
  ]);
  return c.json({
    users: users?.n ?? 0,
    byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r.n])),
    trialing: trials?.n ?? 0,
    newUsers30: newUsers?.n ?? 0,
    proposals: proposals?.n ?? 0,
    sent30: sent30?.n ?? 0,
    accepted30: accepted30?.n ?? 0,
    acceptedTotal30: accepted30?.total ?? 0,
    openTickets: openTickets?.n ?? 0,
    subscribers: subscribers?.n ?? 0,
  });
});

adminRoutes.get("/people", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      brandName: schema.users.brandName,
      plan: schema.users.plan,
      interval: schema.users.billingInterval,
      trialEndsAt: schema.users.trialEndsAt,
      createdAt: schema.users.createdAt,
      marketingOptIn: schema.users.marketingOptIn,
      proposals: sql<number>`(select count(*) from proposals p where p.user_id = users.id)`,
      accepted: sql<number>`(select count(*) from acceptances a join proposals p on p.id = a.proposal_id where p.user_id = users.id)`,
      lastSeen: sql<number | null>`(select max(created_at) from audit_log l where l.user_id = users.id)`,
    })
    .from(schema.users)
    .where(sql`deleted_at is null`)
    .orderBy(desc(schema.users.createdAt))
    .limit(500)
    .all();
  return c.json({
    people: rows.map((r) => ({ ...r, trialEndsAt: r.trialEndsAt?.getTime() ?? null, createdAt: r.createdAt.getTime(), effective: effectivePlan({ plan: r.plan, trialEndsAt: r.trialEndsAt }).id })),
  });
});

// Everyone who ticked the box, as a file for whichever mailing tool you use. Consent proof included.
adminRoutes.get("/subscribers.csv", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select({ email: schema.users.email, at: schema.users.marketingOptInAt, name: schema.users.brandName }).from(schema.users).where(sql`deleted_at is null and marketing_opt_in = 1`).orderBy(desc(schema.users.marketingOptInAt)).all();
  const csv = ["email,business,consented_at", ...rows.map((r) => `${r.email},"${(r.name ?? "").replace(/"/g, '""')}",${r.at ? r.at.toISOString() : ""}`)].join("\n");
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
  await audit(getDb(c.env.DB), { userId: c.get("user").id, event: "admin.subscribers_export", meta: { n: rows.length } });
  return c.body(csv);
});

adminRoutes.get("/tickets", async (c) => {
  const db = getDb(c.env.DB);
  const status = c.req.query("status") === "closed" ? "closed" : "open";
  const rows = await db.select().from(schema.tickets).where(eq(schema.tickets.status, status)).orderBy(desc(schema.tickets.updatedAt)).limit(200).all();
  return c.json({ tickets: rows.map((t) => ({ ...t, createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime(), ipHash: undefined })) });
});

adminRoutes.get("/tickets/:id", async (c) => {
  const db = getDb(c.env.DB);
  const t = await db.select().from(schema.tickets).where(eq(schema.tickets.id, c.req.param("id"))).get();
  if (!t) return c.json({ error: "not found" }, 404);
  const messages = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, t.id)).orderBy(schema.ticketMessages.createdAt).all();
  return c.json({ ticket: { ...t, createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime(), ipHash: undefined }, messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.getTime() })) });
});

adminRoutes.post("/tickets/:id/reply", async (c) => {
  const db = getDb(c.env.DB);
  const t = await db.select().from(schema.tickets).where(eq(schema.tickets.id, c.req.param("id"))).get();
  if (!t) return c.json({ error: "not found" }, 404);
  const parsed = z.object({ body: z.string().trim().min(1).max(5000), close: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Write a reply." }, 400);
  const now = new Date();
  await db.insert(schema.ticketMessages).values({ id: uuid(), ticketId: t.id, from: "admin", body: parsed.data.body, createdAt: now });
  await db.update(schema.tickets).set({ status: parsed.data.close ? "closed" : "open", updatedAt: now }).where(eq(schema.tickets.id, t.id));
  await sendEmail(c.env, {
    to: t.email,
    replyTo: c.env.SUPPORT_EMAIL || undefined,
    subject: `Re: ${oneLine(t.subject)} (#${t.id.slice(0, 8).toUpperCase()})`,
    text: `${parsed.data.body}\n\nReply to this email to continue the conversation.`,
  });
  await audit(db, { userId: c.get("user").id, event: "ticket.replied", meta: { id: t.id, closed: Boolean(parsed.data.close) } });
  return c.json({ ok: true });
});

adminRoutes.post("/tickets/:id/status", async (c) => {
  const db = getDb(c.env.DB);
  const parsed = z.object({ status: z.enum(["open", "closed"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid." }, 400);
  const r = await db.update(schema.tickets).set({ status: parsed.data.status, updatedAt: new Date() }).where(and(eq(schema.tickets.id, c.req.param("id")))).returning({ id: schema.tickets.id }).get();
  if (!r) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
