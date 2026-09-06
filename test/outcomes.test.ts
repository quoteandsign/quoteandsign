import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";

// Outcomes beyond the online signature: marked by hand, declined by the client,
// a payment link once signed, no footer on paid plans, and the owner's framed phone preview.

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
const client = (path: string, init: RequestInit = {}) => app.request(`${APP}${path}`, { ...init, headers: { "cf-connecting-ip": "203.0.113.40", ...(init.headers as Record<string, string>) } }, env);

let userId = "";

async function sent(template = "blank"): Promise<{ id: string; pub: string }> {
  const id = (await (await json("/api/proposals", "POST", { template })).json()).id;
  await json(`/api/proposals/${id}`, "PUT", { clientName: "Sam Client", clientEmail: "sam@client.example" });
  expect((await json(`/api/proposals/${id}/send`, "POST")).status).toBe(200);
  const pub = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;
  return { id, pub };
}

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  await json("/auth/request", "POST", { email: "outcomes@example.com" });
  const token = new URL(logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  userId = (await (await req("/auth/me")).json()).user.id;
  await json("/auth/me", "PUT", { brandName: "Outcome Studio" });
});

describe("declining", () => {
  it("lets the client say no with a reason, tells the sender, and the sender can reopen by sending again", async () => {
    const { id, pub } = await sent("retainer");
    const n = logs.length;
    const d = await client(`/p/${pub}/decline`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ reason: "Budget moved to next quarter." }) });
    expect(d.status).toBe(200);
    expect(logs.slice(n).join("\n")).toContain("Budget moved to next quarter.");
    const row = (await (await req("/api/proposals")).json()).proposals.find((p: { id: string }) => p.id === id);
    expect(row.status).toBe("declined");
    expect(row.declineReason).toBe("Budget moved to next quarter.");
    // The page says so and no longer offers the form; accepting is refused.
    const page = await (await client(`/p/${pub}`)).text();
    expect(page).toContain("You passed on this one");
    expect(page).not.toContain('id="acceptForm"');
    const seen = "0".repeat(64);
    const a = await client(`/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP }, body: JSON.stringify({ signerName: "Sam", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) });
    expect(a.status).toBe(410);
    // Declined does not count as live; sending again reopens it.
    expect((await json(`/api/proposals/${id}/send`, "POST")).status).toBe(200);
    expect((await (await req(`/api/proposals/${id}`)).json()).proposal.status).toBe("sent");
    await json(`/api/proposals/${id}/archive`, "POST");
  });

  it("the sender can mark declined, reopen, and mark accepted by hand with a manual record", async () => {
    const { id, pub } = await sent("retainer");
    expect((await json(`/api/proposals/${id}/mark`, "POST", { status: "declined", reason: "Went with someone else" })).status).toBe(200);
    expect((await (await req(`/api/proposals/${id}`)).json()).proposal.status).toBe("declined");
    expect((await (await json(`/api/proposals/${id}/mark`, "POST", { status: "open" })).json()).status).toBe("sent");
    const m = await json(`/api/proposals/${id}/mark`, "POST", { status: "accepted" });
    expect(m.status).toBe(200);
    const g = await (await req(`/api/proposals/${id}`)).json();
    expect(g.proposal.status).toBe("accepted");
    expect(g.acceptance.method).toBe("manual");
    expect(g.acceptance.signerName).toBe("Sam Client");
    expect(g.acceptance.recurring[0].period).toBe("month");
    expect(g.acceptance.recurring[0].total).toBeGreaterThan(0);
    expect(g.acceptance.consentText).toContain("Marked as accepted by the sender");
    // The record is honest about how it came to be, and cannot be signed twice or declined after.
    const rec = await (await client(`/p/${pub}/record.json`)).json();
    expect(rec.acceptance.consentText).toContain("outside Quote and Sign");
    expect((await json(`/api/proposals/${id}/mark`, "POST", { status: "declined" })).status).toBe(409);
    expect((await json(`/api/proposals/${id}/mark`, "POST", { status: "accepted" })).status).toBe(409);
  });
});

describe("after signing", () => {
  it("shows the payment button on the accepted page and in the signed copy, proposal link over brand link", async () => {
    expect((await json("/auth/me", "PUT", { paymentUrl: "http://insecure.example/pay" })).status).toBe(400);
    expect((await json("/auth/me", "PUT", { paymentUrl: "https://pay.example/brand" })).status).toBe(200);
    expect((await (await req("/auth/me")).json()).user.paymentUrl).toBe("https://pay.example/brand");
    const { id, pub } = await sent("retainer");
    await json(`/api/proposals/${id}`, "PUT", { paymentUrl: "https://pay.example/this-one", paymentLabel: "Pay the 30% deposit" });
    const html = await (await client(`/p/${pub}`)).text();
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1]!;
    expect(html).toContain('id="declineOpen"');
    const n = logs.length;
    const a = await client(`/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP }, body: JSON.stringify({ signerName: "Sam Client", signerEmail: "sam@client.example", consent: true, selection: {}, seenHash: seen }) });
    expect(a.status).toBe(200);
    const done = await (await client(`/p/${pub}`)).text();
    expect(done).toContain('href="https://pay.example/this-one"');
    expect(done).toContain("Pay the 30% deposit");
    const mail = logs.slice(n).join("\n");
    expect(mail).toContain("Pay the 30% deposit: https://pay.example/this-one");
    // Both parties get the signed PDF attached.
    expect(mail.match(/Attachment: .*-signed\.pdf/g)?.length).toBe(2);
    expect(mail).toContain("Your signed copy is attached as a PDF.");
    await json("/auth/me", "PUT", { paymentUrl: null });
  });

  it("shows the Made with footer by default, lets paid plans switch it off, and frames the owner's phone preview only", async () => {
    const { pub } = await sent("blank");
    // On by default everywhere; a paid plan may turn it off; Free cannot.
    expect(await (await client(`/p/${pub}`)).text()).toContain("Made with");
    await env.DB.prepare("UPDATE users SET trial_ends_at = NULL WHERE id = ?").bind(userId).run();
    expect((await json("/auth/me", "PUT", { hideMadeWith: true })).status).toBe(402);
    expect(await (await client(`/p/${pub}`)).text()).toContain("Made with");
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_o", metadata: { userId, plan: "pro" } } });
    expect((await json("/auth/me", "PUT", { hideMadeWith: true })).status).toBe(200);
    expect(await (await client(`/p/${pub}`)).text()).not.toContain("Made with");
    // Framing: only the owner, only when asked.
    const anon = await client(`/p/${pub}?frame=1`);
    expect(anon.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const own = await req(`/p/${pub}?frame=1`);
    expect(own.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(own.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(await own.text()).not.toContain("Back to the editor");
  });
});

describe("big accounts", () => {
  it("lists and exports more than a hundred proposals (D1 binds at most 100 variables)", async () => {
    const stmt = env.DB.prepare("INSERT INTO proposals (id, public_id, user_id, title, currency, content, status, created_at, updated_at) VALUES (?, ?, ?, 'Bulk', 'USD', '[]', 'draft', ?, ?)");
    const now = Date.now();
    await env.DB.batch(Array.from({ length: 120 }, (_, i) => stmt.bind(`bulk-${i}-${userId}`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, userId, now, now)));
    const list = await req("/api/proposals");
    expect(list.status).toBe(200);
    expect((await list.json()).proposals.length).toBeGreaterThan(100);
    const exp = await req("/api/account/export");
    expect(exp.status).toBe(200);
    expect((await exp.json()).proposals.length).toBeGreaterThan(100);
  });
});

describe("pricing copy", () => {
  it("never prints a dash for an unpriced line; zero-start lines show their unit price", async () => {
    const html = await (await client("/t/photography")).text();
    expect(html).not.toContain("—");
    expect(html).toContain('>at</span> <span data-unit="t1">$25.00 USD per photo</span>');
    expect(html).toContain('>×</span> <span data-unit="t2">$90.00 USD per person</span>');
  });
});
