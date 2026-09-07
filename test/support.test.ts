import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

// Images in proposals, the contact form and its tickets, the admin area, and marketing consent.

const APP = "http://localhost:5173";
const logs: string[] = [];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

async function signIn(email: string, marketing = false): Promise<string> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.60" }, body: JSON.stringify({ email, marketing }) }, env);
  const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  return (v.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const as = (cookie: string) => (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
};
const jsonAs = (cookie: string) => (path: string, method: string, body?: unknown) =>
  as(cookie)(path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

let owner = "";
let ownerId = "";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  owner = await signIn("images@example.com");
  ownerId = (await (await as(owner)("/auth/me")).json()).user.id;
});

describe("images in proposals", () => {
  it("uploads, dedupes, serves sandboxed, and stops at the plan quota", async () => {
    const up = async (bytes: Uint8Array, name = "pic.png") => {
      const fd = new FormData();
      fd.set("file", new Blob([bytes], { type: "image/png" }), name);
      return as(owner)("/api/account/images", { method: "POST", body: fd });
    };
    const first = await (await up(PNG)).json();
    expect(first.url).toMatch(/^\/files\/images\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
    expect(first.quota).toBe(200); // trial reads as Pro
    const again = await (await up(PNG)).json();
    expect(again.url).toBe(first.url); // same bytes, same file
    const served = await app.request(`${APP}${first.url}`, {}, env);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    const fake = new FormData();
    fake.set("file", new Blob([new TextEncoder().encode("<svg onload=alert(1)>")], { type: "image/png" }), "x.png");
    expect((await as(owner)("/api/account/images", { method: "POST", body: fake })).status).toBe(415);
    // Free keeps 10.
    await env.DB.prepare("UPDATE users SET trial_ends_at = NULL WHERE id = ?").bind(ownerId).run();
    expect((await (await as(owner)("/api/account/images")).json()).quota).toBe(10);
    for (let i = 0; i < 9; i++) {
      const b = new Uint8Array(PNG);
      b[b.length - 1] = i + 1; // distinct bytes
      expect((await up(b)).status).toBe(200);
    }
    const over = new Uint8Array(PNG);
    over[over.length - 1] = 99;
    const r = await up(over);
    expect(r.status).toBe(402);
    expect((await r.json()).code).toBe("plan");
    await env.DB.prepare("UPDATE users SET trial_ends_at = ? WHERE id = ?").bind(Date.now() + 86_400_000, ownerId).run();
  });
});

describe("contact and admin", () => {
  it("opens a ticket from the contact page, emails both sides, and lets an admin reply and close", async () => {
    expect((await app.request(`${APP}/contact`, {}, env)).status).toBe(200);
    const n = logs.length;
    const r = await app.request(`${APP}/api/contact`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "cf-connecting-ip": "203.0.113.61" }, body: JSON.stringify({ name: "Pat Client", email: "pat@example.com", kind: "billing", subject: "Invoice question", message: "Can I get a receipt for last month?" }) }, env);
    const text = await r.text();
    expect(r.status + " " + text).toMatch(/^200 /);
    const { ref } = JSON.parse(text);
    const mail = logs.slice(n).join("\n");
    expect(mail).toContain("[billing] Invoice question");
    expect(mail).toContain("We got your message");
    expect(mail).toContain(ref);
    // Honeypot: quiet yes, nothing stored.
    const bot = await app.request(`${APP}/api/contact`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "cf-connecting-ip": "203.0.113.62" }, body: JSON.stringify({ name: "Bot", email: "bot@example.com", subject: "x", message: "buy now buy now", website: "http://spam" }) }, env);
    expect(bot.status).toBe(200);

    // Not an admin: the area does not exist.
    expect((await as(owner)("/api/admin/overview")).status).toBe(404);
    (env as any).ADMIN_EMAILS = "boss@quoteandsign.com, images@example.com";
    const me = (await (await as(owner)("/auth/me")).json()).user;
    expect(me.isAdmin).toBe(true);
    const ov = await (await as(owner)("/api/admin/overview")).json();
    expect(ov.openTickets).toBeGreaterThanOrEqual(1);
    expect(ov.storageBytes).toBeGreaterThan(0);
    expect(ov.storageLimitBytes).toBe(500 * 1024 * 1024);
    const list = (await (await as(owner)("/api/admin/tickets")).json()).tickets;
    const t = list.find((x: { subject: string }) => x.subject === "Invoice question");
    expect(t).toBeTruthy();
    expect(t.ipHash).toBeUndefined();
    const m = logs.length;
    expect((await jsonAs(owner)(`/api/admin/tickets/${t.id}/reply`, "POST", { body: "Sure, it is attached to your Polar receipt email.", close: true })).status).toBe(200);
    expect(logs.slice(m).join("\n")).toContain("Re: Invoice question");
    const thread = await (await as(owner)(`/api/admin/tickets/${t.id}`)).json();
    expect(thread.ticket.status).toBe("closed");
    expect(thread.messages.map((x: { from: string }) => x.from)).toEqual(["customer", "admin"]);
    const csv = await as(owner)("/api/admin/subscribers.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    delete (env as any).ADMIN_EMAILS;
    expect((await as(owner)("/api/admin/overview")).status).toBe(404);
  });
});

describe("marketing consent", () => {
  it("is off unless the box was ticked, becomes consent when the link is used, and can be withdrawn", async () => {
    const quiet = await signIn("quiet@example.com");
    expect((await (await as(quiet)("/auth/me")).json()).user.marketingOptIn).toBe(false);
    const keen = await signIn("keen@example.com", true);
    expect((await (await as(keen)("/auth/me")).json()).user.marketingOptIn).toBe(true);
    const row = await env.DB.prepare("SELECT marketing_opt_in_at AS at, marketing_opt_in_ip_hash AS ip FROM users WHERE email = ?").bind("keen@example.com").first<{ at: number; ip: string }>();
    expect(row!.at).toBeGreaterThan(0);
    expect(row!.ip).toBeTruthy();
    expect((await jsonAs(keen)("/auth/me", "PUT", { marketingOptIn: false })).status).toBe(200);
    expect((await (await as(keen)("/auth/me")).json()).user.marketingOptIn).toBe(false);
  });
});
