import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";

// Regression tests for the pre-publication security pass: the seams between accounts.

const APP = "http://localhost:5173";
const logs: string[] = [];
type Session = { cookie: string; id: string };

async function signIn(email: string, ip = "203.0.113.77"): Promise<Session> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ email }) }, env);
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

  it("the signer copy carries a payment button only for paid accounts", async () => {
    const u = await signIn("trialpay@example.com");
    expect((await as(u)("/auth/me", "PUT", { paymentUrl: "https://pay.example.com/deposit", brandName: "Trial Co" })).status).toBe(402);
    // Even a link left over from a paid period stays out of the email once the account is not paid.
    await env.DB.prepare("UPDATE users SET payment_url = ? WHERE id = ?").bind("https://pay.example.com/deposit", u.id).run();
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

describe("abuse limits", () => {
  it("one trial per inbox: +tags and Gmail dots do not start a new one", async () => {
    const { trialIdentity } = await import("../src/worker/routes/auth");
    expect(trialIdentity("Me.Name+promo@GMail.com")).toBe("mename@gmail.com");
    expect(trialIdentity("me+x@googlemail.com")).toBe("me@gmail.com");
    expect(trialIdentity("first.last+x@company.example")).toBe("first.last@company.example");
    const a = await signIn("dupe@gmail.com", "203.0.113.92");
    await env.DB.prepare("UPDATE users SET trial_ends_at = 1000 WHERE id = ?").bind(a.id).run();
    const b = await signIn("d.u.p.e+again@gmail.com", "203.0.113.93");
    expect(b.id).not.toBe(a.id);
    const row = await env.DB.prepare("SELECT trial_ends_at AS t FROM users WHERE id = ?").bind(b.id).first<{ t: number }>();
    expect(row?.t).toBe(1000);
  });

  it("an admin can disable an account and take a page down", async () => {
    (env as any).ADMIN_EMAILS = "boss@example.com";
    try {
      const boss = await signIn("boss@example.com", "203.0.113.90");
      const bad = await signIn("baddie@example.com", "203.0.113.91");
      const created = await (await as(bad)("/api/proposals", "POST", { template: "blank" })).json();
      await as(bad)(`/api/proposals/${created.id}/send`, "POST", { email: false });
      const pub = (await (await as(bad)(`/api/proposals/${created.id}`)).json()).proposal.publicId;
      expect((await app.request(`${APP}/p/${pub}`, {}, env)).status).toBe(200);
      // A page comes down by its link.
      expect((await as(boss)("/api/admin/takedown", "POST", { link: `https://quoteandsign.com/p/${pub}` })).status).toBe(200);
      expect((await app.request(`${APP}/p/${pub}`, {}, env)).status).toBe(410);
      // Disabling ends the session and the account cannot come back.
      expect((await as(bad)(`/api/admin/people/${bad.id}/disable`, "POST", {})).status).toBe(404);
      expect((await as(boss)(`/api/admin/people/${bad.id}/disable`, "POST", {})).status).toBe(200);
      expect((await (await as(bad)("/auth/me")).json()).user).toBeNull();
      expect((await as(bad)("/api/proposals")).status).toBe(401);
      const n = logs.length;
      await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.78" }, body: JSON.stringify({ email: "baddie@example.com" }) }, env);
      const token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
      const v = await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
      expect(v.headers.get("location")).toBe("/login?error=deleted");
    } finally {
      delete (env as any).ADMIN_EMAILS;
    }
  });
});

describe("attribution and referrals", () => {
  it("records where an account came from, pays the referrer, and gives the newcomer a longer trial", async () => {
    const alice = await signIn("alice-ref@example.com", "203.0.113.101");
    const me = await (await as(alice)("/auth/me")).json();
    expect(me.user.referralCode).toMatch(/^[a-z2-9]{10}$/);
    expect(me.user.referrals).toBe(0);
    // The friend's link remembers the code and the door, then shows the homepage.
    const r = await app.request(`${APP}/r/${me.user.referralCode}?ref=signed`, { redirect: "manual" }, env);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/?ref=signed");
    const refCookie = (r.headers.get("set-cookie") ?? "").split(";")[0]!;
    const home = await app.request(`${APP}/?ref=signed`, {}, env);
    expect(home.headers.get("cache-control")).toContain("no-store");
    const srcCookie = (home.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(srcCookie).toBe("qs-src=signed");
    // Bob signs up with both cookies present.
    const n = logs.length;
    await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.102", cookie: `${refCookie}; ${srcCookie}` }, body: JSON.stringify({ email: "bob-ref@example.com" }) }, env);
    const token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
    await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
    const bob = await env.DB.prepare("SELECT source, referred_by AS ref, trial_ends_at AS t, created_at AS c FROM users WHERE email = ?").bind("bob-ref@example.com").first<{ source: string; ref: string; t: number; c: number }>();
    expect(bob?.source).toBe("signed");
    expect(bob?.ref).toBe(alice.id);
    expect(Math.round((bob!.t - bob!.c) / 86_400_000)).toBe(21);
    // Signing up pays nothing; the newcomer's first paid plan does.
    const a1 = await env.DB.prepare("SELECT trial_ends_at AS t, created_at AS c FROM users WHERE id = ?").bind(alice.id).first<{ t: number; c: number }>();
    expect(Math.round((a1!.t - a1!.c) / 86_400_000)).toBe(14);
    const bobCookie = (await app.request(`${APP}/auth/me`, {}, env), null);
    void bobCookie;
    const bobSession = { cookie: "", id: "" } as Session;
    {
      const n2 = logs.length;
      await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.105" }, body: JSON.stringify({ email: "bob-ref@example.com" }) }, env);
      const tk = new URL(logs.slice(n2).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
      const v = await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token: tk }), redirect: "manual" }, env);
      bobSession.cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
    }
    const created = await (await as(bobSession)("/api/proposals", "POST", { template: "blank" })).json();
    await as(bobSession)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const a1b = await env.DB.prepare("SELECT trial_ends_at AS t, created_at AS c FROM users WHERE id = ?").bind(alice.id).first<{ t: number; c: number }>();
    expect(Math.round((a1b!.t - a1b!.c) / 86_400_000)).toBe(14); // sending pays nothing
    const bobId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("bob-ref@example.com").first<{ id: string }>())!.id;
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_bob", metadata: { userId: bobId, plan: "pro" } } });
    const a2 = await env.DB.prepare("SELECT trial_ends_at AS t, created_at AS c FROM users WHERE id = ?").bind(alice.id).first<{ t: number; c: number }>();
    expect(Math.round((a2!.t - a2!.c) / 86_400_000)).toBe(44);
    // A second delivery pays nothing more; a revocation inside thirty days takes the month back.
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_bob", metadata: { userId: bobId, plan: "pro" } } });
    expect((await env.DB.prepare("SELECT trial_ends_at AS t FROM users WHERE id = ?").bind(alice.id).first<{ t: number }>())!.t).toBe(a2!.t);
    await applyPolarEvent(env as any, { type: "subscription.revoked", data: { status: "revoked", customer_id: "cus_bob", metadata: { userId: bobId, plan: "pro" } } });
    const a3 = await env.DB.prepare("SELECT trial_ends_at AS t, created_at AS c FROM users WHERE id = ?").bind(alice.id).first<{ t: number; c: number }>();
    expect(Math.round((a3!.t - a3!.c) / 86_400_000)).toBe(14);
    expect((await (await as(alice)("/auth/me")).json()).user.referrals).toBe(1);
    // A bad code is ignored quietly.
    expect((await app.request(`${APP}/r/nope`, { redirect: "manual" }, env)).headers.get("set-cookie")).toBeNull();
  });

  it("invites the client on the accepted page and in their signed copy, unless the footer is off", async () => {
    const u = await signIn("inviter@example.com", "203.0.113.103");
    const created = await (await as(u)("/api/proposals", "POST", { template: "retainer" })).json();
    await as(u)(`/api/proposals/${created.id}`, "PUT", { clientEmail: "client-x@example.com" });
    await as(u)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const pub = (await (await as(u)(`/api/proposals/${created.id}`)).json()).proposal.publicId;
    const page = await (await app.request(`${APP}/p/${pub}`, {}, env)).text();
    expect(page).toContain('href="http://localhost:5173/?ref=proposal"');
    expect(page).not.toContain("class=\"grow\"");
    const seen = /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(page)![1];
    const n = logs.length;
    const a = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: APP, "cf-connecting-ip": "203.0.113.104" }, body: JSON.stringify({ signerName: "Client X", signerEmail: "client-x@example.com", consent: true, selection: {}, seenHash: seen }) }, env);
    expect(a.status).toBe(200);
    const code = (await (await as(u)("/auth/me")).json()).user.referralCode;
    expect(logs.slice(n).join("\n")).toContain(`/r/${code}?ref=email`);
    const done = await (await app.request(`${APP}/p/${pub}`, {}, env)).text();
    expect(done).toContain(`/r/${code}?ref=signed`);
    expect(done).toContain("Try Quote and Sign free");
  });
});

describe("referral abuse limits and the daily alert", () => {
  it("caps rewards at twelve a year, credits paying referrers instead of extending, and never rewards a self sign-up", async () => {
    const { rewardReferrerForPaidPlan, isSelfReferral } = await import("../src/worker/lib/referral");
    const { getDb } = await import("../src/worker/lib/db");
    const db = getDb(env.DB);
    const ref = await signIn("farmer@example.com", "203.0.113.120");
    const own = (await env.DB.prepare("SELECT ip_hash AS h FROM audit_log WHERE user_id = ? AND event = 'login.success'").bind(ref.id).first<{ h: string }>())!.h;
    expect(await isSelfReferral(db, ref.id, own, new Date())).toBe(true);
    expect(await isSelfReferral(db, ref.id, "someone-else", new Date())).toBe(false);
    const before = (await env.DB.prepare("SELECT trial_ends_at AS t FROM users WHERE id = ?").bind(ref.id).first<{ t: number }>())!.t;
    for (let i = 0; i < 15; i++) {
      await env.DB.prepare("INSERT INTO users (id, email, plan, created_at, referred_by) VALUES (?, ?, 'free', 1, ?)").bind(`farm-${i}`, `farm-${i}@example.com`, ref.id).run();
      await rewardReferrerForPaidPlan(db, { id: `farm-${i}`, referredBy: ref.id, referralRewardedAt: null }, new Date());
    }
    const after = (await env.DB.prepare("SELECT trial_ends_at AS t FROM users WHERE id = ?").bind(ref.id).first<{ t: number }>())!.t;
    expect(Math.round((after - before) / 86_400_000)).toBe(351); // twelve paid, three capped, and the year-ahead ceiling trims the last one
    expect(await rewardReferrerForPaidPlan(db, { id: "farm-0", referredBy: ref.id, referralRewardedAt: new Date() }, new Date())).toBe(false);
    // A paying referrer is credited, not extended.
    await env.DB.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").bind(ref.id).run();
    await env.DB.prepare("INSERT INTO users (id, email, plan, created_at, referred_by) VALUES ('farm-x', 'farm-x@example.com', 'free', 1, ?)").bind(ref.id).run();
    await env.DB.prepare("DELETE FROM users WHERE id IN ('farm-13', 'farm-14')").run();
    await env.DB.prepare("UPDATE users SET referral_rewarded_at = 1 WHERE referred_by = ? AND id <> 'farm-x'").bind(ref.id).run();
    await rewardReferrerForPaidPlan(db, { id: "farm-x", referredBy: ref.id, referralRewardedAt: null }, new Date());
    expect((await env.DB.prepare("SELECT trial_ends_at AS t FROM users WHERE id = ?").bind(ref.id).first<{ t: number }>())!.t).toBe(after);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE user_id = ? AND event = 'referral.credit_owed'").bind(ref.id).first<{ n: number }>())!.n).toBe(1);
  });

  it("emails the operator once a day when something looks off", async () => {
    const { sendSuspiciousActivityAlert } = await import("../src/worker/lib/alerts");
    const n = logs.length;
    expect(await sendSuspiciousActivityAlert(env as any, new Date("2030-01-01T09:00:00Z"))).toBe(false);
    await env.DB.prepare("INSERT INTO tickets (id, kind, name, email, subject, status, created_at, updated_at) VALUES ('t-abuse', 'abuse', 'A', 'a@example.com', 'Phishing page', 'open', 1, 1)").run();
    expect(await sendSuspiciousActivityAlert(env as any, new Date("2030-01-01T09:00:00Z"))).toBe(true);
    expect(logs.slice(n).join("\n")).toContain("1 open abuse report");
    expect(await sendSuspiciousActivityAlert(env as any, new Date("2030-01-01T18:00:00Z"))).toBe(false);
  });
});

describe("admin email previews", () => {
  it("sends each proposal email to the admin from one sample proposal, tagged as a test", async () => {
    (env as any).ADMIN_EMAILS = "boss2@example.com";
    try {
      const boss = await signIn("boss2@example.com", "203.0.113.130");
      const kinds = ["sent", "opened", "question", "accepted-sender", "accepted-client", "reminder"];
      let proposalId = "";
      for (const kind of kinds) {
        const n = logs.length;
        const r = await (await as(boss)("/api/admin/emails/test", "POST", { kind })).json();
        expect(r.ok).toBe(true);
        if (proposalId) expect(r.proposalId).toBe(proposalId); else proposalId = r.proposalId;
        const mail = logs.slice(n).join("\n");
        expect(mail).toContain("To:      boss2@example.com");
        expect(mail).toContain("Subject: [Test]");
      }
      expect(logs.join("\n")).toContain("Attachment: sample-signed.pdf");
      expect((await as(boss)("/api/admin/emails/test", "POST", { kind: "nope" })).status).toBe(400);
      const count = await env.DB.prepare("SELECT count(*) AS n FROM proposals WHERE user_id = ? AND title LIKE 'Sample:%'").bind(boss.id).first<{ n: number }>();
      expect(count?.n).toBe(1);
    } finally {
      delete (env as any).ADMIN_EMAILS;
    }
  });
});

describe("partner programme", () => {
  it("creates a partner, ties sign-ups to it with extra days, records shares from paid orders, reverses refunds, and shows a private stats page", async () => {
    (env as any).ADMIN_EMAILS = "boss3@example.com";
    try {
      const boss = await signIn("boss3@example.com", "203.0.113.140");
      const created = await (await as(boss)("/api/admin/partners", "POST", { name: "Ownr", code: "ownr", contactEmail: "partners@ownr.example", sharePct: 25, bonusDays: 30 })).json();
      expect(created.partner.code).toBe("ownr");
      expect((await as(boss)("/api/admin/partners", "POST", { name: "Dup", code: "ownr" })).status).toBe(409);
      // The link remembers the code, first touch wins, and an unknown code sets nothing.
      const go = await app.request(`${APP}/go/ownr`, { redirect: "manual" }, env);
      expect(go.headers.get("location")).toBe("/?ref=partner-ownr");
      const cookie = (go.headers.get("set-cookie") ?? "").split(";")[0]!;
      expect(cookie).toBe("qs-partner=ownr");
      expect((await app.request(`${APP}/go/nobody`, { redirect: "manual" }, env)).headers.get("set-cookie")).toBeNull();
      // A member signs up through the cookie.
      let n = logs.length;
      await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.141", cookie }, body: JSON.stringify({ email: "member1@example.com" }) }, env);
      let token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
      await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
      const m1 = await env.DB.prepare("SELECT id, partner_id AS p, source, trial_ends_at AS t, created_at AS c FROM users WHERE email = ?").bind("member1@example.com").first<{ id: string; p: string; source: string; t: number; c: number }>();
      expect(m1?.p).toBe(created.partner.id);
      expect(m1?.source).toBe("partner-ownr");
      expect(Math.round((m1!.t - m1!.c) / 86_400_000)).toBe(44);
      // Another member types the code on the form instead.
      n = logs.length;
      await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.142" }, body: JSON.stringify({ email: "member2@example.com", partner: "OWNR" }) }, env);
      token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
      await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
      expect((await env.DB.prepare("SELECT partner_id AS p FROM users WHERE email = ?").bind("member2@example.com").first<{ p: string }>())?.p).toBe(created.partner.id);
      // Member 1 pays: the share is recorded once, even when Polar delivers the event twice; a refund reverses it.
      await applyPolarEvent(env as any, { type: "order.paid", data: { id: "ord_1", status: "paid", customer_id: "cus_m1", net_amount: 22800, currency: "usd", metadata: { userId: m1!.id, plan: "pro" } } });
      await applyPolarEvent(env as any, { type: "order.paid", data: { id: "ord_1", status: "paid", customer_id: "cus_m1", net_amount: 22800, currency: "usd", metadata: { userId: m1!.id, plan: "pro" } } });
      let list = await (await as(boss)("/api/admin/partners")).json();
      expect(list.partners[0].stats).toMatchObject({ signups: 2, paid: 1, earned: 5700, paidOut: 0, owed: 5700 });
      // Pay out part (more than owed needs a second confirmation), then a refund on the order.
      expect((await as(boss)(`/api/admin/partners/${created.partner.id}/payout`, "POST", { amount: 9000, note: "typo" })).status).toBe(409);
      expect((await as(boss)(`/api/admin/partners/${created.partner.id}/payout`, "POST", { amount: 5000, note: "Wise Q3" })).status).toBe(200);
      await applyPolarEvent(env as any, { type: "order.refunded", data: { id: "ord_1", customer_id: "cus_m1", metadata: { userId: m1!.id } } });
      list = await (await as(boss)("/api/admin/partners")).json();
      expect(list.partners[0].stats).toMatchObject({ earned: 0, reversed: 5700, paidOut: 5000, owed: -5000 });
      // The private page shows counts and money, never member emails; a wrong token is a 404.
      const page = await app.request(`${APP}/partner/${created.partner.viewToken}`, {}, env);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("Ownr and Quote and Sign");
      expect(html).toContain("/go/ownr");
      expect(html).not.toContain("member1@example.com");
      expect(html).toContain('name="robots" content="noindex');
      expect((await app.request(`${APP}/partner/${"x".repeat(32)}`, {}, env)).status).toBe(404);
      // The public programme page and robots rules.
      expect((await app.request(`${APP}/partners`, {}, env)).status).toBe(200);
      const robots = await (await app.request(`${APP}/robots.txt`, {}, env)).text();
      expect(robots).toContain("Disallow: /go/");
      expect(robots).toContain("Disallow: /partner/");
      expect(robots).toContain("Allow: /partners");
    } finally {
      delete (env as any).ADMIN_EMAILS;
    }
  });
});

describe("bonus farming", () => {
  it("gives the extra days to at most three accounts from one address a month", async () => {
    (env as any).ADMIN_EMAILS = "boss4@example.com";
    let partnerId = "";
    try {
      const boss = await signIn("boss4@example.com", "203.0.113.150");
      partnerId = (await (await as(boss)("/api/admin/partners", "POST", { name: "Guild", code: "guild", bonusDays: 30 })).json()).partner.id;
    } finally { delete (env as any).ADMIN_EMAILS; }
    const days: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = logs.length;
      await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.151" }, body: JSON.stringify({ email: `farm${i}@farm-${i}.example`, partner: "guild" }) }, env);
      const token = new URL(logs.slice(n).join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)![0]).searchParams.get("token")!;
      await app.request(`${APP}/auth/verify`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: APP }, body: new URLSearchParams({ token }), redirect: "manual" }, env);
      const u = await env.DB.prepare("SELECT trial_ends_at AS t, created_at AS c, partner_id AS p FROM users WHERE email = ?").bind(`farm${i}@farm-${i}.example`).first<{ t: number; c: number; p: string | null }>();
      days.push(Math.round((u!.t - u!.c) / 86_400_000));
      expect(u!.p).toBe(partnerId); // the tie stays; only the extra days are capped
    }
    expect(days).toEqual([44, 44, 44, 14]);
  });
});

describe("partner programme, edge cases", () => {
  it("survives the nightly prune, stops accruing when paused, handles partial refunds, escapes names, and hides from non-admins", async () => {
    const { pruneOldRows } = await import("../src/worker/lib/reminders");
    const { recordPartnerOrder, reversePartnerOrder, partnerStats } = await import("../src/worker/lib/partners");
    const { getDb } = await import("../src/worker/lib/db");
    const db = getDb(env.DB);
    (env as any).ADMIN_EMAILS = "boss5@example.com";
    let p: any;
    try {
      const boss = await signIn("boss5@example.com", "203.0.113.160");
      p = (await (await as(boss)("/api/admin/partners", "POST", { name: "<script>alert(1)</script> Co", code: "esc-co", bonusDays: 30 })).json()).partner;
      // 2. Name is escaped on the private page.
      const html = await (await app.request(`${APP}/partner/${p.viewToken}`, {}, env)).text();
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
      // 3. A partial refund reduces the share in proportion; a paused partner earns nothing new.
      await env.DB.prepare("INSERT INTO users (id, email, plan, created_at, partner_id) VALUES ('pu-1', 'pu1@example.com', 'free', ?, ?)").bind(Date.now(), p.id).run();
      const u = { id: "pu-1", partnerId: p.id, createdAt: new Date() };
      expect(await recordPartnerOrder(db, u, { id: "ord_p1", amount: 10000, currency: "usd" }, new Date())).toBe(true);
      expect(await reversePartnerOrder(db, "ord_p1", new Date(), 2500)).toBe(true);
      expect((await partnerStats(db, p.id)).earned).toBe(1875); // 25% of 10000, less a quarter
      expect((await as(boss)(`/api/admin/partners/${p.id}/active`, "POST", { active: false })).status).toBe(200);
      expect(await recordPartnerOrder(db, u, { id: "ord_p2", amount: 10000, currency: "usd" }, new Date())).toBe(false);
      expect((await app.request(`${APP}/go/esc-co`, { redirect: "manual" }, env)).headers.get("set-cookie")).toBeNull();
      expect(await (await app.request(`${APP}/partner/${p.viewToken}`, {}, env)).text()).toContain("This partnership is paused");
      // 4. Old-year orders earn nothing.
      expect(await recordPartnerOrder(db, { id: "pu-1", partnerId: p.id, createdAt: new Date(Date.now() - 400 * 86_400_000) }, { id: "ord_p3", amount: 10000, currency: "usd" }, new Date())).toBe(false);
      // 5. The 30-day bonus counter survives the nightly prune run a day later.
      const { rateLimit } = await import("../src/worker/lib/ratelimit");
      await rateLimit(db, "bonus:ip:test-hash", 3, 30 * 86_400_000);
      await pruneOldRows(env as any, new Date(Date.now() + 2 * 86_400_000));
      expect((await env.DB.prepare("SELECT count(*) AS n FROM rate_limits WHERE key = 'bonus:ip:test-hash'").first<{ n: number }>())?.n).toBe(1);
      await pruneOldRows(env as any, new Date(Date.now() + 31 * 86_400_000));
      expect((await env.DB.prepare("SELECT count(*) AS n FROM rate_limits WHERE key = 'bonus:ip:test-hash'").first<{ n: number }>())?.n).toBe(0);
    } finally {
      delete (env as any).ADMIN_EMAILS;
    }
    // 5. Without the admin gate the routes do not exist.
    const nobody = await signIn("nobody5@example.com", "203.0.113.161");
    expect((await as(nobody)("/api/admin/partners")).status).toBe(404);
    expect((await as(nobody)(`/api/admin/partners/${p.id}/payout`, "POST", { amount: 100 })).status).toBe(404);
  });
});
