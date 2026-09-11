// The public proposal page. Server-rendered, one HTML response, no framework on the wire.
// It reads as a designed web page, not a document: a cover, a sticky section nav with the
// Accept button always in reach, and color bands per section.

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
  thumb?: boolean; // a gallery thumbnail: flat hero, everything visible, no scroll effects
  previewNote?: string;
};

function accent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#2b3f8c";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

// Highlight palette (backgrounds) and text colors, the same values the editor uses.
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
  return `.bg-${c}{background:${bg};padding:.15em .4em;border-radius:6px;box-decoration-break:clone}.fg-${c}{color:${fg}}.sec.band-${c}{background:color-mix(in srgb,${bg} var(--band-mix,45%),var(--bg))}`;
}).join("");

export const CSS = `
@font-face{font-family:"Geist";src:url("/fonts/Geist-Variable.woff2") format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Newsreader";src:url("/fonts/Newsreader-Variable.woff2") format("woff2");font-weight:300 800;font-style:normal;font-display:swap}
@font-face{font-family:"Newsreader";src:url("/fonts/Newsreader-Italic-Variable.woff2") format("woff2");font-weight:300 800;font-style:italic;font-display:swap}
::selection{background:color-mix(in srgb,var(--accent) 22%,transparent)}
html{scrollbar-color:color-mix(in srgb,var(--fg) 28%,transparent) transparent}
body{caret-color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
:root{--accent:#2b3f8c;--bg:#fbfaf7;--fg:#191816;--muted:#5f5b55;--line:#e6e2da;--card:#fff;--soft:rgba(25,24,22,.04);--radius:14px;--radius-card:16px;--radius-btn:999px;--font-display:"Geist",ui-sans-serif,system-ui,sans-serif;--accent-fg:#fff;--cover-fg:var(--accent-fg)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:calc(76px + 6vh)}
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
.ribbon a{color:inherit;text-decoration:none;font-weight:600;justify-self:start}
.ribbon a:hover{text-decoration:underline;text-underline-offset:3px}
@media(max-width:600px){.ribbon .in{grid-template-columns:auto 1fr}.ribbon .note{text-align:right}.ribbon .in>span:last-child{display:none}}
@media(max-width:719px){html.has-ribbon{scroll-padding-top:calc(140px + 4vh)}}

/* The section nav: a floating island, detached from the top, with Accept always in reach. */
.topnav{position:sticky;top:10px;z-index:6;padding:0 14px;pointer-events:none;height:0}
.topnav .in{--nav-bg:color-mix(in srgb,var(--card) 78%,transparent);--nav-line:color-mix(in srgb,var(--fg) 8%,transparent);pointer-events:auto;position:relative;max-width:1040px;margin:0 auto;height:56px;display:flex;align-items:center;gap:14px;padding:0 8px 0 18px;border-radius:999px;background:var(--nav-bg);border:1px solid var(--nav-line);box-shadow:0 1px 2px rgba(0,0,0,.04),0 18px 50px -24px rgba(0,0,0,.35);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4)}
.topnav .brand{font-size:14px;flex:none;margin-right:6px}
.topnav .links{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0;padding:4px 0}
.topnav .links::-webkit-scrollbar{display:none}
.topnav .links a{flex:none;font-size:13.5px;font-weight:500;color:var(--muted);text-decoration:none;padding:7px 12px;border-radius:999px;transition:color .2s cubic-bezier(.32,.72,0,1),background-color .25s cubic-bezier(.32,.72,0,1)}
.topnav .links a:hover{color:var(--fg);background:var(--soft)}
.topnav .links a.on{color:var(--bg);background:var(--fg)}
.topnav .cta{flex:none;font-size:14px;font-weight:600;color:var(--accent-fg);background:var(--accent);padding:10px 18px;border-radius:999px;text-decoration:none;transition:transform .2s cubic-bezier(.32,.72,0,1),filter .2s}
.topnav .cta:hover{filter:brightness(1.06)}.topnav .cta:active{transform:scale(.97)}
.topnav .done{flex:none;font-size:13px;font-weight:600;color:var(--accent);padding:0 12px}
.topnav .progress{position:absolute;left:22px;right:22px;bottom:-1px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 35%,transparent));transform-origin:0 50%;transform:scaleX(0);pointer-events:none;opacity:.9}
@media(max-width:719px){.topnav{top:8px;padding:0 8px}.topnav .in{height:50px;padding:0 6px 0 14px;gap:8px;border-radius:999px}.topnav .brand{margin-right:0}.topnav .brand span:last-child{display:none}.topnav .links{margin:0;padding:3px 0;mask-image:linear-gradient(90deg,#000 88%,transparent)}.topnav .links a{font-size:13px;padding:6px 10px}.topnav .cta{display:none}.topnav .done{padding:0 8px}.topnav .progress{left:16px;right:16px}.scroll-cue{display:none}}
html.has-ribbon .topnav{top:calc(var(--ribbon-h) + 10px)}
[data-style=night] .topnav .in{--nav-bg:rgba(20,20,24,.72);--nav-line:rgba(255,255,255,.1);box-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 50px -24px rgba(0,0,0,.9)}
[data-style=night] .topnav .links a.on{color:#0e0e11;background:#fff}
[data-style=bold] .topnav .in{--nav-bg:color-mix(in srgb,var(--fg) 88%,transparent);--nav-line:rgba(255,255,255,.12)}
[data-style=bold] .topnav .brand{color:#fff}[data-style=bold] .topnav .links a{color:rgba(255,255,255,.7)}[data-style=bold] .topnav .links a:hover{color:#fff;background:rgba(255,255,255,.1)}[data-style=bold] .topnav .links a.on{color:var(--fg);background:#fff}[data-style=bold] .topnav .done{color:#fff}
[data-style=editorial] .topnav .in{border-radius:14px;--nav-bg:color-mix(in srgb,var(--bg) 86%,transparent)}[data-style=editorial] .topnav .links a{border-radius:8px}[data-style=editorial] .topnav .cta{border-radius:8px}
[data-style=minimal] .topnav .in{box-shadow:none;--nav-bg:rgba(255,255,255,.82)}[data-style=minimal] .topnav .cta{background:var(--fg);color:var(--bg)}
[data-style=warm] .topnav .in{--nav-bg:rgba(255,250,242,.8);border-radius:24px}
[data-style=studio] .topnav .cta{background:var(--fg);color:var(--bg)}

/* Cover */
.cover{color:var(--cover-fg);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 78%,#000) 0%,var(--accent) 55%,color-mix(in srgb,var(--accent) 72%,#fff) 100%);position:relative;overflow:hidden}
.cover::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.14),transparent 55%);pointer-events:none}
.cover .wrap{position:relative;z-index:1;padding-top:136px;padding-bottom:84px}
.cover .meta{font-size:14px;opacity:.85;margin:0 0 14px}
.cover h1{font-family:var(--font-display);font-size:clamp(40px,7vw,76px);line-height:1.02;letter-spacing:-.04em;font-weight:650;margin:0;text-wrap:balance;max-width:16ch}
.cover .by{margin:26px 0 0;font-size:15px;opacity:.9;display:flex;flex-wrap:wrap;gap:6px 18px}
@media(max-width:719px){.cover .wrap{padding-top:96px;padding-bottom:48px}}

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
article p{margin:0 0 1em;font-size:17px;line-height:1.65}article p.blank{margin:0;height:1em}
.ta-center{text-align:center}.ta-right{text-align:right}.ta-justify{text-align:justify}
article ul,article ol{padding-left:1.3em;margin:0 0 1em;font-size:17px}article li{margin:.3em 0}
article blockquote{margin:1.4em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--accent);color:var(--muted);font-size:18px}
article hr{border:0;border-top:1px solid var(--line);margin:2em 0}
article figure{margin:1.4em 0}article figcaption{font-size:13px;color:var(--muted);margin-top:.5em}
figure.img .ph{overflow:hidden;border-radius:14px}figure.img img{max-width:100%;height:auto;display:block}
figure.img.wide img{width:100%}
figure.img.w-25{width:25%}figure.img.w-33{width:33.333%}figure.img.w-50{width:50%}figure.img.w-66{width:66.666%}figure.img.w-75{width:75%}
figure.img.al-center{margin-left:auto;margin-right:auto}figure.img.al-right{margin-left:auto}
figure.img.al-center figcaption{text-align:center}figure.img.al-right figcaption{text-align:right}
@media(max-width:640px){figure.img.w-25,figure.img.w-33{width:50%}}
.imgrow{display:grid;gap:14px;margin:1.4em 0}.imgrow.cols-2{grid-template-columns:repeat(2,1fr)}.imgrow.cols-3{grid-template-columns:repeat(3,1fr)}.imgrow.cols-4{grid-template-columns:repeat(4,1fr)}
.imgrow figure{margin:0}.imgrow .ph{aspect-ratio:4/3}.imgrow img{width:100%;height:100%;aspect-ratio:4/3;object-fit:cover}
@media(max-width:640px){.imgrow.cols-3,.imgrow.cols-4{grid-template-columns:repeat(2,1fr)}}
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
.switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .42s cubic-bezier(.34,1.45,.64,1)}
.line{transition:background-color .2s}.line:has(.switch):hover{background:var(--soft)}
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
.sig{display:grid;gap:6px;min-height:58px;margin:10px 0 2px;padding:0 2px}
.sig-name{font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:36px;line-height:1.05;letter-spacing:-.01em;color:var(--fg);opacity:0;transform:translateY(6px);transition:opacity .4s ease-out,transform .55s cubic-bezier(.32,.72,0,1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sig-line{height:1px;background:color-mix(in srgb,var(--fg) 30%,transparent);transform:scaleX(0);transform-origin:0 50%;transition:transform .6s cubic-bezier(.32,.72,0,1)}
.sig.has .sig-name{opacity:1;transform:none}.sig.has .sig-line{transform:none}
.sig-hint{font-size:12px;color:var(--muted);margin:0}
.okmark{width:44px;height:44px;flex:none}
.okmark circle{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-dasharray:132;stroke-dashoffset:0}
.okmark path{fill:none;stroke:var(--accent);stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:36;stroke-dashoffset:0}
html.js .just .okmark circle{stroke-dashoffset:132;animation:qs-draw-ok .7s cubic-bezier(.32,.72,0,1) .1s forwards}
html.js .just .okmark path{stroke-dashoffset:36;animation:qs-draw-ok .45s cubic-bezier(.32,.72,0,1) .65s forwards}
@keyframes qs-draw-ok{to{stroke-dashoffset:0}}
.accept.done h2{display:flex;align-items:center;gap:14px}
.sig-done{margin:10px 0 18px;font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:40px;line-height:1.05;letter-spacing:-.01em;color:var(--fg);padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,var(--fg) 30%,transparent)}
@media(prefers-reduced-motion:reduce){.sig-name,.sig-line{transition:none}html.js .just .okmark circle,html.js .just .okmark path{animation:none;stroke-dashoffset:0}}
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

/* ---- Micro-site layer: shared by every style. */
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ws .w{display:inline-block}
html.js .rv .ws .w{opacity:0;transform:translateY(.55em) rotate(2deg);filter:blur(4px);transition:opacity .55s cubic-bezier(.32,.72,0,1),transform .7s cubic-bezier(.32,.72,0,1),filter .5s ease-out;transition-delay:calc(var(--i,0) * 38ms)}
.ws .w:nth-child(1){--i:0}.ws .w:nth-child(2){--i:1}.ws .w:nth-child(3){--i:2}.ws .w:nth-child(4){--i:3}.ws .w:nth-child(5){--i:4}.ws .w:nth-child(6){--i:5}.ws .w:nth-child(7){--i:6}.ws .w:nth-child(8){--i:7}.ws .w:nth-child(9){--i:8}.ws .w:nth-child(10){--i:9}.ws .w:nth-child(11){--i:10}.ws .w:nth-child(12){--i:11}.ws .w:nth-child(13){--i:12}.ws .w:nth-child(14){--i:13}.ws .w:nth-child(15){--i:14}.ws .w:nth-child(16){--i:15}.ws .w:nth-child(17){--i:16}.ws .w:nth-child(18){--i:17}.ws .w:nth-child(19){--i:18}.ws .w:nth-child(20){--i:19}.ws .w:nth-child(21){--i:20}.ws .w:nth-child(22){--i:21}.ws .w:nth-child(23){--i:22}.ws .w:nth-child(24){--i:23}.ws .w:nth-child(25){--i:24}.ws .w:nth-child(26){--i:25}.ws .w:nth-child(27){--i:26}.ws .w:nth-child(28){--i:27}.ws .w:nth-child(29){--i:28}.ws .w:nth-child(30){--i:29}.ws .w:nth-child(31){--i:30}.ws .w:nth-child(32){--i:31}.ws .w:nth-child(33){--i:32}.ws .w:nth-child(34){--i:33}.ws .w:nth-child(35){--i:34}.ws .w:nth-child(36){--i:35}.ws .w:nth-child(37){--i:36}.ws .w:nth-child(38){--i:37}.ws .w:nth-child(39){--i:38}.ws .w:nth-child(40){--i:39}
html.js .rv.in .ws .w{opacity:1;transform:none;filter:none}
@supports(animation-timeline:view()){figure.img img,.imgrow img{animation:qs-par linear both;animation-timeline:view();animation-range:entry 0% exit 100%;will-change:transform}}
@keyframes qs-par{from{transform:translateY(7%) scale(1.12)}to{transform:translateY(-7%) scale(1.12)}}
html.js .pricing.rv{transform:translateY(28px) scale(.985)}
html.js .accept.rv{transform:translateY(28px) scale(.985)}
.cover .cover-text{position:relative}
.hero-art{margin:0;position:relative}
.hero-art img{display:block;width:100%;height:100%;object-fit:cover;border-radius:24px}
.hero-art figcaption{position:absolute;left:14px;bottom:12px;font-size:12px;color:#fff;background:rgba(0,0,0,.35);padding:4px 10px;border-radius:999px;backdrop-filter:blur(6px)}
.scroll-cue{position:absolute;right:28px;bottom:26px;z-index:2;width:28px;height:44px;border:1.5px solid color-mix(in srgb,var(--cover-fg) 35%,transparent);border-radius:999px;display:grid;justify-content:center;padding-top:8px}
.scroll-cue span{width:3px;height:8px;border-radius:2px;background:var(--cover-fg);animation:qs-cue 1.8s cubic-bezier(.32,.72,0,1) infinite}
@keyframes qs-cue{0%{transform:translateY(0);opacity:1}70%{transform:translateY(16px);opacity:0}100%{transform:translateY(16px);opacity:0}}
@media(max-width:719px){.scroll-cue{display:none}}
@media(prefers-reduced-motion:reduce){html.js .rv .ws .w{opacity:1;transform:none;filter:none;transition:none}figure.img img,.imgrow img{animation:none}.scroll-cue span{animation:none}}
/* The curtain: Studio and Night pin the cover and let the page slide over it. */
[data-style=studio] .cover,[data-style=night] .cover{position:sticky;top:0;z-index:0}
[data-style=studio] article,[data-style=studio] .ask,[data-style=studio] footer.made,[data-style=night] article,[data-style=night] .ask,[data-style=night] footer.made{position:relative;z-index:1;background:var(--bg)}
[data-style=studio] article{box-shadow:0 -30px 80px -40px rgba(15,15,16,.35)}
[data-style=night] article{box-shadow:0 -30px 80px -40px rgba(0,0,0,.9)}
@supports(animation-timeline:scroll()){[data-style=studio] .cover .wrap,[data-style=night] .cover .wrap{animation:qs-curtain linear both;animation-timeline:scroll(root);animation-range:0 100vh}[data-style=studio] .cover::before,[data-style=night] .cover::before{animation:qs-drift 22s ease-in-out infinite alternate,qs-curtain-bg linear both;animation-timeline:auto,scroll(root);animation-range:normal,0 100vh}}
@keyframes qs-curtain{to{transform:translateY(-8%) scale(.94);opacity:.12}}
@keyframes qs-curtain-bg{to{opacity:.3}}
@media(prefers-reduced-motion:reduce){[data-style=studio] .cover,[data-style=night] .cover{position:relative}[data-style=studio] .cover .wrap,[data-style=night] .cover .wrap{animation:none}}
html.thumb [data-style=studio] .cover,html.thumb [data-style=night] .cover{position:relative}
html.thumb .topnav{position:relative;height:auto;margin-bottom:-66px}
html.thumb .scroll-cue{display:none}
@supports(animation-timeline:scroll()){.topnav .progress{animation:qs-progress linear both;animation-timeline:scroll(root)}}
@keyframes qs-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
html.thumb .cover{min-height:0!important}
html.js .rv{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.32,.72,0,1),transform .85s cubic-bezier(.32,.72,0,1)}
html.js .rv.in{opacity:1;transform:none}
html.js .grid .card.rv{transition-delay:calc(var(--i,0) * 70ms)}
@supports(animation-timeline:view()){.cover .wrap{animation:qs-cover linear both;animation-timeline:view();animation-range:exit 0% exit 100%}}
@keyframes qs-cover{to{transform:translateY(22%);opacity:.2}}
@media(prefers-reduced-motion:reduce){html.js .rv{opacity:1;transform:none;transition:none}.cover .wrap,.topnav .progress{animation:none}.topnav .progress{transform:scaleX(1);opacity:.35}}

/* ---- Studio: the high-end one. A full-screen opening, huge type, sections that rise. */
[data-style=studio]{--bg:#fafafa;--fg:#0f0f10;--muted:#5f6068;--line:#e9e9ec;--card:#fff;--soft:rgba(15,15,16,.045);--radius:16px;--radius-card:24px;--radius-btn:999px;--cover-fg:var(--fg);--band-mix:26%}
[data-style=studio] body,[data-style=studio]{font-size:17px}
[data-style=studio] .cover{background:var(--bg);display:flex;align-items:center;min-height:min(72svh,760px)}
[data-style=studio] .cover:not(.has-art) .wrap{text-align:center;padding-top:120px;padding-bottom:72px}
[data-style=studio] .cover:not(.has-art) h1{margin-inline:auto;max-width:14ch}
[data-style=studio] .cover:not(.has-art) .by{justify-content:center}
[data-style=studio] .cover.has-art{min-height:min(calc(100svh - 64px),940px)}
[data-style=studio] .cover.has-art .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;padding-top:96px;padding-bottom:56px}
[data-style=studio] .cover.has-art .hero-art{aspect-ratio:4/5;max-height:min(calc(100svh - 200px),720px);border-radius:28px;box-shadow:0 1px 2px rgba(15,15,16,.06),0 60px 120px -60px rgba(15,15,16,.45);transform:rotate(-2deg);overflow:hidden}
[data-style=studio] .cover.has-art .hero-art img{border-radius:0}
@supports(animation-timeline:scroll()){[data-style=studio] .cover.has-art .hero-art{animation:qs-hero-art linear both;animation-timeline:scroll(root);animation-range:0 80vh}}
@keyframes qs-hero-art{to{transform:rotate(0) translateY(-10%) scale(.96)}}
@media(max-width:860px){[data-style=studio] .cover.has-art{min-height:0;align-items:start}[data-style=studio] .cover.has-art .wrap{grid-template-columns:1fr;gap:22px;padding-top:88px;padding-bottom:40px}[data-style=studio] .cover.has-art .hero-art{aspect-ratio:4/3;max-height:42svh;order:-1;transform:none;border-radius:20px}}
[data-style=studio] .cover::before{content:"";position:absolute;inset:-30% -20% -10% -20%;background:radial-gradient(38% 46% at 22% 28%,color-mix(in srgb,var(--accent) 42%,transparent) 0%,transparent 72%),radial-gradient(34% 44% at 82% 18%,color-mix(in srgb,var(--accent) 22%,#fff) 0%,transparent 70%),radial-gradient(30% 40% at 65% 80%,color-mix(in srgb,var(--accent) 14%,#fff) 0%,transparent 70%);filter:blur(28px) saturate(1.15);animation:qs-drift 22s ease-in-out infinite alternate;pointer-events:none}
@supports(color:hsl(from red h s l)){[data-style=studio] .cover::before{background:radial-gradient(38% 46% at 22% 28%,color-mix(in srgb,var(--accent) 44%,transparent) 0%,transparent 72%),radial-gradient(34% 44% at 82% 18%,hsl(from var(--accent) calc(h + 40) 70% 82% / .75) 0%,transparent 70%),radial-gradient(30% 40% at 65% 80%,hsl(from var(--accent) calc(h - 30) 60% 84% / .7) 0%,transparent 70%)}}
@keyframes qs-drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(-3%,4%,0) scale(1.06)}}
[data-style=studio] .cover::after{background:linear-gradient(to top,var(--bg) 0%,transparent 40%)}
[data-style=studio] .cover .wrap{max-width:1120px;padding-top:128px;padding-bottom:64px}
[data-style=studio] .cover .meta{display:inline-flex;align-items:center;gap:10px;font-size:13.5px;font-weight:500;color:var(--muted);opacity:1;padding:7px 14px;border:1px solid color-mix(in srgb,var(--fg) 14%,transparent);border-radius:999px;background:color-mix(in srgb,#fff 60%,transparent);backdrop-filter:blur(8px);margin:0 0 28px}
[data-style=studio] .cover .meta::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent)}
[data-style=studio] .cover h1{font-size:clamp(52px,9.4vw,128px);letter-spacing:-.055em;line-height:.92;font-weight:640;max-width:12ch}
[data-style=studio] .cover .by{margin-top:34px;font-size:16px;color:var(--muted);opacity:1}
[data-style=studio] .wrap{max-width:900px}
[data-style=studio] .sec{padding:104px 0 88px}
[data-style=studio] .sec.intro{padding-top:96px}
[data-style=studio] .sec + .sec{border-top:0}
[data-style=studio] article h2{font-size:clamp(34px,5.2vw,58px);letter-spacing:-.045em;line-height:.98;font-weight:620;margin:0 0 .55em;max-width:15ch}
[data-style=studio] article h3{font-size:20px}
[data-style=studio] article p{font-size:18px;line-height:1.6;max-width:64ch}
[data-style=studio] article ul,[data-style=studio] article ol{font-size:18px}
[data-style=studio] .statement{font-size:clamp(34px,5.8vw,66px);letter-spacing:-.045em;line-height:1.02;font-weight:600;max-width:20ch;margin:.2em 0 .6em}
[data-style=studio] .grid{gap:18px;margin:2em 0 2.4em}
[data-style=studio] .card{border:0;padding:30px 28px 26px;border-radius:var(--radius-card);box-shadow:0 1px 2px rgba(15,15,16,.04),0 30px 70px -40px rgba(15,15,16,.28)}
[data-style=studio] .card h3{font-size:21px;letter-spacing:-.02em;margin-bottom:10px}
[data-style=studio] .card p{font-size:15.5px;line-height:1.55}
[data-style=studio] figure.img .ph,[data-style=studio] figure.video .frame{border-radius:var(--radius-card)}
[data-style=studio] .imgrow{gap:18px;margin:2em 0}
[data-style=studio] figure.testimonial{border:0;background:var(--soft);border-radius:28px;padding:44px 44px 36px;margin:2em 0}
[data-style=studio] figure.testimonial blockquote{font-size:clamp(22px,2.8vw,30px);line-height:1.3;letter-spacing:-.025em;font-weight:500;margin-bottom:24px}
[data-style=studio] figure.testimonial blockquote::before{display:none}
[data-style=studio] .tablewrap{border:0;box-shadow:0 1px 2px rgba(15,15,16,.04),0 24px 60px -40px rgba(15,15,16,.25);border-radius:20px}
[data-style=studio] article th{background:transparent;padding-top:16px}
[data-style=studio] article th,[data-style=studio] article td{padding:16px 20px}
[data-style=studio] .pricing{border:0;border-radius:var(--radius-card);box-shadow:0 1px 2px rgba(15,15,16,.04),0 40px 90px -50px rgba(15,15,16,.35);margin:1.6em 0 2.4em}
[data-style=studio] .line{padding:22px 26px}
[data-style=studio] .line .name{font-size:17px}
[data-style=studio] .totals{padding:20px 26px 24px}
[data-style=studio] .totals .grand{font-size:26px;letter-spacing:-.02em}
[data-style=studio] .accept{border:0;padding:40px;border-radius:var(--radius-card);box-shadow:0 1px 2px rgba(15,15,16,.04),0 40px 90px -50px rgba(15,15,16,.35)}
[data-style=studio] .accept h2{font-size:30px;max-width:none}
[data-style=studio] .btn{font-size:17px;padding:16px 22px}
[data-style=studio] .bar{background:color-mix(in srgb,var(--card) 92%,transparent)}
@media(max-width:600px){[data-style=studio] .cover .wrap{padding-top:96px;padding-bottom:40px}[data-style=studio] .sec{padding:64px 0 52px}[data-style=studio] figure.testimonial{padding:28px 24px 24px}[data-style=studio] .accept{padding:26px 22px}}

/* ---- Editorial: serif headlines, paper cover, a rule of color. */
[data-style=editorial]{--font-display:"Newsreader",Georgia,"Times New Roman",serif;font-optical-sizing:auto;--radius-card:4px;--radius-btn:6px;--cover-fg:var(--fg)}
[data-style=editorial] .cover{background:var(--bg);border-bottom:6px solid var(--accent)}
[data-style=editorial] .cover::after{display:none}
[data-style=editorial] .cover .wrap{padding-top:128px;padding-bottom:64px}
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

/* ---- Bold: huge type on a solid block. */
[data-style=bold]{--radius-card:8px;--radius-btn:8px}
[data-style=bold] .cover{background:var(--accent)}
[data-style=bold] .cover::after{display:none}
[data-style=bold] .cover .wrap{padding-top:128px;padding-bottom:80px;max-width:960px}
[data-style=bold] .cover .meta{font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:12px}
[data-style=bold] .cover h1{font-size:clamp(52px,10vw,112px);letter-spacing:-.055em;line-height:.94;font-weight:750;max-width:none}
[data-style=bold] .cover .by{font-weight:600;margin-top:34px}
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
[data-style=minimal] .cover .wrap{padding-top:144px;padding-bottom:56px}
[data-style=minimal] .cover .meta{opacity:1;color:var(--muted)}
[data-style=minimal] .cover .meta::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:10px;vertical-align:1px}
[data-style=minimal] .cover h1{font-weight:450;letter-spacing:-.04em;font-size:clamp(40px,7vw,72px)}
[data-style=minimal] .cover .by{color:var(--muted);opacity:1}
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
[data-style=night] .cover{background:radial-gradient(120% 120% at 100% 0%,color-mix(in srgb,var(--accent) 55%,#000) 0%,var(--bg) 62%);display:flex;align-items:center;min-height:min(72svh,760px)}
[data-style=night] .cover:not(.has-art) .wrap{text-align:center}
[data-style=night] .cover:not(.has-art) h1{margin-inline:auto;max-width:14ch}
[data-style=night] .cover:not(.has-art) .by{justify-content:center}
[data-style=night] .cover.has-art{min-height:min(calc(100svh - 56px),940px)}
[data-style=night] .cover.has-art .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;max-width:1120px}
[data-style=night] .cover.has-art .hero-art{aspect-ratio:4/5;max-height:min(calc(100svh - 200px),720px);border-radius:24px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 60px 120px -50px #000,0 0 80px color-mix(in srgb,var(--accent) 30%,transparent)}
[data-style=night] .cover.has-art .hero-art img{border-radius:0}
@supports(animation-timeline:scroll()){[data-style=night] .cover.has-art .hero-art{animation:qs-hero-art-n linear both;animation-timeline:scroll(root);animation-range:0 80vh}}
@keyframes qs-hero-art-n{to{transform:translateY(-10%) scale(.96)}}
@media(max-width:860px){[data-style=night] .cover.has-art{min-height:0;align-items:start}[data-style=night] .cover.has-art .wrap{grid-template-columns:1fr;gap:22px;padding-top:88px}[data-style=night] .cover.has-art .hero-art{aspect-ratio:4/3;max-height:40svh;order:-1}}
[data-style=night] .cover::before{content:"";position:absolute;inset:-20%;background:radial-gradient(30% 40% at 78% 22%,color-mix(in srgb,var(--accent) 70%,transparent),transparent 70%);filter:blur(50px);animation:qs-drift 20s ease-in-out infinite alternate;pointer-events:none}
[data-style=night] .cover .wrap{padding-top:128px;padding-bottom:64px}
[data-style=night] .cover h1{font-size:clamp(46px,8vw,104px);letter-spacing:-.05em;line-height:.95}
[data-style=night] .sec{padding:80px 0 64px}
[data-style=night] article h2{font-size:clamp(30px,4.2vw,44px);letter-spacing:-.04em}
[data-style=night] .statement{font-size:clamp(28px,4.4vw,48px)}
@media(max-width:600px){[data-style=night] .cover .wrap{padding-top:96px;padding-bottom:44px}[data-style=night] .sec{padding:56px 0 44px}}
[data-style=night] .cover::after{background:radial-gradient(circle,color-mix(in srgb,var(--accent) 50%,transparent),transparent 65%);inset:auto -20% -50% auto;width:80%;filter:blur(20px)}
[data-style=night] .cover h1{text-shadow:0 0 40px color-mix(in srgb,var(--accent) 40%,transparent)}
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
[data-style=warm] .cover::after{background:linear-gradient(215deg,color-mix(in srgb,var(--accent) 16%,transparent) 0%,transparent 48%)}
[data-style=warm] .cover .wrap{padding-top:128px;padding-bottom:72px}
[data-style=warm] .cover .meta{display:inline-block;background:var(--accent);color:#fff;padding:5px 12px;border-radius:999px;font-weight:600;font-size:13px;opacity:1}
[data-style=warm] .cover h1{font-weight:700;letter-spacing:-.035em}
[data-style=warm] .cover .by{color:var(--muted);opacity:1}
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

const safeArt = (u: string) => (/^(https?:)/i.test(u) || /^\/files\/(logos|images)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(u) || /^\/img\/art\/[a-z0-9-]{1,40}\.svg$/i.test(u)) ? u : "";

export function renderProposalPage(p: PageProps): string {
  const { proposal, owner, items, acceptance } = p;
  const color = accent(proposal.accentColor ?? owner.brandColor);
  const pageStyle = styleOf(proposal.style);
  const brand = proposal.senderName || businessName(owner.brandName, owner.name, "Proposal");
  const hasBrand = Boolean(proposal.senderName || businessName(owner.brandName, owner.name, ""));
  const locked = Boolean(acceptance) || p.expired || Boolean(p.declined);
  const blocks = (proposal.content as Block[]) ?? [];

  // The cover carries the title, so a leading H1 that repeats it is dropped from the body.
  const body = [...blocks];
  const first = body[0];
  if (first?.type === "heading" && Number(first.props?.level) === 1) {
    const text = (Array.isArray(first.content) ? first.content.map((n: any) => n.text ?? "").join("") : String(first.content ?? "")).trim();
    if (!text || text === proposal.title.trim()) body.shift();
  }
  // Studio and Night open on a full stage: the first picture in the document becomes the hero art,
  // and the row it came from keeps the rest. A stage with nothing on it is the one thing to avoid.
  let heroArt: { url: string; caption: string } | null = null;
  if ((pageStyle.id === "studio" || pageStyle.id === "night") && proposal.coverArt !== false) {
    for (let i = 0; i < body.length; i++) {
      const b = body[i]!;
      if (b.type === "imageRow") {
        let list: { url?: string; caption?: string }[] = [];
        try { list = JSON.parse(String(b.props?.images ?? "[]")); } catch { list = []; }
        if (Array.isArray(list) && list.length && list[0]?.url) {
          heroArt = { url: String(list[0].url), caption: String(list[0].caption ?? "") };
          const rest = list.slice(1);
          if (rest.length) body[i] = { ...b, props: { ...(b.props ?? {}), images: JSON.stringify(rest) } };
          else body.splice(i, 1);
          break;
        }
      } else if (b.type === "image" && b.props?.url) {
        heroArt = { url: String(b.props.url), caption: String(b.props.caption ?? "") };
        body.splice(i, 1);
        break;
      }
    }
  }
  const sections = splitSections(body);

  const pricing = pricingHtml(items, proposal.currency, locked, acceptance ? (acceptance.selectedItemIds as { id: string; quantity: number }[]) : undefined, {
    defaultBps: proposal.taxRateBps,
    label: proposal.taxLabel,
  });

  let acceptSection = "";
  if (acceptance) {
    acceptSection = `<section class="accept done" id="accept">
  <h2><svg class="okmark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M15 24.5 L21.5 31 L34 18"/></svg>Accepted</h2>
  <p class="sig-done" aria-hidden="true">${esc(acceptance.signerName)}</p>
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
    <div class="sig" id="sigPreview" aria-hidden="true"><span class="sig-name" id="sigName"></span><span class="sig-line"></span><p class="sig-hint">Your typed name is your signature.</p></div>
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
      const band = sec.color ? `band-${sec.color}` : "band-plain";
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
    ? `<div class="notice ok">Thank you. This proposal is now accepted. Your signed copy is on its way to the address you entered.</div>`
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
  // Sections rise into view as the reader scrolls. Elements already on screen at load show at once.
  const revealScript = `<script nonce="${p.nonce}">
(function(){var root=document.documentElement;if(root.classList.contains("thumb")||!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;root.classList.add("js");
addEventListener("beforeprint",function(){[].forEach.call(document.querySelectorAll(".rv"),function(el){el.classList.add("in")})});
var els=[].slice.call(document.querySelectorAll("section.sec .wrap > *, .ask .wrap > *"));var cards=[].slice.call(document.querySelectorAll(".grid .card"));cards.forEach(function(c,i){c.style.setProperty("--i",String(i%6))});els=els.concat(cards);
var h=innerHeight;els.forEach(function(el){var r=el.getBoundingClientRect();if(r.top<h*0.92){el.classList.add("rv","in")}else{el.classList.add("rv")}});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:0.05});els.forEach(function(el){if(!el.classList.contains("in"))io.observe(el)});
function all(){els.forEach(function(el){el.classList.add("in");io.unobserve(el)})}
if(document.documentElement.scrollHeight<=innerHeight+8)all();
addEventListener("scroll",function(){if(innerHeight+scrollY>=document.documentElement.scrollHeight-8)all()},{passive:true})})();
</script>`;
  const navScript = `<script nonce="${p.nonce}">
(function(){var links=[].slice.call(document.querySelectorAll("[data-nav]"));if(!links.length)return;
var secs=links.map(function(a){return {a:a,el:document.getElementById(a.dataset.nav)}}).filter(function(s){return s.el});var cur=null,raf=0;
function pick(){raf=0;var line=innerHeight*0.38,best=null;for(var i=0;i<secs.length;i++){if(secs[i].el.getBoundingClientRect().top<=line)best=secs[i]}
if(best===cur)return;if(cur)cur.a.classList.remove("on");cur=best;if(!cur)return;cur.a.classList.add("on");var strip=cur.a.parentElement;if(strip&&strip.scrollWidth>strip.clientWidth){strip.scrollTo({left:Math.max(0,cur.a.offsetLeft-strip.clientWidth/2+cur.a.offsetWidth/2),behavior:"smooth"})}}
function onScroll(){if(!raf)raf=requestAnimationFrame(pick)}
addEventListener("scroll",onScroll,{passive:true});addEventListener("resize",onScroll);pick()})();
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
<html lang="en"${[ribbon ? "has-ribbon" : "", p.thumb ? "thumb" : "", p.justAccepted ? "just" : ""].filter(Boolean).length ? ` class="${[ribbon ? "has-ribbon" : "", p.thumb ? "thumb" : "", p.justAccepted ? "just" : ""].filter(Boolean).join(" ")}"` : ""}>
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
<nav class="topnav" aria-label="Sections"><div class="in">${brandHtml}<div class="links">${navLinks}</div>${navCta}<span class="progress" aria-hidden="true"></span></div></nav>
<header class="cover${heroArt ? " has-art" : ""}">
  <div class="wrap">
    <div class="cover-text">
    ${proposal.clientName ? `<p class="meta">Prepared for ${esc(proposal.clientName)}</p>` : ""}
    <h1>${esc(proposal.title)}</h1>
    <div class="by">${hasBrand ? `<span>By ${esc(brand)}</span>` : ""}${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
    </div>
    ${heroArt && safeArt(heroArt.url) ? `<figure class="hero-art"><img src="${esc(safeArt(heroArt.url))}" alt="${esc(heroArt.caption)}">${heroArt.caption ? `<figcaption>${esc(heroArt.caption)}</figcaption>` : ""}</figure>` : ""}
  </div>
  ${pageStyle.id === "studio" || pageStyle.id === "night" ? `<a class="scroll-cue" href="#${esc(sections[0]?.id ?? "accept")}" aria-label="Scroll to the proposal"><span></span></a>` : ""}
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
${revealScript}
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
var still=matchMedia("(prefers-reduced-motion: reduce)").matches;
function tween(el,to){var from=el.__v;el.__v=to;if(from==null||still||from===to){el.textContent=fmt(to);return}if(el.__raf)cancelAnimationFrame(el.__raf);var t0=performance.now(),d=420;function step(now){var k=Math.min(1,(now-t0)/d);k=1-Math.pow(1-k,3);el.textContent=fmt(Math.round(from+(to-from)*k));if(k<1)el.__raf=requestAnimationFrame(step);else el.__raf=0}el.__raf=requestAnimationFrame(step)}
var sel={};
function clamp(n,a,b){n=Math.floor(isFinite(n)?n:0);if(a!=null&&n<a)n=a;if(b!=null&&n>b)n=b;if(n>100000)n=100000;return n<0?0:n}
function qty(it,c){var range=it.minQuantity!=null||it.maxQuantity!=null;if(!range)return it.quantity;var raw=c.quantity!=null?c.quantity:it.quantity;if(raw===0&&it.quantity===0)return 0;return clamp(raw,it.minQuantity,it.maxQuantity)}
function per(it){var b=it.billing||"once";var u=it.unit?" per "+it.unit:"";return b==="once"?u:u+" per "+b}
function compute(){var sub=0,tax=0,rec={};items.forEach(function(it){var c=sel[it.id]||{};var on=it.optional?(c.selected!=null?c.selected:it.selectedByDefault):true;var range=it.minQuantity!=null||it.maxQuantity!=null;var q=qty(it,c);var ls=on?it.unitAmount*q:0;var t=Math.round(ls*it.taxRateBps/10000);var b=it.billing||"once";if(b==="once"){sub+=ls;tax+=t}else{rec[b]=(rec[b]||0)+ls+t}var row=document.querySelector('[data-line="'+it.id+'"]');if(row){row.classList.toggle("off",!on);var a=row.querySelector("[data-amt]");if(a)a.textContent=(q===0&&range)?"":fmt(ls);var u=row.querySelector("[data-unit]");if(u)u.textContent=fmt(it.unitAmount)+per(it);var sp=row.querySelector("[data-sep]");if(sp)sp.textContent=q===0?"at":"\u00d7"}});
var s=document.querySelector("[data-sub]"),x=document.querySelector("[data-tax]"),g=document.querySelector("[data-total]"),b=document.querySelector("[data-bartotal]");if(s)tween(s,sub);if(x)tween(x,tax);if(g)tween(g,sub+tax);
var once=items.some(function(it){return (it.billing||"once")==="once"});Object.keys(rec).forEach(function(p){var el=document.querySelector('[data-rec="'+p+'"]');if(el)tween(el,rec[p]);var rw=document.querySelector('[data-recrow="'+p+'"]');if(rw)rw.hidden=once&&rec[p]===0});
if(b){if(once){tween(b,sub+tax)}else{var first=["month","quarter","year"].filter(function(p){return rec[p]!=null})[0];tween(b,first?rec[first]:0)}}}
if(demo){window.qsSetCurrency=function(c){cur=c;compute()}}
document.querySelectorAll("[data-item]").forEach(function(el){el.addEventListener("change",function(){sel[el.dataset.item]=sel[el.dataset.item]||{};sel[el.dataset.item].selected=el.checked;compute()})});
document.querySelectorAll("[data-qty]").forEach(function(el){el.addEventListener("input",function(){sel[el.dataset.qty]=sel[el.dataset.qty]||{};if(el.value===""){delete sel[el.dataset.qty].quantity}else{sel[el.dataset.qty].quantity=Number(el.value)}compute()});el.addEventListener("change",function(){var it=items.filter(function(i){return i.id===el.dataset.qty})[0];if(!it)return;var v=el.value===""?it.quantity:clamp(Number(el.value),it.minQuantity,it.maxQuantity);el.value=String(v);sel[el.dataset.qty]=sel[el.dataset.qty]||{};sel[el.dataset.qty].quantity=v;compute()})});
var sn=document.getElementById("signerName")||document.getElementById("demoName"),sp=document.getElementById("sigPreview"),sv=document.getElementById("sigName");if(sn&&sp&&sv){var upd=function(){var v=sn.value.trim();sv.textContent=v;sp.classList.toggle("has",v.length>1)};sn.addEventListener("input",upd);upd()}
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
    thumb: Boolean(o.thumb),
    ribbon: o.thumb ? { hidden: true } : { href: `${o.appUrl}/app/templates`, label: "← Back to templates", note: `Template preview: ${o.template.name}. Every word, color and price is yours to change.` },
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

export function renderSimplePage(title: string, message: string, nonce = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/brand/site.webmanifest"><meta name="theme-color" content="#2b3f8c"><title>${esc(title)}</title><style nonce="${nonce}">${CSS}</style></head>
<body><div class="wrap"><article class="pad"><h1>${esc(title)}</h1><p>${esc(message)}</p></article><footer class="made">Quote and Sign</footer></div></body></html>`;
}

export function renderUnlockPage(o: { publicId: string; brandName: string | null; brandColor?: string | null; wrong: boolean; nonce?: string }): string {
  const color = accent(o.brandColor);
  const nonce = o.nonce ?? "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/brand/site.webmanifest"><meta name="theme-color" content="#2b3f8c"><title>Enter password</title><style nonce="${nonce}">${CSS}:root{--accent:${color};--accent-fg:${readableOn(color)}}.unlock{min-height:100dvh;display:grid;place-items:center;padding:24px}.unlock article{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius-card);padding:28px 28px 24px}.unlock .brand{margin-bottom:22px;font-size:14px}</style></head>
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
