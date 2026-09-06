import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid } from "../lib/crypto";
import { requireAuth } from "../lib/session";
import { audit } from "../lib/audit";

// Saved templates: a proposal's content, pricing and look, kept by its owner to start from again.
export const templateRoutes = new Hono<AppEnv>();
templateRoutes.use("*", requireAuth);

const MAX_TEMPLATES = 50;

templateRoutes.get("/", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ id: schema.userTemplates.id, name: schema.userTemplates.name, title: schema.userTemplates.title, style: schema.userTemplates.style, accentColor: schema.userTemplates.accentColor, createdAt: schema.userTemplates.createdAt })
    .from(schema.userTemplates)
    .where(eq(schema.userTemplates.userId, user.id))
    .orderBy(desc(schema.userTemplates.createdAt))
    .all();
  c.header("cache-control", "private, no-store");
  return c.json({ templates: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
});

templateRoutes.post("/", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const parsed = z.object({ proposalId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Give the template a name." }, 400);
  const proposal = await db.select().from(schema.proposals).where(and(eq(schema.proposals.id, parsed.data.proposalId), eq(schema.proposals.userId, user.id))).get();
  if (!proposal) return c.json({ error: "not found" }, 404);
  const count = await db.select({ id: schema.userTemplates.id }).from(schema.userTemplates).where(eq(schema.userTemplates.userId, user.id)).all();
  if (count.length >= MAX_TEMPLATES) return c.json({ error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one first.` }, 409);
  const items = await db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all();
  const id = uuid();
  await db.insert(schema.userTemplates).values({
    id,
    userId: user.id,
    name: parsed.data.name,
    title: proposal.title,
    style: proposal.style,
    accentColor: proposal.accentColor,
    content: proposal.content,
    // Ids are dropped so every proposal made from this gets fresh ones.
    items: items.map(({ id: _id, proposalId: _p, ...rest }) => rest),
    createdAt: new Date(),
  });
  await audit(db, { userId: actor.id, proposalId: proposal.id, event: "template.saved", meta: { templateId: id } });
  return c.json({ id }, 201);
});

templateRoutes.delete("/:id", async (c) => {
  const user = c.get("owner");
  const actor = c.get("user");
  const db = getDb(c.env.DB);
  const r = await db
    .delete(schema.userTemplates)
    .where(and(eq(schema.userTemplates.id, c.req.param("id")), eq(schema.userTemplates.userId, user.id)))
    .returning({ id: schema.userTemplates.id })
    .get();
  if (!r) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
