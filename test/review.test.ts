import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { sendExpiryReminders } from "../src/worker/lib/reminders";

// Fixes from the full review: wire dates, send notes, expiry status, signed snapshots,
// login CSRF, public PDF limits, restore cap, webhook replay, engagement ids, the unopened nudge.

const APP = "http://localhost:5173";
let cookie = "";
const logs: string[] = [];

function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
}
const json = (path: string, method: string, body?: unknown, extra: Record<string, string> = {}) =>
  req(path, { method, headers: { "content-type": "application/json", accept: "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });

let userId = "";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  await json("/auth/request", "POST", { email: "review@example.com" });
  const token = new URL(logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  userId = (await (await req("/auth/me")).json()).user.id;
});

describe("wire format", () => {
  it("returns dates as milliseconds so a GET can be PUT straight back", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "blank", currency: "CAD" })).json()).id;
    const until = Date.now() + 5 * 86_400_000;
    expect((await json(`/api/proposals/${id}`, "PUT", { expiresAt: until })).status).toBe(200);
    const g = await (await req(`/api/proposals/${id}`)).json();
    expect(g.proposal.expiresAt).toBe(until);
    expect(typeof g.proposal.updatedAt).toBe("number");
    expect(g.proposal.currency).toBe("CAD");
    // The round trip the editor does on every autosave.
    const again = await json(`/api/proposals/${id}`, "PUT", { clientName: "Sam", expiresAt: g.proposal.expiresAt });
    expect(again.status).toBe(200);
    const list = await (await req("/api/proposals")).json();
    const row = list.proposals.find((p: { id: string }) => p.id === id);
    expect(typeof row.updatedAt).toBe("number");
    expect(row.expiresAt).toBe(until);
  });
});

describe("sending", () => {
  it("puts the sender's note in the email and reports expired proposals as expired", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;
    await json(`/api/proposals/${id}`, "PUT", { clientEmail: "client@example.com", expiresAt: Date.now() + 60_000 });
    const n = logs.length;
    const s = await json(`/api/proposals/${id}/send`, "POST", { message: "Hi Sam,\n\nas discussed on the call." });
    expect(s.status).toBe(200);
    const mail = logs.slice(n).join("\n");
    expect(mail).toContain("as discussed on the call.");
    expect(mail.indexOf("as discussed")).toBeLessThan(mail.indexOf("Open it here"));
    // Past its date it reads as expired in the list and frees its live slot.
    await env.DB.prepare("UPDATE proposals SET expires_at = ? WHERE id = ?").bind(Date.now() - 1000, id).run();
    const row = (await (await req("/api/proposals")).json()).proposals.find((p: { id: string }) => p.id === id);
    expect(row.status).toBe("expired");
    await env.DB.prepare("UPDATE users SET trial_ends_at = NULL WHERE id = ?").bind(userId).run();
    const live = await env.DB.prepare("SELECT count(*) AS n FROM proposals WHERE user_id = ? AND status IN ('sent','viewed') AND (expires_at IS NULL OR expires_at > ?)").bind(userId, Date.now()).first<{ n: number }>();
    expect(live!.n).toBe(0);
  });

  it("restore respects the free live limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;
      ids.push(id);
      await json(`/api/proposals/${id}/send`, "POST");
    }
    // Three live (the fourth send was refused), archive one, send the fourth, restore the archived: refused.
    await json(`/api/proposals/${ids[0]}/archive`, "POST");
    expect((await json(`/api/proposals/${ids[3]}/send`, "POST")).status).toBe(200);
    const r = await json(`/api/proposals/${ids[0]}/restore`, "POST");
    expect(r.status).toBe(402);
    expect((await r.json()).code).toBe("limit");
    for (const id of ids) await json(`/api/proposals/${id}/archive`, "POST");
  });
});

describe("acceptance record", () => {
  it("keeps the signed snapshot, refuses the owner, and edits lose to a signature", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "retainer" })).json()).id;
    await json(`/api/proposals/${id}/send`, "POST");
    const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
    const html = await (await app.request(`${APP}/p/${pub}`, { headers: { "cf-connecting-ip": "203.0.113.20" } }, env)).text();
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1]!;
    // The owner cannot sign their own proposal.
    const self = await json(`/p/${pub}/accept`, "POST", { signerName: "Me", signerEmail: "review@example.com", consent: true, selection: {}, seenHash: seen }, { origin: APP });
    expect(self.status).toBe(400);
    const a = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.21" }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(a.status).toBe(200);
    // A second signature and an edit after the fact both lose.
    const b = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.22" }, body: JSON.stringify({ signerName: "Other", signerEmail: "other@client.example", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(b.status).toBe(409);
    expect((await json(`/api/proposals/${id}`, "PUT", { title: "Changed" })).status).toBe(409);
    const rec = await (await app.request(`${APP}/p/${pub}/record.json`, { headers: { "cf-connecting-ip": "203.0.113.21" } }, env)).json();
    expect(rec.acceptance.contentHash).toBe(seen);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rec.acceptance.signedContent)))).map((x) => x.toString(16).padStart(2, "0")).join("");
    expect(digest).toBe(seen);
    // Renaming the business later does not change what was signed.
    await json("/auth/me", "PUT", { brandName: "Renamed Studio" });
    const rec2 = await (await app.request(`${APP}/p/${pub}/record.json`, { headers: { "cf-connecting-ip": "203.0.113.21" } }, env)).json();
    expect(rec2.acceptance.signedContent).toBe(rec.acceptance.signedContent);
    expect(rec2.acceptance.contentHashMatchesCurrentContent).toBe(false);
    // The record stays readable for the client after the owner archives it.
    await json(`/api/proposals/${id}/archive`, "POST");
    expect((await app.request(`${APP}/p/${pub}/record.json`, { headers: { "cf-connecting-ip": "203.0.113.21" } }, env)).status).toBe(200);
  });
});

describe("hardening", () => {
  it("refuses a cross-site magic-link redeem", async () => {
    const n = logs.length;
    await json("/auth/request", "POST", { email: "victim@example.com" });
    const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
    const evil = await app.request(`${APP}/auth/verify`, { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
    expect(evil.headers.get("location")).toBe("/login?error=invalid");
    expect(evil.headers.get("set-cookie")).toBeNull();
    // The token is untouched, so the real page still works.
    const good = await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
    expect(good.headers.get("location")).toBe("/app");
  });

  it("refuses cross-site API writes up front", async () => {
    const r = await json("/api/proposals", "POST", { template: "blank" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    const r2 = await json("/api/proposals", "POST", { template: "blank" }, { "sec-fetch-site": "cross-site" });
    expect(r2.status).toBe(403);
  });

  it("rate limits public PDF downloads and ignores unknown engagement sections", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;
    await json(`/api/proposals/${id}/send`, "POST");
    const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await app.request(`${APP}/p/${pub}/pdf`, { headers: { "cf-connecting-ip": "203.0.113.30" } }, env)).status;
    expect(last).toBe(429);
    const e = await app.request(`${APP}/p/${pub}/engage`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.31" }, body: JSON.stringify({ sections: [{ id: "intro", title: "x".repeat(300), seconds: 5 }, { id: "made-up", title: "Nope", seconds: 50 }] }) }, env);
    expect(e.status).toBe(204);
    const rows = await env.DB.prepare("SELECT section_id, seconds FROM section_time WHERE proposal_id = ?").bind(id).all<{ section_id: string; seconds: number }>();
    expect(rows.results.map((r) => r.section_id)).toEqual(["intro"]);
    await json(`/api/proposals/${id}/archive`, "POST");
  });

  it("applies a webhook id once", async () => {
    const secret = "whsec_test_secret";
    (env as any).POLAR_WEBHOOK_SECRET = secret;
    const sign = async (id: string, body: string) => {
      const ts = String(Math.floor(Date.now() / 1000));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
      return new Headers({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1," + btoa(String.fromCharCode(...mac)), "content-type": "application/json" });
    };
    const body = JSON.stringify({ type: "subscription.active", data: { status: "active", customer_id: "cus_r", metadata: { userId, plan: "pro" } } });
    const first = await app.request(`${APP}/billing/webhook`, { method: "POST", headers: await sign("msg_dup", body), body }, env);
    expect(await first.json()).toEqual({ ok: true });
    const again = await app.request(`${APP}/billing/webhook`, { method: "POST", headers: await sign("msg_dup", body), body }, env);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    // A timestamp that is not a number never passes.
    const h = await sign("msg_ts", body);
    h.set("webhook-timestamp", "abc");
    expect((await app.request(`${APP}/billing/webhook`, { method: "POST", headers: h, body }, env)).status).toBe(401);
    delete (env as any).POLAR_WEBHOOK_SECRET;
  });
});

describe("nudges", () => {
  it("reminds a client once about a proposal nobody opened after three days", async () => {
    const id = (await (await json("/api/proposals", "POST", { template: "blank" })).json()).id;
    await json(`/api/proposals/${id}`, "PUT", { clientEmail: "quiet@example.com" });
    await json(`/api/proposals/${id}/send`, "POST");
    await env.DB.prepare("UPDATE proposals SET sent_at = ? WHERE id = ?").bind(Date.now() - 4 * 86_400_000, id).run();
    const n = logs.length;
    const sent = await sendExpiryReminders(env as any);
    expect(sent).toBeGreaterThanOrEqual(1);
    expect(logs.slice(n).join("\n")).toContain("Did you get a chance to look?");
    expect(await sendExpiryReminders(env as any)).toBe(0);
    await json(`/api/proposals/${id}/archive`, "POST");
  });
});
