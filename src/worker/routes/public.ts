import { Hono } from "hono";
import { z } from "zod";
import { eq, and, sql, isNotNull, inArray } from "drizzle-orm";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { clientIp, appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { uuid, ipHash, sha256Hex, canonicalJson, verifyPassword, signValue, verifyValue } from "../lib/crypto";
import { rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/email";
import { getSessionUser } from "../lib/session";
import { audit } from "../lib/audit";
import { computeTotals, formatMoney, describeTotals, type Selection } from "../../shared/pricing";
import { renderProposalPage, renderSimplePage, renderUnlockPage, renderRecordPage } from "../lib/page";
import { splitSections, type Block } from "../lib/render";
import { PLANS, effectivePlan, capsOf } from "../lib/plan";
import { businessName } from "../../shared/names";
import { proposalPdf } from "../lib/pdf";

export const publicRoutes = new Hono<AppEnv>();

/** The owner, their notify list, joined team members, and this proposal's extras. */
async function internalRecipients(db: ReturnType<typeof getDb>, owner: { id: string; email: string; notifyEmails: string[] | null }, proposal: { notifyEmails: string[] | null }): Promise<string[]> {
  const members = await db.select({ email: schema.teamMembers.email }).from(schema.teamMembers).where(and(eq(schema.teamMembers.ownerId, owner.id), isNotNull(schema.teamMembers.joinedAt))).all();
  return [...new Set([owner.email, ...(owner.notifyEmails ?? []), ...members.map((m) => m.email), ...(proposal.notifyEmails ?? [])])];
}

const CONSENT_TEXT =
  "I have read this proposal and agree to it. I understand that typing my name and clicking Accept is my electronic signature and is legally binding.";

function unlockCookie(publicId: string) {
  return `op_unlock_${publicId.replace(/-/g, "").slice(0, 16)}`;
}

async function loadProposal(c: any, publicId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) return null;
  const db = getDb(c.env.DB);
  const proposal = await db.select().from(schema.proposals).where(eq(schema.proposals.publicId, publicId)).get();
  if (!proposal) return null;
  const [owner, items, acceptance] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, proposal.userId)).get(),
    db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all(),
    db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get(),
  ]);
  if (!owner) return null;
  if (owner.deletedAt && !acceptance) return null; // signed records outlive the account; drafts do not
  return { db, proposal, owner, items, acceptance: acceptance ?? null };
}

type HashProposal = { title: string; currency: string; content: unknown; taxRateBps: number; taxLabel: string | null; clientName: string | null; senderName: string | null };
type HashOwner = { brandName: string | null; name: string | null; email: string };

export const CONSENT_MANUAL = "Marked as accepted by the sender. The client agreed outside Quote and Sign, by another channel.";

/** Everything that affects price or terms, plus who the two parties are. */
export function contentHashInput(p: HashProposal, owner: HashOwner, items: (typeof schema.pricingItems.$inferSelect)[]) {
  return canonicalJson({
    title: p.title,
    currency: p.currency,
    taxRateBps: p.taxRateBps,
    taxLabel: p.taxLabel,
    clientName: p.clientName,
    sender: { name: p.senderName || businessName(owner.brandName, owner.name) || null, email: owner.email },
    content: p.content,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      unitAmount: i.unitAmount,
      quantity: i.quantity,
      minQuantity: i.minQuantity,
      maxQuantity: i.maxQuantity,
      optional: i.optional,
      selectedByDefault: i.selectedByDefault,
      taxRateBps: i.taxRateBps,
      billing: i.billing,
      unit: i.unit,
    })),
  });
}

publicRoutes.get("/:publicId", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.html(renderSimplePage("Not found", "This proposal link is not valid."), 404);
  const { db, proposal, owner, items, acceptance } = loaded;

  const viewer = await getSessionUser(c);
  const isOwner = viewer?.id === owner.id;

  if (proposal.status === "archived" && !isOwner && !acceptance) {
    return c.html(renderSimplePage("Proposal unavailable", "This proposal is no longer available."), 410);
  }
  if (proposal.status === "draft" && !isOwner) {
    return c.html(renderSimplePage("Not published yet", "This proposal has not been sent yet."), 404);
  }
  const expired = Boolean(proposal.expiresAt && proposal.expiresAt.getTime() < Date.now() && !acceptance);

  if (proposal.passwordHash && !isOwner) {
    const ok = (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) === publicId;
    if (!ok) {
      const wrong = c.req.query("wrong") === "1";
      return c.html(renderUnlockPage({ publicId, brandName: owner.brandName, brandColor: owner.brandColor, wrong }), wrong ? 401 : 200);
    }
  }

  if (!isOwner) {
    const now = new Date();
    const viewerHash = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));
    const fresh = await rateLimit(db, `view:${publicId}:${viewerHash}`, 1, 10 * 60_000);
    const cap = await rateLimit(db, `views:${publicId}`, 500, 60 * 60_000);
    if (fresh.allowed && cap.allowed) {
      await db.insert(schema.views).values({
        id: uuid(),
        proposalId: proposal.id,
        viewedAt: now,
        ipHash: viewerHash,
        userAgent: c.req.header("user-agent")?.slice(0, 255) ?? null,
        country: (c.req.raw as any).cf?.country ?? null,
      });
    }
    // Only the request that actually flips the status sends the "opened" email.
    const firstOpen = proposal.status === "sent"
      ? await db.update(schema.proposals).set({ status: "viewed" }).where(and(eq(schema.proposals.id, proposal.id), eq(schema.proposals.status, "sent"))).returning({ id: schema.proposals.id }).get()
      : null;
    if (firstOpen && capsOf(owner).notify) {
      await sendEmail(c.env, {
        to: owner.email,
        subject: `${proposal.clientName || "Your client"} opened "${proposal.title}"`,
        heading: `${proposal.clientName || "Your client"} just opened it`,
        buttons: [{ label: "See how it is going", url: `${appUrl(c)}/app/p/${proposal.id}` }],
        text: `Your proposal "${proposal.title}" was just opened for the first time.\n\n${appUrl(c)}/app/p/${proposal.id}`,
      });
    }
  }

  const nonce = uuid().replace(/-/g, "");
  const seenHash = await sha256Hex(contentHashInput(proposal, owner, items));
  // The owner's phone preview shows this page inside the editor; nobody else may frame it.
  const framed = isOwner && c.req.query("frame") === "1";
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; media-src https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; form-action 'self'; base-uri 'none'; frame-ancestors ${framed ? "'self'" : "'none'"}`,
  );
  c.header("x-frame-options", framed ? "SAMEORIGIN" : "DENY");
  c.header("cache-control", "private, no-store");
  // What the plan allows shows; what it does not falls back to the standard look. Passwords and
  // expiry set during a trial keep protecting the link either way.
  const caps = capsOf(owner);
  const shownProposal = caps.brand ? proposal : { ...proposal, accentColor: null, style: null, senderName: null };
  const shownOwner = caps.brand ? owner : { ...owner, brandColor: null, brandLogoKey: null };
  return c.html(
    renderProposalPage({
      nonce,
      proposal: shownProposal,
      owner: shownOwner,
      items,
      acceptance,
      expired,
      isOwner,
      declined: proposal.status === "declined",
      paymentUrl: caps.payment ? (proposal.paymentUrl ?? owner.paymentUrl ?? null) : null,
      paymentLabel: proposal.paymentLabel ?? null,
      madeWith: !(caps.footerOff && owner.hideMadeWith),
      ribbon: framed ? { hidden: true } : undefined,
      justAccepted: c.req.query("accepted") === "1",
      consentText: CONSENT_TEXT,
      appUrl: appUrl(c),
      seenHash,
    }),
  );
});

publicRoutes.post("/:publicId/unlock", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded || !loaded.proposal.passwordHash) return c.redirect(`/p/${publicId}`);
  const db = loaded.db;
  const ip = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));
  const rl = await rateLimit(db, `unlock:${ip}:${publicId}`, 8, 15 * 60_000);
  const rlAll = await rateLimit(db, `unlock:all:${publicId}`, 40, 60 * 60_000);
  if (!rl.allowed || !rlAll.allowed) return c.html(renderSimplePage("Too many attempts", "Try again later."), 429);

  const form = await c.req.parseBody();
  const password = typeof form.password === "string" ? form.password : "";
  if (!(await verifyPassword(password, loaded.proposal.passwordHash))) {
    return c.redirect(`/p/${publicId}?wrong=1`);
  }
  setCookie(c, unlockCookie(publicId), await signValue(c.env.SESSION_SECRET, publicId), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: `/p/${publicId}`,
    maxAge: 86_400,
  });
  return c.redirect(`/p/${publicId}`);
});

const acceptSchema = z.object({
  signerName: z.string().trim().min(2).max(120),
  signerEmail: z.string().trim().toLowerCase().email().max(254),
  consent: z.union([z.literal(true), z.literal("on"), z.literal("true")]),
  selection: z.record(z.string(), z.object({ selected: z.boolean().optional(), quantity: z.number().int().min(0).max(100_000).optional() })).optional(),
  seenHash: z.string().regex(/^[0-9a-f]{64}$/),
});

publicRoutes.post("/:publicId/accept", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.json({ error: "Not found." }, 404);
  const { db, proposal, owner, items, acceptance } = loaded;
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
  const fail = (msg: string, status: 400 | 409 | 410 | 429) =>
    wantsJson ? c.json({ error: msg }, status) : c.html(renderSimplePage("Could not accept", msg), status);

  // Browsers always send Origin on cross-site POSTs. If it is present it must be ours.
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site");
  const selfOrigin = new URL(c.req.url).origin;
  if ((origin && origin !== selfOrigin) || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    return fail("This request did not come from the proposal page.", 400);
  }
  if (acceptance) return fail("This proposal has already been accepted.", 409);
  if ((await getSessionUser(c))?.id === owner.id) return fail("The sender cannot accept their own proposal.", 400);
  if (proposal.status === "declined") return fail("This proposal was declined. Ask the sender to reopen it.", 410);
  if (proposal.status === "draft" || proposal.status === "archived") return fail("This proposal is not open for acceptance.", 410);
  if (proposal.expiresAt && proposal.expiresAt.getTime() < Date.now()) return fail("This proposal has expired.", 410);
  if (proposal.passwordHash) {
    const ok = (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) === publicId;
    if (!ok) return fail("Unlock the proposal first.", 400);
  }

  const ip = clientIp(c.req.raw);
  const rl = await rateLimit(db, `accept:${await ipHash(c.env.SESSION_SECRET, ip)}`, 10, 60 * 60_000);
  if (!rl.allowed) return fail("Too many attempts. Try again later.", 429);

  // Accept JSON (progressive) or a plain form post (no JavaScript).
  let body: unknown;
  if ((c.req.header("content-type") ?? "").includes("application/json")) {
    body = await c.req.json().catch(() => null);
  } else {
    const form = await c.req.parseBody();
    const selection: Selection = {};
    for (const it of items) {
      const sel = form[`sel_${it.id}`];
      const qty = form[`qty_${it.id}`];
      selection[it.id] = {
        selected: it.optional ? sel === "on" : true,
        quantity: typeof qty === "string" && qty !== "" && Number.isFinite(Number(qty)) ? Number(qty) : undefined,
      };
    }
    body = { signerName: form.signerName, signerEmail: form.signerEmail, consent: form.consent, selection, seenHash: form.seenHash };
  }
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) return fail("Please enter your name and email, and tick the agreement box.", 400);
  const d = parsed.data;

  // The acceptance is bound to exactly what was on the page. If the sender changed anything since,
  // the client must reload and see the new version before agreeing.
  const snapshot = contentHashInput(proposal, owner, items);
  const contentHash = await sha256Hex(snapshot);
  if (d.seenHash !== contentHash) return fail("This proposal was updated after you opened it. Reload the page to see the current version.", 409);

  const totals = computeTotals(items, d.selection ?? {}, proposal.taxRateBps);
  if (!Number.isSafeInteger(totals.total)) return fail("The total is too large to record.", 400);
  const now = new Date();
  const id = uuid();
  // Flip the status first, and only from an open state: a concurrent edit or second signature loses.
  const flipped = await db
    .update(schema.proposals)
    .set({ status: "accepted", updatedAt: now })
    .where(and(eq(schema.proposals.id, proposal.id), inArray(schema.proposals.status, ["sent", "viewed"]), eq(schema.proposals.updatedAt, proposal.updatedAt)))
    .returning({ id: schema.proposals.id })
    .get();
  if (!flipped) return fail("This proposal was updated after you opened it. Reload the page to see the current version.", 409);
  await db.insert(schema.acceptances).values({
      id,
      proposalId: proposal.id,
      signerName: d.signerName,
      signerEmail: d.signerEmail,
      signedText: d.signerName,
      selectedItemIds: totals.lines.filter((l) => l.selected).map((l) => ({ id: l.id, quantity: l.quantity })),
      totalAmount: totals.total,
      recurring: totals.recurring.map((r) => ({ period: r.period, total: r.total })),
      currency: proposal.currency,
      contentHash,
      ip,
      userAgent: c.req.header("user-agent")?.slice(0, 255) ?? null,
      acceptedAt: now,
      consentText: CONSENT_TEXT,
      snapshot,
      senderName: proposal.senderName || businessName(owner.brandName, owner.name) || null,
      senderEmail: owner.email,
      clientName: proposal.clientName,
    });
  await audit(db, { userId: owner.id, proposalId: proposal.id, event: "proposal.accepted", ipHash: await ipHash(c.env.SESSION_SECRET, ip), meta: { total: totals.total } });

  const total = describeTotals(totals, proposal.currency);
  const link = `${appUrl(c)}/p/${proposal.publicId}`;
  // The signed PDF goes to both parties. If rendering ever fails, the emails still go out with the link.
  let attachments: { filename: string; content: Uint8Array }[] = [];
  try {
    const signed = await db.select().from(schema.acceptances).where(eq(schema.acceptances.proposalId, proposal.id)).get();
    if (signed) {
      const bytes = await proposalPdf({ proposal: { ...proposal, status: "accepted" }, owner, items, acceptance: signed, appUrl: appUrl(c) });
      const name = proposal.title.replace(/[^\w\d-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";
      attachments = [{ filename: `${name}-signed.pdf`, content: bytes }];
    }
  } catch (e) {
    console.error("signed pdf", e);
  }
  const senderBrand = proposal.senderName || businessName(owner.brandName, owner.name) || null;
  const senderAccent = proposal.accentColor ?? owner.brandColor;
  const payUrl = proposal.paymentUrl || owner.paymentUrl;
  await sendEmail(c.env, {
    to: await internalRecipients(db, owner, proposal),
    subject: `Accepted: ${proposal.title} (${total})`,
    heading: `${d.signerName} signed ${proposal.title}`,
    buttons: [{ label: "Open the signed copy", url: link }, { label: "Signing record", url: `${link}/record` }],
    text: `${d.signerName} accepted "${proposal.title}" for ${total} on ${now.toUTCString()}.${attachments.length ? "\n\nThe signed PDF is attached." : ""}\n\nSigned copy: ${link}\nSigning record: ${link}/record\nContent hash: ${contentHash}`,
    attachments,
  });
  await sendEmail(c.env, {
    to: d.signerEmail,
    subject: `Your accepted copy: ${proposal.title}`,
    brand: senderBrand,
    accent: senderAccent,
    heading: "Thank you, it is signed",
    buttons: [...(payUrl ? [{ label: proposal.paymentLabel || "Pay the deposit", url: payUrl }] : []), { label: "Open your signed copy", url: link }],
    text: `Thank you. You accepted "${proposal.title}" for ${total} on ${now.toUTCString()}.${attachments.length ? "\n\nYour signed copy is attached as a PDF." : ""}\n\n${payUrl ? `${proposal.paymentLabel || "Pay the deposit"}: ${payUrl}\n\n` : ""}Open it any time: ${link}\nSigning record: ${link}/record\nContent hash: ${contentHash}`,
    attachments,
  });

  if (wantsJson) return c.json({ ok: true, redirect: `/p/${publicId}?accepted=1#accept` });
  return c.redirect(`/p/${publicId}?accepted=1#accept`);
});

// The client passes on this one. The sender hears why, and can reopen it by sending again.
const declineSchema = z.object({ reason: z.string().trim().max(500).optional(), website: z.string().max(0).optional() });
publicRoutes.post("/:publicId/decline", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.json({ error: "Not found." }, 404);
  const { db, proposal, owner, acceptance } = loaded;
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site");
  if ((origin && origin !== new URL(c.req.url).origin) || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) return c.json({ error: "Please answer from the proposal page." }, 400);
  if (acceptance) return c.json({ error: "This proposal is already accepted." }, 409);
  if (proposal.status !== "sent" && proposal.status !== "viewed") return c.json({ error: "This proposal is not open." }, 409);
  if ((await getSessionUser(c))?.id === owner.id) return c.json({ error: "The sender cannot decline their own proposal." }, 400);
  if (proposal.passwordHash && (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) !== publicId) return c.json({ error: "Unlock the proposal first." }, 401);
  const parsed = declineSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Something went wrong." }, 400);
  if (parsed.data.website) return c.json({ ok: true });
  const viewerHash = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));
  const rl = await rateLimit(db, `decline:${publicId}:${viewerHash}`, 3, 60 * 60_000);
  if (!rl.allowed) return c.json({ error: "Too many attempts. Try again later." }, 429);
  const now = new Date();
  const flipped = await db.update(schema.proposals).set({ status: "declined", declinedAt: now, declineReason: parsed.data.reason || null, updatedAt: now }).where(and(eq(schema.proposals.id, proposal.id), inArray(schema.proposals.status, ["sent", "viewed"]))).returning({ id: schema.proposals.id }).get();
  if (!flipped) return c.json({ error: "This proposal is not open." }, 409);
  const oneLine = (t: string) => t.replace(/[\r\n\t]+/g, " ").trim();
  await sendEmail(c.env, {
    to: await internalRecipients(db, owner, proposal),
    subject: `Declined: ${oneLine(proposal.title)}`,
    heading: `${proposal.clientName || "Your client"} passed on it`,
    buttons: [{ label: "Revise and send again", url: `${appUrl(c)}/app/p/${proposal.id}` }],
    text: `${proposal.clientName || "Your client"} passed on "${oneLine(proposal.title)}".${parsed.data.reason ? `\n\nThey said:\n${parsed.data.reason}` : "\n\nThey did not leave a reason."}\n\nYou can revise it and send it again from the editor:\n${appUrl(c)}/app/p/${proposal.id}`,
  });
  await audit(db, { userId: owner.id, proposalId: proposal.id, event: "proposal.declined", ipHash: viewerHash });
  return c.json({ ok: true });
});

// A question from the client, emailed to the sender with reply-to set to the client.
const askSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254).or(z.literal("")).optional(),
  body: z.string().trim().min(3).max(2000),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

publicRoutes.post("/:publicId/ask", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.json({ error: "not found" }, 404);
  const { db, proposal, owner } = loaded;
  if (proposal.status === "draft" || proposal.status === "archived") return c.json({ error: "This proposal is not open for questions." }, 409);
  if (proposal.passwordHash && (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) !== publicId) return c.json({ error: "Unlock the proposal first." }, 401);
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site");
  const selfOrigin = new URL(c.req.url).origin;
  if ((origin && origin !== selfOrigin) || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    return c.json({ error: "Please ask from the proposal page." }, 400);
  }
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Please add your name and a question." }, 400);
  if (parsed.data.website) return c.json({ ok: true }); // bots get a quiet yes
  const viewerHash = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));
  const perViewer = await rateLimit(db, `ask:${publicId}:${viewerHash}`, 3, 60 * 60_000);
  const perProposal = await rateLimit(db, `ask:${publicId}`, 30, 24 * 60 * 60_000);
  if (!perViewer.allowed || !perProposal.allowed) return c.json({ error: "Too many questions for now. Please try again later." }, 429);

  const now = new Date();
  const oneLine = (t: string) => t.replace(/[\r\n\t]+/g, " ").trim();
  await db.insert(schema.messages).values({ id: uuid(), proposalId: proposal.id, name: parsed.data.name, email: parsed.data.email || null, body: parsed.data.body, createdAt: now });
  await sendEmail(c.env, {
    to: await internalRecipients(db, owner, proposal),
    replyTo: parsed.data.email || undefined,
    subject: `Question about "${oneLine(proposal.title)}" from ${oneLine(parsed.data.name)}`,
    text: `${oneLine(parsed.data.name)}${parsed.data.email ? ` (${parsed.data.email})` : ""} asked a question on your proposal "${oneLine(proposal.title)}":

${parsed.data.body}

${parsed.data.email ? "Reply to this email to answer them directly." : "They did not leave an email address."}

Open the proposal:
${appUrl(c)}/app/p/${proposal.id}`,
  });
  await audit(db, { userId: owner.id, proposalId: proposal.id, event: "proposal.question", ipHash: viewerHash });
  return c.json({ ok: true });
});

// Seconds a client spent on each section, summed per proposal. Sent by a beacon from the page.
const engageSchema = z.object({
  sections: z.array(z.object({ id: z.string().regex(/^[\w-]{1,64}$/), title: z.string().trim().transform((s) => s.slice(0, 120)), seconds: z.number().int().min(1).max(120) })).min(1).max(40),
});

publicRoutes.post("/:publicId/engage", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.body(null, 204);
  const { db, proposal, owner } = loaded;
  if (proposal.status === "draft" || proposal.status === "archived") return c.body(null, 204);
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return c.body(null, 204);
  const viewer = await getSessionUser(c);
  if (viewer?.id === owner.id) return c.body(null, 204); // the sender's own reading never counts
  if (proposal.passwordHash && (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) !== publicId) return c.body(null, 204);
  let body: unknown;
  try {
    body = JSON.parse(await c.req.text());
  } catch {
    return c.body(null, 204);
  }
  const parsed = engageSchema.safeParse(body);
  if (!parsed.success) return c.body(null, 204);
  const viewerHash = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));
  const limit = await rateLimit(db, `engage:${publicId}:${viewerHash}`, 400, 60 * 60_000);
  if (!limit.allowed) return c.body(null, 204);
  const now = new Date();
  const known = new Set([...splitSections(proposal.content as Block[]).map((s) => s.id), "intro", "s-pricing", "s-accept"]);
  for (const s of parsed.data.sections) {
    if (!known.has(s.id)) continue;
    await db
      .insert(schema.sectionTime)
      .values({ proposalId: proposal.id, sectionId: s.id, title: s.title || s.id, seconds: s.seconds, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.sectionTime.proposalId, schema.sectionTime.sectionId],
        set: { seconds: sql`${schema.sectionTime.seconds} + excluded.seconds`, title: sql`excluded.title`, updatedAt: now },
      });
  }
  return c.body(null, 204);
});

// The client's own copy, as a file. Same visibility rules as the page.
publicRoutes.get("/:publicId/pdf", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded) return c.html(renderSimplePage("Not found", "This proposal link is not valid."), 404);
  const { db, proposal, owner, items, acceptance } = loaded;
  const viewer = await getSessionUser(c);
  const isOwner = viewer?.id === owner.id;
  if (proposal.status === "draft" && !isOwner) return c.html(renderSimplePage("Not published yet", "This proposal has not been sent yet."), 404);
  if (proposal.status === "archived" && !isOwner && !acceptance) return c.html(renderSimplePage("Proposal unavailable", "This proposal is no longer available."), 410);
  if (proposal.passwordHash && !isOwner) {
    const ok = (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) === publicId;
    if (!ok) return c.redirect(`/p/${publicId}`);
  }
  // The signed copy is always free for both parties; an unsigned PDF is a Pro feature.
  if (isOwner && !acceptance && !PLANS[effectivePlan(owner).id].pdf) return c.html(renderSimplePage("PDF export is part of Pro", "Upgrade under Brand to download unsigned proposals as PDF. Signed copies are always free."), 402);
  // Building a PDF is real CPU time, so a link alone does not buy unlimited renders.
  const pdfViewer = await rateLimit(db, `pdf:${publicId}:${await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw))}`, 10, 10 * 60_000);
  const pdfTotal = await rateLimit(db, `pdf:${publicId}`, 100, 60 * 60_000);
  if (!pdfViewer.allowed || !pdfTotal.allowed) return c.html(renderSimplePage("Slow down", "Too many downloads for now. Try again in a few minutes."), 429);
  const bytes = await proposalPdf({ proposal, owner, items, acceptance, appUrl: appUrl(c) });
  const name = proposal.title.replace(/[^\w\d-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";
  c.header("content-type", "application/pdf");
  c.header("content-disposition", `attachment; filename="${name}${acceptance ? "-signed" : ""}.pdf"`);
  c.header("cache-control", "private, no-store");
  return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

// The same facts as record.json, laid out for a person. Device details are the sender's only.
publicRoutes.get("/:publicId/record", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded || !loaded.acceptance) return c.html(renderSimplePage("No signing record", "This proposal has not been accepted."), 404);
  const { proposal, items, acceptance, owner } = loaded;
  const viewer = await getSessionUser(c);
  const isOwner = viewer?.id === owner.id;
  if (proposal.passwordHash && !isOwner) {
    const ok = (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) === publicId;
    if (!ok) return c.redirect(`/p/${publicId}`);
  }
  const recomputedHash = await sha256Hex(contentHashInput(proposal, owner, items));
  const chosen = new Map((acceptance.selectedItemIds as { id: string; quantity: number }[]).map((s) => [s.id, s.quantity]));
  const lines = items
    .filter((it) => chosen.has(it.id))
    .map((it) => {
      const q = chosen.get(it.id) ?? 1;
      return { name: it.name, detail: q > 1 || it.unit ? `${q} ${it.unit ? (q === 1 ? it.unit : it.unit + "s") : "x"}`.replace(/ x$/, " x") : "", amount: formatMoney(it.unitAmount * q, acceptance.currency) };
    });
  const nonce = uuid().replace(/-/g, "");
  c.header("content-security-policy", `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  c.header("cache-control", "private, no-store");
  return c.html(
    renderRecordPage(nonce, {
      publicId: proposal.publicId,
      title: proposal.title,
      brand: acceptance.senderName ?? (proposal.senderName || businessName(owner.brandName, owner.name) || null),
      brandColor: proposal.accentColor ?? owner.brandColor,
      clientName: acceptance.clientName ?? proposal.clientName,
      signerName: acceptance.signerName,
      signerEmail: isOwner ? acceptance.signerEmail : null,
      signedText: acceptance.signedText,
      acceptedAt: acceptance.acceptedAt,
      total: formatMoney(acceptance.totalAmount, acceptance.currency),
      method: acceptance.method,
      lines,
      contentHash: acceptance.contentHash,
      matches: recomputedHash === acceptance.contentHash,
      consentText: acceptance.consentText,
      countersign: acceptance.countersignerName && acceptance.countersignedAt ? { name: acceptance.countersignerName, at: acceptance.countersignedAt } : null,
      device: isOwner ? { ip: acceptance.ip, userAgent: acceptance.userAgent } : null,
    }),
  );
});

publicRoutes.get("/:publicId/record.json", async (c) => {
  const publicId = c.req.param("publicId");
  const loaded = await loadProposal(c, publicId);
  if (!loaded || !loaded.acceptance) return c.json({ error: "No acceptance record." }, 404);
  const { proposal, items, acceptance, owner } = loaded;
  const viewer = await getSessionUser(c);
  const isOwner = viewer?.id === owner.id;
  if (proposal.passwordHash) {
    const ok = (await verifyValue(c.env.SESSION_SECRET, getCookie(c, unlockCookie(publicId)))) === publicId;
    if (!ok && !isOwner) return c.json({ error: "Locked." }, 401);
  }
  const recomputedHash = await sha256Hex(contentHashInput(proposal, owner, items));
  c.header("cache-control", "private, no-store");
  return c.json({
    proposal: { title: proposal.title, currency: proposal.currency, publicId: proposal.publicId, clientName: proposal.clientName, taxRateBps: proposal.taxRateBps, taxLabel: proposal.taxLabel, content: proposal.content as Block[] },
    items: items.map(({ proposalId: _p, ...rest }) => rest),
    acceptance: {
      signerName: acceptance.signerName,
      signedText: acceptance.signedText,
      signerEmail: isOwner ? acceptance.signerEmail : undefined,
      clientName: acceptance.clientName,
      acceptedAt: acceptance.acceptedAt.toISOString(),
      totalAmount: acceptance.totalAmount,
      currency: acceptance.currency,
      selectedItems: acceptance.selectedItemIds,
      contentHash: acceptance.contentHash,
      contentHashMatchesCurrentContent: recomputedHash === acceptance.contentHash,
      // What was hashed, verbatim. sha256(signedContent) === contentHash, whatever changes later.
      signedContent: acceptance.snapshot ?? undefined,
      consentText: acceptance.consentText,
      // Device details are part of the sender's evidence, not something to hand to anyone with the link.
      ...(isOwner ? { ip: acceptance.ip, userAgent: acceptance.userAgent } : {}),
    },
    sender: { name: acceptance.senderName ?? (proposal.senderName || businessName(owner.brandName, owner.name) || null) },
  });
});

// Count of views, for the sender's dashboard polling (cheap).
publicRoutes.get("/:publicId/pulse", async (c) => {
  const viewer = await getSessionUser(c);
  if (!viewer) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.views)
    .innerJoin(schema.proposals, eq(schema.proposals.id, schema.views.proposalId))
    .where(and(eq(schema.proposals.publicId, c.req.param("publicId")), eq(schema.proposals.userId, viewer.id)))
    .get();
  return c.json({ views: row?.n ?? 0 });
});
