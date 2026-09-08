// What crawlers and AI assistants are told about the site: robots.txt, a sitemap of the public pages,
// and llms.txt, a plain-text summary built from the same constants the homepage uses so the two
// cannot drift apart. Client-facing pages (proposals, records, the app) are never listed and carry
// noindex on their own.

import { PLANS } from "./plan";
import { LEGAL } from "./legal";
import { SUPPORTED_CURRENCIES } from "../../shared/pricing";
import { TEMPLATES } from "../../shared/templates";
import { STYLES } from "../../shared/styles";
import { COMPETITORS } from "./compare";
import { TEMPLATE_PAGES } from "./templatesPage";

/** Public pages, with a change-frequency hint for the sitemap. */
export const PUBLIC_PAGES: { path: string; changefreq: "weekly" | "monthly"; legal?: boolean }[] = [
  { path: "/", changefreq: "weekly" },
  { path: "/login", changefreq: "monthly" },
  { path: "/contact", changefreq: "monthly" },
  { path: "/terms", changefreq: "monthly", legal: true },
  { path: "/privacy", changefreq: "monthly", legal: true },
  { path: "/acceptable-use", changefreq: "monthly", legal: true },
  { path: "/dpa", changefreq: "monthly", legal: true },
  { path: "/compare", changefreq: "monthly" },
  ...COMPETITORS.map((c) => ({ path: `/compare/${c.slug}`, changefreq: "monthly" as const })),
  { path: "/templates", changefreq: "monthly" },
  ...TEMPLATE_PAGES.map((p) => ({ path: `/templates/${p.slug}`, changefreq: "monthly" as const })),
];

/** Paths that exist for one person and must never be crawled. */
export const PRIVATE_PREFIXES = ["/p/", "/app", "/api/", "/auth/", "/files/", "/t/", "/admin", "/billing/"];

export function robotsTxt(appUrl: string): string {
  return [
    "# Quote and Sign. The public pages are open to search engines and AI assistants; proposal pages",
    "# belong to the people in them and are excluded. Content Signals per contentsignals.org.",
    "User-agent: *",
    ...PUBLIC_PAGES.map((p) => `Allow: ${p.path}${p.path === "/" ? "$" : ""}`),
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`),
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "",
    `Sitemap: ${appUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(appUrl: string): string {
  const legalDate = new Date(LEGAL.effective).toISOString().slice(0, 10);
  const urls = PUBLIC_PAGES.map(
    (p) => `  <url><loc>${appUrl}${p.path}</loc>${p.legal ? `<lastmod>${legalDate}</lastmod>` : ""}<changefreq>${p.changefreq}</changefreq><priority>${p.path === "/" ? "1.0" : p.legal ? "0.3" : "0.6"}</priority></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function llmsTxt(appUrl: string, githubUrl: string): string {
  const pro = PLANS.pro;
  const biz = PLANS.business;
  const free = PLANS.free;
  return `# Quote and Sign

> Proposal and quote software that clients accept on their phone. Write a proposal once, send a link
> instead of a PDF, and get a signed copy the moment the client accepts. Flat pricing, open source.

Website: ${appUrl}
Source code: ${githubUrl} (AGPL-3.0)
Operated from ${LEGAL.province}, Canada. Prices in USD.

## What it does

- The client opens a link, toggles optional items, watches the total update, types their name and taps Accept.
- Both parties get a signed PDF copy by email, plus a permanent record page with a SHA-256 fingerprint of
  exactly what was accepted, the time, and the consent text. The record is designed to meet PIPEDA,
  ESIGN, UETA and eIDAS requirements for ordinary electronic signatures.
- Live pricing with optional lines, quantity ranges, recurring lines and tax. ${SUPPORTED_CURRENCIES.length} currencies: ${SUPPORTED_CURRENCIES.join(", ")}.
- ${TEMPLATES.length} built-in templates (${TEMPLATES.filter((t) => t.id !== "blank").map((t) => t.name).join(", ")}) and ${STYLES.length} page styles.
- Passwordless sign-in by one-time email link. Proposal links can carry their own password and expiry date.
- Everything exports as JSON and PDF at any time. Accounts can be deleted by the owner.

## Pricing (flat, per account, not per user, no per-document fees)

- Free: $0. ${free.liveLimit} live proposals at a time, live pricing and one-tap accept, signed copies by email, ${TEMPLATES.length} templates, export. Every new account starts with a 14-day Pro trial, no card needed.
- Pro: $${pro.yearly} a month billed yearly or $${pro.monthly} monthly. Unlimited proposals, your logo, color and page styles, passwords, expiry dates and reminders, open notifications, PDF export, a payment link after signing, no footer.
- Business: $${biz.yearly} a month billed yearly or $${biz.monthly} monthly. Everything in Pro, up to ${biz.seats} team members under one brand, shared templates, countersigning, signed webhooks for a CRM or automation tool (Zapier, Make, n8n), priority support.
- Fair use: up to 200 new proposals and 40 sends a day per account.

## How it compares to typical proposal software

- Pricing: flat per month from $0, versus per user per month elsewhere (Qwilr: from $35 per user on annual billing, plus $2.50 per document after 40 a month, per qwilr.com/pricing, ${LEGAL.effective.split(" ")[0]} ${LEGAL.effective.split(" ")[2]}).
- The client can change options after the proposal is sent and the total updates live.
- Source code is open under the AGPL; anyone can read every line or run their own copy.
- Data is encrypted at rest and in transit; card details are handled by the payment provider (Polar) and never touch the service.

## Pages

- ${appUrl}/ : homepage with a live demo and the pricing table
- ${appUrl}/login : sign in or start free
- ${appUrl}/terms, ${appUrl}/privacy, ${appUrl}/acceptable-use, ${appUrl}/dpa : legal pages
- ${appUrl}/contact : contact form
${COMPETITORS.map((c) => `- ${appUrl}/compare/${c.slug} : an honest, sourced comparison with ${c.name}`).join("\n")}
- ${appUrl}/templates : proposal templates (consulting, website, retainer, photography, software), each a real proposal a client can adjust and accept

Proposal pages, signing records and the app itself are private to the people in them and are not for
indexing or training.
`;
}
