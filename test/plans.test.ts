import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";
import { sendTrialNotices } from "../src/worker/lib/reminders";

// Plans as a process: what Free can and cannot do once the trial ends, yearly billing,
// countersigning on Business, the footer switch, and the trial notices.

const APP = "http://localhost:5173";
let cookie = "";
const logs: string[] = [];

function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
}
const json = (path: string, method: string, body?: unknown) =>
  req(path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const client = (path: string, init: RequestInit = {}) => app.request(`${APP}${path}`, { ...init, headers: { "cf-connecting-ip": "203.0.113.50", ...(init.headers as Record<string, string>) } }, env);

let userId = "";
const setPlan = (plan: string) => env.DB.prepare("UPDATE users SET plan = ?, trial_ends_at = NULL WHERE id = ?").bind(plan, userId).run();

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  await json("/auth/request", "POST", { email: "plans@example.com" });
  const token = new URL(logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  userId = (await (await req("/auth/me")).json()).user.id;
  // Set up the brand while the trial is on, as a real user would.
  await json("/auth/me", "PUT", { brandName: "Plan Studio", brandColor: "#0f6e4a", defaultStyle: "bold" });
});

describe("free after the trial", () => {
  it("keeps what was made but shows the standard look, and refuses new Pro settings", async () => {
    const me = (await (await req("/auth/me")).json()).user;
    expect(me.caps.brand).toBe(true);
    const id = (await (await json("/api/proposals", "POST", { template: "web-project" })).json()).id;
    await json(`/api/proposals/${id}`, "PUT", { clientEmail: "sam@client.example", expiresAt: Date.now() + 5 * 86_400_000, password: "hush" });
    await json(`/api/proposals/${id}/send`, "POST");
    const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;

    await setPlan("free");
    const free = (await (await req("/auth/me")).json()).user;
    expect(free.plan).toBe("free");
    expect(free.caps).toMatchObject({ brand: false, protect: false, notify: false, payment: false, pdf: false, footerOff: false });
    // Brand settings are kept, not applied; changing them is refused with a plan code.
    expect(free.brandColor).toBe("#0f6e4a");
    const r = await json("/auth/me", "PUT", { brandColor: "#c11574" });
    expect(r.status).toBe(402);
    expect((await r.json()).code).toBe("plan");
    expect((await json("/auth/me", "PUT", { brandName: "Renamed Plan Studio" })).status).toBe(200);
    // The password still protects the link (safety first), but the page is the standard look.
    const locked = await client(`/p/${pub}`);
    expect(await locked.text()).toContain("This proposal is protected");
    await env.DB.prepare("UPDATE proposals SET password_hash = NULL WHERE id = ?").bind(id).run();
    const html = await (await client(`/p/${pub}`)).text();
    expect(html).toContain('data-style="classic"');
    expect(html).toContain("--accent:#2b3f8c");
    expect(html).toContain("Made with");
    // No "opened" email on Free.
    const n = logs.length;
    await client(`/p/${pub}`, { headers: { "cf-connecting-ip": "203.0.113.51" } });
    expect(logs.slice(n).join("\n")).not.toContain("opened");
    // New Pro settings on the proposal are refused; clearing and unrelated saves still work.
    const g = await json(`/api/proposals/${id}`, "PUT", { accentColor: "#c11574" });
    expect(g.status).toBe(402);
    expect((await json(`/api/proposals/${id}`, "PUT", { password: "newer" })).status).toBe(402);
    expect((await json(`/api/proposals/${id}`, "PUT", { expiresAt: null, clientName: "Sam" })).status).toBe(200);
    expect((await json(`/api/proposals/${id}`, "PUT", { countersign: true })).status).toBe(402);
    // Logo upload is refused too.
    const fd = new FormData();
    fd.set("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: "image/png" }), "logo.png");
    expect((await req("/api/account/logo", { method: "POST", body: fd })).status).toBe(402);
    await json(`/api/proposals/${id}/archive`, "POST");
  });
});

describe("paid plans", () => {
  it("maps yearly and monthly Polar products to a plan and interval, and lets paid accounts hide the footer", async () => {
    (env as any).POLAR_PRODUCT_PRO = "prod_pro_m";
    (env as any).POLAR_PRODUCT_PRO_YEAR = "prod_pro_y";
    (env as any).POLAR_PRODUCT_BUSINESS = "prod_biz_m";
    (env as any).POLAR_PRODUCT_BUSINESS_YEAR = "prod_biz_y";
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_plans", product_id: "prod_pro_y", metadata: { userId } } });
    let b = await (await req("/api/billing")).json();
    expect(b.paidPlan).toBe("pro");
    expect(b.interval).toBe("year");
    expect(b.plans.pro).toMatchObject({ monthly: 24, yearly: 19 });
    expect(b.plans.business).toMatchObject({ monthly: 69, yearly: 59, seats: 10, countersign: true });
    // The footer is on by default and can be switched off on a paid plan.
    const id = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;
    await json(`/api/proposals/${id}/send`, "POST");
    const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
    expect(await (await client(`/p/${pub}`)).text()).toContain("Made with");
    expect((await json("/auth/me", "PUT", { hideMadeWith: true })).status).toBe(200);
    expect(await (await client(`/p/${pub}`)).text()).not.toContain("Made with");
    // Countersign is Business only.
    expect((await json(`/api/proposals/${id}`, "PUT", { countersign: true })).status).toBe(402);
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_plans", product_id: "prod_biz_m", metadata: { userId } } });
    b = await (await req("/api/billing")).json();
    expect(b.paidPlan).toBe("business");
    expect(b.interval).toBe("month");
    await json(`/api/proposals/${id}/archive`, "POST");
    for (const k of ["POLAR_PRODUCT_PRO", "POLAR_PRODUCT_PRO_YEAR", "POLAR_PRODUCT_BUSINESS", "POLAR_PRODUCT_BUSINESS_YEAR"]) delete (env as any)[k];
  });

  it("countersigns after the client and sends the executed copy", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "retainer" })).json()).id;
    expect((await json(`/api/proposals/${id}`, "PUT", { countersign: true, clientName: "Sam Client", clientEmail: "sam@client.example" })).status).toBe(200);
    // Too early: nobody has signed.
    expect((await json(`/api/proposals/${id}/countersign`, "POST", { name: "Alex Morgan" })).status).toBe(409);
    await json(`/api/proposals/${id}/send`, "POST");
    const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
    const html = await (await client(`/p/${pub}`)).text();
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1]!;
    const a = await client(`/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) });
    expect(a.status).toBe(200);
    expect(await (await client(`/p/${pub}`)).text()).toContain("will countersign");
    const n = logs.length;
    const cs = await json(`/api/proposals/${id}/countersign`, "POST", { name: "Alex Morgan" });
    expect(cs.status).toBe(200);
    const mail = logs.slice(n).join("\n");
    expect(mail).toContain("Countersigned: ");
    expect(mail).toMatch(/Attachment: .*-signed\.pdf/);
    const page = await (await client(`/p/${pub}`)).text();
    expect(page).toContain("Countersigned by <strong>Alex Morgan</strong>");
    expect((await json(`/api/proposals/${id}/countersign`, "POST", { name: "Again" })).status).toBe(409);
    const g = await (await req(`/api/proposals/${id}`)).json();
    expect(g.acceptance.countersignerName).toBe("Alex Morgan");
  });
});

describe("trial notices", () => {
  it("emails at three days, on the last day, and once it has ended, each once", async () => {
    const day = 86_400_000;
    const now = new Date();
    await env.DB.prepare("UPDATE users SET plan = 'free', trial_warned = 0, trial_ends_at = ? WHERE id = ?").bind(now.getTime() + 2 * day, userId).run();
    let n = logs.length;
    expect(await sendTrialNotices(env as any, now)).toBeGreaterThanOrEqual(1);
    expect(logs.slice(n).join("\n")).toContain("Your Pro trial ends in 3 days");
    n = logs.length;
    expect(await sendTrialNotices(env as any, now)).toBe(0);
    await env.DB.prepare("UPDATE users SET trial_ends_at = ? WHERE id = ?").bind(now.getTime() + 6 * 60 * 60_000, userId).run();
    expect(await sendTrialNotices(env as any, now)).toBeGreaterThanOrEqual(1);
    expect(logs.slice(n).join("\n")).toContain("ends today");
    n = logs.length;
    await env.DB.prepare("UPDATE users SET trial_ends_at = ? WHERE id = ?").bind(now.getTime() - 60_000, userId).run();
    expect(await sendTrialNotices(env as any, now)).toBeGreaterThanOrEqual(1);
    expect(logs.slice(n).join("\n")).toContain("has ended");
    expect(await sendTrialNotices(env as any, now)).toBe(0);
  });
});

describe("sign-in bot check", () => {
  it("requires a Turnstile token only when a secret is configured, and verifies it with Cloudflare", async () => {
    expect((await (await app.request(`${APP}/auth/config`, {}, env)).json()).turnstileSiteKey).toBeNull();
    (env as any).TURNSTILE_SECRET = "ts_secret";
    (env as any).TURNSTILE_SITE_KEY = "ts_site";
    expect((await (await app.request(`${APP}/auth/config`, {}, env)).json()).turnstileSiteKey).toBe("ts_site");
    const noToken = await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bot@example.com" }) }, env);
    expect(noToken.status).toBe(400);
    expect((await noToken.json()).code).toBe("turnstile");
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("turnstile/v0/siteverify")) {
        calls.push(String(init?.body));
        return new Response(JSON.stringify({ success: String(init?.body).includes('"response":"good-token"') }), { headers: { "content-type": "application/json" } });
      }
      return realFetch(input as any, init);
    }) as typeof fetch;
    try {
      const bad = await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bot@example.com", turnstile: "bad-token" }) }, env);
      expect(bad.status).toBe(400);
      const good = await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "human@example.com", turnstile: "good-token" }) }, env);
      expect(good.status).toBe(200);
      expect(calls.length).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
      delete (env as any).TURNSTILE_SECRET;
      delete (env as any).TURNSTILE_SITE_KEY;
    }
  });
});
