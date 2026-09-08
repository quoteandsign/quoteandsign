// A comparison page per competitor, server-rendered like the legal pages and built from the same
// constants as the homepage so prices never drift. Truthful comparative advertising: every number
// about the other product is sourced and dated, and the section on what they do better is real.

import { shell, LEGAL } from "./legal";
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
      "A large library of designed page templates and a block library shared across a team. Quote and Sign ships six templates and lets you save your own.",
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
  const extraHead = `<meta name="description" content="Quote and Sign compared with ${esc(c.name)}: flat pricing versus per-user pricing, live client options, a verifiable acceptance record, open source. Sourced from ${esc(c.site)}, ${esc(c.checked)}.">
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
@media(max-width:640px){.cmp td:first-child{white-space:normal;width:auto}.cmp{font-size:14px}.cmp th,.cmp td{padding:12px 12px}}
</style>`;
  return shell(`Quote and Sign vs ${c.name}`, body, nonce, extraHead, analytics);
}

export const compareBySlug = (slug: string) => COMPETITORS.find((c) => c.slug === slug) ?? null;

/** Used by the sitemap. */
export const COMPARE_PATHS = COMPETITORS.map((c) => `/compare/${c.slug}`);

export { LEGAL };
