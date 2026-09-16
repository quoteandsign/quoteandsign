// Public landing pages for the built-in templates: one per template plus an index. People search
// for "consulting proposal template" far more often than for proposal software, so each page shows
// the real template (the same renderer the client sees), lists what is inside, and hands off to
// sign-in with the template remembered.

import { shell, breadcrumbs } from "./legal";
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
  { slug: "brand-identity-proposal-template", id: "brand", keyword: "Brand identity proposal template", audience: "designers and studios", intro: "A showcase proposal: three visual directions up front, what the client receives, how the weeks run, and an identity priced as one line with the social kit, print and a photography day as options." },
  { slug: "website-proposal-template", id: "web-project", keyword: "Website proposal template", audience: "web designers and studios", intro: "A fixed-scope website build with optional add-ons: copywriting, extra pages the client can count up, and a care plan. The total updates as they choose." },
  { slug: "retainer-proposal-template", id: "retainer", keyword: "Retainer proposal template", audience: "freelancers and agencies on ongoing work", intro: "A monthly retainer where the client picks the number of hours within the range you set, with an optional priority-response line. Recurring pricing is shown as a monthly total." },
  { slug: "photography-proposal-template", id: "photography", keyword: "Photography proposal template", audience: "photographers", intro: "A brand or event shoot with add-ons the client can pick: extra edited photos by the number, headshots per person, and a short social video." },
  { slug: "software-development-proposal-template", id: "software", keyword: "Software development proposal template", audience: "developers and small software shops", intro: "A milestone-based build with a clear scope, a support plan the client can opt into, and terms that say what happens when the scope changes." },
  { slug: "logo-design-proposal-template", id: "logo-design", keyword: "Logo design proposal template", audience: "logo and brand designers", intro: "Three directions, one refined mark and every file, priced as one line with brand colours, business cards and extra directions the client can add." },
  { slug: "seo-proposal-template", id: "seo-retainer", keyword: "SEO proposal template", audience: "SEO consultants and agencies", intro: "A six-month retainer with technical fixes first, two pages a month and a plain-English report, with Google Business Profile and extra pages as options." },
  { slug: "social-media-management-proposal-template", id: "social-media", keyword: "Social media management proposal template", audience: "social media managers", intro: "A monthly calendar, three posts a week written and designed, and a report, with reels and community replies the client can switch on." },
  { slug: "copywriting-proposal-template", id: "copywriting", keyword: "Copywriting proposal template", audience: "copywriters", intro: "Interviews, a voice guide and five website pages written and edited, with extra pages counted up and an email series as an option." },
  { slug: "video-production-proposal-template", id: "video-production", keyword: "Video production proposal template", audience: "videographers and small studios", intro: "A ninety-second brand film from script to final cut, with social cuts, extra shoot days and drone footage as options." },
  { slug: "wedding-photography-proposal-template", id: "wedding-photography", keyword: "Wedding photography proposal template", audience: "wedding photographers", intro: "Ten hours of coverage and a gallery, with a second photographer, an engagement session, extra hours and an album the couple can add." },
  { slug: "bookkeeping-proposal-template", id: "bookkeeping", keyword: "Bookkeeping proposal template", audience: "bookkeepers and accountants", intro: "A fixed monthly service with a catch-up counted by the month behind, sales tax filing and payroll as options." },
  { slug: "coaching-proposal-template", id: "business-coaching", keyword: "Coaching proposal template", audience: "business coaches and consultants", intro: "A twelve-week programme with a weekly call and a ninety-day plan, plus a team workshop and monthly follow-ups as options." },
  { slug: "interior-design-proposal-template", id: "interior-design", keyword: "Interior design proposal template", audience: "interior designers", intro: "Concepts, drawings and a sourcing list for two rooms, with site visits counted up and sourcing as an option." },
  { slug: "landscaping-proposal-template", id: "landscaping", keyword: "Landscaping proposal template", audience: "landscapers and garden designers", intro: "A designed and built front garden and patio, with planting by the bed, lighting and seasonal maintenance the client can choose." },
  { slug: "cleaning-proposal-template", id: "cleaning-services", keyword: "Cleaning proposal template", audience: "cleaning companies", intro: "A weekly office clean at a fixed monthly price, with extra visits, carpet cleaning and windows the client can add." },
  { slug: "renovation-proposal-template", id: "home-renovation", keyword: "Renovation proposal template", audience: "contractors and builders", intro: "A kitchen renovation with a fixed scope and a week-by-week schedule, with worktop, heating and socket upgrades as options." },
  { slug: "event-planning-proposal-template", id: "event-planning", keyword: "Event planning proposal template", audience: "event planners", intro: "A company event for eighty, planned and run, with a photographer, live music and extra guests the client can add." },
  { slug: "catering-proposal-template", id: "catering", keyword: "Catering proposal template", audience: "caterers", intro: "A plated dinner priced per guest, with canapés, wine pairing and tableware hire as options the client chooses." },
  { slug: "personal-training-proposal-template", id: "personal-training", keyword: "Personal training proposal template", audience: "personal trainers", intro: "A twelve-week block where the client sets the number of sessions, with a nutrition plan and partner sessions as options." },
  { slug: "marketing-proposal-template", id: "marketing-retainer", keyword: "Marketing proposal template", audience: "marketing consultants and agencies", intro: "A monthly retainer with a fixed number of senior days, with paid ads, email and extra days the client can switch on." },
  { slug: "mobile-app-proposal-template", id: "app-development", keyword: "Mobile app proposal template", audience: "app developers and studios", intro: "A version-one app built in phases and billed per phase, with notifications, payments and a support plan as options." },
  { slug: "it-support-proposal-template", id: "it-support", keyword: "IT support proposal template", audience: "IT providers", intro: "Managed support priced per user with the headcount the client sets, plus cloud backup and security training." },
  { slug: "translation-proposal-template", id: "translation", keyword: "Translation proposal template", audience: "translators", intro: "A website translation priced per thousand words with review included, plus a glossary and monthly updates." },
  { slug: "tutoring-proposal-template", id: "tutoring", keyword: "Tutoring proposal template", audience: "tutors", intro: "A term of one-to-one sessions the family sets the number of, with paper marking and a holiday course as options." },
  { slug: "architecture-proposal-template", id: "architecture", keyword: "Architecture proposal template", audience: "architects", intro: "A rear extension from survey to planning, with technical design, tender and site visits as later stages the client can add now." },
  { slug: "graphic-design-proposal-template", id: "graphic-design", keyword: "Graphic design proposal template", audience: "graphic designers", intro: "A launch campaign built from one key visual across print and screen, with extra posts, print sizes and an animation by the number." },
  { slug: "illustration-proposal-template", id: "illustration", keyword: "Illustration proposal template", audience: "illustrators", intro: "A style sample, then hero and spot illustrations by the piece with the licence spelled out, plus animated versions as an option." },
  { slug: "podcast-production-proposal-template", id: "podcast-production", keyword: "Podcast production proposal template", audience: "podcast producers", intro: "A launch package and a per-episode price with clips and show notes, plus guest booking as an option." },
  { slug: "virtual-assistant-proposal-template", id: "virtual-assistant", keyword: "Virtual assistant proposal template", audience: "virtual assistants", intro: "A monthly block of hours the client sets for inbox, diary and admin, with bookkeeping hand-off and out-of-hours cover as options." },
  { slug: "hr-consulting-proposal-template", id: "hr-consulting", keyword: "HR consulting proposal template", audience: "HR consultants", intro: "Contracts, a handbook and a hiring kit in six weeks, with a monthly retainer and manager training as options." },
  { slug: "accounting-proposal-template", id: "accounting", keyword: "Accounting proposal template", audience: "accountants", intro: "Year-end accounts and corporate tax with a review meeting, plus director returns by the number and advisory hours." },
  { slug: "website-maintenance-proposal-template", id: "web-maintenance", keyword: "Website maintenance proposal template", audience: "web developers and agencies", intro: "A monthly care plan with content hours the client sets, plus managed hosting as an option." },
  { slug: "ecommerce-proposal-template", id: "ecommerce-store", keyword: "Ecommerce proposal template", audience: "web designers and developers", intro: "A store designed and built on a hosted platform, with products loaded by the number, photography and a care plan as options." },
  { slug: "real-estate-photography-proposal-template", id: "real-estate-photography", keyword: "Real estate photography proposal template", audience: "property photographers", intro: "A full listing shoot delivered by the next morning, with drone, twilight, floor plans by the floor and a video walkthrough." },
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
.tpl-big{aspect-ratio:1200/1000;border-radius:18px;box-shadow:0 1px 2px rgba(25,24,22,.08),0 30px 80px -40px rgba(25,24,22,.4);border:1px solid var(--line)}
.tpl-thumb.tpl-big iframe{width:120%;height:120%;transform:scale(.8333)}
.tpl-big::after{background:linear-gradient(to bottom,transparent 80%,rgba(25,24,22,.08))}
.tpl-cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px;margin:8px 0 0}
.tpl-cta.alt{background:transparent;color:var(--accent);border:1px solid var(--line)}
main,.top,footer{max-width:1040px}
.tpl-grid{display:grid;gap:22px;grid-template-columns:repeat(3,1fr);margin:28px 0 8px}
@media(max-width:860px){.tpl-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:540px){.tpl-grid{grid-template-columns:1fr}}
.tpl-card{position:relative;display:flex;flex-direction:column;background:#efece5;border-radius:22px;padding:8px;box-shadow:inset 0 0 0 1px rgba(25,24,22,.06);transition:transform .45s cubic-bezier(.32,.72,0,1),box-shadow .45s cubic-bezier(.32,.72,0,1)}
.tpl-card:hover{transform:translateY(-4px);box-shadow:inset 0 0 0 1px rgba(25,24,22,.08),0 30px 60px -32px rgba(25,24,22,.45)}
.tpl-thumb{position:relative;display:block;overflow:hidden;aspect-ratio:1200/900;border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba(25,24,22,.08),inset 0 1px 0 rgba(255,255,255,.6)}
.tpl-thumb iframe{position:absolute;left:0;top:0;width:400%;height:400%;transform:scale(.25);transform-origin:top left;border:0;pointer-events:none}
.tpl-thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent 70%,rgba(25,24,22,.06))}
.tpl-body{padding:16px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.tpl-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0}
.tpl-body h2{margin:0;font-size:18px;letter-spacing:-.015em;line-height:1.2}
.tpl-body h2 a{color:var(--fg);text-decoration:none}
.tpl-body h2 a::after{content:"";position:absolute;inset:0;border-radius:22px}
.tpl-body p{margin:0;color:var(--muted);font-size:14px;line-height:1.5;flex:1}
.tpl-more{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13.5px;font-weight:600;color:var(--accent)}
.tpl-more i{display:inline-flex;width:24px;height:24px;border-radius:50%;background:color-mix(in srgb,var(--accent) 12%,transparent);align-items:center;justify-content:center;font-style:normal;transition:transform .35s cubic-bezier(.32,.72,0,1)}
.tpl-card:hover .tpl-more i{transform:translateX(3px)}
.tpl-soon{justify-content:center;align-items:center;text-align:center;background:transparent;box-shadow:none;border:1.5px dashed rgba(25,24,22,.16);padding:28px 22px;min-height:100%}
.tpl-soon:hover{transform:none;box-shadow:none;border-color:rgba(43,63,140,.4)}
.tpl-soon .tpl-eyebrow{color:var(--muted)}
.tpl-soon h2{margin:8px 0 6px;font-size:18px;letter-spacing:-.015em}
.tpl-soon p{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.5;max-width:26ch}
.tpl-soon a{color:var(--accent);font-weight:600;text-decoration:none;font-size:14px}
.tpl-soon a:hover{text-decoration:underline}
.tpl-lines li{margin:.25em 0}
`;

export function renderTemplatesIndex(nonce: string, analytics: string | null = null): string {
  const cards = TEMPLATE_PAGES.map((p) => {
    const t = templateOf(p);
    return `<article class="tpl-card"><a class="tpl-thumb" href="/templates/${p.slug}" tabindex="-1" aria-label="${esc(p.keyword)} preview"><iframe src="/t/${esc(t.id)}?thumb=1" title="${esc(p.keyword)} thumbnail" tabindex="-1" loading="lazy"></iframe></a><div class="tpl-body"><p class="tpl-eyebrow">For ${esc(p.audience)}</p><h2><a href="/templates/${p.slug}">${esc(p.keyword)}</a></h2><p>${esc(t.summary)}</p><span class="tpl-more">See the template <i aria-hidden="true">›</i></span></div></article>`;
  }).join("\n") + `
<article class="tpl-card tpl-soon"><p class="tpl-eyebrow">More on the way</p><h2>Yours might be next</h2><p>Event planning, catering, personal training and more are being written. Tell us which one you need and it moves to the front.</p><a href="/contact?kind=question">Ask for a template</a></article>`;
  const body = `
<h1>Proposal templates</h1>
<p class="eff">${TEMPLATE_PAGES.length} starting points, each a real proposal your client can read, adjust and accept on their phone. Pick one, put your own prices in, and send a link.</p>
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
  return shell("Proposal templates", body, nonce, `${breadcrumbs(nonce, [["Templates", "/templates"]])}
<style nonce="${nonce}">${CSS}</style>`, analytics, {
    path: "/templates",
    description: "Free proposal templates for consulting, websites, brand identity, retainers, photography and software. Real proposals your client can adjust and accept on their phone.",
  });
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
  return shell(p.keyword, body, nonce, `${breadcrumbs(nonce, [["Templates", "/templates"], [p.keyword, `/templates/${p.slug}`]])}
<style nonce="${nonce}">${CSS}</style>`, analytics, {
    path: `/templates/${p.slug}`,
    description: `${p.keyword} for ${p.audience}: a real proposal your client can adjust and accept on their phone. Free to use, sign in with your email.`,
  });
}
