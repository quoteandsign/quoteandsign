import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

// Cookies and sign-in links only ever travel over TLS, and personal JSON is never cached.

describe("transport", () => {
  it("plain http and other hosts redirect to the canonical https origin in production", async () => {
    const prod = { ...env, ENVIRONMENT: "production", APP_URL: "https://quoteandsign.com" } as typeof env;
    const r = await app.request("http://quoteandsign.com/p/abc?x=1", { redirect: "manual" }, prod);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://quoteandsign.com/p/abc?x=1");
    const w = await app.request("https://www.quoteandsign.com/", { redirect: "manual" }, prod);
    expect(w.headers.get("location")).toBe("https://quoteandsign.com/");
  });

  it("account and API JSON carries no-store; the homepage stays cacheable", async () => {
    const me = await app.request("http://localhost:5173/auth/me", {}, env);
    expect(me.headers.get("cache-control")).toBe("no-store");
    const api = await app.request("http://localhost:5173/api/proposals", {}, env);
    expect(api.headers.get("cache-control")).toBe("no-store");
    // Public pages are cacheable in production (development sends no-store so previews stay fresh).
    const prod = { ...env, ENVIRONMENT: "production", APP_URL: "https://quoteandsign.com" } as typeof env;
    const home = await app.request("https://quoteandsign.com/", {}, prod);
    expect(home.headers.get("cache-control")).not.toContain("no-store");
  });
});
