import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, gt } from "drizzle-orm";
import type { AppEnv } from "../env";
import { clientIp, appUrl } from "../env";
import { getDb, schema } from "../lib/db";
import { randomToken, sha256Hex, ipHash, uuid } from "../lib/crypto";
import { rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/email";
import { createSession, destroySession, getSessionUser } from "../lib/session";
import { audit } from "../lib/audit";
import { analyticsId } from "../lib/analytics";
import { STYLE_IDS } from "../../shared/styles";
import { effectivePlan, capsOf, trialEnd } from "../lib/plan";
import { isAdmin } from "./support";
import { workspaceOwner } from "../lib/session";
import { businessName } from "../../shared/names";

const TOKEN_MINUTES = 15;

export const authRoutes = new Hono<AppEnv>();

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), turnstile: z.string().max(4096).optional(), marketing: z.boolean().optional() });

/** The public sign-in configuration: whether a Turnstile challenge is expected, and its site key. */
authRoutes.get("/config", async (c) => c.json({ turnstileSiteKey: c.env.TURNSTILE_SECRET ? (c.env.TURNSTILE_SITE_KEY ?? null) : null, analyticsId: await analyticsId(c.env.DB) }));

/** Cloudflare Turnstile: when a secret is configured, every sign-in request must carry a fresh token. */
export async function turnstileOk(env: { TURNSTILE_SECRET?: string }, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// Step 1: ask for a link. Always answers 200 so nobody can probe which emails exist.
authRoutes.post("/request", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 400);
  const { email } = parsed.data;
  const db = getDb(c.env.DB);
  if (!(await turnstileOk(c.env, parsed.data.turnstile, clientIp(c.req.raw)))) return c.json({ error: "Please complete the check below and try again.", code: "turnstile" }, 400);
  const ip = await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw));

  const byIp = await rateLimit(db, `login:ip:${ip}`, 10, 15 * 60_000);
  const byEmail = await rateLimit(db, `login:email:${await sha256Hex(email)}`, 4, 15 * 60_000);
  const byEmailDay = await rateLimit(db, `login:email:day:${await sha256Hex(email)}`, 12, 24 * 60 * 60_000);
  if (!byIp.allowed || !byEmail.allowed || !byEmailDay.allowed) {
    return c.json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  const raw = randomToken(32);
  const now = new Date();
  await db.insert(schema.magicTokens).values({
    tokenHash: await sha256Hex(raw),
    email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_MINUTES * 60_000),
    marketing: parsed.data.marketing === true, // the box on the form; becomes consent only once the link is used
    ipHash: ip,
  });

  const link = `${appUrl(c)}/auth/verify?token=${raw}`;
  await sendEmail(c.env, {
    to: email,
    subject: "Your Quote and Sign sign-in link",
    heading: "Sign in to Quote and Sign",
    buttons: [{ label: "Sign in", url: link }],
    text: `Click to sign in. The link works once and expires in ${TOKEN_MINUTES} minutes.\n\n${link}\n\nIf you did not request this, ignore this email.`,
  });
  await audit(db, { event: "login.requested", ipHash: ip, meta: { email } });
  // Local development only (no email provider configured): hand the link back so the
  // page can show it. Never true in production, where RESEND_API_KEY is set.
  const devLink = !c.env.RESEND_API_KEY && c.env.ENVIRONMENT === "development" ? link : undefined;
  return c.json({ ok: true, devLink });
});

// Step 2a: the link lands here. Email scanners follow GET links, so a GET only shows a page
// that redeems the token with a POST. Nothing is consumed until the person continues.
authRoutes.get("/verify", async (c) => {
  const raw = c.req.query("token") ?? "";
  if (raw.length < 20 || raw.length > 128) return c.redirect("/login?error=invalid");
  const nonce = uuid().replace(/-/g, "");
  c.header("content-security-policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Signing you in</title>
<style nonce="${nonce}">body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fbfaf7;color:#191816;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}form{text-align:center;padding:24px}h1{font-size:22px;letter-spacing:-.02em;margin:0 0 8px}p{color:#5f5b55;margin:0 0 20px}button{font:inherit;font-weight:600;color:#fff;background:#2b3f8c;border:0;border-radius:999px;padding:12px 22px;cursor:pointer}</style></head>
<body><form method="post" action="/auth/verify" id="f"><input type="hidden" name="token" value="${raw.replace(/[^A-Za-z0-9_-]/g, "")}"><h1>Signing you in</h1><p>One moment. If nothing happens, press the button.</p><button type="submit">Continue</button></form>
<script nonce="${nonce}">document.getElementById("f").submit()</script></body></html>`);
});

// Step 2b: redeem. One use, enforced in a single UPDATE, then a session cookie and a redirect.
authRoutes.post("/verify", async (c) => {
  // The token form is our own page, so the POST is always same-origin. A cross-site post could
  // otherwise sign the visitor into an attacker's account.
  const fetchSite = c.req.header("sec-fetch-site");
  const origin = c.req.header("origin");
  if ((fetchSite && fetchSite !== "same-origin") || (origin && origin !== new URL(c.req.url).origin)) return c.redirect("/login?error=invalid");
  const form = await c.req.parseBody();
  const raw = typeof form.token === "string" ? form.token : "";
  if (raw.length < 20 || raw.length > 128) return c.redirect("/login?error=invalid");
  const db = getDb(c.env.DB);
  const tokenHash = await sha256Hex(raw);
  const now = new Date();

  const token = await db
    .update(schema.magicTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.magicTokens.tokenHash, tokenHash), isNull(schema.magicTokens.usedAt), gt(schema.magicTokens.expiresAt, now)))
    .returning({ email: schema.magicTokens.email, marketing: schema.magicTokens.marketing, ipHash: schema.magicTokens.ipHash })
    .get();
  if (!token) return c.redirect("/login?error=expired");

  let user = await db.select().from(schema.users).where(eq(schema.users.email, token.email)).get();
  if (!user) {
    const id = uuid();
    await db.insert(schema.users).values({ id, email: token.email, createdAt: now, plan: "free", trialEndsAt: trialEnd(now) });
    user = (await db.select().from(schema.users).where(eq(schema.users.id, id)).get())!;
    await audit(db, { userId: id, event: "user.created" });
  } else if (user.deletedAt) {
    return c.redirect("/login?error=deleted");
  }
  // Express consent to product emails, recorded with when and from where (hashed), as CASL asks.
  if (token.marketing && !user.marketingOptIn) {
    await db.update(schema.users).set({ marketingOptIn: true, marketingOptInAt: now, marketingOptInIpHash: token.ipHash }).where(eq(schema.users.id, user.id));
    await audit(db, { userId: user.id, event: "marketing.opt_in", ipHash: token.ipHash });
  }

  await createSession(c, user.id);
  await audit(db, { userId: user.id, event: "login.success", ipHash: await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw)) });
  return c.redirect("/app");
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

const publicUser = (u: { id: string; email: string; name: string | null; brandName: string | null; brandColor: string | null; brandLogoKey: string | null; defaultStyle: string | null; notifyEmails: string[] | null; paymentUrl: string | null; hideMadeWith: boolean; marketingOptIn: boolean; plan: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  brandName: u.brandName,
  brandColor: u.brandColor,
  brandLogoKey: u.brandLogoKey,
  defaultStyle: u.defaultStyle,
  notifyEmails: u.notifyEmails ?? [],
  paymentUrl: u.paymentUrl,
  hideMadeWith: u.hideMadeWith,
  marketingOptIn: u.marketingOptIn,
  plan: u.plan,
});

authRoutes.get("/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null });
  const db = getDb(c.env.DB);
  const owner = await workspaceOwner(c, user);
  const eff = effectivePlan(owner);
  const invite = owner.id === user.id ? await db.select({ id: schema.teamMembers.id, owner: schema.users }).from(schema.teamMembers).innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.ownerId)).where(and(eq(schema.teamMembers.email, user.email), isNull(schema.teamMembers.joinedAt))).get() : null;
  // A member sees the owner's brand everywhere; their own profile fields are not what the client sees.
  const shown = owner.id === user.id ? user : owner;
  return c.json({
    user: {
      ...publicUser(shown),
      id: user.id,
      email: user.email,
      plan: eff.id,
      paidPlan: eff.paid,
      trial: eff.trial,
      trialDaysLeft: eff.trialDaysLeft,
      caps: capsOf(owner),
      isAdmin: isAdmin(c.env, user.email),
      marketingOptIn: user.marketingOptIn,
      workspace: owner.id === user.id ? null : { ownerName: businessName(owner.brandName, owner.name, "your team") },
      pendingInvite: invite && invite.owner.plan === "business" && !invite.owner.deletedAt ? { id: invite.id, ownerName: businessName(invite.owner.brandName, invite.owner.name, invite.owner.email) } : null,
    },
  });
});

// Profile: the name and color used on every proposal unless one overrides them.
authRoutes.put("/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in first." }, 401);
  if ((await workspaceOwner(c, user)).id !== user.id) return c.json({ error: "Only the account owner can change the profile." }, 403);
  const parsed = z
    .object({
      name: z.string().trim().max(120).nullish(),
      brandName: z.string().trim().max(120).transform((s) => s.replace(/[\r\n\t]+/g, " ").trim()).nullish(),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
      defaultStyle: z.enum(STYLE_IDS).nullish(),
      notifyEmails: z.array(z.string().trim().toLowerCase().email().max(254)).max(10).optional(),
      paymentUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Payment links must start with https://").nullish(),
      hideMadeWith: z.boolean().optional(),
      marketingOptIn: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message === "Payment links must start with https://" ? "Payment links must start with https://" : "Invalid data." }, 400);
  const d = parsed.data;
  const caps = capsOf(user);
  const plan = (msg: string) => c.json({ error: msg, code: "plan" }, 402);
  if (!caps.brand && ((d.brandColor && d.brandColor !== user.brandColor) || (d.defaultStyle && d.defaultStyle !== user.defaultStyle))) return plan("Your brand color and page styles are part of Pro.");
  if (!caps.payment && d.paymentUrl && d.paymentUrl !== user.paymentUrl) return plan("A payment link after signing is part of Pro.");
  if (!caps.footerOff && d.hideMadeWith) return plan("Hiding the footer is part of Pro.");
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (d.hideMadeWith !== undefined) set.hideMadeWith = d.hideMadeWith;
  if (d.marketingOptIn !== undefined && d.marketingOptIn !== user.marketingOptIn) {
    set.marketingOptIn = d.marketingOptIn;
    set.marketingOptInAt = d.marketingOptIn ? new Date() : null;
    set.marketingOptInIpHash = d.marketingOptIn ? await ipHash(c.env.SESSION_SECRET, clientIp(c.req.raw)) : null;
    await audit(getDb(c.env.DB), { userId: user.id, event: d.marketingOptIn ? "marketing.opt_in" : "marketing.opt_out" });
  }
  if (d.name !== undefined) set.name = d.name || null;
  if (d.brandName !== undefined) set.brandName = d.brandName || null;
  if (d.brandColor !== undefined) set.brandColor = d.brandColor ? d.brandColor.toLowerCase() : null;
  if (d.defaultStyle !== undefined) set.defaultStyle = d.defaultStyle || null;
  if (d.notifyEmails !== undefined) set.notifyEmails = [...new Set(d.notifyEmails)].filter((e) => e !== user.email);
  if (d.paymentUrl !== undefined) set.paymentUrl = d.paymentUrl || null;
  const db = getDb(c.env.DB);
  if (Object.keys(set).length) await db.update(schema.users).set(set).where(eq(schema.users.id, user.id));
  const fresh = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  return c.json({ user: publicUser(fresh!) });
});
