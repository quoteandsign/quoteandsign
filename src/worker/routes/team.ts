import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import type { AppEnv } from "../env";
import { appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid } from "../lib/crypto";
import { requireAuth, requireOwner } from "../lib/session";
import { sendEmail } from "../lib/email";
import { audit } from "../lib/audit";
import { effectivePlan, PLANS } from "../lib/plan";
import { businessName } from "../../shared/names";

// Business teams. The owner invites by email; the person signs in with that email and joins.
// Members work inside the owner's workspace. Only the owner manages the team, brand and billing.

export const teamRoutes = new Hono<AppEnv>();
teamRoutes.use("*", requireAuth);

teamRoutes.get("/", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const rows = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.ownerId, owner.id)).all();
  const seats = PLANS[effectivePlan(owner).id].seats;
  return c.json({
    seats,
    isOwner: c.get("user").id === owner.id,
    members: rows.map((r) => ({ id: r.id, email: r.email, joined: Boolean(r.joinedAt), invitedAt: r.invitedAt.getTime() })),
  });
});

teamRoutes.post("/invite", requireOwner, async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 400);
  const email = parsed.data.email;
  if (email === owner.email) return c.json({ error: "That is you." }, 400);
  const seats = PLANS[effectivePlan(owner).id].seats;
  if (!seats) return c.json({ error: "Teams are part of the Business plan. Upgrade under Brand to invite people.", code: "plan" }, 402);
  const existing = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.ownerId, owner.id)).all();
  if (existing.some((m) => m.email === email)) return c.json({ error: "Already invited." }, 409);
  if (existing.length >= seats) return c.json({ error: `Business includes up to ${seats} team members.` }, 409);
  const id = uuid();
  await db.insert(schema.teamMembers).values({ id, ownerId: owner.id, email, invitedAt: new Date() });
  const brand = businessName(owner.brandName, owner.name, owner.email);
  await sendEmail(c.env, {
    to: email,
    replyTo: owner.email,
    subject: `${brand} invited you to Quote and Sign`,
    brand,
    accent: owner.brandColor,
    heading: `${brand} added you to their team`,
    buttons: [{ label: "Accept the invitation", url: `${appUrl(c)}/login` }],
    text: `${brand} added you to their team on Quote and Sign.\n\nSign in with this email address and accept the invitation:\n${appUrl(c)}/login\n\nYou will work inside their account: the same proposals, templates and brand.`,
  });
  await audit(db, { userId: owner.id, event: "team.invited", meta: { email } });
  return c.json({ id }, 201);
});

teamRoutes.delete("/:id", requireOwner, async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const r = await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.id, c.req.param("id")), eq(schema.teamMembers.ownerId, owner.id))).returning({ email: schema.teamMembers.email }).get();
  if (!r) return c.json({ error: "not found" }, 404);
  await audit(db, { userId: owner.id, event: "team.removed", meta: { email: r.email } });
  return c.json({ ok: true });
});

// The invited person, signed in with the invited address, accepts.
teamRoutes.post("/join", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const invite = await db.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.email, user.email), isNull(schema.teamMembers.joinedAt))).get();
  if (!invite) return c.json({ error: "No open invitation for this email." }, 404);
  // One workspace at a time: leave any other team first.
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.memberId, user.id), isNotNull(schema.teamMembers.joinedAt)));
  await db.update(schema.teamMembers).set({ memberId: user.id, joinedAt: new Date() }).where(eq(schema.teamMembers.id, invite.id));
  await audit(db, { userId: user.id, event: "team.joined", meta: { ownerId: invite.ownerId } });
  return c.json({ ok: true });
});

teamRoutes.post("/decline", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.email, user.email), isNull(schema.teamMembers.joinedAt)));
  return c.json({ ok: true });
});

teamRoutes.post("/leave", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.memberId, user.id), isNotNull(schema.teamMembers.joinedAt)));
  await audit(db, { userId: user.id, event: "team.left" });
  return c.json({ ok: true });
});
