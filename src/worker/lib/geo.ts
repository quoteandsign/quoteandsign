/**
 * Search and AI-assistant visibility, the parts that live in code:
 * - structured data helpers (Organization, Article, FAQ, ItemList) that every public page family uses,
 * - one "content updated" date shown on the page and in the markup,
 * - a machine-readable pricing file,
 * - IndexNow, which tells Bing (and through it ChatGPT search and Copilot) about new and changed
 *   pages within minutes instead of weeks.
 */
import type { Bindings } from "../env";
import { getDb } from "./db";
import { getSetting, setSetting } from "./analytics";
import { sha256Hex } from "./crypto";
import { PLANS } from "./plan";
import { LEGAL } from "./legal";

/** Bump when the comparison or rate content changes. Shown as "Updated ..." and as dateModified. */
export const CONTENT_UPDATED = "2026-09-19";
export const CONTENT_PUBLISHED = "2026-09-07";
export const updatedLabel = () => new Date(CONTENT_UPDATED + "T12:00:00Z").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

const ld = (nonce: string, obj: unknown) => `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

export const organization = (appUrl: string) => ({ "@type": "Organization", "@id": `${appUrl}/#org`, name: "Quote and Sign", url: appUrl, logo: `${appUrl}/brand/og.png`, sameAs: ["https://github.com/quoteandsign/quoteandsign"] });

export function orgJsonLd(nonce: string, appUrl: string): string {
  return ld(nonce, { "@context": "https://schema.org", "@graph": [organization(appUrl), { "@type": "WebSite", "@id": `${appUrl}/#site`, url: appUrl, name: "Quote and Sign", publisher: { "@id": `${appUrl}/#org` }, inLanguage: "en" }] });
}

export function articleJsonLd(nonce: string, o: { appUrl: string; path: string; headline: string; description: string; about?: string }): string {
  return ld(nonce, {
    "@context": "https://schema.org", "@type": "Article", headline: o.headline, description: o.description, url: `${o.appUrl}${o.path}`, mainEntityOfPage: `${o.appUrl}${o.path}`,
    datePublished: CONTENT_PUBLISHED, dateModified: CONTENT_UPDATED, inLanguage: "en", author: organization(o.appUrl), publisher: organization(o.appUrl), ...(o.about ? { about: o.about } : {}),
  });
}

export function faqJsonLd(nonce: string, qas: [string, string][]): string {
  return ld(nonce, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qas.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
}

export function itemListJsonLd(nonce: string, appUrl: string, items: { name: string; path: string }[]): string {
  return ld(nonce, { "@context": "https://schema.org", "@type": "ItemList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: `${appUrl}${it.path}` })) });
}

/** The pricing, as a text file an assistant can read without parsing a page. */
export function pricingMd(appUrl: string): string {
  const { free, pro, business } = PLANS;
  return `# Quote and Sign pricing

Updated ${CONTENT_UPDATED}. Prices in USD, flat per account (not per user), no per-document fees. Source: ${appUrl}/#plans

| Plan | Monthly | Yearly (per month) | Live proposals | Team | Notes |
|---|---|---|---|---|---|
| Free | $0 | $0 | ${free.liveLimit} at a time | 1 | Live pricing, one-tap accept, signed PDF to both sides, all templates, export |
| Pro | $${pro.monthly} | $${pro.yearly} | Unlimited | 1 | Adds logo, colour and page styles, link passwords, expiry dates, reminders, open notifications, PDF export, payment link after signing, footer off |
| Business | $${business.monthly} | $${business.yearly} | Unlimited | up to ${business.seats} | Everything in Pro, shared templates, countersigning, signed webhooks, priority support |

- Every new account starts with a 14-day Pro trial. No card is taken for it.
- Billing is handled by Polar (merchant of record). Cancel any time; access continues to the end of the paid period.
- Open source under the AGPL-3.0: the whole product can be self-hosted at no licence cost.
- Operated from ${LEGAL.province}, Canada.
`;
}

// ---- IndexNow --------------------------------------------------------------------------------

/** The key is derived, so there is nothing new to store or leak. Served at /<key>.txt. */
export const indexNowKey = (secret: string) => sha256Hex(secret + ":indexnow").then((h) => h.slice(0, 32));

export async function submitIndexNow(env: Bindings, urls: string[]): Promise<{ ok: boolean; status: number; count: number }> {
  if (!urls.length) return { ok: true, status: 200, count: 0 };
  const host = new URL(env.APP_URL).host;
  const key = await indexNowKey(env.SESSION_SECRET);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${env.APP_URL}/${key}.txt`, urlList: urls.slice(0, 10_000) }),
  });
  return { ok: res.ok || res.status === 202, status: res.status, count: urls.length };
}

/** Once a day from the cron: submit the public URLs when the list changed since the last submit. */
export async function indexNowIfChanged(env: Bindings, urls: string[], force = false): Promise<{ submitted: boolean; status?: number; count?: number }> {
  if (env.ENVIRONMENT !== "production") return { submitted: false };
  const db = getDb(env.DB);
  const hash = await sha256Hex(urls.join("\n"));
  if (!force && (await getSetting(db, "indexnow_hash")) === hash) return { submitted: false };
  const r = await submitIndexNow(env, urls);
  if (r.ok) await setSetting(db, "indexnow_hash", hash);
  return { submitted: r.ok, status: r.status, count: r.count };
}
