import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { sendExpiryReminders } from "../src/worker/lib/reminders";

// Profile defaults, extra recipients, duplicate, client questions and expiry reminders.

const APP = "http://localhost:5173";
let cookie = "";
const logs: string[] = [];

function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
}
function json(path: string, method: string, body?: unknown, extra: Record<string, string> = {}) {
  return req(path, { method, headers: { "content-type": "application/json", accept: "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const since = (n: number) => logs.slice(n).join("\n");

let id = "";
let publicId = "";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  await json("/auth/request", "POST", { email: "owner@example.com" });
  const token = new URL(logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
});

describe("profile defaults", () => {
  it("saves the sender name and colour on the profile", async () => {
    const r = await json("/auth/me", "PUT", { brandName: "Northwind Studio", brandColor: "#1F3A8A" });
    expect(r.status).toBe(200);
    const u = (await r.json()).user;
    expect(u.brandName).toBe("Northwind Studio");
    expect(u.brandColor).toBe("#1f3a8a");
    expect((await json("/auth/me", "PUT", { brandColor: "red" })).status).toBe(400);
  });
});

describe("recipients and sending", () => {
  it("stores extra recipients and emails everyone once", async () => {
    const c = await json("/api/proposals", "POST", { template: "retainer" });
    id = (await c.json()).id;
    publicId = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
    // The client address is never duplicated into the extra list.
    const r = await json(`/api/proposals/${id}`, "PUT", { clientEmail: "cfo@client.example", ccEmails: ["ops@client.example", "cfo@client.example", "ops@client.example"], expiresAt: Date.now() + 2 * 86_400_000 });
    expect(r.status).toBe(200);
    const g = await (await req(`/api/proposals/${id}`)).json();
    expect(g.proposal.ccEmails).toEqual(["ops@client.example"]);
    expect(g.proposal.remind).toBe(true);

    const n = logs.length;
    const s = await json(`/api/proposals/${id}/send`, "POST");
    expect(s.status).toBe(200);
    const mail = since(n);
    expect(mail).toContain("To:      cfo@client.example, ops@client.example");
    expect(mail).toContain("Reply-to: owner@example.com");
    expect(mail).toContain("Northwind Studio sent you a proposal:");
  });

  it("uses a per-proposal sender name when set", async () => {
    const u = await json(`/api/proposals/${id}`, "PUT", { senderName: "Alex at Northwind" });
    expect([u.status, await u.text()]).toEqual([200, expect.any(String)]);
    const page = await app.request(`${APP}/p/${publicId}`, {}, env);
    const html = await page.text();
    expect(html).toContain("By Alex at Northwind");
    expect(html).toContain("Valid for 2 more days");
    expect(html).toContain("Have a question?");
  });
});

describe("client questions", () => {
  it("rejects cross-site posts and swallows bots", async () => {
    const x = await json(`/p/${publicId}/ask`, "POST", { name: "Sam", body: "Is delivery included?" }, { origin: "https://evil.example" });
    expect([x.status, await x.text()]).toEqual([400, expect.any(String)]);
    const bot = await json(`/p/${publicId}/ask`, "POST", { name: "Bot", body: "buy now", website: "x" });
    expect(bot.status).toBe(400); // honeypot must be empty to even validate
    expect((await (await req(`/api/proposals/${id}/messages`)).json()).messages).toHaveLength(0);
  });

  it("stores a question, emails the sender with reply-to, and shows it once as unread", async () => {
    const n = logs.length;
    const a = await json(`/p/${publicId}/ask`, "POST", { name: "Sam Client", email: "sam@client.example", body: "Is delivery included?", website: "" }, { origin: APP });
    expect(a.status).toBe(200);
    const mail = since(n);
    expect(mail).toContain("To:      owner@example.com");
    expect(mail).toContain("Reply-to: sam@client.example");
    expect(mail).toContain("Is delivery included?");

    const list = await (await req("/api/proposals")).json();
    expect(list.proposals.find((p: { id: string }) => p.id === id)).toMatchObject({ unreadQuestions: 1, viewCount: 1 });
    const m = (await (await req(`/api/proposals/${id}/messages`)).json()).messages;
    expect(m).toHaveLength(1);
    expect(m[0].unread).toBe(true);
    const again = (await (await req(`/api/proposals/${id}/messages`)).json()).messages;
    expect(again[0].unread).toBe(false);
  });
});

describe("expiry reminders", () => {
  it("sends one reminder to every recipient, once, and respects the switch", async () => {
    const n = logs.length;
    expect(await sendExpiryReminders(env as any)).toBe(1);
    const mail = since(n);
    expect(mail).toContain("Reminder:");
    expect(mail).toContain("To:      cfo@client.example, ops@client.example");
    expect(mail).toContain("Alex at Northwind");
    expect(await sendExpiryReminders(env as any)).toBe(0);

    // A second proposal with reminders off is skipped.
    const c = await json("/api/proposals", "POST", { template: "blank" });
    const { id: id2 } = await c.json();
    await json(`/api/proposals/${id2}`, "PUT", { clientEmail: "a@b.example", expiresAt: Date.now() + 86_400_000, remind: false });
    await json(`/api/proposals/${id2}/send`, "POST");
    expect(await sendExpiryReminders(env as any)).toBe(0);
  });
});

describe("duplicate", () => {
  it("copies content, pricing and details as a new draft", async () => {
    const d = await json(`/api/proposals/${id}/duplicate`, "POST");
    expect(d.status).toBe(201);
    const { id: copyId } = await d.json();
    const g = await (await req(`/api/proposals/${copyId}`)).json();
    expect(g.proposal.title).toBe("Monthly retainer (copy)");
    expect(g.proposal.status).toBe("draft");
    expect(g.proposal.clientEmail).toBe("cfo@client.example");
    expect(g.proposal.ccEmails).toEqual(["ops@client.example"]);
    expect(g.proposal.senderName).toBe("Alex at Northwind");
    expect(g.items).toHaveLength(2);
    expect(g.items.map((i: { id: string }) => i.id)).not.toContain((await (await req(`/api/proposals/${id}`)).json()).items[0].id);
    expect(g.proposal.publicId).not.toBe(publicId);
  });
});

describe("section navigation", () => {
  it("keeps a hidden heading out of the client nav", async () => {
    const c = await json("/api/proposals", "POST", { template: "web-project" });
    const { id: pid } = await c.json();
    const g = await (await req(`/api/proposals/${pid}`)).json();
    const h2 = (g.proposal.content as any[]).find((b) => b.type === "heading" && String(b.content) === "How it works" || (Array.isArray(b.content) && b.content[0]?.text === "How it works"));
    expect(h2?.id, "headings get stable ids when a proposal is created").toBeTruthy();
    await json(`/api/proposals/${pid}`, "PUT", { navHidden: [h2.id], clientEmail: "x@y.example" });
    await json(`/api/proposals/${pid}/send`, "POST");
    const html = await (await app.request(`${APP}/p/${g.proposal.publicId}`, {}, env)).text();
    const nav = html.match(/<div class="links">([\s\S]*?)<\/div>/)![1]!;
    expect(nav).toContain("What you get");
    expect(nav).not.toContain("How it works");
  });
});

describe("engagement analytics", () => {
  it("sums seconds per section from client beacons, never from the sender, and reports the full picture", async () => {
    const g = await (await req(`/api/proposals/${id}`)).json();
    const pubId = g.proposal.publicId;
    const h2 = (g.proposal.content as any[]).find((b) => b.type === "heading");
    const beacon = (body: unknown, extra: Record<string, string> = {}) =>
      app.request(`${APP}/p/${pubId}/engage`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.7", ...extra }, body: JSON.stringify(body) }, env);
    expect((await beacon({ sections: [{ id: h2.id, title: "What is included", seconds: 20 }, { id: "intro", title: "Introduction", seconds: 5 }] })).status).toBe(204);
    expect((await beacon({ sections: [{ id: h2.id, title: "What is included", seconds: 15 }] })).status).toBe(204);
    // Out-of-range or malformed reports are dropped quietly.
    expect((await beacon({ sections: [{ id: h2.id, title: "x", seconds: 9999 }] })).status).toBe(204);
    // The sender reading their own proposal does not count.
    expect((await req(`/p/${pubId}/engage`, { method: "POST", body: JSON.stringify({ sections: [{ id: h2.id, title: "x", seconds: 50 }] }) })).status).toBe(204);

    const a = await (await req(`/api/proposals/${id}/analytics`)).json();
    const sec = a.sections.find((s: { id: string }) => s.id === h2.id);
    expect(sec.seconds).toBe(35);
    expect(a.sections.find((s: { id: string }) => s.id === "intro").seconds).toBe(5);
    expect(a.readSeconds).toBe(40);
    expect(a.opens).toBeGreaterThan(0);
    expect(a.people).toBeGreaterThan(0);
    expect(a.byDay).toHaveLength(14);
    expect(a.byDay[13].opens).toBeGreaterThan(0);
    expect(a.devices.phone + a.devices.desktop).toBe(a.opens);
    expect(a.questions).toBe(1);

    const row = (await (await req("/api/proposals")).json()).proposals.find((p: { id: string }) => p.id === id);
    expect(row).toMatchObject({ readSeconds: 40 });
    expect(row.uniqueViewers).toBeGreaterThan(0);
    expect(row.lastViewedAt).toBeGreaterThan(0);
  });
});

describe("page styles", () => {
  it("templates carry a style, previews accept one, proposals keep theirs", async () => {
    const pv = await (await app.request(`${APP}/t/consulting`, {}, env)).text();
    expect(pv).toContain('data-style="editorial"');
    const pv2 = await (await app.request(`${APP}/t/consulting?style=night`, {}, env)).text();
    expect(pv2).toContain('data-style="night"');
    expect(pv2).toContain('color-scheme" content="dark"');
    const bad = await (await app.request(`${APP}/t/consulting?style=nope`, {}, env)).text();
    expect(bad).toContain('data-style="editorial"');

    const c = await json("/api/proposals", "POST", { template: "software", style: "warm" });
    const { id: pid } = await c.json();
    let g = await (await req(`/api/proposals/${pid}`)).json();
    expect(g.proposal.style).toBe("warm");
    expect((await json(`/api/proposals/${pid}`, "PUT", { style: "bold" })).status).toBe(200);
    expect((await json(`/api/proposals/${pid}`, "PUT", { style: "sparkly" })).status).toBe(400);
    g = await (await req(`/api/proposals/${pid}`)).json();
    expect(g.proposal.style).toBe("bold");
    const owner = await (await req(`/p/${g.proposal.publicId}`)).text();
    expect(owner).toContain('data-style="bold"');
    const d = await (await json(`/api/proposals/${pid}/duplicate`, "POST")).json();
    expect((await (await req(`/api/proposals/${d.id}`)).json()).proposal.style).toBe("bold");
  });
});

describe("saved templates", () => {
  it("saves a proposal as a template, lists it, starts from it, previews it, deletes it", async () => {
    const c = await json("/api/proposals", "POST", { template: "photography", style: "warm", accentColor: "#c11574" });
    const { id: pid } = await c.json();
    expect((await json("/api/templates", "POST", { proposalId: pid, name: "" })).status).toBe(400);
    const s = await json("/api/templates", "POST", { proposalId: pid, name: "Shoot, standard" });
    expect(s.status).toBe(201);
    const { id: tid } = await s.json();
    const list = (await (await req("/api/templates")).json()).templates;
    expect(list.map((t: { name: string }) => t.name)).toContain("Shoot, standard");

    const pv = await req(`/t/u/${tid}?thumb=1`);
    expect(pv.status).toBe(200);
    const html = await pv.text();
    expect(html).toContain('data-style="warm"');
    expect(html).toContain("Brand photography");
    expect(html).not.toContain("Back to templates");
    expect((await app.request(`${APP}/t/u/${tid}`, {}, env)).status).toBe(401);

    const made = await json("/api/proposals", "POST", { userTemplate: tid });
    expect(made.status).toBe(201);
    const g = await (await req(`/api/proposals/${(await made.json()).id}`)).json();
    expect(g.proposal.title).toBe("Brand photography");
    expect(g.proposal.style).toBe("warm");
    expect(g.proposal.accentColor).toBe("#c11574");
    expect(g.items).toHaveLength(4);
    expect(g.proposal.clientName).toBeNull();

    expect((await json(`/api/templates/${tid}`, "DELETE")).status).toBe(200);
    expect((await json("/api/proposals", "POST", { userTemplate: tid })).status).toBe(404);
  });

  it("never shows an email address as the business name", async () => {
    await json("/auth/me", "PUT", { brandName: "owner@example.com" });
    const pv = await (await req("/t/blank")).text();
    expect(pv).not.toContain("owner@example.com");
    expect(pv).toContain("Your business");
    await json("/auth/me", "PUT", { brandName: "Northwind Studio" });
  });
});

describe("team notifications", () => {
  it("tells the owner, the profile team and the proposal extras when a client signs or asks", async () => {
    expect((await json("/auth/me", "PUT", { notifyEmails: ["ops@northwind.example", "owner@example.com", "ops@northwind.example"] })).status).toBe(200);
    expect((await (await req("/auth/me")).json()).user.notifyEmails).toEqual(["ops@northwind.example"]);
    // Extra addresses are honoured on paid plans only; this account pays.
    await env.DB.prepare("UPDATE users SET plan = ? WHERE email = ?").bind("pro", "owner@example.com").run();
    const c = await json("/api/proposals", "POST", { template: "retainer" });
    const { id: pid } = await c.json();
    await json(`/api/proposals/${pid}`, "PUT", { clientEmail: "buyer@client.example", notifyEmails: ["accounts@northwind.example"] });
    // The free plan allows three live proposals; park the ones earlier tests sent.
    for (const p of (await (await req("/api/proposals")).json()).proposals) if ((p.status === "sent" || p.status === "viewed") && p.id !== pid) await json(`/api/proposals/${p.id}/archive`, "POST");
    expect((await json(`/api/proposals/${pid}/send`, "POST")).status).toBe(200);
    const pub = (await (await req(`/api/proposals/${pid}`)).json()).proposal.publicId;
    const html = await (await app.request(`${APP}/p/${pub}`, {}, env)).text();
    const m = html.match(/name="seenHash" id="seenHash" value="([0-9a-f]+)"/);
    if (!m) console.error("DBG page:", html.replace(/<style[^]*?<\/style>/g, "").slice(0, 700));
    const seen = m![1];
    const n = logs.length;
    const a = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.5" }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(a.status).toBe(200);
    const mail = since(n);
    expect(mail).toContain("To:      owner@example.com, ops@northwind.example, accounts@northwind.example");
    expect(mail).toContain("Accepted:");
  });
});
