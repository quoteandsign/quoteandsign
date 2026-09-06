import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

// Drives the whole loop through the real Worker: sign in, create, price, send, open as the
// client, accept, and verify the record. Email goes to the console in test, so we capture it.

const APP = "http://localhost:5173";
let cookie = "";

function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${APP}${path}`, { ...init, headers }, env);
}
function json(path: string, method: string, body?: unknown) {
  return req(path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

let proposalId = "";
let publicId = "";
const logs: string[] = [];

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

describe("end-to-end proposal loop", () => {
  it("signs in with a magic link", async () => {
    const r = await json("/auth/request", "POST", { email: "Sender@Example.com" });
    expect(r.status).toBe(200);
    const link = logs.join("\n").match(/http:\/\/localhost:5173\/auth\/verify\?token=[A-Za-z0-9_-]+/)?.[0];
    expect(link).toBeTruthy();

    // A GET (what email scanners do) only shows the continue page and consumes nothing.
    const page = await app.request(link!, { redirect: "manual" }, env);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Signing you in");
    const token = new URL(link!).searchParams.get("token")!;
    const redeem = () =>
      app.request(`${APP}/auth/verify`, { method: "POST", body: new URLSearchParams({ token }), redirect: "manual" }, env);
    const v = await redeem();
    expect(v.status).toBe(302);
    expect(v.headers.get("location")).toBe("/app");
    const setCookie = v.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/op_session=.*HttpOnly/);
    cookie = setCookie.split(";")[0]!;

    // The token is single-use.
    const again = await redeem();
    expect(again.headers.get("location")).toBe("/login?error=expired");

    const me = await req("/auth/me");
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe("sender@example.com");
  });

  it("creates a proposal from a template and edits it", async () => {
    const c = await json("/api/proposals", "POST", { template: "web-project" });
    expect(c.status).toBe(201);
    proposalId = (await c.json()).id;

    const g = await req(`/api/proposals/${proposalId}`);
    const data = await g.json();
    publicId = data.proposal.publicId;
    expect(data.items.length).toBe(4);
    expect(data.proposal.status).toBe("draft");

    const u = await json(`/api/proposals/${proposalId}`, "PUT", {
      title: "Website for Bramble & Co",
      clientName: "Bramble & Co",
      clientEmail: "hello@bramble.example",
      currency: "CAD",
    });
    expect(u.status).toBe(200);

    const items = data.items.map((it: any) => ({ ...it, taxRateBps: 1300 }));
    const pi = await json(`/api/proposals/${proposalId}/items`, "PUT", items);
    expect(pi.status).toBe(200);
  });

  it("hides drafts from the public and shows a preview to the owner", async () => {
    const anon = await app.request(`${APP}/p/${publicId}`, {}, env);
    expect(anon.status).toBe(404);
    const owner = await req(`/p/${publicId}`);
    expect(owner.status).toBe(200);
    expect(await owner.text()).toContain("Preview. This is what your client will see.");
  });

  it("sends the proposal and the client can open it", async () => {
    const s = await json(`/api/proposals/${proposalId}/send`, "POST");
    expect(s.status).toBe(200);
    expect((await s.json()).link).toBe(`${APP}/p/${publicId}`);
    expect(logs.join("\n")).toContain("hello@bramble.example");

    const page = await app.request(`${APP}/p/${publicId}`, { headers: { "cf-connecting-ip": "203.0.113.9" } }, env);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const html = await page.text();
    expect(html).toContain("Website for Bramble &amp; Co");
    expect(html).toContain("Accept proposal");
    expect(html).toContain('class="switch"');
    expect(html).not.toContain("Preview.");

    const g = await req(`/api/proposals/${proposalId}`);
    const d = await g.json();
    expect(d.proposal.status).toBe("viewed");
    expect(d.proposal.viewCount).toBe(1);
  });

  // The page embeds a fingerprint of what was shown; acceptances must carry it back.
  async function seenHash(): Promise<string> {
    const html = await (await app.request(`${APP}/p/${publicId}`, {}, env)).text();
    return /name="seenHash" id="seenHash" value="([0-9a-f]{64})"/.exec(html)![1]!;
  }

  it("rejects a cross-site acceptance", async () => {
    const r = await app.request(`${APP}/p/${publicId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ signerName: "Alex Morgan", consent: true, seenHash: await seenHash() }),
    }, env);
    expect(r.status).toBe(400);
  });

  it("rejects an acceptance without consent", async () => {
    const r = await app.request(`${APP}/p/${publicId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ signerName: "Alex Morgan", consent: false, seenHash: await seenHash() }),
    }, env);
    expect(r.status).toBe(400);
  });

  it("refuses an acceptance of a version the client did not see", async () => {
    const stale = await seenHash();
    await json(`/api/proposals/${proposalId}`, "PUT", { title: "Website for Bramble & Co (revised)" });
    const r = await app.request(`${APP}/p/${publicId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ signerName: "Alex Morgan", signerEmail: "alex@bramble.example", consent: true, seenHash: stale }),
    }, env);
    expect(r.status).toBe(409);
    await json(`/api/proposals/${proposalId}`, "PUT", { title: "Website for Bramble & Co" });
  });

  it("accepts with server-computed totals and a content hash", async () => {
    const g = await req(`/api/proposals/${proposalId}`);
    const d = await g.json();
    const optional = d.items.find((i: any) => i.name === "Copywriting");
    const pages = d.items.find((i: any) => i.name === "Extra pages");

    const r = await app.request(`${APP}/p/${publicId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "cf-connecting-ip": "203.0.113.9" },
      body: JSON.stringify({
        signerName: "Alex Morgan",
        signerEmail: "alex@bramble.example",
        consent: true,
        selection: { [optional.id]: { selected: false }, [pages.id]: { selected: true, quantity: 3 } },
        seenHash: await seenHash(),
      }),
    }, env);
    expect(r.status).toBe(200);
    expect((await r.json()).redirect).toBe(`/p/${publicId}?accepted=1#accept`);

    const rec = await (await app.request(`${APP}/p/${publicId}/record.json`, {}, env)).json();
    expect(rec.acceptance.ip).toBeUndefined(); // device details are for the owner only
    const ownerRec = await (await req(`/p/${publicId}/record.json`)).json();
    expect(ownerRec.acceptance.ip).toBe("203.0.113.9");
    // 4500 build + 3 pages x 600 = 6300, tax 13 % = 819 → 7119
    expect(rec.acceptance.totalAmount).toBe(711900);
    expect(rec.acceptance.currency).toBe("CAD");
    expect(rec.acceptance.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.acceptance.contentHashMatchesCurrentContent).toBe(true);
    expect(rec.acceptance.selectedItems.map((s: any) => s.quantity)).toContain(3);
    expect(rec.acceptance.signedText).toBe("Alex Morgan");
    expect(rec.items[0].proposalId).toBeUndefined();

    const page = await (await app.request(`${APP}/p/${publicId}?accepted=1`, {}, env)).text();
    expect(page).toContain("Accepted by <strong>Alex Morgan</strong>");
    expect(page).not.toContain('id="acceptBtn"');

    // Second acceptance is refused, and the sender can no longer edit.
    const twice = await app.request(`${APP}/p/${publicId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ signerName: "Someone Else", consent: true, seenHash: "0".repeat(64) }),
    }, env);
    expect(twice.status).toBe(409);
    const edit = await json(`/api/proposals/${proposalId}`, "PUT", { title: "changed" });
    expect(edit.status).toBe(409);
    const del = await req(`/api/proposals/${proposalId}`, { method: "DELETE" });
    expect(del.status).toBe(409);

    expect(logs.join("\n")).toContain("Accepted: Website for Bramble & Co");
    expect(logs.join("\n")).toContain("alex@bramble.example");
  });

  it("protects a link with a password", async () => {
    const c = await json("/api/proposals", "POST", { template: "blank" });
    const id = (await c.json()).id;
    await json(`/api/proposals/${id}`, "PUT", { password: "hunter2" });
    await json(`/api/proposals/${id}/send`, "POST");
    const pid = (await (await req(`/api/proposals/${id}`)).json()).proposal.publicId;

    const locked = await app.request(`${APP}/p/${pid}`, {}, env);
    expect(locked.status).toBe(200);
    expect(await locked.text()).toContain("This proposal is protected");

    const wrong = await app.request(`${APP}/p/${pid}/unlock`, { method: "POST", body: new URLSearchParams({ password: "nope" }), redirect: "manual" }, env);
    expect(wrong.headers.get("location")).toBe(`/p/${pid}?wrong=1`);

    const ok = await app.request(`${APP}/p/${pid}/unlock`, { method: "POST", body: new URLSearchParams({ password: "hunter2" }), redirect: "manual" }, env);
    expect(ok.status).toBe(302);
    const unlock = (ok.headers.get("set-cookie") ?? "").split(";")[0]!;
    const open = await app.request(`${APP}/p/${pid}`, { headers: { cookie: unlock } }, env);
    expect(await open.text()).toContain("Accept proposal");
  });

  it("enforces the free-plan live limit and rate limits sign-in requests", async () => {
    // One live already (the password one; the accepted one no longer counts).
    // Two more succeed, the fourth live proposal is refused on the free plan.
    await env.DB.prepare("UPDATE users SET trial_ends_at = NULL").run();
    for (const expected of [200, 200, 402]) {
      const c = await json("/api/proposals", "POST", { template: "blank" });
      const id = (await c.json()).id;
      const s = await json(`/api/proposals/${id}/send`, "POST");
      expect(s.status).toBe(expected);
    }
    // Distinct emails, so only the per-IP limit (10 per 15 min) applies.
    let last = 200;
    for (let i = 0; i < 12; i++) {
      last = (await json("/auth/request", "POST", { email: `probe${i}@example.com` })).status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it("refuses unauthenticated API access and unknown proposals", async () => {
    const saved = cookie;
    cookie = "";
    expect((await req("/api/proposals")).status).toBe(401);
    cookie = saved;
    expect((await req("/api/proposals/does-not-exist")).status).toBe(404);
    expect((await app.request(`${APP}/p/not-a-uuid`, {}, env)).status).toBe(404);
  });
});
