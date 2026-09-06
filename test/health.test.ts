import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../src/worker/index";

describe("worker", () => {
  it("answers the health check with security headers", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
