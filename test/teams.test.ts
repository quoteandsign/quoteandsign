import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";
import { effectivePlan } from "../src/worker/lib/plan";

// Business teams: invite by email, join on sign-in, work inside the owner's account.

const APP = "http://localhost:5173";
const logs: string[] = [];

async function signIn(email: string): Promise<string> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }, env);
  const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  return (v.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const as = (cookie: string) => (path: string, method = "GET", body?: unknown) =>
  app.request(`${APP}${path}`, { method, headers: { cookie, "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, env);

let owner: ReturnType<typeof as>;
let member: ReturnType<typeof as>;
let ownerId = "";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
  owner = as(await signIn("boss@agency.example"));
  member = as(await signIn("designer@agency.example"));
  ownerId = (await (await owner("/auth/me")).json()).user.id;
  await owner("/auth/me", "PUT", { brandName: "Agency Co" });
});

describe("trial", () => {
  it("treats a fresh free account as Pro for 14 days and then as Free", () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const fresh = effectivePlan({ plan: "free", trialEndsAt: new Date(now.getTime() + 14 * 86_400_000) }, now);
    expect(fresh).toMatchObject({ id: "pro", paid: "free", trial: true, trialDaysLeft: 14 });
    const over = effectivePlan({ plan: "free", trialEndsAt: new Date(now.getTime() - 1) }, now);
    expect(over).toMatchObject({ id: "free", trial: false, trialDaysLeft: 0 });
    // A paid plan never reads as trialing.
    expect(effectivePlan({ plan: "business", trialEndsAt: new Date(now.getTime() + 86_400_000) }, now)).toMatchObject({ id: "business", trial: false });
  });
});

describe("teams", () => {
  it("needs the Business plan to invite", async () => {
    const r = await owner("/api/team/invite", "POST", { email: "designer@agency.example" });
    expect(r.status).toBe(402);
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_team", metadata: { userId: ownerId, plan: "business" } } });
    expect((await (await owner("/api/team")).json()).seats).toBe(10);
  });

  it("invites, shows the invite to the right person, and lets them join", async () => {
    const n = logs.length;
    expect((await owner("/api/team/invite", "POST", { email: "Designer@Agency.example" })).status).toBe(201);
    expect(logs.slice(n).join("\n")).toContain("Agency Co invited you");
    expect((await owner("/api/team/invite", "POST", { email: "designer@agency.example" })).status).toBe(409);
    expect((await owner("/api/team/invite", "POST", { email: "boss@agency.example" })).status).toBe(400);

    const me = (await (await member("/auth/me")).json()).user;
    expect(me.pendingInvite).toMatchObject({ ownerName: "Agency Co" });
    expect(me.workspace).toBeNull();

    expect((await member("/api/team/join", "POST", { inviteId: me.pendingInvite.id })).status).toBe(200);
    const joined = (await (await member("/auth/me")).json()).user;
    expect(joined.workspace).toEqual({ ownerName: "Agency Co" });
    expect(joined.brandName).toBe("Agency Co");
    expect(joined.plan).toBe("business");
    expect(joined.email).toBe("designer@agency.example");
    const team = await (await owner("/api/team")).json();
    expect(team.members).toHaveLength(1);
    expect(team.members[0].joined).toBe(true);
  });

  it("members work inside the owner's proposals and cannot touch the account", async () => {
    const c = await member("/api/proposals", "POST", { template: "blank" });
    expect(c.status).toBe(201);
    const id = (await c.json()).id;
    // The owner sees it; it belongs to the workspace.
    const ownerList = await (await owner("/api/proposals")).json();
    expect(ownerList.proposals.map((p: { id: string }) => p.id)).toContain(id);
    expect((await member(`/api/proposals/${id}`, "PUT", { title: "From the designer" })).status).toBe(200);
    expect((await (await owner(`/api/proposals/${id}`)).json()).proposal.title).toBe("From the designer");
    // The member is told when a client signs: they are on the internal list.
    // Profile, billing, team and account data stay with the owner.
    expect((await member("/auth/me", "PUT", { brandName: "Hijack" })).status).toBe(403);
    expect((await member("/api/team/invite", "POST", { email: "x@y.example" })).status).toBe(403);
    expect((await member("/api/billing/checkout", "POST", { plan: "pro" })).status).toBe(403);
    expect((await member("/api/account/export")).status).toBe(403);
    expect((await member("/api/account", "DELETE", { confirm: "DELETE" })).status).toBe(403);
    expect((await (await owner("/auth/me")).json()).user.brandName).toBe("Agency Co");
  });

  it("caps the team at ten, removes and leaves", async () => {
    for (let i = 0; i < 9; i++) expect((await owner("/api/team/invite", "POST", { email: `p${i}@agency.example` })).status).toBe(201);
    expect((await owner("/api/team/invite", "POST", { email: "eleventh@agency.example" })).status).toBe(409);
    const team = await (await owner("/api/team")).json();
    const pending = team.members.find((m: { joined: boolean }) => !m.joined);
    expect((await owner(`/api/team/${pending.id}`, "DELETE")).status).toBe(200);

    expect((await member("/api/team/leave", "POST")).status).toBe(200);
    const me = (await (await member("/auth/me")).json()).user;
    expect(me.workspace).toBeNull();
    expect((await (await member("/api/proposals")).json()).proposals).toHaveLength(0);
    // One removed by the owner, one who left: their seats are free again.
    expect((await (await owner("/api/team")).json()).members).toHaveLength(8);
  });
});
