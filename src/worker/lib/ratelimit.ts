import { sql } from "drizzle-orm";
import { schema, type Db } from "./db";

/**
 * Fixed-window counter in D1. Good enough to stop credential-stuffing and accept-spam on
 * the free tier, where the WAF only gives us one rule. Keys are already hashed by callers.
 */
export async function rateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  // One statement: start a new window if the old one expired, otherwise increment. No read-then-write race.
  const row = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, windowStart: new Date(now) })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} + ${windowMs} <= ${now} then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${schema.rateLimits.windowStart} + ${windowMs} <= ${now} then ${now} else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count })
    .get();
  const count = row?.count ?? 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
