import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, and, gt, isNotNull } from "drizzle-orm";
import { getDb, schema, type User } from "./db";
import { randomToken, signValue, verifyValue } from "./crypto";
import type { AppEnv } from "../env";

export const SESSION_COOKIE = "op_session";
const SESSION_DAYS = 30;

function isSecure(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const db = getDb(c.env.DB);
  const id = randomToken(32);
  const now = new Date();
  await db.insert(schema.sessions).values({
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
    userAgent: c.req.header("user-agent")?.slice(0, 255) ?? null,
  });
  setCookie(c, SESSION_COOKIE, await signValue(c.env.SESSION_SECRET, id), {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const id = await verifyValue(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE));
  if (id) {
    await getDb(c.env.DB).delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getSessionUser(c: Context<AppEnv>): Promise<User | null> {
  const id = await verifyValue(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE));
  if (!id) return null;
  const db = getDb(c.env.DB);
  const row = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .get();
  if (!row || row.user.deletedAt) return null;
  return row.user;
}

/**
 * The workspace a person works in. Someone who has joined a Business team works inside the
 * owner's account: the owner's proposals, brand and plan. Everyone else is their own owner.
 */
export async function workspaceOwner(c: Context<AppEnv>, user: User): Promise<User> {
  const db = getDb(c.env.DB);
  const owns = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(eq(schema.teamMembers.ownerId, user.id)).get();
  if (owns) return user;
  const m = await db
    .select({ owner: schema.users })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.ownerId))
    .where(and(eq(schema.teamMembers.memberId, user.id), isNotNull(schema.teamMembers.joinedAt)))
    .get();
  if (!m || m.owner.deletedAt || m.owner.plan !== "business") return user;
  return m.owner;
}

/** Attach the signed-in user and the workspace owner to the context, or 401. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  c.set("owner", await workspaceOwner(c, user));
  await next();
};

/** Only the owner of the workspace, never a team member. */
export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").id !== c.get("owner").id) return c.json({ error: "Only the account owner can do this." }, 403);
  await next();
};
