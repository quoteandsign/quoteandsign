import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { getDb, schema } from "../src/worker/lib/db";
import { pruneOldRows, AUDIT_DAYS } from "../src/worker/lib/reminders";
import { count, sql } from "drizzle-orm";

// The privacy policy states retention periods. The nightly job is what makes them true.

const DAY = 24 * 60 * 60_000;

describe("nightly prune enforces the retention periods in the privacy policy", () => {
  it("drops old security-log rows, spent sign-in links and dead sessions, keeps fresh ones", async () => {
    const db = getDb(env.DB);
    const now = new Date();
    const old = (days: number) => new Date(now.getTime() - days * DAY);
    await db.insert(schema.auditLog).values([
      { id: "a-old", event: "test", createdAt: old(AUDIT_DAYS + 1) },
      { id: "a-new", event: "test", createdAt: old(AUDIT_DAYS - 1) },
    ]);
    await db.insert(schema.magicTokens).values([
      { tokenHash: "t-old", email: "x@example.com", createdAt: old(3), expiresAt: old(2) },
      { tokenHash: "t-new", email: "x@example.com", createdAt: now, expiresAt: new Date(now.getTime() + 15 * 60_000) },
    ]);
    await db.insert(schema.users).values({ id: "u-ret", email: "ret@example.com", createdAt: now, updatedAt: now } as any);
    await db.insert(schema.sessions).values([
      { id: "s-old", userId: "u-ret", createdAt: old(40), expiresAt: old(5) },
      { id: "s-new", userId: "u-ret", createdAt: now, expiresAt: new Date(now.getTime() + 10 * DAY) },
    ]);
    await db.insert(schema.tickets).values([
      { id: "k-old", kind: "question", name: "A", email: "a@example.com", subject: "old", status: "closed", createdAt: old(400), updatedAt: old(AUDIT_DAYS + 1) },
      { id: "k-open", kind: "question", name: "A", email: "a@example.com", subject: "open but old", status: "open", createdAt: old(400), updatedAt: old(400) },
      { id: "k-new", kind: "question", name: "A", email: "a@example.com", subject: "closed lately", status: "closed", createdAt: old(10), updatedAt: old(10) },
    ]);
    await pruneOldRows(env, now);
    expect((await db.select({ id: schema.tickets.id }).from(schema.tickets)).map((r) => r.id).sort()).toEqual(["k-new", "k-open"]);
    const ids = async (t: any, col: any) => (await db.select({ id: col }).from(t).where(sql`${col} like 'a-%' or ${col} like 't-%' or ${col} like 's-%'`)).map((r) => r.id).sort();
    expect(await ids(schema.auditLog, schema.auditLog.id)).toEqual(["a-new"]);
    expect(await ids(schema.magicTokens, schema.magicTokens.tokenHash)).toEqual(["t-new"]);
    expect(await ids(schema.sessions, schema.sessions.id)).toEqual(["s-new"]);
    expect((await db.select({ n: count() }).from(schema.rateLimits)).length).toBe(1);
  });
});
