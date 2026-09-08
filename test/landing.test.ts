import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

describe("legal pages", () => {
  it("serves terms, privacy, acceptable use and the DPA with a strict CSP and the key promises", async () => {
    const pages: [string, string][] = [["/terms", "Limitation of liability"], ["/privacy", "Privacy Officer"], ["/acceptable-use", "Report abuse"], ["/dpa", "Subprocessors"]];
    for (const [path, needle] of pages) {
      const res = await app.request(`http://localhost:5173${path}`, {}, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      const html = await res.text();
      expect(html).toContain(needle);
      expect(html).not.toContain("—");
    }
    const terms = await (await app.request("http://localhost:5173/terms", {}, env)).text();
    expect(terms).toContain("CAD $50");
    expect(terms).toContain("12 months");
    const privacy = await (await app.request("http://localhost:5173/privacy", {}, env)).text();
    expect(privacy).toContain("Cloudflare");
    expect(privacy).toContain("72 hours");
  });
});

describe("homepage", () => {
  it("renders server-side with metadata, the live demo and a strict CSP", async () => {
    const res = await app.request("http://localhost:5173/", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const html = await res.text();
    expect(html).toContain("<title>Quote and Sign");
    expect(html).toContain('name="description"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("Accept this proposal");
    expect(html).toContain('class="switch"');
    expect(html).toContain("var demo=true");
    expect(html).not.toContain("—");
  });
});

describe("what crawlers are told", () => {
  it("serves a real robots.txt, sitemap and llms.txt that list only the public pages", async () => {
    const robots = await app.request("http://localhost:5173/robots.txt", {}, env);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    const r = await robots.text();
    expect(r).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
    for (const p of ["/p/", "/app", "/api/", "/auth/", "/files/", "/t/", "/admin"]) expect(r).toContain("Disallow: " + p);
    expect(r).toContain("Sitemap: http://localhost:5173/sitemap.xml");
    const sitemap = await app.request("http://localhost:5173/sitemap.xml", {}, env);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    const x = await sitemap.text();
    expect((x.match(/<url>/g) ?? []).length).toBe(16);
    expect(x).toContain("/compare/pandadoc");
    expect(x).toContain("/templates/consulting-proposal-template");
    expect(x).toContain("/compare/qwilr");
    expect(x).not.toContain("/p/");
    expect(x).not.toContain("/app");
    const llms = await (await app.request("http://localhost:5173/llms.txt", {}, env)).text();
    expect(llms).toContain("# Quote and Sign");
    expect(llms).toContain("Pro: $19 a month billed yearly or $24 monthly");
    expect(llms).toContain("16 currencies");
    expect(llms).toContain("AGPL");
    expect(llms).not.toContain("Cloudflare");
    // Client-facing pages stay out of every index.
    const notFound = await (await app.request("http://localhost:5173/p/00000000-0000-4000-8000-000000000000", {}, env)).text();
    expect(notFound).toContain('name="robots" content="noindex"');
  });
});

describe("comparison pages", () => {
  it("serve a sourced, dated comparison with a strict CSP and an honest 'what they do better' section", async () => {
    const res = await app.request("http://localhost:5173/compare/qwilr", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain("Quote and Sign vs Qwilr");
    expect(html).toContain("qwilr.com/pricing");
    expect(html).toContain("September 2026");
    expect(html).toContain("What Qwilr does that we do not");
    expect(html).toContain("$19 a month billed yearly");
    expect(html).not.toContain("—");
    expect((await app.request("http://localhost:5173/compare/nobody", {}, env)).status).toBe(404);
  });
});

describe("template landing pages", () => {
  it("list every template, show the real preview in a same-origin frame, and hand off to sign-in", async () => {
    const index = await app.request("http://localhost:5173/templates", {}, env);
    expect(index.status).toBe(200);
    const ih = await index.text();
    for (const s of ["consulting-proposal-template", "website-proposal-template", "retainer-proposal-template", "photography-proposal-template", "software-development-proposal-template"]) expect(ih).toContain(`/templates/${s}`);
    const page = await app.request("http://localhost:5173/templates/consulting-proposal-template", {}, env);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-src 'self'");
    const html = await page.text();
    expect(html).toContain("<h1>Consulting proposal template</h1>");
    expect(html).toContain('src="/t/consulting?thumb=1"');
    expect(html).toContain('href="/login?template=consulting"');
    expect(html).toContain("Operations review");
    expect(html).not.toContain("—");
    expect((await app.request("http://localhost:5173/templates/nothing-here", {}, env)).status).toBe(404);
    for (const slug of ["pandadoc", "proposify"]) {
      const c = await app.request(`http://localhost:5173/compare/${slug}`, {}, env);
      expect(c.status).toBe(200);
      expect(await c.text()).toContain("September 2026");
    }
  });
});
