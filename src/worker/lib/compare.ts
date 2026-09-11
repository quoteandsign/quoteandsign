// A comparison page per competitor, server-rendered like the legal pages and built from the same
// constants as the homepage so prices never drift. Truthful comparative advertising: every number
// about the other product is sourced and dated, and the section on what they do better is real.

import { shell, breadcrumbs, LEGAL } from "./legal";
import { esc } from "./render";
import { PLANS } from "./plan";
import { SUPPORTED_CURRENCIES } from "../../shared/pricing";

export type Competitor = {
  slug: string;
  name: string;
  site: string;
  pricingUrl: string;
  checked: string; // month and year the pricing page was read
  theirPricing: string;
  theirPerDoc: string;
  theyDoBetter: string[];
  rows: [string, string, string][]; // label, us, them
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "qwilr",
    name: "Qwilr",
    site: "qwilr.com",
    pricingUrl: "https://qwilr.com/pricing",
    checked: "September 2026",
    theirPricing: "From $35 per user per month on annual billing ($49 monthly). Growth $55 and Scale $75 per user per month, annual only, with five and ten user minimums.",
    theirPerDoc: "$2.50 per document after the plan's monthly allowance (40 on Starter).",
    theyDoBetter: [
      "Native connectors for HubSpot, Salesforce and other CRMs, with two-way sync. Quote and Sign offers signed webhooks instead, which reach the same tools through Zapier, Make or n8n, but there is no native app.",
      "A large library of designed page templates and a block library shared across a team. Quote and Sign ships seven templates and lets you save your own.",
      "Built-in payment collection with QwilrPay. Quote and Sign shows your own payment link after signing rather than processing the payment.",
      "Larger team features: roles, approval workflows, brand locking across many users.",
    ],
    rows: [],
  },
  {
    slug: "pandadoc",
    name: "PandaDoc",
    site: "pandadoc.com",
    pricingUrl: "https://www.pandadoc.com/pricing/",
    checked: "September 2026",
    theirPricing: "Starter $19 per user per month on annual billing ($35 monthly). Business $49 per user per month annual ($65 monthly). Enterprise on request. A free eSign plan exists for signing only.",
    theirPerDoc: "Each plan carries a monthly document allowance; beyond it, $2 to $3.50 per document depending on plan and billing.",
    theyDoBetter: [
      "A very large template and content library, with a document editor that covers contracts, HR paperwork and forms as well as proposals.",
      "Native CRM apps for HubSpot, Salesforce, Pipedrive, Zoho and others, with two-way sync. Quote and Sign offers signed webhooks that reach the same tools through Zapier, Make or n8n.",
      "Built-in payment collection, CPQ-style product catalogues, and approval workflows for larger sales teams.",
      "Notarization and advanced identity verification on higher plans.",
    ],
    rows: [],
  },
  {
    slug: "proposify",
    name: "Proposify",
    site: "proposify.com",
    pricingUrl: "https://www.proposify.com/pricing",
    checked: "September 2026",
    theirPricing: "Basic $19 per user per month on annual billing ($29 monthly). Team $41 per user per month annual ($49 quarterly). Business from about $3,900 a year. Fourteen-day trial, no free plan.",
    theirPerDoc: "Sends are metered: 10 a month on Basic, 30 on Team, 75 on Business, then $0.30 to $0.75 per extra send.",
    theyDoBetter: [
      "A designed template gallery and a content library shared across a team, with brand controls that lock fonts and colors.",
      "Native integrations with HubSpot, Salesforce and Pipedrive, plus Stripe payments inside the proposal.",
      "Team analytics and pipeline-style reporting for sales managers.",
    ],
    rows: [],
  },
];

function rowsFor(c: Competitor): [string, string, string][] {
  const pro = PLANS.pro;
  const biz = PLANS.business;
  return [
    ["Pricing model", `Flat per account. Free, Pro $${pro.yearly} a month billed yearly ($${pro.monthly} monthly), Business $${biz.yearly} ($${biz.monthly}) with ${biz.seats} seats`, c.theirPricing],
    ["Per-document fees", "None. Fair use is 200 new proposals a day", c.theirPerDoc],
    ["Client changes options", "Live: optional lines and quantities, the total updates as they read", "Interactive pricing is available; options are set by the sender"],
    ["Acceptance record", "Name, time, consent text, chosen options and a SHA-256 fingerprint of the exact content, verifiable from the record file; countersign on Business", "E-signature with audit trail"],
    ["Currencies", `${SUPPORTED_CURRENCIES.length}, including CAD, USD, EUR and GBP`, "Multiple; check the plan"],
    ["CRM and automation", "Signed webhooks on Business, for Zapier, Make, n8n, HubSpot, Pipedrive", "Native integrations on higher tiers"],
    ["Source code", "Open under the AGPL. Read every line or run your own copy on a free Cloudflare account", "Closed"],
    ["Export", "Everything as JSON and PDF, any time; delete the account yourself", "PDF export; account deletion through support"],
    ["Sign-in", "One-time email link; no passwords stored", "Password and SSO"],
    ...c.rows,
  ];
}

export function renderCompare(c: Competitor, nonce: string, analytics: string | null = null): string {
  const rows = rowsFor(c);
  const body = `
<p class="cmp-switch">Compared with: ${COMPETITORS.map((o) => o.slug === c.slug ? `<strong>${esc(o.name)}</strong>` : `<a href="/compare/${o.slug}">${esc(o.name)}</a>`).join(" · ")}</p>
<h1>Quote and Sign vs ${esc(c.name)}</h1>
<p class="eff">An honest comparison for people choosing proposal software. ${esc(c.name)}'s prices and features are taken from ${esc(c.site)} as read in ${esc(c.checked)}; if something has changed since, tell us through the <a href="/contact">contact form</a> and it will be corrected.</p>

<div class="box"><p><strong>The short version.</strong> ${esc(c.name)} charges per user and per document and gives you a polished, closed product with native CRM connectors. Quote and Sign charges a flat price per account, lets the client change options on the page, keeps a verifiable acceptance record, and publishes its source code. If you are a freelancer, a studio or a small agency sending proposals rather than managing a sales floor, the flat price usually wins. If you need a native Salesforce or HubSpot app today, ${esc(c.name)} has it and we do not.</p></div>

<h2>Side by side</h2>
<div class="wrap-x"><table class="cmp">
<thead><tr><th></th><th>Quote and Sign</th><th>${esc(c.name)}</th></tr></thead>
<tbody>
${rows.map(([k, us, them]) => `<tr><td>${esc(k)}</td><td>${esc(us)}</td><td>${esc(them)}</td></tr>`).join("\n")}
</tbody></table></div>
<p class="muted">${esc(c.name)} figures from <a href="${esc(c.pricingUrl)}" rel="noopener nofollow">${esc(c.pricingUrl)}</a>, ${esc(c.checked)}. Prices in USD. ${esc(c.name)} is a trademark of its owner; it is named here only to compare the two products.</p>

<h2>What ${esc(c.name)} does that we do not</h2>
<ul>
${c.theyDoBetter.map((t) => `<li>${esc(t)}</li>`).join("\n")}
</ul>

<h2>What we do that ${esc(c.name)} does not</h2>
<ul>
<li>Flat pricing. One price for the account, no seats to count, no document allowance to watch.</li>
<li>The client can toggle optional lines and set quantities on the proposal page; the total updates as they read, and what they chose is part of the signed record.</li>
<li>A fingerprint of the exact accepted content in the record, so either side can prove later that nothing changed.</li>
<li>Open source under the AGPL. You can read how the acceptance record is built, and you can run the whole thing yourself.</li>
<li>Everything exports, and you can delete your account without asking anyone.</li>
</ul>

<h2>Try it</h2>
<p>Every account starts with fourteen days of Pro, no card needed, then Free for three live proposals. <a href="/login">Start free</a> or read the <a href="/#plans">plans</a>.</p>
`;
  const extraHead = `${breadcrumbs(nonce, [["Compare", "/compare"], [`Quote and Sign vs ${c.name}`, `/compare/${c.slug}`]])}
<style nonce="${nonce}">
.cmp{width:100%;border-collapse:separate;border-spacing:0;font-size:14.5px;line-height:1.5;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.cmp th,.cmp td{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line);vertical-align:top}
.cmp tr:last-child td{border-bottom:0}
.cmp th{font-weight:650;background:#faf8f3;font-size:14px}
.cmp td:first-child{white-space:nowrap;font-weight:600;color:var(--muted);width:1%;font-size:13.5px}
.cmp td:nth-child(2),.cmp th:nth-child(2){background:color-mix(in srgb,var(--accent) 6%,#fff)}
.cmp th:nth-child(2){color:var(--accent)}
.cmp td:nth-child(2),.cmp td:nth-child(3){width:46%}
.wrap-x{overflow-x:auto;margin:8px 0 12px}
.cmp-switch{font-size:13.5px;color:var(--muted);margin:24px 0 -12px}.cmp-switch a{color:var(--accent);text-decoration:none}.cmp-switch a:hover{text-decoration:underline}
@media(max-width:640px){.cmp td:first-child{white-space:normal;width:auto}.cmp{font-size:14px}.cmp th,.cmp td{padding:12px 12px}}
</style>`;
  return shell(`Quote and Sign vs ${c.name}`, body, nonce, extraHead, analytics, {
    path: `/compare/${c.slug}`,
    description: `Quote and Sign vs ${c.name}: flat pricing instead of per-user fees, live client options, a verifiable acceptance record, open source. Sourced from ${c.site}, ${c.checked}.`,
  });
}

export const compareBySlug = (slug: string) => COMPETITORS.find((c) => c.slug === slug) ?? null;

/** The index: one card per competitor, and the promise that keeps the pages honest. */
export function renderCompareIndex(nonce: string, analytics: string | null = null): string {
  const cards = COMPETITORS.map((c) => `<div class="cmp-card"><h2><a href="/compare/${c.slug}">Quote and Sign vs ${esc(c.name)}</a></h2><p>${esc(c.theirPricing.split(". ")[0])}. Read in ${esc(c.checked)}.</p><a href="/compare/${c.slug}">Read the comparison</a></div>`).join("\n");
  const body = `
<h1>How Quote and Sign compares</h1>
<p class="eff">One page per product, with their prices and features taken from their own sites, dated, and a section on what they do that we do not. If you find something out of date, tell us through the <a href="/contact">contact form</a>.</p>
<div class="cmp-grid">${cards}</div>
<h2>The pattern across all of them</h2>
<ul>
<li>They charge per user and meter documents or sends. Quote and Sign is one flat price per account with no document fees.</li>
<li>They have native CRM apps on higher tiers. Quote and Sign has signed webhooks on Business, which reach the same tools through Zapier, Make or n8n.</li>
<li>They are closed. Quote and Sign is open source under the AGPL, and you can run your own copy.</li>
</ul>
<p><a class="tpl-cta" href="/login">Start free</a></p>`;
  return shell("Compare", body, nonce, `${breadcrumbs(nonce, [["Compare", "/compare"]])}
<style nonce="${nonce}">.cmp-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin:20px 0}.cmp-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px}.cmp-card h2{margin:0 0 6px;font-size:18px}.cmp-card h2 a{color:var(--fg);text-decoration:none}.cmp-card p{margin:0 0 10px;color:var(--muted);font-size:14px}.tpl-cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px}</style>`, analytics, {
    path: "/compare",
    description: "Quote and Sign compared with Qwilr, PandaDoc and Proposify: pricing, client-side options, the acceptance record, and what each does better.",
  });
}

/** Used by the sitemap. */
export const COMPARE_PATHS = COMPETITORS.map((c) => `/compare/${c.slug}`);

export { LEGAL };
