import { schema, type Db } from "./db";
import { uuid } from "./crypto";

export async function audit(
  db: Db,
  entry: { userId?: string | null; proposalId?: string | null; event: string; meta?: unknown; ipHash?: string | null },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: uuid(),
    userId: entry.userId ?? null,
    proposalId: entry.proposalId ?? null,
    event: entry.event,
    meta: entry.meta ?? null,
    ipHash: entry.ipHash ?? null,
    createdAt: new Date(),
  });
}
