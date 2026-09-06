import type { User } from "./lib/db";

export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  ENVIRONMENT: string;
  EMAIL_FROM: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_SERVER?: string; // "sandbox" (default) or "production"
  POLAR_PRODUCT_PRO?: string; // monthly
  POLAR_PRODUCT_BUSINESS?: string;
  POLAR_PRODUCT_PRO_YEAR?: string; // yearly
  POLAR_PRODUCT_BUSINESS_YEAR?: string;
  TURNSTILE_SITE_KEY?: string; // Cloudflare Turnstile, public; empty = no challenge
  TURNSTILE_SECRET?: string;
  ADMIN_EMAILS?: string; // comma-separated account emails that may open /app/admin
  SUPPORT_EMAIL?: string; // where contact-form messages land; defaults to the from address
};

export type Variables = {
  user: User; // who is signed in
  owner: User; // whose workspace they work in (themselves, or the Business owner who invited them)
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

/** Public origin for links. In development it follows the request so any port works. */
export function appUrl(c: { env: Bindings; req: { url: string } }): string {
  if (c.env.ENVIRONMENT === "development") return new URL(c.req.url).origin;
  return c.env.APP_URL;
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}
