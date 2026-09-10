import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent, verifyWebhook } from "../src/worker/routes/billing";

// Phase 2: PDF export, logo upload, account export and delete, plan changes from Polar.

const APP = "http://localhost:5173";
let cookie = "";
const logs: string[] = [];
function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
}
function json(path: string, method: string, body?: unknown) {
  return req(path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
let userId = "";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  await json("/auth/request", "POST", { email: "paying@example.com" });
  const token = new URL(logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  userId = (await (await req("/auth/me")).json()).user.id;
  // New accounts get a 14-day Pro trial; these tests are about the plans underneath it.
  expect((await (await req("/auth/me")).json()).user.trial).toBe(true);
  await env.DB.prepare("UPDATE users SET trial_ends_at = NULL WHERE id = ?").bind(userId).run();
});

describe("plans and billing", () => {
  it("reports the plan and refuses checkout until Polar is configured", async () => {
    const b = await (await req("/api/billing")).json();
    expect(b.plan).toBe("free");
    expect(b.checkoutAvailable).toBe(false);
    expect((await json("/api/billing/checkout", "POST", { plan: "pro" })).status).toBe(503);
    expect((await json("/api/billing/checkout", "POST", { plan: "gold" })).status).toBe(400);
  });

  it("verifies webhook signatures and applies plan changes", async () => {
    const secret = "whsec_test_secret";
    const body = JSON.stringify({ type: "subscription.active", data: { status: "active", customer_id: "cus_1", metadata: { userId, plan: "pro" } } });
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    const sig = "v1," + btoa(String.fromCharCode(...mac));
    const good = new Headers({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig });
    expect(await verifyWebhook(secret, good, body)).toBe(true);
    expect(await verifyWebhook(secret, good, body + " ")).toBe(false);
    expect(await verifyWebhook(secret, new Headers({ "webhook-id": id, "webhook-timestamp": "1", "webhook-signature": sig }), body)).toBe(false);
    expect((await app.request(`${APP}/billing/webhook`, { method: "POST", headers: good, body }, env)).status).toBe(503);

    const r = await applyPolarEvent(env as any, JSON.parse(body));
    expect(r).toEqual({ userId, plan: "pro" });
    expect((await (await req("/auth/me")).json()).user.plan).toBe("pro");
    // Cancelled keeps access until revoked; revoked drops to free; the customer id is remembered.
    await applyPolarEvent(env as any, { type: "subscription.canceled", data: { status: "canceled", customer_id: "cus_1" } });
    expect((await (await req("/auth/me")).json()).user.plan).toBe("pro");
    await applyPolarEvent(env as any, { type: "subscription.revoked", data: { status: "revoked", customer_id: "cus_1" } });
    expect((await (await req("/auth/me")).json()).user.plan).toBe("free");
    await applyPolarEvent(env as any, { type: "order.paid", data: { customer: { id: "cus_1", email: "paying@example.com" }, metadata: { plan: "business" } } });
    expect((await (await req("/auth/me")).json()).user.plan).toBe("business");
  });
});

describe("pdf", () => {
  let pid = "";
  let pub = "";
  it("owners on a paid plan download a real PDF; the client gets their copy at the public link", async () => {
    const c = await json("/api/proposals", "POST", { template: "web-project" });
    pid = (await c.json()).id;
    await json(`/api/proposals/${pid}`, "PUT", { clientName: "Bramble & Co", clientEmail: "x@y.example", taxRateBps: 1300, taxLabel: "HST" });
    pub = (await (await req(`/api/proposals/${pid}`)).json()).proposal.publicId;
    const r = await req(`/api/proposals/${pid}/pdf`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain('filename="Website-redesign.pdf"');
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(4000);

    expect((await app.request(`${APP}/p/${pub}/pdf`, {}, env)).status).toBe(404);
    await json(`/api/proposals/${pid}/send`, "POST");
    const client = await app.request(`${APP}/p/${pub}/pdf`, {}, env);
    expect(client.status).toBe(200);
    expect(client.headers.get("content-type")).toBe("application/pdf");
  });

  it("the free plan is told PDF export is part of Pro", async () => {
    await applyPolarEvent(env as any, { type: "subscription.revoked", data: { status: "revoked", customer_id: "cus_1" } });
    const r = await req(`/api/proposals/${pid}/pdf`);
    expect(r.status).toBe(402);
    expect((await r.json()).code).toBe("plan");
  });
});

describe("logo", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
  const upload = (bytes: Uint8Array, name: string, type: string) => {
    const fd = new FormData();
    fd.append("file", new File([bytes as unknown as BlobPart], name, { type }));
    return req("/api/account/logo", { method: "POST", body: fd });
  };
  it("accepts a real PNG by its bytes, refuses a fake one, and serves it safely", async () => {
    // A logo is part of Pro; this account's trial was ended above.
    await env.DB.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").bind(userId).run();
    const fake = await upload(new TextEncoder().encode("<svg onload=alert(1)></svg>"), "logo.png", "image/png");
    expect(fake.status).toBe(415);
    const ok = await upload(png, "anything.txt", "text/plain");
    expect(ok.status).toBe(200);
    const { key, url } = await ok.json();
    expect(key).toMatch(/^logos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
    expect((await (await req("/auth/me")).json()).user.brandLogoKey).toBe(key);
    // Production headers: development sends no-store on everything so previews stay fresh.
    const served = await app.request(`${APP}${url}`, {}, { ...env, ENVIRONMENT: "production", APP_URL: APP } as typeof env);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect(served.headers.get("cache-control")).toBe("public, max-age=86400");
    expect((await app.request(`${APP}/files/logos/x/y.svg`, {}, env)).status).toBe(404);
    const list = (await (await req("/api/proposals")).json()).proposals;
    const sent = list.find((p: { status: string }) => p.status === "sent" || p.status === "viewed");
    const html = await (await app.request(`${APP}/p/${sent.publicId}`, {}, env)).text();
    expect(html).toContain(`/files/${key}`);
    expect((await json("/api/account/logo", "DELETE")).status).toBe(200);
    expect((await (await req("/auth/me")).json()).user.brandLogoKey).toBeNull();
  });
});

describe("account", () => {
  it("exports everything and deletes the account while keeping signed records readable", async () => {
    const ex = await req("/api/account/export");
    expect(ex.status).toBe(200);
    expect(ex.headers.get("content-disposition")).toContain("quote-and-sign-export-");
    const data = await ex.json();
    expect(data.profile.email).toBe("paying@example.com");
    expect(data.profile.polarCustomerId).toBeUndefined();
    expect(data.proposals.length).toBeGreaterThan(0);
    expect(data.proposals[0].passwordHash).toBeUndefined();

    const list = (await (await req("/api/proposals")).json()).proposals;
    const sent = list.find((p: { status: string }) => p.status === "sent" || p.status === "viewed");
    const html = await (await app.request(`${APP}/p/${sent.publicId}`, {}, env)).text();
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1];
    const a = await app.request(`${APP}/p/${sent.publicId}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(a.status).toBe(200);
    const draftId = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;

    expect((await json("/api/account", "DELETE", { code: "000000" })).status).toBe(400);
    const before = logs.length;
    expect((await json("/api/account/delete-code", "POST")).status).toBe(200);
    const code = /Your code is (\d{6})/.exec(logs.slice(before).join("\n"))![1];
    expect((await json("/api/account", "DELETE", { code: "123456" })).status).toBe(400);
    const del = await json("/api/account", "DELETE", { code });
    expect(del.status).toBe(200);
    expect((await del.json()).keptSigned).toBe(1);
    expect((await (await req("/auth/me")).json()).user).toBeNull();
    cookie = "";
    expect((await app.request(`${APP}/api/proposals/${draftId}`, {}, env)).status).toBe(401);
    const signed = await app.request(`${APP}/p/${sent.publicId}`, {}, env);
    expect(signed.status).toBe(200);
    expect(await signed.text()).toContain("Accepted by");

    // The same email can start over as a brand-new account, not as the deleted one. It was a paying
    // account, so there is no trial to inherit: deleting is not a way to a fresh 14 days.
    const n = logs.length;
    await json("/auth/request", "POST", { email: "paying@example.com" });
    const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
    const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
    expect(v.headers.get("location")).toBe("/app");
    const c2 = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
    const me2 = (await (await app.request(`${APP}/auth/me`, { headers: { cookie: c2 } }, env)).json()).user;
    expect(me2.id).not.toBe(userId);
    expect(me2.paidPlan).toBe("free");
    expect(me2.trial).toBe(false);
  });
});
