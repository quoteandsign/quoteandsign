/**
 * Rate guides: /rates and /rates/<topic>. One page per template, built from the template's own
 * pricing lines, for the searches that happen before anyone looks for a template: "how much to
 * charge for logo design". Each guide sends the reader to the template and to the editor.
 */
import { shell, breadcrumbs } from "./legal";
import { esc } from "./render";
import { TEMPLATES, type Template } from "../../shared/templates";
import { formatMoney } from "../../shared/pricing";
import { TEMPLATE_PAGES, type TemplatePage } from "./templatesPage";

export type RatePage = { slug: string; topic: string; page: TemplatePage; template: Template };

const CAPS = new Set(["SEO", "IT", "HR"]);
const topicOf = (keyword: string) =>
  keyword
    .replace(/ proposal template$/i, "")
    .split(" ")
    .map((w) => (CAPS.has(w) ? w : w.toLowerCase()))
    .join(" ");

export const RATE_PAGES: RatePage[] = TEMPLATE_PAGES.map((page) => ({
  slug: page.slug.replace(/-proposal-template$/, ""),
  topic: topicOf(page.keyword),
  page,
  template: TEMPLATES.find((t) => t.id === page.id)!,
}));

export const rateBySlug = (slug: string): RatePage | null => RATE_PAGES.find((r) => r.slug === slug) ?? null;

/** Advice by line of work. Written once per category, so every guide says something true about its trade. */
const ADVICE: Record<string, string[]> = {
  Design: [
    "Design is bought on trust, so the proposal has to show the work before it talks about money. Put the directions or a comparable project up front, then the price. A client who has already pictured the result argues less about the number.",
    "Price the outcome, not the hours. \"Three directions, one refined mark, every file\" is a thing a client can want; \"twelve hours\" is a thing they can haggle over. Keep revisions explicit: two rounds included, a third by the round, priced.",
    "Put the extras on the page as optional lines rather than in a follow-up email. Brand colours, business cards, an extra direction: when they sit next to the base price with a switch, a fair share of clients turn one on.",
  ],
  Marketing: [
    "Marketing work is easiest to sell as a monthly retainer with a clear first month. Say what the first thirty days produce (an audit, a calendar, the first fixes) and what every month after that looks like, so the client is not paying for a promise.",
    "Show the report. The single line that closes most retainers is the plain-English monthly summary the client can forward to whoever pays them. Name it, price it in, and describe what is in it.",
    "Keep the add-ons countable: extra pages a month, reels by the number, replies handled. A client who can see the total move as they choose feels in control of the spend, and a retainer they set themselves is one they keep.",
  ],
  "Web and software": [
    "Software and web work needs a scope the client can read in one sitting: what is included, what happens when it changes, and what they get at each milestone. The proposal doubles as the agreement, so write the change rule into it.",
    "Fixed price for the defined build, then a care plan or support line as a recurring option. The build wins the project; the care plan is where the year's revenue is, and a switch on the proposal is the cheapest way to sell it.",
    "Let the client count the extras: pages, products loaded, integrations, seats. A quantity they set within limits you chose replaces three rounds of \"can you also\" emails.",
  ],
  "Photography and video": [
    "Photography and video sell on the deliverable and the day. Say how many finished pictures or minutes, when they arrive, and how they arrive, and the price stops looking arbitrary.",
    "Price the shoot as one line and everything else as options: extra edited images by the number, headshots per person, drone, twilight, a social cut. Clients rarely ask for extras by email; on the page, with a switch, they choose them.",
    "Usage rights belong in the proposal, not in a later invoice. A short licence line next to the price protects you and avoids the awkward conversation when a client puts the work on a billboard.",
  ],
  "Home and trades": [
    "Trades quotes are compared side by side, often on a phone, so the total has to be obvious and the scope written in words a homeowner uses. Materials, labour and what happens if the wall is not what you expected, each on its own line.",
    "A fixed price for the defined job and optional lines for the things clients always ask about mid-way: the extra bed, the second coat, the seasonal visit. When they are on the page from the start, nobody feels upsold.",
    "Deposit and payment stages belong in the proposal. A client who has accepted a page that says \"40 percent to book, balance on completion\" has agreed to it, and the signed record proves it.",
  ],
  "Business services": [
    "Advisory and back-office work is bought for peace of mind, so the proposal should read like a plan: what you look at first, what the client receives, and how often. A monthly or yearly figure with a named deliverable beats an hourly rate.",
    "Fix the recurring core and make the rest optional: director returns by the number, extra hours, a training day. The core is easy to say yes to; the options let the client size the engagement without a second call.",
    "Say what you need from the client and by when. Missing receipts and late answers are where these engagements go wrong, and a proposal that says so is a proposal that gets respected.",
  ],
  "Events and personal": [
    "Personal services are chosen on feel. A warm opening paragraph and a clear list of what the day, the term or the month includes do more than a discount ever will.",
    "Price the package, then the countable extras: guests, sessions, hours, dishes. A client who moves a quantity and sees the total settle has already decided.",
    "Put the cancellation and rescheduling terms on the same page as the price, in plain words. Signed together, they are far easier to hold to later.",
  ],
  "Starting points": [
    "The core templates cover the projects most freelancers sell: a fixed-scope build, a retainer, a shoot, a consulting engagement. Each one prices the defined work as one line and everything negotiable as an option the client can switch on.",
    "Fixed price for the thing you can define, recurring for the thing that continues, and countable options for whatever clients tend to add. That structure survives almost any trade.",
    "Whatever you charge, the client should be able to see the total change as they choose. A total that responds is a total that gets accepted.",
  ],
};

const CSS = `
main,.top,footer{max-width:1040px}
.rt-cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px;margin:8px 8px 0 0}
.rt-cta.alt{background:transparent;color:var(--accent);border:1px solid var(--line)}
table.rt{width:100%;border-collapse:collapse;margin:16px 0 8px;font-size:15px}
table.rt th,table.rt td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
table.rt th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
table.rt td.num{white-space:nowrap;font-variant-numeric:tabular-nums}
table.rt td small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.rt-grid{display:grid;gap:14px 28px;grid-template-columns:repeat(3,1fr);margin:18px 0 8px;padding:0;list-style:none}
@media(max-width:760px){.rt-grid{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.rt-grid{grid-template-columns:1fr}}
.rt-grid li a{font-weight:600;text-decoration:none;color:var(--accent)}.rt-grid li span{display:block;color:var(--muted);font-size:13.5px}
`;

const cat = (t: Template) => (t.group === "trade" ? (t.trade ?? "Other") : "Starting points");

function itemRows(t: Template): string {
  return t.items
    .map((i) => {
      const price = formatMoney(i.unitAmount, "USD");
      const per = i.billing && i.billing !== "once" ? ` per ${i.billing}` : i.unit ? ` per ${i.unit}` : "";
      const kind = i.optional ? (i.selectedByDefault ? "Optional, on by default" : "Optional, off by default") : "Included";
      const qty = i.minQuantity != null || i.maxQuantity != null ? `Client picks ${i.minQuantity ?? 0} to ${i.maxQuantity ?? "any"}` : i.quantity > 1 ? `${i.quantity} included` : "";
      return `<tr><td><strong>${esc(i.name)}</strong>${i.description ? `<small>${esc(i.description)}</small>` : ""}</td><td class="num">${esc(price)}${esc(per)}</td><td>${esc(kind)}${qty ? `<small>${esc(qty)}</small>` : ""}</td></tr>`;
    })
    .join("\n");
}

function baseTotal(t: Template): number {
  return t.items.filter((i) => !i.optional || i.selectedByDefault).reduce((s, i) => s + i.unitAmount * Math.max(1, i.quantity), 0);
}

export function renderRatesIndex(nonce: string, analytics: string | null = null): string {
  const groups = new Map<string, RatePage[]>();
  for (const r of RATE_PAGES) {
    const k = cat(r.template);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const body = `
<h1>What to charge, by trade</h1>
<p class="eff">${RATE_PAGES.length} pricing guides, each built from a real proposal a client can adjust and accept on their phone. Every guide shows the lines, the example prices, and how to present them so the client says yes.</p>
${[...groups.entries()].map(([k, list]) => `<h2>${esc(k)}</h2><ul class="rt-grid">${list.map((r) => `<li><a href="/rates/${r.slug}">How much to charge for ${esc(r.topic)}</a><span>For ${esc(r.page.audience)}</span></li>`).join("")}</ul>`).join("\n")}
<h2>Where the numbers come from</h2>
<p>Each guide takes its lines and example prices from the matching proposal template. They are starting points in US dollars, not a survey; the point is the structure, which is the part most freelancers get wrong. Open any template in the editor and put your own prices in.</p>
<p><a class="rt-cta" href="/try">Try the editor, no account</a> <a class="rt-cta alt" href="/templates">Browse the templates</a></p>`;
  return shell("What to charge, by trade", body, nonce, `${breadcrumbs(nonce, [["Rates", "/rates"]])}
<style nonce="${nonce}">${CSS}</style>`, analytics, {
    path: "/rates",
    description: "Pricing guides for freelancers and small agencies: what to charge for design, marketing, web, photography, trades and services, built from real proposals with optional lines and quantities.",
  });
}

export function renderRatePage(r: RatePage, nonce: string, analytics: string | null = null): string {
  const t = r.template;
  const k = cat(t);
  const advice = ADVICE[k] ?? ADVICE["Starting points"]!;
  const related = RATE_PAGES.filter((o) => o.slug !== r.slug && cat(o.template) === k).slice(0, 6);
  const optional = t.items.filter((i) => i.optional);
  const counted = t.items.filter((i) => i.minQuantity != null || i.maxQuantity != null);
  const base = baseTotal(t);
  const body = `
<h1>How much to charge for ${esc(r.topic)}</h1>
<p class="eff">A worked example for ${esc(r.page.audience)}: the pricing lines from our ${esc(r.topic)} proposal, what is fixed, what the client can switch on, and how to present it so the total gets accepted rather than negotiated.</p>

<h2>The example pricing</h2>
<table class="rt"><thead><tr><th>Line</th><th>Example price</th><th>How it is sold</th></tr></thead><tbody>
${itemRows(t)}
</tbody></table>
<p class="muted">Starting total with the defaults on: <strong>${esc(formatMoney(base, "USD"))}</strong>${optional.length ? `, before the client chooses among ${optional.length} optional ${optional.length === 1 ? "line" : "lines"}` : ""}${counted.length ? `, with ${counted.length} ${counted.length === 1 ? "quantity" : "quantities"} the client sets within your limits` : ""}. Example prices in US dollars; the template works in 16 currencies and every number is yours to change.</p>

<h2>How to present it</h2>
${advice.map((p) => `<p>${esc(p)}</p>`).join("\n")}

<h2>Why this structure gets accepted</h2>
<ul>
<li><strong>One fixed line the client can say yes to.</strong> ${esc(t.items.find((i) => !i.optional)?.name ?? "The core of the work")} is priced as a whole, so the conversation is about the result, not the hours.</li>
<li><strong>Options on the page, not in follow-up emails.</strong> ${optional.length ? `${optional.map((i) => esc(i.name)).slice(0, 3).join(", ")}${optional.length > 3 ? " and more" : ""} sit next to the base price with a switch.` : "Extras can be added as optional lines the client switches on."} People choose what they can see.</li>
<li><strong>The total moves as they choose.</strong> On a Quote and Sign page the client toggles lines and sets quantities, watches the total update, and signs with their name. What they chose becomes part of the signed record.</li>
</ul>

<h2>Put it in front of a client</h2>
<p>Open this pricing as a real proposal, change the words and numbers, and send the link. Your client reads it on their phone, adjusts the options, and accepts with one tap. Both of you get the signed PDF.</p>
<p><a class="rt-cta" href="/try/${esc(t.id)}">Try it in the editor, no account</a> <a class="rt-cta alt" href="/templates/${esc(r.page.slug)}">See the ${esc(r.topic)} proposal template</a></p>

${related.length ? `<h2>More in ${esc(k)}</h2><ul class="rt-grid">${related.map((o) => `<li><a href="/rates/${o.slug}">${esc(o.topic)}</a><span>For ${esc(o.page.audience)}</span></li>`).join("")}</ul>` : ""}
<p class="muted"><a href="/rates">All pricing guides</a> · Quote and Sign is open source under the AGPL.</p>`;
  return shell(`How much to charge for ${r.topic}`, body, nonce, `${breadcrumbs(nonce, [["Rates", "/rates"], [`How much to charge for ${r.topic}`, `/rates/${r.slug}`]])}
<style nonce="${nonce}">${CSS}</style>`, analytics, {
    path: `/rates/${r.slug}`,
    description: `What to charge for ${r.topic}: example pricing lines for ${r.page.audience}, what to fix, what to make optional, and how to present it so the client accepts.`,
  });
}
