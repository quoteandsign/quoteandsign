import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";
import { applyPolarEvent } from "../src/worker/routes/billing";

// Fixes from the September 2026 security audit, each pinned by a test.

const APP = "http://localhost:5173";
const logs: string[] = [];
beforeAll(() => { vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }); });

async function requestLink(email: string): Promise<{ token: string; loginCookie: string }> {
  const n = logs.length;
  const r = await app.request(`${APP}/auth/request`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.77" }, body: JSON.stringify({ email }) }, env);
  const loginCookie = (r.headers.get("set-cookie") ?? "").split(";")[0]!;
  const token = logs.slice(n).join("\n").match(/verify\?token=([A-Za-z0-9_-]+)/)![1]!;
  return { token, loginCookie };
}
async function signIn(email: string): Promise<string> {
  const { token } = await requestLink(email);
  const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
  return (v.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const as = (cookie: string) => (path: string, method = "GET", body?: unknown) =>
  app.request(`${APP}${path}`, { method, headers: { cookie, "content-type": "application/json", accept: "application/json", origin: APP }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
const me = async (cookie: string) => (await (await as(cookie)("/auth/me")).json()).user;

/** The text of a pdf-lib PDF: every Flate content stream inflated and joined. Standard fonts write literal strings. */
async function pdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const raw = new TextDecoder("latin1").decode(bytes);
  let out = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    let stop = end;
    while (stop > start && (bytes[stop - 1] === 0x0a || bytes[stop - 1] === 0x0d)) stop--;
    const chunk = bytes.subarray(start, stop);
    try {
      const inflated = await new Response(new Blob([chunk]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
      out += new TextDecoder("latin1").decode(inflated);
    } catch {
      out += raw.slice(start, end);
    }
  }
  // pdf-lib writes glyphs as hex strings: <48656c6c6f> Tj
  return out.replace(/<([0-9a-fA-F]+)>/g, (_, h) => h.replace(/../g, (b) => String.fromCharCode(parseInt(b, 16))));
}

describe("sign-in link opened elsewhere", () => {
  it("auto-continues only in the browser that asked; anyone else sees whose link it is and must press Continue", async () => {
    const { token, loginCookie } = await requestLink("owner@example.com");
    const same = await app.request(`${APP}/auth/verify?token=${token}`, { headers: { cookie: loginCookie } }, env);
    expect(await same.text()).toContain('document.getElementById("f").submit()');
    const other = await app.request(`${APP}/auth/verify?token=${token}`, {}, env);
    const html = await other.text();
    expect(html).not.toContain(".submit()");
    expect(html).toContain("Sign in as owner@example.com?");
    // Looking did not consume it.
    const v = await app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
    expect(v.headers.get("location")).toBe("/app");
    // A spent or unknown token goes back to the sign-in page.
    expect((await app.request(`${APP}/auth/verify?token=${token}`, { redirect: "manual" }, env)).headers.get("location")).toBe("/login?error=expired");
  });
});

describe("free-plan live cap holds on every path", () => {
  it("mark as open and restore respect the cap, and parallel sends cannot all pass", async () => {
    const c = await signIn("capped@example.com");
    const id = (await me(c)).id;
    await env.DB.prepare("UPDATE users SET trial_ends_at = 0 WHERE id = ?").bind(id).run();
    const make = async () => (await (await as(c)("/api/proposals", "POST", { template: "blank" })).json()).id as string;
    const ids = await Promise.all([make(), make(), make(), make(), make()]);
    const sends = await Promise.all(ids.map((p) => as(c)(`/api/proposals/${p}/send`, "POST", { email: false })));
    expect(sends.filter((r) => r.status === 200).length).toBe(3);
    expect(sends.filter((r) => r.status === 402).length).toBe(2);
    const live = ids.filter((_, i) => sends[i]!.status === 200);
    // Decline one, send a fourth, then try to reopen the declined one: that would be a fourth live proposal.
    expect((await as(c)(`/api/proposals/${live[0]}/mark`, "POST", { status: "declined" })).status).toBe(200);
    const fourth = ids.find((_, i) => sends[i]!.status === 402)!;
    expect((await as(c)(`/api/proposals/${fourth}/send`, "POST", { email: false })).status).toBe(200);
    const reopen = await as(c)(`/api/proposals/${live[0]}/mark`, "POST", { status: "open" });
    expect(reopen.status).toBe(402);
    expect((await reopen.json()).code).toBe("limit");
    // Archive one, reopen the declined one, and restoring the archived one while three are live is refused too.
    expect((await as(c)(`/api/proposals/${fourth}/archive`, "POST")).status).toBe(200);
    expect((await as(c)(`/api/proposals/${live[0]}/mark`, "POST", { status: "open" })).status).toBe(200);
    expect((await as(c)(`/api/proposals/${fourth}/restore`, "POST")).status).toBe(402);
    // A declined proposal can be revised.
    expect((await as(c)(`/api/proposals/${live[1]}/mark`, "POST", { status: "declined" })).status).toBe(200);
    expect((await as(c)(`/api/proposals/${live[1]}`, "PUT", { title: "Revised" })).status).toBe(200);
  });
});

describe("deleting an account is not a trial reset", () => {
  it("the same address keeps the trial end date it had", async () => {
    const c = await signIn("again@example.com");
    const first = await me(c);
    expect(first.trial).toBe(true);
    const before = logs.length;
    await as(c)("/api/account/delete-code", "POST");
    const code = /Your code is (\d{6})/.exec(logs.slice(before).join("\n"))![1]!;
    expect((await as(c)("/api/account", "DELETE", { code })).status).toBe(200);
    const c2 = await signIn("again@example.com");
    const second = await me(c2);
    expect(second.id).not.toBe(first.id);
    expect(second.trial).toBe(true);
    expect(second.trialDaysLeft).toBe(first.trialDaysLeft);
  });
});

describe("signer's email stays with the sender", () => {
  it("is absent from the copy a link holder downloads and from the accepted banner", async () => {
    const c = await signIn("sender@example.com");
    const id = (await (await as(c)("/api/proposals", "POST", { template: "blank" })).json()).id;
    await as(c)(`/api/proposals/${id}/send`, "POST", { email: false });
    const pub = (await (await as(c)(`/api/proposals/${id}`)).json()).proposal.publicId;
    const page = await app.request(`${APP}/p/${pub}`, {}, env);
    const hash = (await page.text()).match(/id="seenHash" value="([a-f0-9]+)"/)?.[1] ?? "";
    const acc = await app.request(`${APP}/p/${pub}/accept`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.78" }, body: JSON.stringify({ signerName: "Pat Client", signerEmail: "pat.private@example.com", consent: true, seenHash: hash }) }, env);
    expect(acc.headers.get("location")).toContain("accepted=1");
    const banner = await (await app.request(`${APP}/p/${pub}?accepted=1`, {}, env)).text();
    expect(banner).not.toContain("pat.private@example.com");
    const publicPdf = await pdfText(await (await app.request(`${APP}/p/${pub}/pdf`, {}, env)).arrayBuffer());
    const ownerPdf = await pdfText(await (await as(c)(`/api/proposals/${id}/pdf`)).arrayBuffer());
    expect(ownerPdf).toContain("Accepted by");
    expect(ownerPdf).toContain("pat.private@example.com");
    expect(publicPdf).not.toContain("pat.private@example.com");
  });
});

describe("admin CSV export", () => {
  it("cannot smuggle a spreadsheet formula", async () => {
    (env as any).ADMIN_EMAILS = "boss@quoteandsign.com";
    const c = await signIn("formula@example.com");
    await as(c)("/auth/me", "PUT", { brandName: "=HYPERLINK(\"https://evil.example\")", marketingOptIn: true });
    const admin = await signIn("boss@quoteandsign.com");
    const csv = await (await as(admin)("/api/admin/subscribers.csv")).text();
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(csv).not.toContain(`,"=HYPERLINK`);
    delete (env as any).ADMIN_EMAILS;
  });
});

describe("billing events from a different Polar customer", () => {
  it("are ignored once the account is linked, even when they name the account", async () => {
    const c = await signIn("linked@example.com");
    const id = (await me(c)).id;
    await applyPolarEvent(env as any, { type: "subscription.active", data: { status: "active", customer_id: "cus_real", metadata: { userId: id, plan: "pro" } } });
    expect((await me(c)).paidPlan).toBe("pro");
    expect(await applyPolarEvent(env as any, { type: "subscription.revoked", data: { status: "revoked", customer_id: "cus_stranger", metadata: { userId: id } } })).toBeNull();
    expect((await me(c)).paidPlan).toBe("pro");
  });
});

describe("small public pages", () => {
  it("carry the strict policy", async () => {
    const r = await app.request(`${APP}/p/00000000-0000-4000-8000-000000000000`, {}, env);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-security-policy")).toContain("style-src 'nonce-");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("unlimited means a working business, not a script", () => {
  it("stops new proposals after 200 in a day, with a fair-use code", async () => {
    const c = await signIn("bulk@example.com");
    let ok = 0;
    let stopped: Response | null = null;
    for (let batch = 0; batch < 21 && !stopped; batch++) {
      const rs = await Promise.all(Array.from({ length: 10 }, () => as(c)("/api/proposals", "POST", { template: "blank" })));
      for (const r of rs) { if (r.ok) ok++; else if (!stopped) stopped = r; }
    }
    expect(ok).toBe(200);
    expect(stopped!.status).toBe(429);
    expect((await stopped!.json()).code).toBe("fair-use");
  });
});
