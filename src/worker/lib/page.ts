// The public proposal page. Server-rendered, one HTML response, no framework on the wire.
// It reads as a designed web page, not a document: a cover, a sticky section nav with the
// Accept button always in reach, and colour bands per section.

import type { Proposal, User, PricingItem, Acceptance } from "./db";
import { renderBlocks, splitSections, esc, PRICING_MARKER, ACCEPT_MARKER, COLOUR_NAMES, type Block } from "./render";
import { computeTotals, formatMoney, priceLabel, lineSummary, periodRow, describeTotals, type Billing } from "../../shared/pricing";
import type { Template } from "../../shared/templates";
import { styleOf } from "../../shared/styles";
import { businessName } from "../../shared/names";
import { readableOn } from "../../shared/looks";

type PageProps = {
  nonce: string;
  proposal: Proposal;
  owner: User;
  items: PricingItem[];
  acceptance: Acceptance | null;
  expired: boolean;
  isOwner: boolean;
  /** The client said no; the accept form gives way to a short note. */
  declined?: boolean;
  /** Shown as a button on the accepted page. */
  paymentUrl?: string | null;
  paymentLabel?: string | null;
  /** The "Made with" footer; off for paid plans. */
  madeWith?: boolean;
  justAccepted: boolean;
  consentText: string;
  appUrl: string;
  seenHash: string;
  /** Overrides the owner ribbon (used by template previews). */
  ribbon?: { href: string; label: string; note: string } | { hidden: true };
  previewNote?: string;
};

function accent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#2b3f8c";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

// Highlight palette (backgrounds) and text colours, the same values the editor uses.
const HL: Record<string, [string, string]> = {
  gray: ["#f5f5f4", "#57534e"],
  brown: ["#f4ebe4", "#7c4a2a"],
  red: ["#fdeceb", "#b42318"],
  orange: ["#fff1e5", "#b54708"],
  yellow: ["#fdf6dd", "#93700a"],
  green: ["#e6f4f2", "#0f6e4a"],
  blue: ["#e8f0fc", "#175cd3"],
  purple: ["#f0ebfb", "#6941c6"],
  pink: ["#fce7f3", "#c11574"],
};
const COLOUR_CSS = COLOUR_NAMES.map((c) => {
  const [bg, fg] = HL[c]!;
  return `.bg-${c}{background:${bg};padding:.15em .4em;border-radius:6px;box-decoration-break:clone}.fg-${c}{color:${fg}}.sec.band-${c}{background:color-mix(in srgb,${bg} 70%,var(--bg))}`;
}).join("");

export const CSS = `
@font-face{font-family:"Geist";src:url("/fonts/Geist-Variable.woff2") format("woff2");font-weight:100 900;font-display:swap}
:root{--accent:#2b3f8c;--bg:#fbfaf7;--fg:#191816;--muted:#5f5b55;--line:#e6e2da;--card:#fff;--soft:rgba(25,24,22,.04);--radius:14px;--radius-card:16px;--radius-btn:999px;--font-display:"Geist",ui-sans-serif,system-ui,sans-serif;--accent-fg:#fff;--cover-fg:var(--accent-fg)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:calc(56px + 8vh)}
@media(max-width:719px){html{scroll-padding-top:calc(100px + 4vh)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 "Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
.wrap.wide{max-width:960px}
.brand{display:flex;align-items:center;gap:12px;font-weight:600;letter-spacing:-.01em}
.brand img{height:32px;width:auto;border-radius:6px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.ribbon{position:sticky;top:0;z-index:7;height:var(--ribbon-h);background:var(--fg);color:var(--bg);font-size:13px}
.ribbon .in{max-width:960px;margin:0 auto;padding:0 20px;height:100%;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px}
.ribbon .note{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-align:center}
:root{--ribbon-h:0px}html.has-ribbon{--ribbon-h:40px;scroll-padding-top:calc(96px + 8vh)}
html.has-ribbon .topnav{top:var(--ribbon-h)}
.ribbon a{color:inherit;text-decoration:none;font-weight:600;justify-self:start}
.ribbon a:hover{text-decoration:underline;text-underline-offset:3px}
@media(max-width:600px){.ribbon .in{grid-template-columns:auto 1fr}.ribbon .note{text-align:right}.ribbon .in>span:last-child{display:none}}
@media(max-width:719px){html.has-ribbon{scroll-padding-top:calc(140px + 4vh)}}

/* Sticky section nav with Accept always in reach. */
.topnav{position:sticky;top:0;z-index:6;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.topnav .in{max-width:960px;margin:0 auto;padding:0 20px;height:56px;display:flex;align-items:center;gap:20px}
.topnav .brand{font-size:14px;flex:none}
.topnav .links{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}
.topnav .links::-webkit-scrollbar{display:none}
.topnav .links a{flex:none;font-size:13.5px;color:var(--muted);text-decoration:none;padding:6px 10px;border-radius:999px;transition:color .15s,background-color .15s}
.topnav .links a:hover{color:var(--fg)}
.topnav .links a.on{color:var(--fg);background:var(--soft)}
.topnav .cta{flex:none;font-size:14px;font-weight:600;color:var(--accent-fg);background:var(--accent);padding:9px 16px;border-radius:var(--radius-btn);text-decoration:none}
.topnav .done{flex:none;font-size:13px;font-weight:600;color:var(--accent)}
@media(max-width:719px){.topnav .in{flex-wrap:wrap;height:auto;padding:10px 20px 0;gap:6px 12px}.topnav .links{order:3;flex-basis:100%;margin:0 -20px;padding:2px 16px 8px;mask-image:linear-gradient(90deg,#000 88%,transparent)}.topnav .cta{display:none}}

/* Cover */
.cover{color:var(--cover-fg);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 78%,#000) 0%,var(--accent) 55%,color-mix(in srgb,var(--accent) 72%,#fff) 100%);position:relative;overflow:hidden}
.cover::after{content:"";position:absolute;inset:auto -10% -40% auto;width:60%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.18),transparent 65%);pointer-events:none}
.cover .wrap{position:relative;padding-top:88px;padding-bottom:72px}
.cover .meta{font-size:14px;opacity:.85;margin:0 0 14px}
.cover h1{font-family:var(--font-display);font-size:clamp(38px,6.5vw,64px);line-height:1.02;letter-spacing:-.04em;font-weight:650;margin:0;text-wrap:balance;max-width:16ch}
.cover .by{margin:26px 0 0;font-size:15px;opacity:.9;display:flex;flex-wrap:wrap;gap:6px 18px}
@media(max-width:600px){.cover .wrap{padding-top:56px;padding-bottom:48px}}

.notice{margin:16px auto;max-width:760px;padding:14px 16px;border-radius:var(--radius);background:var(--soft);font-size:14px}
.notice.ok{background:color-mix(in srgb,var(--accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.notice code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all}

/* Sections. A heading's highlight becomes the band of its whole section. */
.sec{padding:48px 0 40px}
@media(max-width:600px){.sec{padding:36px 0 30px}.sec.intro{padding-top:40px}}
.sec.intro{padding-top:56px}
.sec + .sec{border-top:1px solid transparent}
.sec.band-plain + .sec.band-plain{border-top-color:var(--line)}
article h1{font-family:var(--font-display);font-size:clamp(30px,5vw,42px);line-height:1.06;letter-spacing:-.035em;margin:0 0 .5em;font-weight:650;text-wrap:balance}
article h2{font-family:var(--font-display);font-size:clamp(24px,3.2vw,30px);line-height:1.12;letter-spacing:-.03em;margin:0 0 .6em;font-weight:650;text-wrap:balance}
article h3{font-size:19px;margin:1.4em 0 .4em;font-weight:600;letter-spacing:-.015em}
article p{margin:0 0 1em;font-size:17px;line-height:1.65}article p.blank{margin:0;height:.6em}
article ul,article ol{padding-left:1.3em;margin:0 0 1em;font-size:17px}article li{margin:.3em 0}
article blockquote{margin:1.4em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--accent);color:var(--muted);font-size:18px}
article hr{border:0;border-top:1px solid var(--line);margin:2em 0}
article figure{margin:1.4em 0}article figcaption{font-size:13px;color:var(--muted);margin-top:.5em}
figure.img img{max-width:100%;height:auto;border-radius:14px;display:block}
figure.img.wide img{width:100%}
figure.video .frame{aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#111}
figure.video iframe,figure.video video{width:100%;height:100%;border:0;display:block}
figure.video video{border-radius:14px}
article pre{background:var(--soft);padding:14px;border-radius:10px;overflow:auto;font-size:13px}
article code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--soft);padding:.1em .35em;border-radius:5px}
.tablewrap{overflow-x:auto;margin:1em 0;border:1px solid var(--line);border-radius:12px;background:var(--card)}
article table{border-collapse:collapse;width:100%;font-size:15px}
article th,article td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line)}
article tr:last-child td{border-bottom:0}
article th{font-weight:600;background:var(--soft);font-size:13px;color:var(--muted)}
@media(max-width:600px){article table,article tbody,article tr,article td{display:block}article thead{display:none}article tr{padding:10px 14px;border-bottom:1px solid var(--line)}article tr:last-child{border-bottom:0}article td{padding:2px 0;border:0}article td[data-th]::before{content:attr(data-th);display:block;font-size:12px;font-weight:600;color:var(--muted);margin-top:6px}article td:first-child[data-th]::before{margin-top:0}}
.checklist{list-style:none;padding-left:0}.check{display:inline-block;width:14px;height:14px;border:1.5px solid var(--muted);border-radius:4px;margin-right:8px;vertical-align:-2px}.check.on{background:var(--accent);border-color:var(--accent)}
.statement{font-family:var(--font-display);font-size:clamp(24px,3.4vw,34px);line-height:1.25;letter-spacing:-.025em;font-weight:600;max-width:24ch;margin:.6em 0 1em;text-wrap:balance}
.grid{display:grid;gap:14px;margin:1.2em 0 1.6em}
.grid.cols-3{grid-template-columns:repeat(3,1fr)}.grid.cols-2{grid-template-columns:repeat(2,1fr)}
@media(max-width:640px){.grid.cols-3,.grid.cols-2{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-card);padding:20px 20px 18px}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;font-size:15px;color:var(--muted);line-height:1.55}
figure.testimonial{margin:1.6em 0;padding:26px 26px 22px;border-radius:var(--radius-card);background:var(--card);border:1px solid var(--line)}
figure.testimonial blockquote{margin:0 0 16px;padding:0;border:0;color:var(--fg);font-size:20px;line-height:1.4;letter-spacing:-.015em;font-weight:500}
figure.testimonial blockquote::before{content:"\\201C";color:var(--accent);font-size:1.4em;line-height:0;margin-right:.1em}
figure.testimonial figcaption{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--muted);margin:0}
figure.testimonial b{color:var(--fg);font-weight:600}
.avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);font-weight:700;font-size:18px}
${COLOUR_CSS}

/* Pricing */
.pricing{margin:1.2em 0 2em;border:1px solid var(--line);border-radius:var(--radius-card);background:var(--card);overflow:hidden;box-shadow:0 1px 2px rgba(25,24,22,.04),0 24px 48px -32px rgba(25,24,22,.25)}
.line{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding:16px 18px;border-top:1px solid var(--line);align-items:start}
.line:first-child{border-top:0}
.line .name{font-weight:600}.line .desc{grid-column:1;font-size:14px;color:var(--muted)}
.line .amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.line .unit{grid-column:2;font-size:13px;color:var(--muted);text-align:right;white-space:nowrap}
.line.off .name,.line.off .amt,.line.off .desc{opacity:.45;text-decoration:line-through}
.line.off .desc{text-decoration:none}
.opt{display:flex;align-items:center;gap:10px}
.switch{appearance:none;width:40px;height:24px;border-radius:12px;background:var(--line);position:relative;cursor:pointer;flex:none;transition:background .25s cubic-bezier(.32,.72,0,1);margin:0}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .25s cubic-bezier(.32,.72,0,1)}
.switch:checked{background:var(--accent)}.switch:checked::after{transform:translateX(16px)}
.switch:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.qty{width:76px;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);text-align:right}
.totals{padding:14px 18px 18px;border-top:1px solid var(--line);background:var(--soft);font-variant-numeric:tabular-nums}
.totals div{display:flex;justify-content:space-between;padding:3px 0;font-size:15px;color:var(--muted)}
.totals .grand{font-size:20px;font-weight:650;color:var(--fg);margin-top:6px;padding-top:10px;border-top:1px solid var(--line)}
.totals .grand.rec{font-size:17px;margin-top:0;padding-top:6px;border-top:0}.totals .grand.rec.first{font-size:20px;margin-top:6px;padding-top:10px;border-top:1px solid var(--line)}

/* Accept */
.accept{margin:1.4em 0 0;padding:28px;border-radius:var(--radius-card);background:var(--card);border:1px solid var(--line);box-shadow:0 1px 2px rgba(25,24,22,.04),0 24px 48px -32px rgba(25,24,22,.25)}
.accept h2{margin:0 0 6px;font-size:24px;letter-spacing:-.025em}
.accept p.lead{margin:0 0 18px;color:var(--muted);font-size:15px}
label.f{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
.opt-label{font-weight:400;color:var(--muted)}
.h-sm{font-size:28px}
input.t{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}
input.t:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.consent{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:18px 0;color:var(--muted)}
.consent{padding:4px 0;cursor:pointer}.consent input{margin-top:1px;flex:none;width:22px;height:22px;accent-color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:14px 20px;border:0;border-radius:var(--radius-btn);background:var(--accent);color:var(--accent-fg);cursor:pointer;transition:transform .2s cubic-bezier(.32,.72,0,1),filter .2s}
.btn:hover{filter:brightness(1.06)}.btn:active{transform:scale(.985)}.btn[disabled]{opacity:.6;cursor:default}
.err{color:#b91c1c;font-size:14px;margin:8px 0 0;min-height:1.2em}
.note{color:var(--muted);font-size:14px;margin:10px 0 0}
.linkbtn{font:inherit;font-size:14px;color:var(--muted);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.linkbtn:hover{color:var(--fg)}
textarea.t{resize:vertical;min-height:72px}
.hash{font-size:13px;color:var(--muted);margin:0}.hash code{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all}
.rec{margin:14px 0 0}
.bar{position:sticky;bottom:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.bar .t{font-size:13px;color:var(--muted)}.bar .v{font-size:18px;font-weight:650;display:block}
.bar a{font-weight:600;text-decoration:none;color:var(--accent-fg);background:var(--accent);padding:10px 18px;border-radius:var(--radius-btn);font-size:15px;white-space:nowrap}
article.pad{padding-top:64px}article.narrow{max-width:420px}.muted{color:var(--muted)}
footer.made{padding:40px 0 48px;text-align:center;font-size:13px;color:var(--muted)}footer.made a{color:inherit}
.ask{padding:40px 0 8px;border-top:1px solid var(--line)}
.ask h2{font-size:22px;letter-spacing:-.02em;margin:0 0 4px}.ask p.lead{margin:0 0 6px;color:var(--muted);font-size:15px}
.ask .two{display:grid;gap:0 14px;grid-template-columns:1fr 1fr}@media(max-width:560px){.ask .two{grid-template-columns:1fr}}
textarea.t{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);resize:vertical}
textarea.t:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.btn.ghost{width:auto;background:transparent;color:var(--accent);border:1.5px solid color-mix(in srgb,var(--accent) 45%,transparent);padding:11px 18px;font-size:15px}
.btn.ghost:hover{background:color-mix(in srgb,var(--accent) 8%,transparent);filter:none}
.note.ok{color:var(--fg);font-weight:500}
@media(min-width:720px){.bar{display:none}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}

/* ---- Editorial: serif headlines, paper cover, a rule of colour. */
[data-style=editorial]{--font-display:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;--radius-card:4px;--radius-btn:6px;--cover-fg:var(--fg)}
[data-style=editorial] .cover{background:var(--bg);border-bottom:6px solid var(--accent)}
[data-style=editorial] .cover::after{display:none}
[data-style=editorial] .cover .wrap{padding-top:96px;padding-bottom:64px}
[data-style=editorial] .cover .meta{color:var(--accent);text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:600;opacity:1}
[data-style=editorial] .cover h1{font-weight:500;letter-spacing:-.025em;font-size:clamp(44px,7.5vw,84px);line-height:1;max-width:18ch}
[data-style=editorial] .cover .by{color:var(--muted);opacity:1}
[data-style=editorial] article h2{font-weight:500;letter-spacing:-.02em;font-size:clamp(28px,3.6vw,38px)}
[data-style=editorial] article h2::before{content:"";display:block;width:36px;height:3px;background:var(--accent);margin:0 0 16px}
[data-style=editorial] .statement{font-weight:500;font-style:italic;letter-spacing:-.01em}
[data-style=editorial] .sec[class*=band-]:not(.band-plain){background:transparent}
[data-style=editorial] .sec + .sec{border-top-color:var(--line)}
[data-style=editorial] .card{border:0;border-top:2px solid var(--accent);border-radius:0;background:transparent;padding:16px 0 0}
[data-style=editorial] figure.testimonial{border:0;border-left:3px solid var(--accent);border-radius:0;background:transparent;padding:4px 0 4px 24px}
[data-style=editorial] figure.testimonial blockquote{font-family:var(--font-display);font-style:italic;font-size:24px}
[data-style=editorial] .pricing,[data-style=editorial] .accept{box-shadow:none}
[data-style=editorial] .topnav .brand{font-family:var(--font-display);font-size:16px}

/* ---- Bold: huge type on a solid block. */
[data-style=bold]{--radius-card:8px;--radius-btn:8px}
[data-style=bold] .cover{background:var(--accent)}
[data-style=bold] .cover::after{display:none}
[data-style=bold] .cover .wrap{padding-top:96px;padding-bottom:80px;max-width:960px}
[data-style=bold] .cover .meta{font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:12px}
[data-style=bold] .cover h1{font-size:clamp(52px,10vw,112px);letter-spacing:-.055em;line-height:.94;font-weight:750;max-width:none}
[data-style=bold] .cover .by{font-weight:600;margin-top:34px}
[data-style=bold] .topnav{background:var(--fg);border-bottom:0}
[data-style=bold] .topnav .brand,[data-style=bold] .topnav .links a.on{color:#fff}
[data-style=bold] .topnav .links a{color:rgba(255,255,255,.65)}
[data-style=bold] .topnav .links a.on{background:rgba(255,255,255,.12)}
[data-style=bold] .topnav .done{color:#fff}
[data-style=bold] .ribbon{background:#000}
[data-style=bold] article h2{font-size:clamp(32px,5vw,48px);letter-spacing:-.045em;font-weight:750;line-height:1}
[data-style=bold] .statement{font-weight:750;letter-spacing:-.035em;font-size:clamp(28px,4.2vw,42px)}
[data-style=bold] .sec[class*=band-]:not(.band-plain){background:color-mix(in srgb,var(--accent) 9%,var(--bg))}
[data-style=bold] .card{border:2px solid var(--fg);box-shadow:4px 4px 0 var(--fg)}
[data-style=bold] .pricing{border:2px solid var(--fg);box-shadow:6px 6px 0 var(--fg)}
[data-style=bold] .totals .grand{color:var(--accent);font-size:24px}
[data-style=bold] .accept{border:2px solid var(--fg);box-shadow:6px 6px 0 var(--fg)}
[data-style=bold] .btn{font-size:17px;font-weight:700;letter-spacing:-.01em}
[data-style=bold] figure.testimonial{border:2px solid var(--fg);box-shadow:4px 4px 0 var(--fg)}

/* ---- Minimal: white space, thin type, almost no decoration. */
[data-style=minimal]{--radius-card:12px;--cover-fg:var(--fg);--bg:#fff;--soft:rgba(25,24,22,.035)}
[data-style=minimal] .cover{background:var(--bg)}
[data-style=minimal] .cover::after{display:none}
[data-style=minimal] .cover .wrap{padding-top:128px;padding-bottom:56px}
[data-style=minimal] .cover .meta{opacity:1;color:var(--muted)}
[data-style=minimal] .cover .meta::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:10px;vertical-align:1px}
[data-style=minimal] .cover h1{font-weight:450;letter-spacing:-.04em;font-size:clamp(40px,7vw,72px)}
[data-style=minimal] .cover .by{color:var(--muted);opacity:1}
[data-style=minimal] .topnav{background:rgba(255,255,255,.85);border-bottom-color:transparent}
[data-style=minimal] .topnav .cta{background:var(--fg);color:var(--bg)}
[data-style=minimal] article h2{font-weight:500;letter-spacing:-.03em}
[data-style=minimal] .statement{font-weight:450;letter-spacing:-.03em}
[data-style=minimal] .sec[class*=band-]:not(.band-plain){background:transparent}
[data-style=minimal] .sec + .sec{border-top-color:var(--line)}
[data-style=minimal] .card{border:0;background:var(--soft)}
[data-style=minimal] .pricing,[data-style=minimal] .accept{box-shadow:none}
[data-style=minimal] .btn{background:var(--fg);color:var(--bg)}
[data-style=minimal] .bar a{background:var(--fg);color:var(--bg)}
[data-style=minimal] figure.testimonial{border:0;background:var(--soft)}
[data-style=minimal] .avatar{background:var(--fg);color:#fff}

/* ---- Night: dark page, glowing accent. */
[data-style=night]{--cover-fg:#f4f4f5;--bg:#0e0e11;--fg:#f4f4f5;--muted:#a1a1aa;--line:#26262b;--card:#17171b;--soft:rgba(255,255,255,.05);--radius-card:16px;color-scheme:dark}
[data-style=night] .cover{background:radial-gradient(120% 120% at 100% 0%,color-mix(in srgb,var(--accent) 55%,#000) 0%,var(--bg) 62%)}
[data-style=night] .cover::after{background:radial-gradient(circle,color-mix(in srgb,var(--accent) 50%,transparent),transparent 65%);inset:auto -20% -50% auto;width:80%;filter:blur(20px)}
[data-style=night] .cover h1{text-shadow:0 0 40px color-mix(in srgb,var(--accent) 40%,transparent)}
[data-style=night] .topnav{background:rgba(14,14,17,.82)}
[data-style=night] .topnav .cta{box-shadow:0 0 24px color-mix(in srgb,var(--accent) 50%,transparent)}
[data-style=night] .ribbon{background:#fff;color:#000}
[data-style=night] .sec[class*=band-]:not(.band-plain){background:color-mix(in srgb,var(--accent) 10%,var(--bg))}
[data-style=night] .bg-gray,[data-style=night] .bg-brown,[data-style=night] .bg-red,[data-style=night] .bg-orange,[data-style=night] .bg-yellow,[data-style=night] .bg-green,[data-style=night] .bg-blue,[data-style=night] .bg-purple,[data-style=night] .bg-pink{color:#111}
[data-style=night] .card{background:var(--card);border-color:var(--line)}
[data-style=night] .pricing,[data-style=night] .accept{box-shadow:0 30px 60px -30px #000}
[data-style=night] .btn{box-shadow:0 0 30px color-mix(in srgb,var(--accent) 45%,transparent)}
[data-style=night] .switch{background:#3a3a40}
[data-style=night] .qty,[data-style=night] input.t,[data-style=night] textarea.t{background:#111114;border-color:#3a3a40}
[data-style=night] article th{color:var(--muted)}
[data-style=night] .bar{background:rgba(23,23,27,.9)}
[data-style=night] .notice.ok{background:color-mix(in srgb,var(--accent) 25%,transparent)}

/* ---- Warm: cream paper, rounded shapes, friendly. */
[data-style=warm]{--bg:#f7f1e6;--fg:#2a2118;--muted:#6f6254;--line:#e5dac9;--card:#fffaf2;--soft:rgba(60,40,20,.05);--radius-card:24px;--cover-fg:var(--fg)}
[data-style=warm] .cover{background:var(--bg)}
[data-style=warm] .cover::after{background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent),transparent 62%);inset:auto -8% -35% auto;width:66%;opacity:.9}
[data-style=warm] .cover .wrap{padding-top:96px;padding-bottom:72px}
[data-style=warm] .cover .meta{display:inline-block;background:var(--accent);color:#fff;padding:5px 12px;border-radius:999px;font-weight:600;font-size:13px;opacity:1}
[data-style=warm] .cover h1{font-weight:700;letter-spacing:-.035em}
[data-style=warm] .cover .by{color:var(--muted);opacity:1}
[data-style=warm] .topnav{background:rgba(247,241,230,.88)}
[data-style=warm] article h2{font-weight:700}
[data-style=warm] .card{border:0;box-shadow:0 12px 32px -20px rgba(60,40,20,.45)}
[data-style=warm] .pricing{border:0;box-shadow:0 20px 50px -30px rgba(60,40,20,.5)}
[data-style=warm] .accept{border:0;box-shadow:0 20px 50px -30px rgba(60,40,20,.5)}
[data-style=warm] figure.testimonial{border:0;box-shadow:0 12px 32px -20px rgba(60,40,20,.45)}
[data-style=warm] .line{border-top-color:var(--line)}
`;

type PricingInput = Pick<PricingItem, "id" | "name" | "description" | "unitAmount" | "quantity" | "minQuantity" | "maxQuantity" | "optional" | "selectedByDefault" | "taxRateBps" | "position"> & { billing?: string | null; unit?: string | null };

export function pricingHtml(
  items: PricingInput[],
  currency: string,
  locked: boolean,
  selectedFromRecord?: { id: string; quantity: number }[],
  tax: { defaultBps: number; label: string | null } = { defaultBps: 0, label: null },
): string {
  if (!items.length) return "";
  const selection: Record<string, { selected: boolean; quantity?: number }> = {};
  if (selectedFromRecord) {
    for (const it of items) selection[it.id] = { selected: false };
    for (const s of selectedFromRecord) selection[s.id] = { selected: true, quantity: s.quantity };
  }
  const totals = computeTotals(items, selection, tax.defaultBps);
  const taxName = tax.label ? esc(tax.label) : "Tax";
  const lines = totals.lines
    .map((l) => {
      const it = items.find((i) => i.id === l.id)!;
      const range = it.minQuantity != null || it.maxQuantity != null;
      const control = it.optional
        ? `<span class="opt"><input class="switch" type="checkbox" name="sel_${esc(it.id)}" data-item="${esc(it.id)}" ${l.selected ? "checked" : ""} ${locked ? "disabled" : ""} aria-label="Include ${esc(it.name)}"></span>`
        : "";
      const qty = range
        ? `<input class="qty" type="number" name="qty_${esc(it.id)}" data-qty="${esc(it.id)}" value="${l.quantity}" min="${it.quantity === 0 ? 0 : (it.minQuantity ?? 0)}" max="${it.maxQuantity ?? 100000}" ${locked ? "disabled" : ""} aria-label="Quantity for ${esc(it.name)}">`
        : "";
      const label = priceLabel(it.unitAmount, currency, it.unit, it.billing);
      const summary = lineSummary(l, currency);
      const unit = qty
        ? `<div class="unit">${qty} <span data-sep="${esc(it.id)}">${l.quantity === 0 ? "at" : "×"}</span> <span data-unit="${esc(it.id)}">${esc(label)}</span></div>`
        : summary
          ? `<div class="unit">${esc(summary)}</div>`
          : "";
      const amt = l.quantity === 0 && range ? "" : formatMoney(l.lineSubtotal, currency);
      return `<div class="line${l.selected ? "" : " off"}" data-line="${esc(it.id)}">
  <div><div class="name">${control}${esc(it.name)}</div>${it.description ? `<div class="desc">${esc(it.description)}</div>` : ""}</div>
  <div class="amt" data-amt="${esc(it.id)}">${esc(amt)}</div>
  ${unit}
</div>`;
    })
    .join("\n");
  return `<section class="pricing" id="pricing" aria-label="Pricing">
${lines}
<div class="totals">
  ${totals.hasOnce && totals.hasTax ? `<div><span>Subtotal</span><span data-sub>${esc(formatMoney(totals.subtotal, currency))}</span></div><div><span>${taxName}</span><span data-tax>${esc(formatMoney(totals.tax, currency))}</span></div>` : ""}
  ${totals.hasOnce ? `<div class="grand"><span>${totals.recurring.length ? "One-time total" : "Total"}</span><span data-total>${esc(formatMoney(totals.total, currency))}</span></div>` : ""}
  ${totals.recurring.map((r) => `<div class="grand rec${totals.hasOnce ? "" : " first"}" data-recrow="${r.period}"${r.total === 0 && totals.hasOnce ? " hidden" : ""}><span>${esc(periodRow(r.period))}${totals.hasTax ? " (incl. tax)" : ""}</span><span data-rec="${r.period}">${esc(formatMoney(r.total, currency))}</span></div>`).join("")}
</div>
</section>`;
}

export function renderProposalPage(p: PageProps): string {
  const { proposal, owner, items, acceptance } = p;
  const color = accent(proposal.accentColor ?? owner.brandColor);
  const pageStyle = styleOf(proposal.style);
  const brand = proposal.senderName || businessName(owner.brandName, owner.name, "Proposal");
  const locked = Boolean(acceptance) || p.expired || Boolean(p.declined);
  const blocks = (proposal.content as Block[]) ?? [];

  // The cover carries the title, so a leading H1 that repeats it is dropped from the body.
  const body = [...blocks];
  const first = body[0];
  if (first?.type === "heading" && Number(first.props?.level) === 1) {
    const text = (Array.isArray(first.content) ? first.content.map((n: any) => n.text ?? "").join("") : String(first.content ?? "")).trim();
    if (!text || text === proposal.title.trim()) body.shift();
  }
  const sections = splitSections(body);

  const pricing = pricingHtml(items, proposal.currency, locked, acceptance ? (acceptance.selectedItemIds as { id: string; quantity: number }[]) : undefined, {
    defaultBps: proposal.taxRateBps,
    label: proposal.taxLabel,
  });

  let acceptSection = "";
  if (acceptance) {
    acceptSection = `<section class="accept" id="accept">
  <h2>Accepted</h2>
  <p class="lead">Accepted by <strong>${esc(acceptance.signerName)}</strong> on ${esc(fmtDate(acceptance.acceptedAt))} for <strong>${esc(describeTotals({ total: acceptance.totalAmount, recurring: ((acceptance.recurring ?? []) as { period: Billing; total: number }[]) }, acceptance.currency))}</strong>.</p>
  ${acceptance.countersignerName && acceptance.countersignedAt ? `<p class="lead">Countersigned by <strong>${esc(acceptance.countersignerName)}</strong> for ${esc(brand)} on ${esc(fmtDate(acceptance.countersignedAt))}.</p>` : proposal.countersign ? `<p class="note">${esc(brand)} will countersign; you will get the fully signed copy by email.</p>` : ""}
  <p class="hash">Content hash <code>${esc(acceptance.contentHash)}</code></p>
  ${p.paymentUrl ? `<p class="rec"><a class="btn" href="${esc(p.paymentUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.paymentLabel || "Pay the deposit")}</a></p>` : ""}
  <p class="rec"><a class="btn ghost" href="/p/${esc(proposal.publicId)}/pdf">Download the signed copy (PDF)</a></p>
  <p class="hash"><a href="/p/${esc(proposal.publicId)}/record.json">Acceptance record (JSON)</a></p>
</section>`;
  } else if (p.declined) {
    acceptSection = `<section class="accept" id="accept"><h2>You passed on this one</h2><p class="lead">Thanks for letting ${esc(brand)} know. Changed your mind? Reply to their email and they can reopen it.</p></section>`;
  } else if (p.expired) {
    acceptSection = `<section class="accept" id="accept"><h2>This proposal has expired</h2><p class="lead">Contact ${esc(brand)} for an updated version.</p></section>`;
  } else {
    acceptSection = `<section class="accept" id="accept">
  <h2>Accept this proposal</h2>
  <p class="lead">Type your name to sign. You will get a copy by email.</p>
  <div>
    <label class="f" for="signerName">Full name</label>
    <input class="t" id="signerName" name="signerName" required minlength="2" maxlength="120" autocomplete="name">
    <label class="f" for="signerEmail">Email <span class="opt-label">(your signed copy goes here)</span></label>
    <input class="t" id="signerEmail" name="signerEmail" type="email" maxlength="254" autocomplete="email" inputmode="email" required>
    <label class="consent"><input type="checkbox" name="consent" required><span>${esc(p.consentText)}</span></label>
    <p class="note">Your name, email, the time and your IP address become part of the signed record, which both you and ${esc(brand)} receive. <a href="${esc(p.appUrl)}/privacy" rel="noopener">How Quote and Sign handles data</a>.</p>
    <button class="btn" type="submit" id="acceptBtn"${p.isOwner ? " disabled" : ""}>Accept proposal</button>${p.isOwner ? `<p class="note">${esc(p.previewNote ?? "Preview: try the options above. Accepting is disabled for you as the sender.")}</p>` : ""}
    <p class="err" id="acceptErr" role="alert"></p>
    ${p.isOwner ? "" : `<p class="note"><button type="button" class="linkbtn" id="declineOpen" aria-expanded="false" aria-controls="declineBox">Not this time?</button></p>
    <div id="declineBox" hidden>
      <label class="f" for="declineReason">Anything you want ${esc(brand)} to know? <span class="opt-label">(optional)</span></label>
      <textarea class="t" id="declineReason" rows="3" maxlength="500"></textarea>
      <p class="rec"><button class="btn ghost" type="button" id="declineBtn">Send and close this proposal</button></p>
      <p class="err" id="declineErr" role="alert"></p>
    </div>`}
  </div>
</section>`;
  }

  let placedPricing = false;
  let placedAccept = false;
  const sectionHtml = sections
    .map((sec, i) => {
      let html = renderBlocks(sec.blocks);
      if (html.includes(PRICING_MARKER)) {
        html = html.replace(PRICING_MARKER, pricing);
        placedPricing = true;
      }
      if (html.includes(ACCEPT_MARKER)) {
        html = html.replace(ACCEPT_MARKER, acceptSection);
        placedAccept = true;
      }
      const band = sec.colour ? `band-${sec.colour}` : "band-plain";
      return `<section class="sec ${band}${i === 0 && !sec.title ? " intro" : ""}" id="${esc(sec.id)}" data-title="${esc(sec.title ?? "Introduction")}"><div class="wrap">${html}</div></section>`;
    })
    .join("\n");
  const tail =
    (placedPricing ? "" : `<section class="sec band-plain" id="s-pricing" data-title="Pricing"><div class="wrap">${pricing}</div></section>`) +
    (placedAccept ? "" : `<section class="sec band-plain" id="s-accept" data-title="Accept"><div class="wrap">${acceptSection}</div></section>`);

  const clientItems: ClientItem[] = items.map((i) => ({
    id: i.id,
    position: i.position,
    unitAmount: i.unitAmount,
    quantity: i.quantity,
    minQuantity: i.minQuantity,
    maxQuantity: i.maxQuantity,
    optional: i.optional,
    selectedByDefault: i.selectedByDefault,
    taxRateBps: i.taxRateBps ?? proposal.taxRateBps,
    billing: i.billing,
    unit: i.unit,
  }));

  const banner = p.justAccepted && acceptance
    ? `<div class="notice ok">Thank you. This proposal is now accepted. Your signed copy is on its way to ${esc(acceptance.signerEmail ?? "you")}.</div>`
    : "";
  const ribbonSpec = p.ribbon ?? (p.isOwner ? { href: `${p.appUrl}/app/p/${proposal.id}`, label: "← Back to the editor", note: "Preview. This is what your client will see." } : null);
  const ribbon = ribbonSpec && !("hidden" in ribbonSpec) ? `<div class="ribbon"><div class="in"><a href="${esc(ribbonSpec.href)}">${esc(ribbonSpec.label)}</a><span class="note">${esc(ribbonSpec.note)}</span><span></span></div></div>` : "";

  const hiddenNav = new Set(Array.isArray(proposal.navHidden) ? proposal.navHidden : []);
  const navLinks = sections
    .filter((s) => s.title && !(s.blockId && hiddenNav.has(s.blockId)))
    .map((s) => `<a href="#${esc(s.id)}" data-nav="${esc(s.id)}">${esc(s.title!)}</a>`)
    .join("");
  const navCta = acceptance ? `<span class="done">Accepted</span>` : p.expired ? "" : `<a class="cta" href="#accept">Accept</a>`;
  const brandHtml = `<div class="brand">${owner.brandLogoKey ? `<img src="/files/${esc(owner.brandLogoKey)}" alt="${esc(brand)}">` : `<span class="dot" aria-hidden="true"></span>`}<span>${esc(brand)}</span></div>`;

  const script = locked ? "" : pricingScript(p.nonce, clientItems, proposal.currency, false);
  const navScript = `<script nonce="${p.nonce}">
(function(){var links=[].slice.call(document.querySelectorAll("[data-nav]"));if(!links.length||!("IntersectionObserver" in window))return;
var map={};links.forEach(function(a){map[a.dataset.nav]=a});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.remove("on")});var a=map[e.target.id];if(a){a.classList.add("on");var strip=a.parentElement;if(strip&&strip.scrollWidth>strip.clientWidth){var left=a.offsetLeft-strip.clientWidth/2+a.offsetWidth/2;strip.scrollTo({left:Math.max(0,left),behavior:"smooth"})}}}})},{rootMargin:"-45% 0px -50% 0px"});
Object.keys(map).forEach(function(id){var el=document.getElementById(id);if(el)io.observe(el)})})();
</script>`;

  const canAsk = !acceptance && !p.ribbon && !p.isOwner;
  // Time on each section, reported in small batches. Never for the sender or a template preview.
  const engageScript = !p.ribbon && !p.isOwner
    ? `<script nonce="${p.nonce}">
(function(){var U="/p/${esc(proposal.publicId)}/engage";var secs={},vis={},titles={};var els=[].slice.call(document.querySelectorAll("section.sec[id]"));if(!els.length||!("IntersectionObserver" in window))return;
els.forEach(function(e){titles[e.id]=e.getAttribute("data-title")||e.id});
var io=new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting})},{threshold:0.2});els.forEach(function(e){io.observe(e)});
setInterval(function(){if(document.hidden)return;for(var k in vis){if(vis[k])secs[k]=(secs[k]||0)+1}},1000);
function flush(){var out=[];for(var k in secs){if(secs[k]>0){out.push({id:k,title:titles[k],seconds:secs[k]});secs[k]=0}}if(!out.length)return;var body=JSON.stringify({sections:out});
if(navigator.sendBeacon){navigator.sendBeacon(U,new Blob([body],{type:"application/json"}))}else{fetch(U,{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:true}).catch(function(){})}}
setInterval(flush,15000);document.addEventListener("visibilitychange",function(){if(document.hidden)flush()});window.addEventListener("pagehide",flush)})();
</script>`
    : "";
  const ask = canAsk
    ? `<section class="ask" id="ask"><div class="wrap">
  <h2>Have a question?</h2>
  <p class="lead">Ask ${esc(brand)} directly. It goes straight to their inbox and they reply to you by email.</p>
  <form id="askForm">
    <div class="two">
      <div><label class="f" for="askName">Your name</label><input class="t" id="askName" name="name" required maxlength="120" autocomplete="name"></div>
      <div><label class="f" for="askEmail">Email <span class="opt-label">(for the reply)</span></label><input class="t" id="askEmail" name="email" type="email" maxlength="254" autocomplete="email" inputmode="email"></div>
    </div>
    <label class="f" for="askBody">Your question</label>
    <textarea class="t" id="askBody" name="body" required minlength="3" maxlength="2000" rows="4"></textarea>
    <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <p class="rec"><button class="btn ghost" type="submit" id="askBtn">Send question</button></p>
    <p class="err" id="askErr" role="alert"></p>
  </form>
  <p class="note ok" id="askDone" hidden>Sent. ${esc(brand)} will reply to you by email.</p>
</div></section>`
    : "";
  const askScript = canAsk
    ? `<script nonce="${p.nonce}">
(function(){var f=document.getElementById("askForm");if(!f)return;f.addEventListener("submit",function(e){e.preventDefault();var b=document.getElementById("askBtn"),err=document.getElementById("askErr");b.disabled=true;b.textContent="Sending…";err.textContent="";
fetch("/p/${esc(proposal.publicId)}/ask",{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({name:f.name.value,email:f.email.value,body:f.body.value,website:f.website.value})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){if(x.ok){f.hidden=true;document.getElementById("askDone").hidden=false}else{err.textContent=x.j.error||"Something went wrong.";b.disabled=false;b.textContent="Send question"}}).catch(function(){err.textContent="Network error. Try again.";b.disabled=false;b.textContent="Send question"})})})();
</script>`
    : "";
  const declineScript = !locked && !p.isOwner
    ? `<script nonce="${p.nonce}">
(function(){var o=document.getElementById("declineOpen"),b=document.getElementById("declineBox"),btn=document.getElementById("declineBtn");if(!o||!b||!btn)return;
o.addEventListener("click",function(){var open=b.hidden;b.hidden=!open;o.setAttribute("aria-expanded",String(open));if(open)document.getElementById("declineReason").focus()});
btn.addEventListener("click",function(){var err=document.getElementById("declineErr");btn.disabled=true;err.textContent="";
fetch("/p/${esc(proposal.publicId)}/decline",{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({reason:document.getElementById("declineReason").value})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){if(x.ok){location.href="/p/${esc(proposal.publicId)}#accept"}else{err.textContent=x.j.error||"Something went wrong.";btn.disabled=false}}).catch(function(){err.textContent="Network error. Try again.";btn.disabled=false})})})();
</script>`
    : "";
  const totalsNow = computeTotals(items, {}, proposal.taxRateBps);
  const bar = locked
    ? ""
    : items.length
      ? `<div class="bar"><div><span class="t">${totalsNow.hasOnce ? "Total" : esc(periodRow(totalsNow.recurring[0]!.period))}</span><span class="v" data-bartotal>${esc(formatMoney(totalsNow.hasOnce ? totalsNow.total : totalsNow.recurring[0]!.total, proposal.currency))}</span></div><a href="#accept">Accept</a></div>`
      : `<div class="bar"><div><span class="t">${esc(brand)}</span></div><a href="#accept">Accept</a></div>`;

  const formOpen = locked ? "" : `<form method="post" action="/p/${esc(proposal.publicId)}/accept" id="acceptForm"><input type="hidden" name="seenHash" id="seenHash" value="${esc(p.seenHash)}">`;
  const formClose = locked ? "" : `</form>`;

  const meta: string[] = [];
  if (proposal.sentAt) meta.push(fmtDate(proposal.sentAt));
  if (proposal.expiresAt && !acceptance) {
    const dayOf = (ms: number) => Math.floor(ms / 86_400_000);
    const days = dayOf(proposal.expiresAt.getTime()) - dayOf(Date.now());
    meta.push(p.expired ? "Expired" : days <= 0 ? "Expires today" : days === 1 ? "Valid for 1 more day" : `Valid for ${days} more days`);
  }

  return `<!doctype html>
<html lang="en"${ribbon ? ' class="has-ribbon"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="${pageStyle.dark ? "dark" : "light"}">
<link rel="icon" href="/brand/mark.svg" type="image/svg+xml">
<link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/brand/site.webmanifest">
<meta name="theme-color" content="#2b3f8c">
<meta name="theme-color" content="${pageStyle.dark ? "#0e0e11" : esc(color)}">
<title>${esc(proposal.title)} · ${esc(brand)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(brand)}">
<meta property="og:title" content="${esc(proposal.title)}">
<meta property="og:description" content="${esc(proposal.clientName ? `Proposal for ${proposal.clientName} from ${brand}` : `A proposal from ${brand}`)}">
<meta name="twitter:card" content="summary">
<style nonce="${p.nonce}">${CSS}:root{--accent:${color};--accent-fg:${readableOn(color)}}</style>
</head>
<body data-style="${esc(pageStyle.id)}">
${ribbon}
<nav class="topnav" aria-label="Sections"><div class="in">${brandHtml}<div class="links">${navLinks}</div>${navCta}</div></nav>
<header class="cover">
  <div class="wrap">
    ${proposal.clientName ? `<p class="meta">Prepared for ${esc(proposal.clientName)}</p>` : ""}
    <h1>${esc(proposal.title)}</h1>
    <div class="by"><span>By ${esc(brand)}</span>${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
  </div>
</header>
${banner}
<article>
${formOpen}
${sectionHtml}
${tail}
${formClose}
</article>
${ask}
<footer class="made">${p.madeWith === false ? "" : `Made with <a href="${esc(p.appUrl)}" rel="noopener">Quote and Sign</a> · `}<a href="${esc(p.appUrl)}/privacy" rel="noopener">Privacy</a></footer>
${bar}
${script}
${navScript}
${askScript}
${declineScript}
${engageScript}
</body>
</html>`;
}

export type ClientItem = {
  id: string;
  position: number;
  unitAmount: number;
  quantity: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  optional: boolean;
  selectedByDefault: boolean;
  taxRateBps: number;
  billing?: string | null;
  unit?: string | null;
};

/** JSON that is safe inside a <script> element: "<" can never close the tag. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * Live totals and the accept submit. Shared by the client page and the homepage demo.
 * In demo mode the accept button never calls the server; it shows the confirmation state.
 */
export function pricingScript(nonce: string, clientItems: ClientItem[], currency: string, demo: boolean): string {
  return `<script nonce="${nonce}">
(function(){
var demo=${demo ? "true" : "false"};
var items=${jsonForScript(clientItems)};var cur=${jsonForScript(currency)};
var fmt=function(m){try{return new Intl.NumberFormat("en",{style:"currency",currency:cur,currencyDisplay:"narrowSymbol",minimumFractionDigits:2,maximumFractionDigits:2}).format(m/100)+" "+cur}catch(e){return (m/100).toFixed(2)+" "+cur}};
var sel={};
function clamp(n,a,b){n=Math.floor(isFinite(n)?n:0);if(a!=null&&n<a)n=a;if(b!=null&&n>b)n=b;if(n>100000)n=100000;return n<0?0:n}
function qty(it,c){var range=it.minQuantity!=null||it.maxQuantity!=null;if(!range)return it.quantity;var raw=c.quantity!=null?c.quantity:it.quantity;if(raw===0&&it.quantity===0)return 0;return clamp(raw,it.minQuantity,it.maxQuantity)}
function per(it){var b=it.billing||"once";var u=it.unit?" per "+it.unit:"";return b==="once"?u:u+" per "+b}
function compute(){var sub=0,tax=0,rec={};items.forEach(function(it){var c=sel[it.id]||{};var on=it.optional?(c.selected!=null?c.selected:it.selectedByDefault):true;var range=it.minQuantity!=null||it.maxQuantity!=null;var q=qty(it,c);var ls=on?it.unitAmount*q:0;var t=Math.round(ls*it.taxRateBps/10000);var b=it.billing||"once";if(b==="once"){sub+=ls;tax+=t}else{rec[b]=(rec[b]||0)+ls+t}var row=document.querySelector('[data-line="'+it.id+'"]');if(row){row.classList.toggle("off",!on);var a=row.querySelector("[data-amt]");if(a)a.textContent=(q===0&&range)?"":fmt(ls);var u=row.querySelector("[data-unit]");if(u)u.textContent=fmt(it.unitAmount)+per(it);var sp=row.querySelector("[data-sep]");if(sp)sp.textContent=q===0?"at":"\u00d7"}});
var s=document.querySelector("[data-sub]"),x=document.querySelector("[data-tax]"),g=document.querySelector("[data-total]"),b=document.querySelector("[data-bartotal]");if(s)s.textContent=fmt(sub);if(x)x.textContent=fmt(tax);if(g)g.textContent=fmt(sub+tax);
var once=items.some(function(it){return (it.billing||"once")==="once"});Object.keys(rec).forEach(function(p){var el=document.querySelector('[data-rec="'+p+'"]');if(el)el.textContent=fmt(rec[p]);var rw=document.querySelector('[data-recrow="'+p+'"]');if(rw)rw.hidden=once&&rec[p]===0});
if(b){if(once){b.textContent=fmt(sub+tax)}else{var first=["month","quarter","year"].filter(function(p){return rec[p]!=null})[0];b.textContent=fmt(first?rec[first]:0)}}}
if(demo){window.qsSetCurrency=function(c){cur=c;compute()}}
document.querySelectorAll("[data-item]").forEach(function(el){el.addEventListener("change",function(){sel[el.dataset.item]=sel[el.dataset.item]||{};sel[el.dataset.item].selected=el.checked;compute()})});
document.querySelectorAll("[data-qty]").forEach(function(el){el.addEventListener("input",function(){sel[el.dataset.qty]=sel[el.dataset.qty]||{};if(el.value===""){delete sel[el.dataset.qty].quantity}else{sel[el.dataset.qty].quantity=Number(el.value)}compute()});el.addEventListener("change",function(){var it=items.filter(function(i){return i.id===el.dataset.qty})[0];if(!it)return;var v=el.value===""?it.quantity:clamp(Number(el.value),it.minQuantity,it.maxQuantity);el.value=String(v);sel[el.dataset.qty]=sel[el.dataset.qty]||{};sel[el.dataset.qty].quantity=v;compute()})});
var f=document.getElementById("acceptForm");if(f){f.addEventListener("submit",function(e){e.preventDefault();var btn=document.getElementById("acceptBtn"),err=document.getElementById("acceptErr");btn.disabled=true;btn.textContent="Accepting…";err.textContent="";
if(demo){setTimeout(function(){var d=document.getElementById("demoDone");if(d){d.hidden=false}btn.textContent="Accepted";f.querySelectorAll("input,button").forEach(function(i){i.disabled=true})},500);return}
fetch(f.action,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({signerName:f.signerName.value,signerEmail:f.signerEmail.value,consent:f.consent.checked,selection:sel,seenHash:(document.getElementById("seenHash")||{}).value||""})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){if(x.ok){location.href=x.j.redirect}else{err.textContent=x.j.error||"Something went wrong.";btn.disabled=false;btn.textContent="Accept proposal"}}).catch(function(){err.textContent="Network error. Try again.";btn.disabled=false;btn.textContent="Accept proposal"})})}
})();
</script>`;
}

/**
 * A template rendered through the real client page, so the gallery shows the thing itself
 * rather than a picture of it. Nothing is stored; accepting is disabled.
 */
export function renderTemplatePreview(o: { template: Template; nonce: string; appUrl: string; brand: { name: string; color: string | null; logoKey?: string | null }; thumb?: boolean; style?: string }): string {
  const now = new Date();
  const proposal = {
    id: "template",
    publicId: "template",
    title: o.template.title,
    clientName: "Alex Morgan",
    currency: "USD",
    content: o.template.content,
    taxRateBps: 0,
    taxLabel: null,
    senderName: null,
    accentColor: null,
    ccEmails: null,
    navHidden: null,
    style: o.style ?? o.template.style,
    sentAt: now,
    expiresAt: null,
    status: "sent",
  } as unknown as Proposal;
  const owner = { brandName: o.brand.name, brandColor: o.brand.color, brandLogoKey: o.brand.logoKey ?? null, name: o.brand.name, email: "" } as unknown as User;
  const items = o.template.items.map((it, i) => ({
    id: `t${i}`,
    position: i,
    name: it.name,
    description: it.description ?? null,
    unitAmount: it.unitAmount,
    quantity: it.quantity,
    minQuantity: it.minQuantity ?? null,
    maxQuantity: it.maxQuantity ?? null,
    optional: it.optional,
    selectedByDefault: it.selectedByDefault,
    taxRateBps: it.taxRateBps,
    billing: it.billing ?? "once",
    unit: it.unit ?? null,
  })) as unknown as PricingItem[];
  return renderProposalPage({
    nonce: o.nonce,
    proposal,
    owner,
    items,
    acceptance: null,
    expired: false,
    isOwner: true,
    justAccepted: false,
    consentText: "I have read this proposal and agree to it. I understand that typing my name and clicking Accept is my electronic signature and is legally binding.",
    appUrl: o.appUrl,
    seenHash: "",
    ribbon: o.thumb ? { hidden: true } : { href: `${o.appUrl}/app/templates`, label: "← Back to templates", note: `Template preview: ${o.template.name}. Every word, colour and price is yours to change.` },
    previewNote: "Template preview. Your client will be able to accept here.",
  });
}

export type RecordView = {
  publicId: string;
  title: string;
  brand: string | null;
  brandColor: string | null;
  clientName: string | null;
  signerName: string;
  signerEmail: string | null; // the sender sees it; anyone else with the link does not
  signedText: string;
  acceptedAt: Date;
  total: string;
  method: string;
  lines: { name: string; detail: string; amount: string }[];
  contentHash: string;
  matches: boolean;
  consentText: string;
  countersign: { name: string; at: Date } | null;
  device: { ip: string | null; userAgent: string | null } | null;
};

/** The signing record: who accepted what, when, and the hash that proves the content. */
export function renderRecordPage(nonce: string, r: RecordView): string {
  const color = accent(r.brandColor);
  const when = (d: Date) => d.toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  const row = (k: string, v: string, mono = false) => `<tr><th>${esc(k)}</th><td${mono ? ' class="mono"' : ""}>${v}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/brand/site.webmanifest"><meta name="theme-color" content="#2b3f8c"><title>Signing record · ${esc(r.title)}</title><style nonce="${nonce}">${CSS}:root{--accent:${color};--accent-fg:${readableOn(color)}}
.rec{max-width:680px;margin:0 auto;padding:56px 20px 64px}.rec h1{font-size:30px;letter-spacing:-.02em;margin:6px 0 4px}.rec .sub{color:var(--muted);margin:0 0 28px}
.rec .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-card);padding:6px 22px;margin:0 0 18px}
.rec table{width:100%;border-collapse:collapse;font-size:15px}.rec th{text-align:left;font-weight:500;color:var(--muted);width:38%;padding:12px 12px 12px 0;vertical-align:top;border-bottom:1px solid var(--line)}.rec td{padding:12px 0;border-bottom:1px solid var(--line);vertical-align:top}.rec tr:last-child th,.rec tr:last-child td{border-bottom:0}
.rec .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all}
.rec .ok{display:inline-flex;align-items:center;gap:6px;color:#166534;font-weight:600}.rec .bad{color:#9f1239;font-weight:600}
.rec .actions{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 0}.rec .actions a{display:inline-flex;align-items:center;padding:11px 18px;border-radius:999px;font-weight:600;font-size:15px;text-decoration:none;background:var(--accent);color:var(--accent-fg)}.rec .actions a.quiet{background:transparent;border:1px solid var(--line);color:var(--fg)}
.rec .note{font-size:13.5px;color:var(--muted);margin:22px 0 0;line-height:1.6}
@media(max-width:520px){.rec th{width:100%;display:block;padding:12px 0 0;border:0}.rec td{display:block;padding:2px 0 12px}}</style></head>
<body><main class="rec">
${r.brand ? `<p class="brand"><span class="dot"></span>${esc(r.brand)}</p>` : ""}
<h1>Signing record</h1>
<p class="sub">${esc(r.title)}${r.clientName ? `, prepared for ${esc(r.clientName)}` : ""}</p>
<div class="card"><table>
${row("Accepted by", esc(r.signerName) + (r.signerEmail ? ` <span class="muted">(${esc(r.signerEmail)})</span>` : ""))}
${row("Typed signature", esc(r.signedText))}
${row("Date", esc(when(r.acceptedAt)))}
${row("Amount", esc(r.total))}
${row("How", r.method === "manual" ? "Marked as accepted by the sender; the client agreed by another channel." : "Signed online on the proposal page.")}
${r.countersign ? row("Countersigned", `${esc(r.countersign.name)}${r.brand ? ` for ${esc(r.brand)}` : ""}, ${esc(when(r.countersign.at))}`) : ""}
</table></div>
${r.lines.length ? `<div class="card"><table>${r.lines.map((l) => `<tr><th>${esc(l.name)}${l.detail ? `<br><span class="muted" style="font-weight:400">${esc(l.detail)}</span>` : ""}</th><td style="text-align:right">${esc(l.amount)}</td></tr>`).join("")}</table></div>` : ""}
<div class="card"><table>
${row("Content hash", `<span class="mono">${esc(r.contentHash)}</span><br>${r.matches ? '<span class="ok">Matches the proposal as it reads today</span>' : '<span class="bad">The proposal has changed since it was signed. The signed version is kept in the record file.</span>'}`)}
${row("Consent", esc(r.consentText))}
${r.device ? row("Signer's device", esc([r.device.ip, r.device.userAgent].filter(Boolean).join(" · ") || "Not recorded"), true) : ""}
</table></div>
<div class="actions"><a href="/p/${esc(r.publicId)}">Open the signed proposal</a><a class="quiet" href="/p/${esc(r.publicId)}/pdf">Download the PDF</a><a class="quiet" href="/p/${esc(r.publicId)}/record.json">Record file (JSON)</a></div>
<p class="note">The content hash is a SHA-256 fingerprint of the proposal exactly as it read when it was accepted. Anyone can recompute it from the record file to confirm nothing was altered afterwards.${r.device ? " The signer's device details are shown to the sender only." : ""}</p>
</main><footer class="made"><a href="/">Quote and Sign</a></footer></body></html>`;
}

export function renderSimplePage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/brand/site.webmanifest"><meta name="theme-color" content="#2b3f8c"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="wrap"><article class="pad"><h1>${esc(title)}</h1><p>${esc(message)}</p></article><footer class="made">Quote and Sign</footer></div></body></html>`;
}

export function renderUnlockPage(o: { publicId: string; brandName: string | null; brandColor?: string | null; wrong: boolean }): string {
  const color = accent(o.brandColor);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/brand/site.webmanifest"><meta name="theme-color" content="#2b3f8c"><title>Enter password</title><style>${CSS}:root{--accent:${color};--accent-fg:${readableOn(color)}}.unlock{min-height:100dvh;display:grid;place-items:center;padding:24px}.unlock article{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius-card);padding:28px 28px 24px}.unlock .brand{margin-bottom:22px;font-size:14px}</style></head>
<body><div class="unlock"><article>
${o.brandName ? `<p class="brand"><span class="dot"></span>${esc(o.brandName)}</p>` : ""}
<h1 class="h-sm">This proposal is protected</h1>
<p class="muted">${o.brandName ? esc(o.brandName) + " set a password for this link." : "Enter the password you were given."}</p>
<form method="post" action="/p/${esc(o.publicId)}/unlock">
<label class="f" for="pw">Password</label><input class="t" id="pw" name="password" type="password" required autocomplete="off">
${o.wrong ? `<p class="err">That password is not right.</p>` : ""}
<p class="rec"><button class="btn" type="submit">Open proposal</button></p>
</form></article></div></body></html>`;
}
