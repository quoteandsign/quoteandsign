import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { getDb, schema } from "../src/worker/lib/db";
import { webhookUrlProblem, signWebhook, retryWebhooks, DISABLE_AFTER } from "../src/worker/lib/webhooks";
import { eq } from "drizzle-orm";

// Business webhooks: signed, private-by-content, rate-limited, retried, and switched off when dead.

const APP = "http://localhost:5173";
const logs: string[] = [];

// Outbound calls to *.example.com are answered here; everything else goes out as usual.
type Call = { url: string; headers: Record<string, string>; body: string };
let handler: ((call: Call) => Response) | null = null;
const calls: Call[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^https:\/\/[a-z]+\.example\.com\//.test(url)) {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
      const call = { url, headers, body: String(init?.body ?? "") };
      calls.push(call);
      return handler ? handler(call) : new Response("no handler", { status: 500 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; });
afterEach(() => { handler = null; calls.length = 0; });

async function signIn(email: string): Promise<string> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.90" }, body: JSON.stringify({ email }) }, env);
  const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  return (v.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const as = (cookie: string) => (path: string, method = "GET", body?: unknown) =>
  app.request(`${APP}${path}`, { method, headers: { cookie, "content-type": "application/json", accept: "application/json", origin: APP }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
const business = async (cookie: string) => {
  const id = (await (await as(cookie)("/auth/me")).json()).user.id as string;
  await env.DB.prepare("UPDATE users SET plan = 'business' WHERE id = ?").bind(id).run();
  return id;
};

describe("webhook addresses", () => {
  it("accept only public https on the standard port", () => {
    const bad = ["http://hooks.example.com/a", "https://10.0.0.1/a", "https://localhost/a", "https://foo.localhost/a", "https://x.internal/a", "https://x.local/a", "https://me.workers.dev/a", "https://api.cloudflare.com/a", "https://quoteandsign.com/a", "https://user:pw@hooks.example.com/a", "https://hooks.example.com:8443/a", "https://[::1]/a", "https://intranet/a", "ftp://hooks.example.com", "not a url", "https://hooks.example.com./a", "https://x.pages.dev/a", "https://x.r2.dev/a"];
    for (const u of bad) expect(webhookUrlProblem(u), u).not.toBeNull();
    expect(webhookUrlProblem("https://hooks.zapier.com/hooks/catch/1/abc")).toBeNull();
    expect(webhookUrlProblem("https://hooks.example.com:443/x")).toBeNull();
  });
});

describe("plan gate and lifecycle", () => {
  it("is Business only, creates with a one-time secret, and signs a test ping the receiver can verify", async () => {
    const c = await signIn("hooks@example.com");
    expect((await as(c)("/api/webhooks")).status).toBe(402);
    await business(c);
    expect((await as(c)("/api/webhooks", "PUT", { url: "http://hooks.example.com/x" })).status).toBe(400);
    const created = await as(c)("/api/webhooks", "PUT", { url: "https://hooks.example.com/qs" });
    expect(created.status).toBe(200);
    const { secret, webhook } = await created.json();
    expect(secret).toMatch(/^whsec_/);
    expect(webhook.events.length).toBe(5);
    // Saving again never returns the secret.
    expect((await (await as(c)("/api/webhooks", "PUT", { url: "https://hooks.example.com/qs", events: ["proposal.accepted"] })).json()).secret).toBeUndefined();
    expect((await (await as(c)("/api/webhooks")).json()).webhook.events).toEqual(["proposal.accepted"]);

    handler = () => new Response("ok", { status: 200 });
    expect((await as(c)("/api/webhooks/test", "POST")).status).toBe(200);
    expect(calls.length).toBe(1);
    const got = calls[0]!;
    expect(got.headers["x-qs-event"]).toBe("ping");
    expect(got.headers["x-qs-signature"]).toBe(await signWebhook(secret, got.headers["x-qs-timestamp"]!, got.body));
    expect(JSON.parse(got.body)).toMatchObject({ event: "ping", proposal: null });
    const list = await (await as(c)("/api/webhooks")).json();
    expect(list.deliveries[0]).toMatchObject({ event: "ping", status: "ok", responseCode: 200 });
  });

  it("sends on accept with ids and amounts only, never the client's email", async () => {
    const c = await signIn("hooks2@example.com");
    const ownerId = await business(c);
    await as(c)("/api/webhooks", "PUT", { url: "https://crm.example.com/in", events: ["proposal.sent", "proposal.accepted"] });
    handler = () => new Response(null, { status: 204 });
    const id = (await (await as(c)("/api/proposals", "POST", { template: "blank" })).json()).id;
    await as(c)(`/api/proposals/${id}`, "PUT", { clientName: "Sam Client", clientEmail: "sam.secret@example.com" });
    await as(c)(`/api/proposals/${id}/send`, "POST", { email: false });
    const pub = (await (await as(c)(`/api/proposals/${id}`)).json()).proposal.publicId;
    const page = await (await app.request(`${APP}/p/${pub}`, {}, env)).text();
    const hash = page.match(/id="seenHash" value="([a-f0-9]+)"/)?.[1] ?? "";
    const acc = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.91" }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam.secret@example.com", consent: true, seenHash: hash }) }, env);
    expect(acc.status).toBe(200);
    expect(calls.map((x) => x.headers["x-qs-event"])).toEqual(["proposal.sent", "proposal.accepted"]);
    const accepted = JSON.parse(calls[1]!.body);
    expect(accepted.proposal).toMatchObject({ id, publicId: pub, clientName: "Sam Client", status: "accepted" });
    const all = calls.map((x) => x.body).join("");
    expect(all).not.toContain("sam.secret@example.com");
    expect(all).not.toContain("203.0.113");
    const rows = await getDb(env.DB).select().from(schema.webhookDeliveries).innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId)).where(eq(schema.webhooks.userId, ownerId)).all();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.webhook_deliveries.status === "ok")).toBe(true);
  });

  it("retries a failed delivery on the nightly job, then gives up, and switches off a dead address", async () => {
    const c = await signIn("hooks3@example.com");
    const ownerId = await business(c);
    await as(c)("/api/webhooks", "PUT", { url: "https://down.example.com/in" });
    handler = () => new Response("nope", { status: 503 });
    expect((await as(c)("/api/webhooks/test", "POST")).status).toBe(200);
    const db = getDb(env.DB);
    const hook = (await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, ownerId)).get())!;
    let d = (await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.webhookId, hook.id)).get())!;
    expect(d.status).toBe("pending");
    expect(d.attempts).toBe(2); // one now, one quick retry
    expect(d.nextAt).not.toBeNull();
    // The nightly job retries once it is due, up to five attempts in all.
    for (let night = 1; night <= 3; night++) await retryWebhooks(env, new Date(Date.now() + night * 25 * 60 * 60_000));
    d = (await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, d.id)).get())!;
    expect(d.attempts).toBe(5);
    expect(d.status).toBe("failed");
    // Enough consecutive failures switch the webhook off and tell the owner once.
    await db.update(schema.webhooks).set({ failures: DISABLE_AFTER - 1 }).where(eq(schema.webhooks.id, hook.id));
    const before = logs.length;
    await as(c)("/api/webhooks/test", "POST");
    const after = (await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, hook.id)).get())!;
    expect(after.active).toBe(false);
    expect(logs.slice(before).join("\n")).toContain("switched off");
    expect((await as(c)("/api/webhooks/test", "POST")).status).toBe(409);
  });

  it("stops sending the moment the plan no longer includes webhooks", async () => {
    const c = await signIn("hooks5@example.com");
    const ownerId = await business(c);
    await as(c)("/api/webhooks", "PUT", { url: "https://gone.example.com/in" });
    handler = () => new Response("ok", { status: 200 });
    await as(c)("/api/webhooks/test", "POST");
    expect(calls.length).toBe(1);
    await env.DB.prepare("UPDATE users SET plan = 'pro', trial_ends_at = 0 WHERE id = ?").bind(ownerId).run();
    const id = (await (await as(c)("/api/proposals", "POST", { template: "blank" })).json()).id;
    await as(c)(`/api/proposals/${id}/send`, "POST", { email: false });
    expect(calls.length).toBe(1);
    expect((await as(c)("/api/webhooks")).status).toBe(402);
  });

  it("caps deliveries per hour and drops the rest", async () => {
    const c = await signIn("hooks4@example.com");
    const ownerId = await business(c);
    await as(c)("/api/webhooks", "PUT", { url: "https://busy.example.com/in" });
    handler = () => new Response("ok", { status: 200 });
    for (let i = 0; i < 61; i++) await as(c)("/api/webhooks/test", "POST");
    const db = getDb(env.DB);
    const hook = (await db.select().from(schema.webhooks).where(eq(schema.webhooks.userId, ownerId)).get())!;
    const n = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.webhookId, hook.id)).all();
    expect(n.length).toBe(60);
  });
});
