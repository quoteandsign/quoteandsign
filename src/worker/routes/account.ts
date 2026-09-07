import { Hono } from "hono";
import { Buffer } from "node:buffer";
import { eq, inArray, notInArray, and, or, like, sql, gt, isNull } from "drizzle-orm";
import type { AppEnv } from "../env";
import { clientIp } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid, ipHash, sha256Hex, hmacHex } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { rateLimit } from "../lib/ratelimit";
import { requireAuth, requireOwner, destroySession } from "../lib/session";
import { capsOf } from "../lib/plan";
import { audit } from "../lib/audit";

// Your data is yours: export everything, delete the account, and a logo that is checked by its
// bytes rather than its name.

export const accountRoutes = new Hono<AppEnv>();
accountRoutes.use("*", requireAuth);
// Export, delete and the logo are the owner's; images may be uploaded by team members too.
accountRoutes.use("*", async (c, next) => {
  if (c.req.path.endsWith("/images")) return next();
  return requireOwner(c, next);
});

// ---- Export ----------------------------------------------------------------------------------
accountRoutes.get("/export", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const proposals = await db.select().from(schema.proposals).where(eq(schema.proposals.userId, user.id)).all();
  // Joined on the owner rather than bound per proposal: D1 caps a statement at 100 variables.
  const mine = db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.userId, user.id));
  const [items, acceptances, messages, templates] = await Promise.all([
    db.select().from(schema.pricingItems).where(inArray(schema.pricingItems.proposalId, mine)).all(),
    db.select().from(schema.acceptances).where(inArray(schema.acceptances.proposalId, mine)).all(),
    db.select().from(schema.messages).where(inArray(schema.messages.proposalId, mine)).all(),
    db.select().from(schema.userTemplates).where(eq(schema.userTemplates.userId, user.id)).all(),
  ]);
  const { polarCustomerId: _p, ...profile } = user;
  await audit(db, { userId: user.id, event: "account.exported" });
  c.header("content-disposition", `attachment; filename="quote-and-sign-export-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("cache-control", "private, no-store");
  return c.json({
    exportedAt: new Date().toISOString(),
    profile,
    proposals: proposals.map(({ passwordHash, ...p }) => ({ ...p, hasPassword: Boolean(passwordHash) })),
    items,
    acceptances,
    messages,
    templates,
  });
});

// ---- Delete ----------------------------------------------------------------------------------
// Step one: a six-digit code goes to the account's email. Whoever holds the session alone cannot
// close the account; they also need the inbox. Codes live in the magic-token table, 15 minutes.
const deleteHash = (env: { SESSION_SECRET: string }, userId: string, code: string) => sha256Hex(`delete:${env.SESSION_SECRET}:${userId}:${code}`);
accountRoutes.post("/delete-code", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const limit = await rateLimit(db, `delcode:${user.id}`, 3, 60 * 60_000);
  if (!limit.allowed) return c.json({ error: "Three codes an hour is the limit. Check your inbox for the last one." }, 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
  const now = new Date();
  await db.insert(schema.magicTokens).values({ tokenHash: await deleteHash(c.env, user.id, code), email: user.email, createdAt: now, expiresAt: new Date(now.getTime() + 15 * 60_000) });
  await sendEmail(c.env, {
    to: user.email,
    subject: "Your account deletion code",
    heading: "Delete your account?",
    text: `Your code is ${code}. It works once and expires in 15 minutes.\n\nEntering it on the Settings page removes your drafts, templates and unsigned proposals for good. Signed proposals stay readable at their links, because they are your clients' records too.\n\nIf you did not ask for this, ignore this email and nothing happens.`,
  });
  await audit(db, { userId: user.id, event: "account.delete_code" });
  return c.json({ ok: true });
});

// Step two. Accepted proposals are a signed record for two parties, so they stay readable at
// their link. Everything else goes now; the account is anonymised and can never sign in again.
accountRoutes.delete("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return c.json({ error: "Enter the six-digit code from the email." }, 400);
  // A six-digit code is only as good as the guess limit: five tries, then every code is void.
  const tries = await rateLimit(db, `delverify:${user.id}`, 5, 15 * 60_000);
  if (!tries.allowed) {
    await db.update(schema.magicTokens).set({ usedAt: new Date() }).where(and(eq(schema.magicTokens.email, user.email), isNull(schema.magicTokens.usedAt)));
    return c.json({ error: "Too many wrong codes. Ask for a new one in a few minutes." }, 429);
  }
  const used = await db
    .update(schema.magicTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.magicTokens.tokenHash, await deleteHash(c.env, user.id, code)), eq(schema.magicTokens.email, user.email), isNull(schema.magicTokens.usedAt), gt(schema.magicTokens.expiresAt, new Date())))
    .returning({ tokenHash: schema.magicTokens.tokenHash })
    .get();
  if (!used) return c.json({ error: "That code is wrong or has expired. Ask for a new one." }, 400);
  // Signed ones are kept (archived, contact details removed); everything else goes. Subqueries, not id lists: D1 caps variables at 100.
  const signed = db.select({ id: schema.acceptances.proposalId }).from(schema.acceptances);
  const keptRows = await db.select({ id: schema.proposals.id }).from(schema.proposals).where(and(eq(schema.proposals.userId, user.id), inArray(schema.proposals.id, signed))).all();
  const keep = new Set(keptRows.map((r) => r.id));
  const dropped = await db.delete(schema.proposals).where(and(eq(schema.proposals.userId, user.id), notInArray(schema.proposals.id, signed))).returning({ id: schema.proposals.id }).all();
  const drop = dropped.map((r) => r.id);
  if (keep.size) await db.update(schema.proposals).set({ status: "archived", clientEmail: null, ccEmails: null, notifyEmails: null }).where(and(eq(schema.proposals.userId, user.id), inArray(schema.proposals.id, signed)));
  await db.delete(schema.userTemplates).where(eq(schema.userTemplates.userId, user.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await db.delete(schema.files).where(eq(schema.files.userId, user.id));
  await db.delete(schema.webhooks).where(eq(schema.webhooks.userId, user.id));
  // Out of every team, and no more copies of anyone's signed proposals to this address.
  await db.delete(schema.teamMembers).where(or(eq(schema.teamMembers.memberId, user.id), eq(schema.teamMembers.email, user.email), eq(schema.teamMembers.ownerId, user.id)));
  const now = new Date();
  await db
    .update(schema.users)
    .set({ email: `deleted-${user.id}@deleted.invalid`, name: null, brandLogoKey: null, notifyEmails: null, polarCustomerId: null, plan: "free", deletedAt: now, deletedEmailHash: await hmacHex(c.env.SESSION_SECRET, user.email) })
    .where(eq(schema.users.id, user.id));
  await audit(db, { userId: user.id, event: "account.deleted", ipHash: await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw)), meta: { removed: drop.length, keptSigned: keep.size } });
  await destroySession(c);
  return c.json({ ok: true, keptSigned: keep.size });
});

// ---- Logo -------------------------------------------------------------------------------------
// The browser shrinks every upload to WebP first (a logo to 512px, an image to 1400px), so real
// files arrive at a few tens of kilobytes. The caps below are a backstop, not a target.
const MAX_LOGO = 300_000;
const sha = async (b: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b))).map((x) => x.toString(16).padStart(2, "0")).join("");
const SNIFF: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

accountRoutes.post("/logo", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_LOGO * 1.05) return c.json({ error: "Logos are limited to 300 KB." }, 413);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "Choose an image file." }, 400);
  if (file.size > MAX_LOGO) return c.json({ error: "Logos are limited to 300 KB." }, 413);
  if (!capsOf(user).brand) return c.json({ error: "A logo on every page is part of Pro.", code: "plan" }, 402);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = SNIFF.find((s) => s.test(bytes));
  if (!kind) return c.json({ error: "Use a PNG, JPEG or WebP image." }, 415);
  const key = `logos/${user.id}/${uuid()}.${kind.ext}`;
  await db.insert(schema.files).values({ id: uuid(), userId: user.id, key, mime: kind.mime, bytes: bytes.length, sha256: await sha(bytes), data: Buffer.from(bytes), createdAt: new Date() });
  if (user.brandLogoKey) await db.delete(schema.files).where(eq(schema.files.key, user.brandLogoKey));
  await db.update(schema.users).set({ brandLogoKey: key }).where(eq(schema.users.id, user.id));
  return c.json({ key, url: `/files/${key}` });
});

accountRoutes.delete("/logo", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  if (user.brandLogoKey) await db.delete(schema.files).where(eq(schema.files.key, user.brandLogoKey));
  await db.update(schema.users).set({ brandLogoKey: null }).where(eq(schema.users.id, user.id));
  return c.json({ ok: true });
});

// ---- Serving ----------------------------------------------------------------------------------
// Public, immutable, image-only. Nothing here can execute: the bytes were sniffed on the way in
// and the response forbids scripts and framing.
export const fileRoutes = new Hono<AppEnv>();
// Images for proposals. Same checks as logos, plus a per-plan quota so the service never becomes storage.
const MAX_IMAGE = 400_000;
accountRoutes.post("/images", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_IMAGE * 1.05) return c.json({ error: "Images are limited to 400 KB. The editor shrinks them for you; try a smaller file." }, 413);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "Choose an image file." }, 400);
  if (file.size > MAX_IMAGE) return c.json({ error: "Images are limited to 400 KB." }, 413);
  const quota = capsOf(owner).images;
  const used = await db.select({ n: sql<number>`count(*)` }).from(schema.files).where(and(eq(schema.files.userId, owner.id), like(schema.files.key, "images/%"))).get();
  if ((used?.n ?? 0) >= quota) return c.json({ error: `Your plan includes ${quota} images. Remove one from a proposal, or upgrade under Settings for more.`, code: "plan" }, 402);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = SNIFF.find((s) => s.test(bytes));
  if (!kind) return c.json({ error: "Use a PNG, JPEG or WebP image." }, 415);
  const digest = await sha(bytes);
  // The same picture twice is stored once.
  const dup = await db.select({ key: schema.files.key }).from(schema.files).where(and(eq(schema.files.userId, owner.id), eq(schema.files.sha256, digest), like(schema.files.key, "images/%"))).get();
  if (dup) return c.json({ key: dup.key, url: `/files/${dup.key}`, used: used?.n ?? 0, quota });
  const key = `images/${owner.id}/${uuid()}.${kind.ext}`;
  await db.insert(schema.files).values({ id: uuid(), userId: owner.id, key, mime: kind.mime, bytes: bytes.length, sha256: digest, data: Buffer.from(bytes), createdAt: new Date() });
  await audit(db, { userId: c.get("user").id, event: "image.uploaded", meta: { bytes: bytes.length } });
  return c.json({ key, url: `/files/${key}`, used: (used?.n ?? 0) + 1, quota });
});

accountRoutes.get("/images", async (c) => {
  const owner = c.get("owner");
  const db = getDb(c.env.DB);
  const rows = await db.select({ key: schema.files.key, bytes: schema.files.bytes, createdAt: schema.files.createdAt }).from(schema.files).where(and(eq(schema.files.userId, owner.id), like(schema.files.key, "images/%"))).orderBy(schema.files.createdAt).all();
  return c.json({ images: rows.map((r) => ({ url: `/files/${r.key}`, key: r.key, bytes: r.bytes, createdAt: r.createdAt.getTime() })), quota: capsOf(owner).images });
});

fileRoutes.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/files\//, "");
  if (!/^(logos|images)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key)) return c.notFound();
  const obj = await getDb(c.env.DB).select({ mime: schema.files.mime, data: schema.files.data }).from(schema.files).where(eq(schema.files.key, key)).get();
  if (!obj) return c.notFound();
  c.header("content-type", obj.mime.startsWith("image/") ? obj.mime : "application/octet-stream");
  c.header("cache-control", "public, max-age=86400");
  c.header("content-disposition", "inline");
  c.header("x-content-type-options", "nosniff");
  c.header("content-security-policy", "default-src 'none'; sandbox");
  return c.body(new Uint8Array(obj.data));
});
