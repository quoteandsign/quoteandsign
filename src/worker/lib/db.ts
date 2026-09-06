import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
export type User = typeof schema.users.$inferSelect;
export type Proposal = typeof schema.proposals.$inferSelect;
export type PricingItem = typeof schema.pricingItems.$inferSelect;
export type Acceptance = typeof schema.acceptances.$inferSelect;
