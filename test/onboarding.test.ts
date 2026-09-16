import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { sendDay3Nudges, renderOnboardingHtml } from "../src/worker/lib/onboarding";

// The onboarding sequence: a welcome on the first sign-in and a nudge after three days without a
// sent proposal, each once, only while the admin switch is on, never to admins, and an admin
// "send me a test" that works with the switch off.

const APP = "http://localhost:5173";
const logs: string[] = [];
const DAY = 86_400_000;

async function signIn(email: string): Promise<{ cookie: string; id: string }> {
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }, env);
  const links = logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/g)!;
  const token = new URL(links[links.length - 1]!).searchParams.get("token")!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  const cookie = (v.headers.get("set-cookie") ?? "").split(";")[0]!;
  const me = await (await app.request(`${APP}/auth/me`, { headers: { cookie } }, env)).json();
  return { cookie, id: me.user.id };
}
const json = (cookie: string, path: string, method: string, body?: unknown) =>
  app.request(`${APP}${path}`, { method, headers: { cookie, "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
const switchOn = (on: boolean) => on
  ? env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('onboarding_emails', '1', ?)").bind(Date.now()).run()
  : env.DB.prepare("DELETE FROM settings WHERE key = 'onboarding_emails'").run();
const stage = async (id: string) => (await env.DB.prepare("SELECT onboarding_sent AS s FROM users WHERE id = ?").bind(id).first<{ s: number }>())!.s;
const since = (n: number) => logs.slice(n).join("\n");

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
});

describe("the renderer", () => {
  it("builds a 600px card with the image, the button and an escaped name", () => {
    const w = renderOnboardingHtml("welcome", { appUrl: "https://quoteandsign.com", firstName: "<b>Ana</b>", templateSlug: "website-proposal-template", supportEmail: "support@quoteandsign.com" });
    expect(w.subject).toBe("Welcome to Quote and Sign");
    expect(w.html).toContain('width="600"');
    expect(w.html).toContain('name="color-scheme"');
    expect(w.html).toContain("https://quoteandsign.com/img/step-template.jpg");
    expect(w.html).toContain("Make your first proposal");
    expect(w.html).toContain("https://quoteandsign.com/app/templates");
    expect(w.html).toContain("Sent with");
    expect(w.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(w.html).not.toContain("<b>Ana</b>");
    expect(w.text).toContain("Make your first proposal: https://quoteandsign.com/app/templates");
    const d = renderOnboardingHtml("day3", { appUrl: "https://quoteandsign.com", firstName: null, templateSlug: "website-proposal-template", supportEmail: "support@quoteandsign.com" });
    expect(d.subject).toBe("Your trial has 11 days left");
    expect(d.html).toContain("https://quoteandsign.com/templates/website-proposal-template");
    expect(d.html).toContain("Hello,");
    expect(Buffer.byteLength(w.html)).toBeLessThan(102 * 1024);
  });
});

describe("the switch", () => {
  it("off: no welcome on sign-in and no nudge from the job", async () => {
    await switchOn(false);
    const n = logs.length;
    const u = await signIn("off@example.com");
    expect(since(n)).not.toContain("Welcome to Quote and Sign");
    await env.DB.prepare("UPDATE users SET created_at = ? WHERE id = ?").bind(Date.now() - 4 * DAY, u.id).run();
    expect(await sendDay3Nudges(env as any)).toBe(0);
    expect(await stage(u.id)).toBe(0);
    // Park this account so the day-3 test below counts only its own people.
    await env.DB.prepare("UPDATE users SET onboarding_sent = 2 WHERE id = ?").bind(u.id).run();
  });
});

describe("the welcome", () => {
  it("goes out once on the first sign-in, with the support reply-to, and never again", async () => {
    await switchOn(true);
    const n = logs.length;
    const u = await signIn("onb1@example.com");
    const out = since(n);
    expect(out).toContain("Subject: Welcome to Quote and Sign");
    expect(out).toContain("To:      onb1@example.com");
    expect(out).toContain("Reply-to");
    expect(await stage(u.id)).toBe(1);
    const m = logs.length;
    await signIn("onb1@example.com");
    expect(since(m)).not.toContain("Welcome to Quote and Sign");
    expect(logs.filter((l) => l.includes("Subject: Welcome to Quote and Sign")).length).toBe(1);
  });

  it("skips admins", async () => {
    await switchOn(true);
    (env as any).ADMIN_EMAILS = "boss@example.com";
    const n = logs.length;
    await signIn("boss@example.com");
    expect(since(n)).not.toContain("Welcome to Quote and Sign");
    delete (env as any).ADMIN_EMAILS;
  });
});

describe("the day-3 nudge", () => {
  it("sends once to accounts three days old with nothing sent, skips senders and young accounts", async () => {
    await switchOn(true);
    const quiet = await signIn("quiet3@example.com");
    const sender = await signIn("sender3@example.com");
    const young = await signIn("young3@example.com");
    const three = Date.now() - 3 * DAY - 60_000;
    await env.DB.prepare("UPDATE users SET created_at = ? WHERE id IN (?, ?)").bind(three, quiet.id, sender.id).run();
    await env.DB.prepare("UPDATE users SET created_at = ? WHERE id = ?").bind(Date.now() - 2 * DAY, young.id).run();
    // The sender has a proposal out; the quiet one only a draft.
    const p = await (await json(sender.cookie, "/api/proposals", "POST", { template: "retainer" })).json();
    await env.DB.prepare("UPDATE proposals SET status = 'sent' WHERE id = ?").bind(p.id).run();
    await json(quiet.cookie, "/api/proposals", "POST", { template: "retainer" });
    const n = logs.length;
    expect(await sendDay3Nudges(env as any)).toBe(1);
    const out = since(n);
    expect(out).toContain("11 days left");
    expect(out).toContain("To:      quiet3@example.com");
    expect(out).not.toContain("sender3@example.com");
    expect(out).not.toContain("young3@example.com");
    expect(await stage(quiet.id)).toBe(2);
    expect(await stage(sender.id)).toBe(1);
    expect(await sendDay3Nudges(env as any)).toBe(0);
  });
});

describe("the admin side", () => {
  it("settings round-trip and the test endpoint, admins only, to the caller", async () => {
    await switchOn(false);
    const me = await signIn("admin3@example.com");
    expect((await json(me.cookie, "/api/admin/onboarding/test", "POST", { kind: "welcome" })).status).toBe(404);
    expect((await app.request(`${APP}/api/admin/onboarding/test`, { method: "POST" }, env)).status).toBe(401);
    (env as any).ADMIN_EMAILS = "admin3@example.com";
    const s0 = await (await json(me.cookie, "/api/admin/settings", "GET")).json();
    expect(s0.onboardingEmails).toBe(false);
    const s1 = await (await json(me.cookie, "/api/admin/settings", "PUT", { onboardingEmails: true })).json();
    expect(s1.onboardingEmails).toBe(true);
    const s2 = await (await json(me.cookie, "/api/admin/settings", "PUT", { analyticsId: "" })).json();
    expect(s2.onboardingEmails).toBe(true);
    await json(me.cookie, "/api/admin/settings", "PUT", { onboardingEmails: false });
    const n = logs.length;
    const r = await json(me.cookie, "/api/admin/onboarding/test", "POST", { kind: "welcome" });
    expect(r.status).toBe(200);
    expect((await r.json()).to).toBe("admin3@example.com");
    expect(since(n)).toContain("[Test] Welcome to Quote and Sign");
    expect(since(n)).toContain("To:      admin3@example.com");
    const m = logs.length;
    expect((await json(me.cookie, "/api/admin/onboarding/test", "POST", { kind: "day3" })).status).toBe(200);
    expect(since(m)).toContain("[Test] Your trial has 11 days left");
    expect((await json(me.cookie, "/api/admin/onboarding/test", "POST", { kind: "nope" })).status).toBe(400);
    expect(await stage(me.id)).toBe(0);
    delete (env as any).ADMIN_EMAILS;
  });
});
