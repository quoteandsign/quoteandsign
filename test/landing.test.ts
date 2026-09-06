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
