import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

// Google Analytics is an admin setting, off by default, and the public pages only load it after
// a visitor clicks Allow. Proposal pages never carry it.

const APP = "http://localhost:5173";
const logs: string[] = [];

async function signIn(email: string): Promise<string> {
  const n = logs.length;
  await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.61" }, body: JSON.stringify({ email }) }, env);
  const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  return (v.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const jsonAs = (cookie: string) => (path: string, method: string, body?: unknown) =>
  app.request(`${APP}${path}`, { method, headers: { cookie, "content-type": "application/json", accept: "application/json", origin: APP }, body: body === undefined ? undefined : JSON.stringify(body) }, env);

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); });
});

describe("analytics setting and consent", () => {
  it("is off by default: no Google code, no banner, no Google in the CSP", async () => {
    const home = await app.request(`${APP}/`, {}, env);
    expect(await home.text()).not.toContain("googletagmanager");
    expect(home.headers.get("content-security-policy")).not.toContain("googletagmanager");
    expect((await (await app.request(`${APP}/auth/config`, {}, env)).json()).analyticsId).toBeNull();
  });

  it("only an admin can set it, and only to a real-looking id", async () => {
    const stranger = await signIn("visitor@example.com");
    expect((await jsonAs(stranger)("/api/admin/settings", "PUT", { analyticsId: "G-ABC123DEF" })).status).toBe(404);
    (env as any).ADMIN_EMAILS = "boss@quoteandsign.com";
    const admin = await signIn("boss@quoteandsign.com");
    expect((await jsonAs(admin)("/api/admin/settings", "PUT", { analyticsId: "not-an-id" })).status).toBe(400);
    expect((await jsonAs(admin)("/api/admin/settings", "PUT", { analyticsId: "<script>" })).status).toBe(400);
    const ok = await jsonAs(admin)("/api/admin/settings", "PUT", { analyticsId: "g-abc123def" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).analyticsId).toBe("G-ABC123DEF");
    expect((await (await jsonAs(admin)("/api/admin/settings", "GET")).json()).analyticsId).toBe("G-ABC123DEF");
  });

  it("once set, the public pages ask first and the CSP allows Google; proposal pages stay clean", async () => {
    const home = await app.request(`${APP}/`, {}, env);
    const html = await home.text();
    expect(html).toContain('id="consent"');
    expect(html).toContain("G-ABC123DEF");
    expect(html).toContain("data-cookie-settings");
    // The loader is inline and gated; the Google script tag itself is never in the markup.
    expect(html).not.toMatch(/<script[^>]+src="https:\/\/www\.googletagmanager\.com/);
    expect(home.headers.get("content-security-policy")).toContain("script-src 'nonce-");
    expect(home.headers.get("content-security-policy")).toContain("https://www.googletagmanager.com");
    const privacy = await app.request(`${APP}/privacy`, {}, env);
    const ptext = await privacy.text();
    expect(ptext).toContain('id="consent"');
    expect(ptext).toContain("Google Analytics");
    expect(ptext).toContain("Cookie settings");
    expect((await (await app.request(`${APP}/auth/config`, {}, env)).json()).analyticsId).toBe("G-ABC123DEF");
    // A proposal page carries none of it.
    const owner = await signIn("sender2@example.com");
    const created = await (await jsonAs(owner)("/api/proposals", "POST", { template: "blank" })).json();
    await jsonAs(owner)(`/api/proposals/${created.id}/send`, "POST", { email: false });
    const pub = (await (await jsonAs(owner)(`/api/proposals/${created.id}`, "GET")).json()).proposal.publicId;
    const page = await app.request(`${APP}/p/${pub}`, {}, env);
    expect(await page.text()).not.toContain("googletagmanager");
    expect(page.headers.get("content-security-policy")).not.toContain("googletagmanager");
  });

  it("clearing the field turns it off again", async () => {
    const admin = await signIn("boss@quoteandsign.com");
    expect((await jsonAs(admin)("/api/admin/settings", "PUT", { analyticsId: "" })).status).toBe(200);
    expect(await (await app.request(`${APP}/`, {}, env)).text()).not.toContain("googletagmanager");
    delete (env as any).ADMIN_EMAILS;
  });
});
