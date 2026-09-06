import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";

// Regression tests for the pre-publication security pass: the seams between accounts.

const APP = "http://localhost:5173";
const logs: string[] = [];
type Session = { cookie: string; id: string };

async function signIn(email: string): Promise<Session> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.77" }, body: JSON.stringify({ email }) }, env);
  const token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
  const cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  const me = await (await app.request(`${APP}/auth/me`, { headers: { cookie } }, env)).json();
  return { cookie, id: me.user.id };
}
const as = (s: Session) => (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  app.request(`${APP}${path}`, { method, headers: { cookie: s.cookie, "content-type": "application/json", accept: "application/json", origin: APP, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }, env);

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
});

describe("billing webhook cannot be pointed at another account", () => {
  it("ignores events that match only by email, and never re-links a linked account", async () => {
    const victim = await signIn("victim@example.com");
    const r = await applyPolarEvent(env as any, { type: "order.paid", data: { customer: { id: "cus_attacker", email: "victim@example.com" }, metadata: { plan: "business" } } });
    expect(r).toBeNull();
    expect((await (await as(victim)("/auth/me")).json()).user.paidPlan).toBe("free");
    // A legitimate checkout links the account; a later event for a different customer without our userId does not move it.
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_victim", metadata: { userId: victim.id, plan: "pro" } } });
    expect((await (await as(victim)("/auth/me")).json()).user.paidPlan).toBe("pro");
    expect(await applyPolarEvent(env as any, { type: "subscription.revoked", data: { status: "revoked", customer_id: "cus_other" } })).toBeNull();
    expect((await (await as(victim)("/auth/me")).json()).user.paidPlan).toBe("pro");
  });
});

describe("team joins are explicit", () => {
  it("needs the invitation id, and a team owner cannot be pulled into another team", async () => {
    const boss = await signIn("boss@agency.example");
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_boss", metadata: { userId: boss.id, plan: "business" } } });
    const rival = await signIn("rival@agency.example");
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_rival", metadata: { userId: rival.id, plan: "business" } } });
    const person = await signIn("person@agency.example");
    expect((await as(boss)("/api/team/invite", "POST", { email: "person@agency.example" })).status).toBe(201);
    expect((await as(rival)("/api/team/invite", "POST", { email: "person@agency.example" })).status).toBe(201);
    const invite = (await (await as(person)("/auth/me")).json()).user.pendingInvite;
    expect(typeof invite.id).toBe("string");
    expect((await as(person)("/api/team/join", "POST", {})).status).toBe(400);
    expect((await as(person)("/api/team/join", "POST", { inviteId: "not-an-invite" })).status).toBe(404);
    expect((await as(person)("/api/team/join", "POST", { inviteId: invite.id })).status).toBe(200);
    expect((await (await as(person)("/auth/me")).json()).user.workspace).not.toBeNull();
    // The rival, who runs a team, invites the boss; the boss cannot join and lose their own account.
    expect((await as(rival)("/api/team/invite", "POST", { email: "boss@agency.example" })).status).toBe(201);
    const bossInvite = (await (await as(boss)("/auth/me")).json()).user.pendingInvite;
    expect((await as(boss)("/api/team/join", "POST", { inviteId: bossInvite.id })).status).toBe(409);
    expect((await (await as(boss)("/auth/me")).json()).user.workspace).toBeNull();
  });

  it("a member who deletes their account stops receiving the owner's mail", async () => {
    const owner = await signIn("owner2@agency.example");
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_owner2", metadata: { userId: owner.id, plan: "business" } } });
    const member = await signIn("leaver@agency.example");
    expect((await as(owner)("/api/team/invite", "POST", { email: "leaver@agency.example" })).status).toBe(201);
    const invite = (await (await as(member)("/auth/me")).json()).user.pendingInvite;
    expect((await as(member)("/api/team/join", "POST", { inviteId: invite.id })).status).toBe(200);
    // Leave the workspace to delete the own account (delete is owner-only), then check the roster.
    expect((await as(member)("/api/team/leave", "POST")).status).toBe(200);
    const n = logs.length;
    expect((await as(member)("/api/account/delete-code", "POST")).status).toBe(200);
    const code = /Your code is (\d{6})/.exec(logs.slice(n).join("\n"))![1];
    expect((await as(member)("/api/account", "DELETE", { code })).status).toBe(200);
    const roster = await (await as(owner)("/api/team")).json();
    expect(roster.members.some((m: { email: string }) => m.email === "leaver@agency.example")).toBe(false);
  });
});

describe("deletion code cannot be guessed", () => {
  it("five wrong guesses void every outstanding code", async () => {
    const u = await signIn("guess@example.com");
    const n = logs.length;
    expect((await as(u)("/api/account/delete-code", "POST")).status).toBe(200);
    const code = /Your code is (\d{6})/.exec(logs.slice(n).join("\n"))![1];
    for (let i = 0; i < 5; i++) expect((await as(u)("/api/account", "DELETE", { code: "000000" })).status).toBe(400);
    expect((await as(u)("/api/account", "DELETE", { code: "000000" })).status).toBe(429);
    // Even the real code is dead now.
    expect((await as(u)("/api/account", "DELETE", { code })).status).toBe(429);
    expect((await (await as(u)("/auth/me")).json()).user).not.toBeNull();
  });
});

describe("public page hardening", () => {
  it("a password change logs every reader out, and titles never carry line breaks", async () => {
    const u = await signIn("sender@example.com");
    const created = await (await as(u)("/api/proposals", "POST", { template: "blank" })).json();
    expect((await as(u)(`/api/proposals/${created.id}`, "PUT", { title: "Line one\r\nBcc: x@evil.example", clientName: "Acme\nCo", password: "first" })).status).toBe(200);
    const saved = await (await as(u)(`/api/proposals/${created.id}`)).json();
    expect(saved.proposal.title).toBe("Line one Bcc: x@evil.example");
    expect(saved.proposal.clientName).toBe("Acme Co");
    await as(u)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const pub = saved.proposal.publicId;
    const unlock = await app.request(`${APP}/p/${pub}/unlock`, { method: "POST", headers: { origin: APP }, body: new URLSearchParams({ password: "first" }), redirect: "manual" }, env);
    const cookie = (unlock.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(cookie).toMatch(/^op_unlock_/);
    expect((await app.request(`${APP}/p/${pub}`, { headers: { cookie } }, env)).status).toBe(200);
    expect((await as(u)(`/api/proposals/${created.id}`, "PUT", { password: "second" })).status).toBe(200);
    const again = await app.request(`${APP}/p/${pub}`, { headers: { cookie } }, env);
    expect(await again.text()).toContain("password");
    // A cross-site post cannot spend the reader's unlock attempts.
    const foreign = await app.request(`${APP}/p/${pub}/unlock`, { method: "POST", headers: { origin: "https://evil.example" }, body: new URLSearchParams({ password: "second" }), redirect: "manual" }, env);
    expect(foreign.headers.get("set-cookie")).toBeNull();
  });

  it("an unsigned PDF is a paid feature for everyone with the link", async () => {
    const u = await signIn("freepdf@example.com");
    // End the trial so the account reads as free.
    const created = await (await as(u)("/api/proposals", "POST", { template: "blank" })).json();
    await as(u)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const pub = (await (await as(u)(`/api/proposals/${created.id}`)).json()).proposal.publicId;
    const { getDb, schema } = await import("../src/worker/lib/db");
    const { eq } = await import("drizzle-orm");
    await getDb(env.DB).update(schema.users).set({ trialEndsAt: new Date(0) }).where(eq(schema.users.id, u.id));
    expect((await app.request(`${APP}/p/${pub}/pdf`, {}, env)).status).toBe(402);
  });

  it("the signer copy carries a payment button only for paid accounts or addressed signers", async () => {
    const u = await signIn("trialpay@example.com");
    expect((await as(u)("/auth/me", "PUT", { paymentUrl: "https://pay.example.com/deposit", brandName: "Trial Co" })).status).toBe(200);
    const created = await (await as(u)("/api/proposals", "POST", { template: "blank" })).json();
    await as(u)(`/api/proposals/${created.id}`, "PUT", { clientEmail: "real@client.example" });
    await as(u)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const pub = (await (await as(u)(`/api/proposals/${created.id}`)).json()).proposal.publicId;
    const html = await (await app.request(`${APP}/p/${pub}`, {}, env)).text();
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1];
    const n = logs.length;
    const a = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ signerName: "Stranger", signerEmail: "stranger@elsewhere.example", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(a.status).toBe(200);
    const mail = logs.slice(n).join("\n");
    expect(mail).toContain("stranger@elsewhere.example");
    expect(mail).not.toContain("pay.example.com/deposit");
  });
});
