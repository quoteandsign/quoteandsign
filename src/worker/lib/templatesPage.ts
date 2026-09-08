// Public landing pages for the built-in templates: one per template plus an index. People search
// for "consulting proposal template" far more often than for proposal software, so each page shows
// the real template (the same renderer the client sees), lists what is inside, and hands off to
// sign-in with the template remembered.

import { shell } from "./legal";
import { esc } from "./render";
import { TEMPLATES, type Template } from "../../shared/templates";
import { formatMoney } from "../../shared/pricing";

export type TemplatePage = {
  slug: string;
  id: string; // TEMPLATES id
  keyword: string; // the phrase people search for, used as the h1
  audience: string;
  intro: string;
};

export const TEMPLATE_PAGES: TemplatePage[] = [
  { slug: "consulting-proposal-template", id: "consulting", keyword: "Consulting proposal template", audience: "consultants and advisors", intro: "A discovery-first consulting proposal: the problem as you understand it, a four-week approach, what the client receives, and an optional implementation phase they can switch on themselves." },
  { slug: "website-proposal-template", id: "web-project", keyword: "Website proposal template", audience: "web designers and studios", intro: "A fixed-scope website build with optional add-ons: copywriting, extra pages the client can count up, and a care plan. The total updates as they choose." },
  { slug: "retainer-proposal-template", id: "retainer", keyword: "Retainer proposal template", audience: "freelancers and agencies on ongoing work", intro: "A monthly retainer where the client picks the number of hours within the range you set, with an optional priority-response line. Recurring pricing is shown as a monthly total." },
  { slug: "photography-proposal-template", id: "photography", keyword: "Photography proposal template", audience: "photographers", intro: "A brand or event shoot with add-ons the client can pick: extra edited photos by the number, headshots per person, and a short social video." },
  { slug: "software-development-proposal-template", id: "software", keyword: "Software development proposal template", audience: "developers and small software shops", intro: "A milestone-based build with a clear scope, a support plan the client can opt into, and terms that say what happens when the scope changes." },
];

export const pageBySlug = (slug: string) => TEMPLATE_PAGES.find((p) => p.slug === slug) ?? null;
export const TEMPLATE_PATHS = ["/templates", ...TEMPLATE_PAGES.map((p) => `/templates/${p.slug}`)];

const templateOf = (p: TemplatePage): Template => TEMPLATES.find((t) => t.id === p.id)!;

/** Section headings inside the template content, in order. */
function sections(t: Template): string[] {
  const out: string[] = [];
  for (const b of t.content as { type?: string; props?: { level?: number }; content?: unknown }[]) {
    if (b.type === "heading" && b.props?.level === 2 && typeof b.content === "string") out.push(b.content);
  }
  return out;
}

const CSS = `
.tpl-big{aspect-ratio:1200/1400;border-radius:16px;box-shadow:0 30px 80px -40px rgba(25,24,22,.4)}
.tpl-big iframe{width:160%;height:160%;transform:scale(.625)}
.tpl-cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px;margin:8px 0 0}
.tpl-cta.alt{background:transparent;color:var(--accent);border:1px solid var(--line)}
.tpl-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin:24px 0}
.tpl-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 12px 18px;transition:transform .3s cubic-bezier(.32,.72,0,1),box-shadow .3s}
.tpl-card:hover{transform:translateY(-3px);box-shadow:0 24px 50px -30px rgba(25,24,22,.4)}
.tpl-card h3{margin:14px 8px 4px;font-size:18px}.tpl-card p{margin:0 8px 10px;color:var(--muted);font-size:14.5px}.tpl-card>a{margin:0 8px}
.tpl-thumb{position:relative;display:block;overflow:hidden;aspect-ratio:1200/900;border-radius:10px;border:1px solid var(--line);background:#fff}
.tpl-thumb iframe{position:absolute;left:0;top:0;width:400%;height:400%;transform:scale(.25);transform-origin:top left;border:0;pointer-events:none}
.tpl-thumb::after{content:"";position:absolute;inset:0}
.tpl-lines li{margin:.25em 0}
`;

export function renderTemplatesIndex(nonce: string, analytics: string | null = null): string {
  const cards = TEMPLATE_PAGES.map((p) => {
    const t = templateOf(p);
    return `<div class="tpl-card"><a class="tpl-thumb" href="/templates/${p.slug}" aria-label="${esc(p.keyword)}"><iframe src="/t/${esc(t.id)}?thumb=1" title="${esc(p.keyword)} thumbnail" tabindex="-1" aria-hidden="true" loading="lazy"></iframe></a><h3><a href="/templates/${p.slug}">${esc(p.keyword)}</a></h3><p>${esc(t.summary)}</p><a href="/templates/${p.slug}">See the template</a></div>`;
  }).join("\n");
  const body = `
<h1>Proposal templates</h1>
<p class="eff">Five starting points, each a real proposal your client can read, adjust and accept on their phone. Pick one, put your own prices in, and send a link.</p>
<div class="tpl-grid">${cards}</div>
<h2>How a template becomes a proposal</h2>
<ol>
<li>Sign in with your email. No password, no card, fourteen days of Pro included.</li>
<li>Choose the template. Every heading, paragraph and pricing line is yours to change.</li>
<li>Send a link. Your client toggles options, watches the total update, types their name and taps Accept.</li>
<li>You both get a signed PDF and a record of exactly what was agreed.</li>
</ol>
<p><a class="tpl-cta" href="/login">Start free</a></p>
<p class="muted">Quote and Sign is open source under the AGPL. Prices in the templates are examples; change them to yours.</p>`;
  return shell("Proposal templates", body, nonce, `<meta name="description" content="Free proposal templates for consulting, websites, retainers, photography and software. Real proposals your client can adjust and accept on their phone.">
<style nonce="${nonce}">${CSS}</style>`, analytics);
}

export function renderTemplatePage(p: TemplatePage, nonce: string, analytics: string | null = null): string {
  const t = templateOf(p);
  const secs = sections(t);
  const lines = t.items.map((i) => {
    const price = formatMoney(i.unitAmount, "USD");
    const how = i.optional ? (i.selectedByDefault ? "optional, on by default" : "optional, off by default") : "included";
    const qty = i.minQuantity != null || i.maxQuantity != null ? `, client picks ${i.minQuantity ?? 0} to ${i.maxQuantity ?? "any"}` : "";
    const per = i.billing && i.billing !== "once" ? ` per ${i.billing}` : i.unit ? ` per ${i.unit}` : "";
    return `<li><strong>${esc(i.name)}</strong> ${esc(price)}${esc(per)} (${esc(how)}${esc(qty)})${i.description ? `: ${esc(i.description)}` : ""}</li>`;
  }).join("\n");
  const others = TEMPLATE_PAGES.filter((o) => o.slug !== p.slug).map((o) => `<a href="/templates/${o.slug}">${esc(o.keyword)}</a>`).join(" · ");
  const body = `
<h1>${esc(p.keyword)}</h1>
<p class="eff">For ${esc(p.audience)}. ${esc(p.intro)}</p>
<p><a class="tpl-cta" href="/login?template=${esc(t.id)}">Use this template</a> <a class="tpl-cta alt" href="/t/${esc(t.id)}" target="_blank" rel="noopener">Open full size</a></p>

<h2>The template, as your client would see it</h2>
<a class="tpl-thumb tpl-big" href="/t/${esc(t.id)}" target="_blank" rel="noopener" aria-label="Open the ${esc(p.keyword)} full size"><iframe src="/t/${esc(t.id)}?thumb=1" title="${esc(p.keyword)} preview" tabindex="-1" aria-hidden="true" loading="lazy"></iframe></a>
<p class="muted">A scaled preview. <a href="/t/${esc(t.id)}" target="_blank" rel="noopener">Open full size</a> to read it as a client would.</p>

<h2>What is inside</h2>
<p>Sections: ${secs.map((s) => esc(s)).join(", ")}. Then the pricing table and the accept button.</p>
<ul class="tpl-lines">
${lines}
</ul>
<p class="muted">Example prices in USD; the template works in ${esc(String(16))} currencies and every line is editable.</p>

<h2>Why a link beats a document</h2>
<ul>
<li>The client can switch optional lines on and off and change quantities within limits you set. The total updates as they read, and what they chose becomes part of the signed record.</li>
<li>Accepting is one tap on a phone: they type their name, tick the consent line, and both of you get the signed PDF by email.</li>
<li>You get an email the moment it is opened, can set an expiry date and a password, and can send a reminder.</li>
</ul>

<h2>Start with it</h2>
<p>Sign in with your email, no password and no card. The template opens in the editor with your currency set, and fourteen days of Pro are included.</p>
<p><a class="tpl-cta" href="/login?template=${esc(t.id)}">Use this template</a></p>

<p class="muted">Other templates: ${others}. Quote and Sign is open source under the AGPL; you can also run your own copy.</p>`;
  return shell(p.keyword, body, nonce, `<meta name="description" content="${esc(p.keyword)} for ${esc(p.audience)}: a real proposal your client can adjust and accept on their phone. Free to use, sign in with your email.">
<style nonce="${nonce}">${CSS}</style>`, analytics);
}
