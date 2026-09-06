import { Hono } from "hono";
import type { AppEnv } from "./env";
import { appUrl } from "./env";
import { authRoutes } from "./routes/auth";
import { proposalRoutes } from "./routes/proposals";
import { publicRoutes } from "./routes/public";
import { templateRoutes } from "./routes/templates";
import { billingRoutes, billingWebhook } from "./routes/billing";
import { accountRoutes, fileRoutes } from "./routes/account";
import { teamRoutes } from "./routes/team";
import { renderTerms, renderPrivacy, renderAcceptableUse, renderDpa, renderContact } from "./lib/legal";
import { contactRoutes, adminRoutes } from "./routes/support";
import { getSessionUser } from "./lib/session";
import { businessName } from "../shared/names";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "./lib/db";
import { renderLanding } from "./lib/landing";
import { renderTemplatePreview, renderSimplePage } from "./lib/page";
import { TEMPLATES } from "../shared/templates";
import { isHex } from "../shared/looks";
import { STYLE_IDS } from "../shared/styles";
import { sendExpiryReminders, sendTrialNotices, pruneOldRows } from "./lib/reminders";

import type { Bindings } from "./env";
export type { Bindings };

const app = new Hono<AppEnv>();

// Cross-site writes are refused before any handler runs. Browsers always send Sec-Fetch-Site
// (and Origin on cross-site POSTs); same-origin fetches from our own pages pass. The Polar webhook
// is a server-to-server call and is verified by signature instead.
app.use("*", async (c, next) => {
  const m = c.req.method;
  const path = new URL(c.req.url).pathname;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && !path.startsWith("/billing/webhook") && (path.startsWith("/api/") || path.startsWith("/auth/"))) {
    const fetchSite = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    if ((fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") || (origin && origin !== new URL(c.req.url).origin)) {
      // The sign-in form is a real page, so send people back to it instead of showing JSON.
      if (path === "/auth/verify") return c.redirect("/login?error=invalid");
      return c.json({ error: "Cross-site request refused." }, 403);
    }
  }
  await next();
});

// Security headers on every response the Worker produces.
app.use("*", async (c, next) => {
  await next();
  if (new URL(c.req.url).protocol === "https:") c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!c.res.headers.has("x-frame-options")) c.header("X-Frame-Options", "DENY");
  if (!c.res.headers.has("content-security-policy")) {
    c.header("Content-Security-Policy", "frame-ancestors 'none'");
  }
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong." }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

// Homepage: server-rendered so it is indexable and fast, with the live demo built from the
// same code as the client page.
app.get("/", (c) => {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );
  c.header("cache-control", "public, max-age=300");
  return c.html(renderLanding({ nonce, appUrl: appUrl(c), githubUrl: "https://github.com/quoteandsign/quoteandsign" }));
});

// Legal pages, server-rendered like the homepage.
const legalPages: Record<string, (nonce: string) => string> = { "/terms": renderTerms, "/privacy": renderPrivacy, "/acceptable-use": renderAcceptableUse, "/dpa": renderDpa };
for (const [path, render] of Object.entries(legalPages)) {
  app.get(path, (c) => {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    c.header("content-security-policy", `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
    c.header("cache-control", "public, max-age=3600");
    return c.html(render(nonce));
  });
}

// The contact page: pre-filled for a signed-in person; Turnstile when configured.
app.get("/contact", async (c) => {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const siteKey = c.env.TURNSTILE_SECRET ? (c.env.TURNSTILE_SITE_KEY ?? null) : null;
  const viewer = await getSessionUser(c);
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'${siteKey ? " https://challenges.cloudflare.com" : ""}; style-src 'nonce-${nonce}'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'${siteKey ? "; frame-src https://challenges.cloudflare.com" : ""}`,
  );
  c.header("cache-control", "private, no-store");
  return c.html(renderContact(nonce, { siteKey, email: viewer?.email ?? null, name: viewer?.brandName ?? viewer?.name ?? null, kind: c.req.query("kind") ?? null }));
});

// Template previews: the real client page fed with template content. Our own gallery embeds
// them as scaled thumbnails, so framing is allowed from this origin only.
app.get("/t/:id", async (c) => {
  const template = TEMPLATES.find((t) => t.id === c.req.param("id"));
  if (!template) return c.html(renderSimplePage("Template not found", "There is no template at this address."), 404);
  const user = await getSessionUser(c);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data: https:; font-src 'self'; media-src https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`,
  );
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("cache-control", "private, no-store");
  return c.html(
    renderTemplatePreview({
      template,
      nonce,
      appUrl: appUrl(c),
      brand: { name: businessName(user?.brandName, user?.name, "Your business"), color: isHex(c.req.query("accent")) ? c.req.query("accent")! : (user?.brandColor ?? null), logoKey: user?.brandLogoKey ?? null },
      thumb: c.req.query("thumb") === "1",
      style: STYLE_IDS.includes(c.req.query("style") ?? "") ? c.req.query("style")! : template.style,
    }),
  );
});

// A saved template, rendered through the real client page. Owner only.
app.get("/t/u/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.html(renderSimplePage("Sign in", "Sign in to preview your templates."), 401);
  const db = getDb(c.env.DB);
  const t = await db.select().from(schema.userTemplates).where(and(eq(schema.userTemplates.id, c.req.param("id")), eq(schema.userTemplates.userId, user.id))).get();
  if (!t) return c.html(renderSimplePage("Template not found", "There is no template at this address."), 404);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data: https:; font-src 'self'; media-src https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`,
  );
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("cache-control", "private, no-store");
  const accent = c.req.query("accent");
  const style = c.req.query("style");
  return c.html(
    renderTemplatePreview({
      template: { id: t.id, name: t.name, summary: "", title: t.title, style: t.style ?? "classic", content: t.content as unknown[], items: t.items as any },
      nonce,
      appUrl: appUrl(c),
      brand: { name: businessName(user.brandName, user.name, "Your business"), color: isHex(accent) ? accent! : (t.accentColor ?? user.brandColor ?? null), logoKey: user.brandLogoKey },
      thumb: c.req.query("thumb") === "1",
      style: STYLE_IDS.includes(style ?? "") ? style! : (t.style ?? "classic"),
    }),
  );
});

app.route("/auth", authRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/billing", billingRoutes);
app.route("/billing/webhook", billingWebhook);
app.route("/api/account", accountRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/contact", contactRoutes);
app.route("/api/admin", adminRoutes);
app.route("/files", fileRoutes);
app.route("/api/proposals", proposalRoutes);
app.route("/p", publicRoutes);

// Anything the router does not own falls through to static assets / the SPA.
app.notFound((c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text("Not found", 404)));

export { app };

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    // A short or missing session secret would make every cookie forgeable. Refuse to serve.
    if (env.ENVIRONMENT !== "development" && env.ENVIRONMENT !== "test" && (env.SESSION_SECRET?.length ?? 0) < 32) {
      return new Response("Server misconfigured: SESSION_SECRET must be at least 32 characters.", { status: 500 });
    }
    return app.fetch(request, env, ctx);
  },
  // Daily: one reminder to clients whose proposal expires within a few days.
  scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(sendExpiryReminders(env));
    ctx.waitUntil(sendTrialNotices(env));
    ctx.waitUntil(pruneOldRows(env));
  },
};
