import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, desc, inArray, sql, gt, isNull } from "drizzle-orm";
import type { AppEnv } from "../env";
import { clientIp, appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid, hashPassword, ipHash } from "../lib/crypto";
import { requireAuth } from "../lib/session";
import { sendEmail } from "../lib/email";
import { rateLimit } from "../lib/ratelimit";
import { audit } from "../lib/audit";
import { getTemplate } from "../../shared/templates";
import { splitSections, type Block } from "../lib/render";
import { SUPPORTED_CURRENCIES } from "../../shared/pricing";
import { STYLE_IDS } from "../../shared/styles";
import { businessName } from "../../shared/names";
import { proposalPdf } from "../lib/pdf";
import { PLANS, effectivePlan, capsOf } from "../lib/plan";
import { contentHashInput, CONSENT_MANUAL } from "./public";
import { computeTotals } from "../../shared/pricing";
import { sha256Hex } from "../lib/crypto";

const MAX_CONTENT_BYTES = 500_000;

export const proposalRoutes = new Hono<AppEnv>();
proposalRoutes.use("*", requireAuth);

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullish(),
  unitAmount: z.number().int().min(0).max(1_000_000_000),
  quantity: z.number().int().min(0).max(100_000),
  minQuantity: z.number().int().min(0).max(100_000).nullish(),
  maxQuantity: z.number().int().min(0).max(100_000).nullish(),
  optional: z.boolean(),
  selectedByDefault: z.boolean(),
  taxRateBps: z.number().int().min(0).max(10_000).nullable(),
  billing: z.enum(["once", "month", "quarter", "year"]).optional(),
  unit: z.string().trim().max(24).nullish(),
}).refine((it) => it.minQuantity == null || it.maxQuantity == null || it.minQuantity <= it.maxQuantity, {
  message: "Minimum quantity cannot be more than the maximum.",
}).refine((it) => it.minQuantity == null || it.maxQuantity != null, {
  message: "A minimum quantity needs a maximum.",
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientName: z.string().trim().max(200).nullish(),
  clientEmail: z.string().trim().toLowerCase().email().max(254).or(z.literal("")).nullish(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
  expiresAt: z.number().int().positive().nullish(),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  taxLabel: z.string().trim().max(40).nullish(),
  senderName: z.string().trim().max(120).nullish(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  ccEmails: z.array(z.string().trim().toLowerCase().email().max(254)).max(10).optional(),
  remind: z.boolean().optional(),
  navHidden: z.array(z.string().max(64)).max(200).optional(),
  notifyEmails: z.array(z.string().trim().toLowerCase().email().max(254)).max(10).optional(),
  style: z.enum(STYLE_IDS).optional(),
  paymentUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Payment links must start with https://").nullish(),
  paymentLabel: z.string().trim().max(40).nullish(),
  countersign: z.boolean().optional(),
  // undefined = unchanged, "" = remove, string = set
  password: z.string().max(200).optional(),
});

/** Everyone a proposal goes to: the client plus any extra recipients, deduplicated. */
function recipientsOf(p: { clientEmail: string | null; ccEmails: string[] | null }): string[] {
  return [...new Set([p.clientEmail, ...(p.ccEmails ?? [])].filter((e): e is string => Boolean(e)))];
}

/** Template blocks carry no ids; stable ids are what section settings point at. */
function withIds(blocks: unknown): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || typeof b !== "object") return b;
    const block = b as Record<string, unknown>;
    return { ...block, id: typeof block.id === "string" ? block.id : uuid(), ...(Array.isArray(block.children) ? { children: withIds(block.children) } : {}) };
  });
}

function ownerProposal(db: ReturnType<typeof getDb>, id: string, userId: string) {
  return db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)))
    .get();
}

proposalRoutes.get("/", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.proposals.id,
      publicId: schema.proposals.publicId,
      title: schema.proposals.title,
      clientName: schema.proposals.clientName,
      currency: schema.proposals.currency,
      status: schema.proposals.status,
      sentAt: schema.proposals.sentAt,
      lastSentAt: schema.proposals.lastSentAt,
      sendCount: schema.proposals.sendCount,
      clientEmail: schema.proposals.clientEmail,
      updatedAt: schema.proposals.updatedAt,
      expiresAt: schema.proposals.expiresAt,
      declinedAt: schema.proposals.declinedAt,
      declineReason: schema.proposals.declineReason,
      // Subqueries are written by hand: drizzle drops the table qualifier inside them.
      viewCount: sql<number>`(select count(*) from views v where v.proposal_id = proposals.id)`,
      acceptedAt: sql<number | null>`(select a.accepted_at from acceptances a where a.proposal_id = proposals.id)`,
      acceptedTotal: sql<number | null>`(select a.total_amount from acceptances a where a.proposal_id = proposals.id)`,
      signerName: sql<string | null>`(select a.signer_name from acceptances a where a.proposal_id = proposals.id)`,
      acceptMethod: sql<string | null>`(select a.method from acceptances a where a.proposal_id = proposals.id)`,
      unreadQuestions: sql<number>`(select count(*) from messages m where m.proposal_id = proposals.id and m.read_at is null)`,
      uniqueViewers: sql<number>`(select count(distinct v.ip_hash) from views v where v.proposal_id = proposals.id)`,
      lastViewedAt: sql<number | null>`(select max(v.viewed_at) from views v where v.proposal_id = proposals.id)`,
      firstViewedAt: sql<number | null>`(select min(v.viewed_at) from views v where v.proposal_id = proposals.id)`,
      readSeconds: sql<number>`(select coalesce(sum(t.seconds), 0) from section_time t where t.proposal_id = proposals.id)`,
    })
    .from(schema.proposals)
    .where(eq(schema.proposals.userId, user.id))
    .orderBy(desc(schema.proposals.updatedAt))
    .all();
  c.header("cache-control", "private, no-store");
  const now = Date.now();
  return c.json({
    proposals: rows.map((r) => ({
      ...r,
      sentAt: r.sentAt?.getTime() ?? null,
      lastSentAt: r.lastSentAt?.getTime() ?? null,
      updatedAt: r.updatedAt.getTime(),
      expiresAt: r.expiresAt?.getTime() ?? null,
      declinedAt: r.declinedAt?.getTime() ?? null,
      // A live proposal past its date can no longer be accepted; say so instead of "Viewed".
      status: (r.status === "sent" || r.status === "viewed") && r.expiresAt && r.expiresAt.getTime() < now && !r.acceptedAt ? "expired" : r.status,
    })),
  });
});

proposalRoutes.post("/", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const body = z.object({ template: z.string().max(40).optional(), userTemplate: z.string().uuid().optional(), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), style: z.enum(STYLE_IDS).optional(), currency: z.enum(SUPPORTED_CURRENCIES).optional() }).safeParse(await c.req.json().catch(() => ({})));
  let template = getTemplate(body.success ? body.data.template : undefined);
  let savedAccent: string | null = null;
  if (body.success && body.data.userTemplate) {
    const saved = await db.select().from(schema.userTemplates).where(and(eq(schema.userTemplates.id, body.data.userTemplate), eq(schema.userTemplates.userId, user.id))).get();
    if (!saved) return c.json({ error: "That template no longer exists." }, 404);
    template = { id: saved.id, name: saved.name, summary: "", title: saved.title, style: saved.style ?? "classic", content: saved.content as unknown[], items: saved.items as typeof template.items };
    savedAccent = saved.accentColor;
  }
  const now = new Date();
  const id = uuid();
  await db.insert(schema.proposals).values({
    id,
    publicId: uuid(),
    userId: user.id,
    title: template.title,
    currency: (body.success && body.data.currency) || "USD",
    content: withIds(template.content),
    accentColor: body.success && body.data.accentColor ? body.data.accentColor.toLowerCase() : savedAccent,
    style: (body.success && body.data.style) || user.defaultStyle || template.style,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  if (template.items.length) {
    await db.insert(schema.pricingItems).values(
      template.items.map((it, i) => ({
        id: uuid(),
        proposalId: id,
        position: i,
        name: it.name,
        description: it.description ?? null,
        unitAmount: it.unitAmount,
        quantity: it.quantity,
        minQuantity: it.minQuantity ?? null,
        maxQuantity: it.maxQuantity ?? null,
        optional: it.optional,
        selectedByDefault: it.selectedByDefault,
        taxRateBps: it.taxRateBps ?? null,
        billing: it.billing ?? "once",
        unit: it.unit ?? null,
      })),
    );
  }
  await audit(db, { userId: actor.id, proposalId: id, event: "proposal.created", meta: { template: template.id } });
  return c.json({ id }, 201);
});

proposalRoutes.get("/:id", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const [items, acceptance, viewCountRow] = await Promise.all([
    db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all(),
    db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.views).where(eq(schema.views.proposalId, proposal.id)).get(),
  ]);
  const { passwordHash, ...safe } = proposal;
  const ms = (d: Date | null) => (d ? d.getTime() : null);
  return c.json({
    proposal: { ...safe, expiresAt: ms(safe.expiresAt), sentAt: ms(safe.sentAt), createdAt: safe.createdAt.getTime(), updatedAt: safe.updatedAt.getTime(), reminderSentAt: ms(safe.reminderSentAt), hasPassword: Boolean(passwordHash), viewCount: viewCountRow?.n ?? 0 },
    items,
    acceptance: acceptance ? { ...acceptance, acceptedAt: acceptance.acceptedAt.getTime() } : null,
  });
});

proposalRoutes.put("/:id", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (proposal.status === "accepted") return c.json({ error: "Accepted proposals cannot be edited." }, 409);
  if (proposal.status === "archived") return c.json({ error: "Restore this proposal before editing it." }, 409);

  const raw = await c.req.text();
  if (raw.length > MAX_CONTENT_BYTES) return c.json({ error: "Proposal is too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON." }, 400);
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid data.", issues: parsed.error.issues }, 400);
  const d = parsed.data;

  // Plan gates: a field that needs a plan may be cleared or left as it is, never set anew.
  const caps = capsOf(user);
  const wants = (v: unknown, current: unknown) => v !== undefined && v !== null && v !== "" && v !== false && v !== current;
  const gate = (msg: string) => c.json({ error: msg, code: "plan" }, 402);
  if (!caps.brand && (wants(d.accentColor?.toLowerCase(), proposal.accentColor) || wants(d.style, proposal.style) || wants(d.senderName, proposal.senderName))) return gate("Colours, page styles and a custom sender name are part of Pro.");
  if (!caps.protect && (wants(d.password, undefined) || wants(d.expiresAt, proposal.expiresAt?.getTime()))) return gate("Link passwords, expiry dates and reminders are part of Pro.");
  if (!caps.payment && wants(d.paymentUrl, proposal.paymentUrl)) return gate("A payment link after signing is part of Pro.");
  if (!caps.countersign && wants(d.countersign, proposal.countersign)) return gate("Countersigning is part of Business.");

  const set: Partial<typeof schema.proposals.$inferInsert> = { updatedAt: new Date() };
  if (d.countersign !== undefined) set.countersign = d.countersign;
  if (d.title !== undefined) set.title = d.title;
  if (d.clientName !== undefined) set.clientName = d.clientName || null;
  if (d.clientEmail !== undefined) set.clientEmail = d.clientEmail || null;
  if (d.currency !== undefined) set.currency = d.currency;
  if (d.content !== undefined) set.content = d.content;
  if (d.expiresAt !== undefined) set.expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
  if (d.taxRateBps !== undefined) set.taxRateBps = d.taxRateBps;
  if (d.taxLabel !== undefined) set.taxLabel = d.taxLabel || null;
  if (d.senderName !== undefined) set.senderName = d.senderName || null;
  if (d.accentColor !== undefined) set.accentColor = d.accentColor ? d.accentColor.toLowerCase() : null;
  if (d.ccEmails !== undefined) set.ccEmails = [...new Set(d.ccEmails)].filter((e) => e !== (d.clientEmail ?? proposal.clientEmail));
  if (d.remind !== undefined) set.remind = d.remind;
  if (d.navHidden !== undefined) set.navHidden = d.navHidden;
  if (d.notifyEmails !== undefined) set.notifyEmails = [...new Set(d.notifyEmails)];
  if (d.style !== undefined) set.style = d.style;
  if (d.paymentUrl !== undefined) set.paymentUrl = d.paymentUrl || null;
  if (d.paymentLabel !== undefined) set.paymentLabel = d.paymentLabel || null;
  if (d.password !== undefined) set.passwordHash = d.password === "" ? null : await hashPassword(d.password);

  const changed = await db
    .update(schema.proposals)
    .set(set)
    .where(and(eq(schema.proposals.id, proposal.id), inArray(schema.proposals.status, ["draft", "sent", "viewed", "expired"])))
    .returning({ id: schema.proposals.id })
    .get();
  if (!changed) return c.json({ error: "This proposal was accepted while you were editing. Reload to see the signed version." }, 409);
  return c.json({ ok: true });
});

proposalRoutes.put("/:id/items", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (proposal.status === "accepted") return c.json({ error: "Accepted proposals cannot be edited." }, 409);
  if (proposal.status === "archived") return c.json({ error: "Restore this proposal before editing it." }, 409);

  const parsed = z.array(itemSchema).max(100).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: first?.message ? `Pricing: ${first.message}` : "Invalid pricing.", issues: parsed.error.issues }, 400);
  }

  const rows = parsed.data.map((it, i) => ({
    id: it.id ?? uuid(),
    proposalId: proposal.id,
    position: i,
    name: it.name,
    description: it.description ?? null,
    unitAmount: it.unitAmount,
    quantity: it.quantity,
    minQuantity: it.minQuantity ?? null,
    maxQuantity: it.maxQuantity ?? null,
    optional: it.optional,
    selectedByDefault: it.selectedByDefault,
    taxRateBps: it.taxRateBps ?? null,
    billing: it.billing ?? "once",
    unit: it.unit || null,
  }));

  await db.batch([
    db.delete(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)),
    ...(rows.length ? [db.insert(schema.pricingItems).values(rows)] : []),
    db.update(schema.proposals).set({ updatedAt: new Date() }).where(eq(schema.proposals.id, proposal.id)),
  ] as any);
  return c.json({ ok: true, items: rows });
});

proposalRoutes.post("/:id/send", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (proposal.status === "accepted") return c.json({ error: "Already accepted." }, 409);
  if (proposal.status === "archived") return c.json({ error: "Restore this proposal before sending it." }, 409);

  const plan = PLANS[effectivePlan(user).id];
  if (plan.liveLimit !== Infinity && (proposal.status === "draft" || proposal.status === "declined")) {
    const live = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.userId, user.id), inArray(schema.proposals.status, ["sent", "viewed"]), or(isNull(schema.proposals.expiresAt), gt(schema.proposals.expiresAt, new Date()))))
      .get();
    if ((live?.n ?? 0) >= plan.liveLimit) {
      return c.json({ error: `The free plan allows ${plan.liveLimit} live proposals at a time. Archive one, or upgrade under Brand for unlimited.`, code: "limit" }, 402);
    }
  }

  const perProposal = await rateLimit(db, `send:p:${proposal.id}`, 5, 24 * 60 * 60_000);
  const perUser = await rateLimit(db, `send:u:${user.id}`, 40, 24 * 60 * 60_000);
  if (!perProposal.allowed || !perUser.allowed) {
    return c.json({ error: "Sending limit reached for today. Share the link directly instead." }, 429);
  }
  const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

  const sendBody = z.object({ message: z.string().trim().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const message = sendBody.success && sendBody.data.message ? sendBody.data.message.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n") : "";
  const now = new Date();
  const link = `${appUrl(c)}/p/${proposal.publicId}`;
  if (proposal.status === "draft" || proposal.status === "declined") {
    await db.update(schema.proposals).set({ status: "sent", sentAt: proposal.sentAt ?? now, declinedAt: null, declineReason: null, updatedAt: now }).where(eq(schema.proposals.id, proposal.id));
  }
  const recipients = recipientsOf(proposal);
  if (recipients.length) {
    const from = oneLine(proposal.senderName || businessName(user.brandName, user.name, user.email));
    const title = oneLine(proposal.title);
    await sendEmail(c.env, {
      to: recipients,
      replyTo: user.email,
      subject: `Proposal: ${title}`,
      text: `${from} sent you a proposal.
${message ? `\n${message}\n` : ""}
${title}

Open it here:
${link}

You can review the pricing, choose options and accept online. Reply to this email if you have a question.`,
    });
  }
  // Every email that goes out counts, so the dashboard can say "sent twice".
  if (recipients.length) await db.update(schema.proposals).set({ sendCount: sql`${schema.proposals.sendCount} + 1`, lastSentAt: now }).where(eq(schema.proposals.id, proposal.id));
  await audit(db, { userId: actor.id, proposalId: proposal.id, event: "proposal.sent", ipHash: await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw)), meta: { emailed: recipients.length } });
  return c.json({ ok: true, link, emailed: recipients.length, sendCount: proposal.sendCount + (recipients.length ? 1 : 0) });
});

// A copy as a fresh draft: content, pricing and details, none of the history.
proposalRoutes.post("/:id/duplicate", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const items = await db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all();
  const now = new Date();
  const id = uuid();
  await db.insert(schema.proposals).values({
    id,
    publicId: uuid(),
    userId: user.id,
    title: /(copy)$/i.test(proposal.title) ? proposal.title : `${proposal.title} (copy)`.slice(0, 200),
    clientName: proposal.clientName,
    clientEmail: proposal.clientEmail,
    ccEmails: proposal.ccEmails,
    currency: proposal.currency,
    content: proposal.content,
    taxRateBps: proposal.taxRateBps,
    taxLabel: proposal.taxLabel,
    senderName: proposal.senderName,
    accentColor: proposal.accentColor,
    remind: proposal.remind,
    navHidden: proposal.navHidden,
    notifyEmails: proposal.notifyEmails,
    style: proposal.style,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  if (items.length) {
    await db.insert(schema.pricingItems).values(items.map((it) => ({ ...it, id: uuid(), proposalId: id })));
  }
  await audit(db, { userId: actor.id, proposalId: id, event: "proposal.created", meta: { duplicatedFrom: proposal.id } });
  return c.json({ id }, 201);
});

// Questions the client asked from the proposal page. Reading them marks them read.
proposalRoutes.get("/:id/messages", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const rows = await db.select().from(schema.messages).where(eq(schema.messages.proposalId, proposal.id)).orderBy(desc(schema.messages.createdAt)).all();
  if (rows.some((m) => !m.readAt)) {
    await db.update(schema.messages).set({ readAt: new Date() }).where(and(eq(schema.messages.proposalId, proposal.id), sql`${schema.messages.readAt} is null`));
  }
  c.header("cache-control", "private, no-store");
  return c.json({ messages: rows.map((m) => ({ id: m.id, name: m.name, email: m.email, body: m.body, createdAt: m.createdAt.getTime(), unread: !m.readAt })) });
});

// The sender's own signature on an accepted proposal. Business only; the client gets the executed copy.
proposalRoutes.post("/:id/countersign", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (!capsOf(user).countersign) return c.json({ error: "Countersigning is part of Business.", code: "plan" }, 402);
  const parsed = z.object({ name: z.string().trim().min(2).max(120) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Type your full name." }, 400);
  const acceptance = await db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get();
  if (!acceptance) return c.json({ error: "The client has not signed yet." }, 409);
  if (acceptance.countersignedAt) return c.json({ error: "Already countersigned." }, 409);
  const now = new Date();
  await db.update(schema.acceptances).set({ countersignedAt: now, countersignerName: parsed.data.name }).where(eq(schema.acceptances.id, acceptance.id));
  await audit(db, { userId: actor.id, proposalId: proposal.id, event: "proposal.countersigned" });
  const signed = { ...acceptance, countersignedAt: now, countersignerName: parsed.data.name };
  const link = `${appUrl(c)}/p/${proposal.publicId}`;
  if (acceptance.signerEmail) {
    let attachments: { filename: string; content: Uint8Array }[] = [];
    try {
      const items = await db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all();
      const bytes = await proposalPdf({ proposal, owner: user, items, acceptance: signed, appUrl: appUrl(c) });
      const name = proposal.title.replace(/[^\w\d-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";
      attachments = [{ filename: `${name}-signed.pdf`, content: bytes }];
    } catch (e) {
      console.error("countersign pdf", e);
    }
    const brand = proposal.senderName || businessName(user.brandName, user.name, user.email);
    await sendEmail(c.env, {
      to: acceptance.signerEmail,
      replyTo: user.email,
      subject: `Countersigned: ${proposal.title}`,
      text: `${parsed.data.name} of ${brand} has countersigned "${proposal.title}". Both signatures are now on the record.${attachments.length ? "\n\nThe fully signed PDF is attached." : ""}\n\nOpen it any time: ${link}\nRecord: ${link}/record.json`,
      attachments,
    });
  }
  return c.json({ ok: true, countersignedAt: now.getTime(), countersignerName: parsed.data.name });
});

const markSchema = z.object({ status: z.enum(["accepted", "declined", "open"]), reason: z.string().trim().max(500).optional() });
proposalRoutes.post("/:id/mark", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const parsed = markSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid data." }, 400);
  const now = new Date();
  const existing = await db.select({ id: schema.acceptances.id }).from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get();
  if (parsed.data.status === "accepted") {
    if (existing) return c.json({ error: "Already accepted." }, 409);
    if (proposal.status === "archived") return c.json({ error: "Restore this proposal first." }, 409);
    const items = await db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all();
    const snapshot = contentHashInput(proposal, user, items);
    const totals = computeTotals(items, {}, proposal.taxRateBps);
    const brand = proposal.senderName || businessName(user.brandName, user.name) || null;
    await db.insert(schema.acceptances).values({
      id: uuid(),
      proposalId: proposal.id,
      signerName: proposal.clientName || "Client",
      signerEmail: proposal.clientEmail || null,
      signedText: `Marked as accepted by ${brand ?? "the sender"}`,
      selectedItemIds: totals.lines.filter((l) => l.selected).map((l) => ({ id: l.id, quantity: l.quantity })),
      totalAmount: totals.total,
      recurring: totals.recurring.map((r) => ({ period: r.period, total: r.total })),
      currency: proposal.currency,
      contentHash: await sha256Hex(snapshot),
      snapshot,
      method: "manual",
      ip: clientIp(c.req.raw),
      userAgent: c.req.header("user-agent")?.slice(0, 255) ?? null,
      acceptedAt: now,
      consentText: CONSENT_MANUAL,
      senderName: brand,
      senderEmail: user.email,
      clientName: proposal.clientName,
    });
    await db.update(schema.proposals).set({ status: "accepted", sentAt: proposal.sentAt ?? now, declinedAt: null, declineReason: null, updatedAt: now }).where(eq(schema.proposals.id, proposal.id));
    await audit(db, { userId: actor.id, proposalId: proposal.id, event: "proposal.marked_accepted", meta: { total: totals.total } });
    return c.json({ ok: true, status: "accepted" });
  }
  if (parsed.data.status === "declined") {
    if (existing) return c.json({ error: "Accepted proposals cannot be declined." }, 409);
    await db.update(schema.proposals).set({ status: "declined", declinedAt: now, declineReason: parsed.data.reason || null, updatedAt: now }).where(eq(schema.proposals.id, proposal.id));
    await audit(db, { userId: actor.id, proposalId: proposal.id, event: "proposal.marked_declined" });
    return c.json({ ok: true, status: "declined" });
  }
  // Reopen: back to live if it was ever sent, otherwise a draft.
  if (existing) return c.json({ error: "Accepted proposals stay accepted." }, 409);
  const status = proposal.sentAt ? "sent" : "draft";
  await db.update(schema.proposals).set({ status, declinedAt: null, declineReason: null, updatedAt: now }).where(eq(schema.proposals.id, proposal.id));
  return c.json({ ok: true, status });
});

proposalRoutes.post("/:id/archive", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  await db.update(schema.proposals).set({ status: "archived", updatedAt: new Date() }).where(eq(schema.proposals.id, proposal.id));
  return c.json({ ok: true });
});

proposalRoutes.post("/:id/restore", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (proposal.status !== "archived") return c.json({ ok: true });
  const accepted = await db.select({ id: schema.acceptances.id }).from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get();
  const status = accepted ? "accepted" : proposal.sentAt ? "sent" : "draft";
  if (status === "sent") {
    const plan = PLANS[effectivePlan(user).id];
    if (plan.liveLimit !== Infinity) {
      const live = await db.select({ n: sql<number>`count(*)` }).from(schema.proposals).where(and(eq(schema.proposals.userId, user.id), inArray(schema.proposals.status, ["sent", "viewed"]), or(isNull(schema.proposals.expiresAt), gt(schema.proposals.expiresAt, new Date())))).get();
      if ((live?.n ?? 0) >= plan.liveLimit) return c.json({ error: `The free plan allows ${plan.liveLimit} live proposals at a time. Archive one first, or upgrade under Brand.`, code: "limit" }, 402);
    }
  }
  await db.update(schema.proposals).set({ status, updatedAt: new Date() }).where(eq(schema.proposals.id, proposal.id));
  return c.json({ ok: true, status });
});

proposalRoutes.delete("/:id", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (proposal.status === "accepted") {
    return c.json({ error: "Accepted proposals are kept as a record. Archive it instead." }, 409);
  }
  await db.delete(schema.proposals).where(eq(schema.proposals.id, proposal.id));
  await audit(db, { userId: actor.id, proposalId: proposal.id, event: "proposal.deleted" });
  return c.json({ ok: true });
});

// The full picture for one proposal: opens over time, who and where, time per section.
proposalRoutes.get("/:id/analytics", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const [views, times, acceptance, questions] = await Promise.all([
    db.select({ viewedAt: schema.views.viewedAt, ipHash: schema.views.ipHash, userAgent: schema.views.userAgent, country: schema.views.country }).from(schema.views).where(eq(schema.views.proposalId, proposal.id)).all(),
    db.select().from(schema.sectionTime).where(eq(schema.sectionTime.proposalId, proposal.id)).all(),
    db.select({ acceptedAt: schema.acceptances.acceptedAt, signerName: schema.acceptances.signerName }).from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.messages).where(eq(schema.messages.proposalId, proposal.id)).get(),
  ]);

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const byDay: { day: string; opens: number }[] = [];
  for (let i = 13; i >= 0; i--) byDay.push({ day: day(new Date(today.getTime() - i * 86_400_000)), opens: 0 });
  const counts = new Map(byDay.map((d) => [d.day, d]));
  const countries = new Map<string, number>();
  let phone = 0;
  let desktop = 0;
  const viewers = new Set<string>();
  for (const v of views) {
    const d = counts.get(day(v.viewedAt));
    if (d) d.opens++;
    if (v.ipHash) viewers.add(v.ipHash);
    if (v.country) countries.set(v.country, (countries.get(v.country) ?? 0) + 1);
    if (/Mobi|Android|iPhone|iPad/i.test(v.userAgent ?? "")) phone++;
    else desktop++;
  }
  // Sections in document order, whether or not anyone reached them yet.
  const secs = new Map(times.map((t) => [t.sectionId, t]));
  const sections = splitSections((proposal.content as Block[]) ?? [])
    .map((s) => ({ id: s.id, title: s.title ?? "Introduction", seconds: secs.get(s.id)?.seconds ?? 0 }));
  for (const extra of ["s-pricing", "s-accept"]) if (secs.has(extra)) sections.push({ id: extra, title: secs.get(extra)!.title, seconds: secs.get(extra)!.seconds });
  const sortedViews = views.map((v) => v.viewedAt.getTime()).sort((a, b) => a - b);

  c.header("cache-control", "private, no-store");
  return c.json({
    title: proposal.title,
    status: proposal.status,
    sentAt: proposal.sentAt?.getTime() ?? null,
    acceptedAt: acceptance?.acceptedAt.getTime() ?? null,
    signerName: acceptance?.signerName ?? null,
    opens: views.length,
    people: viewers.size,
    firstViewedAt: sortedViews[0] ?? null,
    lastViewedAt: sortedViews[sortedViews.length - 1] ?? null,
    readSeconds: times.reduce((s, t) => s + t.seconds, 0),
    questions: questions?.n ?? 0,
    byDay,
    devices: { phone, desktop },
    countries: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, opens]) => ({ country, opens })),
    sections,
  });
});

// The paper copy. Pro and Business; the free plan sees why.
proposalRoutes.get("/:id/pdf", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  if (!PLANS[effectivePlan(user).id].pdf) return c.json({ error: "PDF export is part of Pro. Upgrade under Brand.", code: "plan" }, 402);
  const [items, acceptance] = await Promise.all([
    db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all(),
    db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get(),
  ]);
  const bytes = await proposalPdf({ proposal, owner: user, items, acceptance: acceptance ?? null, appUrl: appUrl(c) });
  const name = proposal.title.replace(/[^\w\d-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";
  c.header("content-type", "application/pdf");
  c.header("content-disposition", `attachment; filename="${name}.pdf"`);
  c.header("cache-control", "private, no-store");
  return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

proposalRoutes.get("/:id/export", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const proposal = await ownerProposal(db, c.req.param("id"), user.id);
  if (!proposal) return c.json({ error: "not found" }, 404);
  const [items, acceptance] = await Promise.all([
    db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all(),
    db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get(),
  ]);
  const { passwordHash, ...safe } = proposal;
  c.header("content-disposition", `attachment; filename="proposal-${proposal.publicId}.json"`);
  c.header("cache-control", "private, no-store");
  return c.json({ exportedAt: new Date().toISOString(), proposal: safe, items, acceptance: acceptance ?? null });
});
