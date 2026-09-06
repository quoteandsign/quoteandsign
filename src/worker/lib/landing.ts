// The homepage. Server-rendered for search engines. The hero is the product itself: a live
// proposal inside a phone, built from the same code the client page uses, so it cannot go stale.

import { esc } from "./render";
import { CSS as PAGE_CSS, pricingHtml, pricingScript, type ClientItem } from "./page";
import { computeTotals, formatMoney } from "../../shared/pricing";

const DEMO_CURRENCY = "USD";
const DEMO_ITEMS = [
  { id: "d1", position: 0, name: "Design and build", description: "Five pages, launched on your domain", unitAmount: 450000, quantity: 1, minQuantity: null, maxQuantity: null, optional: false, selectedByDefault: true, taxRateBps: null },
  { id: "d2", position: 1, name: "Copywriting", description: "Every page written and edited", unitAmount: 120000, quantity: 1, minQuantity: null, maxQuantity: null, optional: true, selectedByDefault: true, taxRateBps: null },
  { id: "d3", position: 2, name: "Extra pages", description: "Per additional page", unitAmount: 60000, quantity: 2, minQuantity: 0, maxQuantity: 10, optional: true, selectedByDefault: false, taxRateBps: null },
];

const LANDING_CSS = `
html,body{overflow-x:hidden}
nav.main .brand,footer.site-foot .foot-brand{color:var(--accent)}
.brand .and,.foot-brand .and{font-weight:300}
.site{max-width:1160px;margin:0 auto;padding:0 24px}
nav.main{display:flex;align-items:center;justify-content:space-between;height:76px}
nav.main .links{display:flex;gap:28px;align-items:center;font-size:15px}
nav.main .links a{color:var(--fg);text-decoration:none}
nav.main .links a.cta{background:var(--fg);color:var(--bg);padding:10px 18px;border-radius:999px;font-weight:600}
.brand.home{text-decoration:none;color:var(--accent);font-size:17px}
@media(max-width:600px){nav.main .links a.sm-hide{display:none}nav.main .links{gap:16px}}

.hero{display:grid;gap:40px;padding:24px 0 56px;align-items:center;overflow:visible}
@media(min-width:980px){.hero{grid-template-columns:1.1fr .9fr;gap:48px;padding:40px 0 80px}}
.hero h1{font-size:clamp(42px,6.4vw,74px);line-height:1;letter-spacing:-.045em;font-weight:650;margin:0;max-width:12ch;text-wrap:balance}
.hero h1 .u{position:relative;display:inline-block;white-space:nowrap;color:var(--accent)}
.hero h1 .u svg{position:absolute;left:0;bottom:-.14em;width:100%;height:.22em;overflow:visible}
.hero h1 .u path{stroke:currentColor;stroke-width:3.5;fill:none;stroke-linecap:round;stroke-dasharray:340;stroke-dashoffset:340}
.hero .lede{font-size:19px;line-height:1.55;color:var(--muted);max-width:40ch;margin:28px 0 36px}
.ctas{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.ctas .primary{display:inline-flex;align-items:center;height:52px;padding:0 24px;border-radius:999px;background:var(--accent);color:#fff;font-weight:600;text-decoration:none;font-size:16px;transition:transform .2s cubic-bezier(.32,.72,0,1)}
.ctas .primary:active{transform:scale(.98)}
.ctas .secondary{display:inline-flex;align-items:center;height:52px;padding:0 4px;color:var(--fg);font-weight:500;text-decoration:none;font-size:16px;border-bottom:1.5px solid var(--line)}
.ctas .secondary:hover{border-color:var(--fg)}
.hero .fine{margin:22px 0 0;font-size:14px;color:var(--muted)}.hero .fine a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}.hero .fine a:hover{color:var(--fg)}

.stage{position:relative;display:grid;place-items:center;perspective:1600px;padding:16px 0}
.stage .halo{position:absolute;inset:auto;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 14%,transparent),transparent 62%);filter:blur(10px);z-index:0}
.phone{position:relative;z-index:1;width:min(392px,100%);background:#141311;border-radius:46px;padding:12px;box-shadow:0 2px 3px rgba(25,24,22,.12),0 60px 100px -40px rgba(25,24,22,.55),inset 0 0 0 1px rgba(255,255,255,.08);transform:rotateY(-10deg) rotateX(5deg);transform-style:preserve-3d;transition:transform .9s cubic-bezier(.32,.72,0,1)}
.phone.flat{transform:none}
.screen{background:var(--card);border-radius:36px;overflow:hidden;height:min(720px,72svh);min-height:560px;display:flex;flex-direction:column}
.statusbar{display:flex;justify-content:space-between;align-items:center;padding:14px 26px 6px;font-size:13px;font-weight:600;color:var(--fg)}
.statusbar .notch{width:110px;height:26px;border-radius:999px;background:#141311;margin:-4px auto 0}
.scroll{overflow-y:auto;padding:8px 18px 18px;scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}
.phone article{padding:0}
.phone h1{font-size:24px;letter-spacing:-.03em;margin:.4em 0 .4em;line-height:1.1}
.phone .brand{font-size:13px;margin-bottom:6px}
.phone .pricing{margin:.9em 0}
.phone .accept{padding:16px;margin:1em 0 0}
.phone .accept h2{font-size:17px}
.phone .accept p.lead{font-size:13.5px;margin-bottom:6px}
.phone .consent{font-size:12px;margin:12px 0}
.phone .btn{padding:12px 18px;font-size:15px}
.phone .line{padding:12px 14px}
.phone .totals{padding:10px 14px 14px}
.phone .totals .grand{font-size:17px}
.phone .switch{width:36px;height:22px}.phone .switch::after{width:16px;height:16px}.phone .switch:checked::after{transform:translateX(14px)}
.lede-sm{font-size:14px;color:var(--muted);margin:0 0 .5em}
.done{margin-top:14px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--accent) 10%,transparent);font-size:13.5px}
.done b{display:block}
.try{position:absolute;right:-8px;top:8px;transform:rotate(3deg);background:var(--fg);color:var(--bg);font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;z-index:2}
@media(max-width:979px){.stage{order:2;overflow:hidden;margin:0 -20px;padding:16px 20px}.try{right:8px}.phone{transform:none;transition:none}.stage .halo{width:100%;max-width:520px}
/* On a phone the mock is a picture, not a second page: it does not scroll or catch taps. */
.screen{height:auto;min-height:0;aspect-ratio:9/19}.scroll{overflow:hidden;pointer-events:none;touch-action:pan-y}}
.cur{position:relative;z-index:1;display:flex;gap:6px;align-items:center;margin-top:18px;font-size:13px;color:var(--muted)}
.cur span{margin-right:4px}
.cur button{font:inherit;font-size:13px;font-weight:600;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;transition:background-color .15s,border-color .15s}
.cur button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}

section.band{padding:88px 0;border-top:1px solid var(--line)}
section.band h2{font-size:clamp(30px,3.6vw,42px);letter-spacing:-.035em;line-height:1.05;margin:0 0 14px;font-weight:650;max-width:20ch;text-wrap:balance}
section.band .sub{color:var(--muted);font-size:18px;max-width:50ch;margin:0;line-height:1.55}

.how{display:grid;gap:36px;margin-top:48px;align-items:center}
@media(min-width:960px){.how{grid-template-columns:1.25fr .75fr;gap:56px}}
.frames{position:relative;aspect-ratio:1440/900;border-radius:18px;overflow:hidden;background:#141311;box-shadow:0 2px 3px rgba(25,24,22,.08),0 50px 90px -40px rgba(25,24,22,.5);border:1px solid rgba(25,24,22,.12)}
.frames img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;opacity:0;transition:opacity .7s cubic-bezier(.32,.72,0,1)}
.frames img.on{opacity:1}
.frames .bar{position:absolute;left:0;bottom:0;height:3px;background:var(--accent);width:0;transition:width 2.8s linear}
.frames.run .bar{width:100%}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.steps li{padding:16px 18px;border-radius:14px;cursor:pointer;transition:background-color .25s;border:1px solid transparent}
.steps li[aria-current="true"]{background:var(--card);border-color:var(--line)}
.steps .n{font-size:13px;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}
.steps h3{margin:4px 0 4px;font-size:20px;letter-spacing:-.02em}
.steps p{margin:0;color:var(--muted);font-size:15.5px;line-height:1.5}
@media(prefers-reduced-motion:reduce){.frames img{transition:none}.frames .bar{display:none}}

.ink{background:#191816;color:#fbfaf7;padding:96px 0;margin:0 calc(50% - 50vw);padding-inline:calc(50vw - 50%)}
.ink > .site{padding:0}
.ink h2{color:#fbfaf7}
.ink .sub{color:#b8b3aa}
.ink .grid{display:grid;gap:40px;margin-top:48px;align-items:center}
@media(min-width:900px){.ink .grid{grid-template-columns:1fr 1fr;gap:72px}}
.receipt{background:#fbfaf7;color:#191816;border-radius:10px;padding:28px 28px 24px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);max-width:460px;font-size:14px;transform:rotate(-1.2deg)}
.receipt .top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:12px}
.receipt .top b{font-size:17px;letter-spacing:-.02em}
.receipt dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 18px}
.receipt dt{color:var(--muted)}
.receipt dd{margin:0;font-variant-numeric:tabular-nums}
.receipt code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all}
.receipt .sig{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-family:"Geist";font-style:italic;font-size:22px;letter-spacing:-.02em;color:var(--accent)}
.flow{list-style:none;margin:0 0 36px;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;position:relative}
.flow li{position:relative;padding-top:18px;font-size:14px;color:#8f8a80;opacity:.45;transition:opacity .5s,color .5s}
.flow li::before{content:"";position:absolute;left:0;top:0;height:2px;width:100%;background:rgba(255,255,255,.14)}
.flow li::after{content:"";position:absolute;left:0;top:0;height:2px;width:0;background:var(--accent);transition:width .8s cubic-bezier(.32,.72,0,1)}
.flow li b{display:block;color:#fbfaf7;font-size:15px;margin-bottom:2px}
.flow li time{font-variant-numeric:tabular-nums}
.play .flow li{opacity:1}
.play .flow li::after{width:100%}
.play .flow li:nth-child(1)::after{transition-delay:.1s}.play .flow li:nth-child(2)::after{transition-delay:1s}.play .flow li:nth-child(3)::after{transition-delay:1.9s}.play .flow li:nth-child(4)::after{transition-delay:2.8s}
.play .flow li:nth-child(2){transition-delay:1s}.play .flow li:nth-child(3){transition-delay:1.9s}.play .flow li:nth-child(4){transition-delay:2.8s}
.receipt{opacity:0;transform:rotate(-1.2deg) scale(1.06) translateY(8px);transition:opacity .6s cubic-bezier(.32,.72,0,1) 3.2s,transform .6s cubic-bezier(.32,.72,0,1) 3.2s}
.play .receipt{opacity:1;transform:rotate(-1.2deg) scale(1) translateY(0)}
@media(max-width:700px){.flow{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.flow li,.flow li::after,.receipt{transition:none}.flow li{opacity:1}.flow li::after{width:100%}.receipt{opacity:1;transform:rotate(-1.2deg)}}
.ink ul.points{margin:0;padding:0;list-style:none;display:grid;gap:18px}
.ink ul.points li{padding-left:22px;position:relative;font-size:17px;line-height:1.5;color:#e7e2d9}
.ink ul.points li::before{content:"";position:absolute;left:0;top:.62em;width:10px;height:10px;border-radius:50%;background:var(--accent)}

.interval{display:inline-grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:28px;padding:3px;border-radius:999px;background:var(--soft)}
.interval button{font:inherit;font-size:13.5px;font-weight:600;padding:8px 16px;border:0;border-radius:999px;background:transparent;color:var(--muted);cursor:pointer;display:flex;gap:8px;align-items:center}
.interval button[aria-checked="true"]{background:var(--card);color:var(--fg);box-shadow:0 1px 2px rgba(25,24,22,.12)}
.interval button span{font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.plans{display:grid;gap:16px;margin-top:24px;align-items:stretch}
@media(min-width:760px){.plans{grid-template-columns:repeat(3,1fr);gap:20px}}
.plan{position:relative;display:flex;flex-direction:column;padding:28px 26px 26px;border-radius:22px;background:var(--card);border:1px solid var(--line)}
.plan .name{font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center}
.plan .tag{font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.plan .price{font-size:52px;letter-spacing:-.045em;font-weight:650;margin:18px 0 4px;font-variant-numeric:tabular-nums;line-height:1}
.plan .price small{font-size:15px;letter-spacing:0;font-weight:500;color:var(--muted)}
.plan .for{color:var(--muted);font-size:14px;margin:0 0 20px}
.plan ul{list-style:none;padding:0;margin:0 0 26px;display:grid;gap:10px;font-size:15px;line-height:1.45;flex:1}
.plan li{padding-left:26px;position:relative}
.plan li::before{content:"";position:absolute;left:0;top:.35em;width:15px;height:15px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.plan li::after{content:"";position:absolute;left:5px;top:.55em;width:6px;height:3.5px;border-left:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg)}
.plan a{display:flex;justify-content:center;align-items:center;height:46px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px;color:var(--fg);border:1px solid var(--line);transition:transform .2s cubic-bezier(.32,.72,0,1),background-color .2s}
.plan a:hover{background:var(--soft)}.plan a:active{transform:scale(.98)}
.plan.hot{background:#191816;color:#fbfaf7;border-color:#191816;box-shadow:0 40px 80px -36px rgba(25,24,22,.6)}
@media(min-width:760px){.plan.hot{transform:translateY(-14px)}}
.plan.hot .price small,.plan.hot .for{color:#b8b3aa}
.plan.hot .tag{background:var(--accent);color:#fff}
.plan.hot li::before{background:rgba(255,255,255,.12)}.plan.hot li::after{border-color:#9fb0ff}
.plan.hot a{background:var(--accent);color:#fff;border-color:var(--accent)}.plan.hot a:hover{background:#3a52b0}
.compare{margin-top:40px;border:1px solid var(--line);border-radius:22px;background:var(--card);overflow:hidden}
.compare table{width:100%;border-collapse:collapse;font-size:15px}
.compare th,.compare td{text-align:left;padding:14px 18px;border-bottom:1px solid var(--line);vertical-align:top}
.compare tr:last-child td{border-bottom:0}
.compare th{font-weight:600;color:var(--muted);font-size:13px;background:var(--soft)}
.compare th.us,.compare td.us{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.compare td.us{color:var(--accent);font-weight:600}
.compare .wrap-x{overflow-x:auto}
.foot-note{margin:12px 0 0;font-size:12.5px;color:var(--muted)}

.trust{display:grid;gap:26px 48px;margin-top:44px}
@media(min-width:760px){.trust{grid-template-columns:1fr 1fr}}
.trust div{padding-top:16px;border-top:1px solid var(--line)}
.trust b{display:block;font-size:17px;letter-spacing:-.01em;margin-bottom:4px}
.trust p{margin:0;color:var(--muted);font-size:15.5px;line-height:1.55}

footer.site-foot{padding:44px 0 56px;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr auto auto;gap:18px 44px;align-items:center;font-size:14px;color:var(--muted)}
footer.site-foot .foot-brand{display:inline-flex;align-items:center;gap:8px;font-weight:600;color:var(--fg)}
footer.site-foot .foot-brand i{width:10px;height:10px;border-radius:50%;background:var(--accent)}
footer.site-foot nav{display:flex;flex-wrap:wrap;gap:8px 20px}
footer.site-foot a{color:inherit;text-decoration:none}
footer.site-foot a:hover{color:var(--fg)}
footer.site-foot .foot-licence{grid-column:1/-1;margin:0;font-size:13px}
@media(max-width:700px){footer.site-foot{grid-template-columns:1fr;gap:16px;padding:36px 0 44px}footer.site-foot nav{gap:8px 18px}}

/* One load sequence. Everything else on the page is still. */
.rise{opacity:0;transform:translateY(14px)}
.ready .rise{animation:rise .9s cubic-bezier(.32,.72,0,1) forwards}
.ready .rise.d1{animation-delay:.08s}.ready .rise.d2{animation-delay:.18s}.ready .rise.d3{animation-delay:.28s}
.ready .hero h1 .u path{animation:draw 1s cubic-bezier(.32,.72,0,1) .7s forwards}
@keyframes rise{to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.rise{opacity:1;transform:none;animation:none!important}.hero h1 .u path{stroke-dashoffset:0;animation:none!important}.phone{transform:none;transition:none}}
`;

export function renderLanding(o: { nonce: string; appUrl: string; githubUrl: string }): string {
  const totals = computeTotals(DEMO_ITEMS);
  const clientItems: ClientItem[] = DEMO_ITEMS.map(({ id, position, unitAmount, quantity, minQuantity, maxQuantity, optional, selectedByDefault, taxRateBps }) => ({ id, position, unitAmount, quantity, minQuantity, maxQuantity, optional, selectedByDefault, taxRateBps: taxRateBps ?? 0 }));
  const title = "Quote and Sign: open-source proposal software clients accept on their phone";
  const description = "Write a proposal once, send a link, and get a signed copy the moment your client accepts. Live pricing your client can toggle, one-tap accept, flat pricing, open source.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Quote and Sign",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description,
    url: o.appUrl,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: [
      { "@type": "Offer", price: "0", priceCurrency: "USD", name: "Free" },
      { "@type": "Offer", price: "19", priceCurrency: "USD", name: "Pro, billed yearly" },
      { "@type": "Offer", price: "24", priceCurrency: "USD", name: "Pro, billed monthly" },
      { "@type": "Offer", price: "59", priceCurrency: "USD", name: "Business, billed yearly" },
      { "@type": "Offer", price: "69", priceCurrency: "USD", name: "Business, billed monthly" },
    ],
  };
  const sampleHash = "9f2c7a1e4b0d6c8a3e5f1b7d2c9a4e6f8b0d3c5a7e9f1b2d4c6a8e0f3b5d7c9a";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#fbfaf7">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(o.appUrl)}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(o.appUrl)}/">
<meta property="og:image" content="${esc(o.appUrl)}/brand/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<link rel="icon" href="/brand/mark.svg" type="image/svg+xml">
<link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/brand/site.webmanifest">
<meta name="theme-color" content="#2b3f8c">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json" nonce="${o.nonce}">${JSON.stringify(jsonLd)}</script>
<style nonce="${o.nonce}">${PAGE_CSS}${LANDING_CSS}</style>
</head>
<body>
<div class="site">
<nav class="main" aria-label="Main">
  <a href="/" class="brand home"><span class="dot" aria-hidden="true"></span><span>Quote <span class="and">and</span> Sign</span></a>
  <div class="links">
    <a href="#plans" class="sm-hide">Pricing</a>
    <a href="${esc(o.githubUrl)}" rel="noopener" class="sm-hide">GitHub</a>
    <a href="/login">Sign in</a>
    <a href="/login" class="cta">Start free</a>
  </div>
</nav>

<section class="hero">
  <div>
    <h1 class="rise">Proposals your clients accept <span class="u">on their phone.<svg viewBox="0 0 340 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 13 C 70 4, 130 17, 200 9 S 300 3, 337 11"/></svg></span></h1>
    <p class="lede rise d1">Send a link instead of a PDF. Your client toggles the options, watches the total change, types their name, and taps Accept. You get the signed copy in your inbox.</p>
    <div class="ctas rise d2">
      <a class="primary" href="/login">Start free</a>
      <a class="secondary" href="#record">See what your client gets</a>
    </div>
    <p class="fine rise d3">Fourteen days of Pro, then free for three live proposals. No card needed. <a href="${esc(o.githubUrl)}" rel="noopener">Open source</a>.</p>
  </div>

  <div class="stage rise d1">
    <div class="halo" aria-hidden="true"></div>
    <div class="phone" id="phone">
      <span class="try">Try it</span>
      <div class="screen">
        <div class="statusbar"><span>9:41</span><span class="notch" aria-hidden="true"></span><span>100%</span></div>
        <div class="scroll">
          <form id="acceptForm" action="#" method="post">
          <article>
            <div class="brand"><span class="dot" aria-hidden="true"></span><span>Northwind Studio</span></div>
            <h1>Website redesign for Bramble &amp; Co</h1>
            <p class="lede-sm">A fast, mobile-first site that turns visitors into enquiries. Live in six weeks.</p>
            ${pricingHtml(DEMO_ITEMS, DEMO_CURRENCY, false)}
            <section class="accept" id="accept">
              <h2>Accept this proposal</h2>
              <p class="lead">Type your name to sign.</p>
              <label class="f" for="demoName">Full name</label>
              <input class="t" id="demoName" name="signerName" required minlength="2" placeholder="Alex Morgan" autocomplete="off">
              <label class="consent"><input type="checkbox" name="consent" required><span>I have read this proposal and agree to it. Typing my name and clicking Accept is my electronic signature.</span></label>
              <button class="btn" type="submit" id="acceptBtn">Accept proposal</button>
              <p class="err" id="acceptErr" role="alert"></p>
              <div class="done" id="demoDone" hidden><b>Accepted.</b> Both sides get a signed copy with a timestamp and a content hash. Nothing was sent: this is a demo.</div>
            </section>
          </article>
          </form>
        </div>
      </div>
    </div>
    <div class="cur" role="group" aria-label="Show prices in">
      <span>Show in</span>
      <button type="button" data-cur="USD" aria-pressed="true">USD</button>
      <button type="button" data-cur="CAD" aria-pressed="false">CAD</button>
      <button type="button" data-cur="EUR" aria-pressed="false">EUR</button>
      <button type="button" data-cur="GBP" aria-pressed="false">GBP</button>
      <button type="button" data-cur="AUD" aria-pressed="false">AUD</button>
    </div>
  </div>
</section>

<section class="band" id="how">
  <h2>A proposal in minutes, not an afternoon.</h2>
  <p class="sub">Pick a template, set your prices, press Send. No PDF, no printing, no chasing.</p>
  <div class="how">
    <div class="frames" id="frames" aria-label="The app, step by step">
      <img src="/img/step-template.jpg" width="1440" height="900" alt="Choosing a template: Website project, Consulting project, Monthly retainer, Photography package, Software build" class="on" loading="lazy" decoding="async">
      <img src="/img/step-editor.jpg" width="1440" height="900" alt="The editor: the proposal as a page on the left, pricing lines with optional items on the right" loading="lazy" decoding="async">
      <img src="/img/step-send.jpg" width="1440" height="900" alt="The send dialog with the client link ready to copy" loading="lazy" decoding="async">
      <div class="bar" aria-hidden="true"></div>
    </div>
    <ol class="steps" id="steps">
      <li aria-current="true" data-i="0"><span class="n">Step 1</span><h3>Pick a template</h3><p>Six starting points written by people who send proposals for a living. Every word is editable.</p></li>
      <li aria-current="false" data-i="1"><span class="n">Step 2</span><h3>Set your prices</h3><p>Add lines, mark what is optional, and decide which quantities the client may change.</p></li>
      <li aria-current="false" data-i="2"><span class="n">Step 3</span><h3>Send the link</h3><p>Optionally with a password and an expiry date. You get an email the first time it is opened.</p></li>
    </ol>
  </div>
</section>

<section class="ink" id="record">
  <div class="site">
    <h2>What you both get the moment they accept.</h2>
    <p class="sub">Not a screenshot of a signature. A record that proves what was agreed, when, and by whom.</p>
    <ol class="flow" aria-label="What happens after you send">
      <li><b>Opened</b><time>Tue 10:02</time><br>You get an email.</li>
      <li><b>Options chosen</b><time>Tue 10:05</time><br>Copywriting kept, extra pages set to 0.</li>
      <li><b>Accepted</b><time>Tue 10:07</time><br>Alex types their name and taps Accept.</li>
      <li><b>Copies sent</b><time>Tue 10:07</time><br>Both inboxes, with the record below.</li>
    </ol>
    <div class="grid">
      <div class="receipt" aria-label="Example acceptance record">
        <div class="top"><b>Website redesign for Bramble &amp; Co</b><span>Accepted</span></div>
        <dl>
          <dt>Signed by</dt><dd>Alex Morgan</dd>
          <dt>When</dt><dd>4 September 2026, 14:07 UTC</dd>
          <dt>Total</dt><dd>${esc(formatMoney(totals.total, DEMO_CURRENCY))}</dd>
          <dt>Options</dt><dd>Copywriting included, extra pages 0</dd>
          <dt>Content hash</dt><dd><code>${sampleHash}</code></dd>
        </dl>
        <div class="sig">Alex Morgan</div>
      </div>
      <ul class="points">
        <li>The hash is a fingerprint of the exact proposal text and prices at the moment of acceptance. Change one word later and it no longer matches.</li>
        <li>Name, time, IP address and the consent sentence they agreed to are stored once and never edited.</li>
        <li>Both sides can download the record, and the accepted proposal stays online at the same link.</li>
        <li>Electronic signatures of this kind are recognised in Canada, the United States, the United Kingdom and the European Union.</li>
      </ul>
    </div>
  </div>
</section>

<section class="band" id="plans">
  <h2>Flat pricing. The total you see is the total you pay.</h2>
  <p class="sub">No per-user seats, no per-document fees. Monthly or yearly, cancel any time and take your data with you.</p>
  <div class="interval" role="radiogroup" aria-label="Billing"><button type="button" role="radio" aria-checked="true" data-interval="year">Yearly <span>2 months free</span></button><button type="button" role="radio" aria-checked="false" data-interval="month">Monthly</button></div>
  <div class="plans">
    <div class="plan"><div class="name">Free</div><div class="price">$0</div><p class="for">After a 14-day Pro trial</p><ul><li>3 live proposals at a time</li><li>Live pricing and one-tap accept</li><li>Signed copies by email, PDF attached</li><li>Six templates, the standard look</li><li>Export any time</li></ul><a href="/login">Start free</a></div>
    <div class="plan hot"><div class="name">Pro <span class="tag">Most chosen</span></div><div class="price">$<span data-price data-year="19" data-month="24">19</span><small>/month</small></div><p class="for"><span data-billed data-year="Billed $228 a year" data-month="Billed monthly">Billed $228 a year</span> · For freelancers and studios</p><ul><li>Unlimited proposals</li><li>Your logo, colour and six page styles</li><li>Passwords, expiry dates and reminders</li><li>An email the moment it is opened</li><li>PDF export and a payment link after signing</li><li>No Quote and Sign footer</li></ul><a href="/login">Start with Pro</a></div>
    <div class="plan"><div class="name">Business</div><div class="price">$<span data-price data-year="59" data-month="69">59</span><small>/month</small></div><p class="for"><span data-billed data-year="Billed $708 a year" data-month="Billed monthly">Billed $708 a year</span> · For small agencies</p><ul><li>Everything in Pro</li><li>Up to 10 team members, one brand</li><li>Shared templates</li><li>Countersign after the client</li><li>Priority support</li></ul><a href="/login">Start with Business</a></div>
  </div>
  <p class="foot-note">Prices in USD. Unlimited means what it says for a working business; the terms carry a fair-use line so nobody can script tens of thousands of proposals.</p>
</section>

<section class="band" id="compare">
  <h2>How it compares.</h2>
  <p class="sub">Most proposal tools charge per user and lock the document once it is sent. This one is priced flat, stays live for the client, and is yours to run.</p>
  <div class="compare"><div class="wrap-x">
    <table>
      <thead><tr><th></th><th class="us">Quote and Sign</th><th>Typical proposal software</th></tr></thead>
      <tbody>
        <tr><td>Pricing model</td><td class="us">Flat per month, from $0</td><td>Per user, per month. Qwilr: from $35 per user, annual billing<sup>1</sup></td></tr>
        <tr><td>Per-document fees</td><td class="us">None</td><td>Qwilr: $2.50 per document after the first 40 each month<sup>1</sup></td></tr>
        <tr><td>Client changes options</td><td class="us">Live, total updates</td><td>Usually fixed</td></tr>
        <tr><td>Currencies</td><td class="us">16, including CAD, USD, EUR and GBP</td><td>Often USD only</td></tr>
        <tr><td>Source code</td><td class="us">Open, AGPL</td><td>Closed</td></tr>
        <tr><td>Export everything</td><td class="us">Any time, JSON and PDF</td><td>Varies</td></tr>
      </tbody>
    </table>
  </div></div>
  <p class="foot-note"><sup>1</sup> From qwilr.com/pricing, September 2026.</p>
</section>

<section class="band" id="trust">
  <h2>Built to be trusted with a contract.</h2>
  <div class="trust">
    <div><b>Open source, AGPL</b><p>The code is public. Anyone can read every line and check that it does what this page says.</p></div>
    <div><b>Encrypted at rest and in transit</b><p>Every proposal, record and upload is encrypted where it is stored and on its way to you. Card details are handled by our payment provider and never touch our servers.</p></div>
    <div><b>No passwords to leak</b><p>You sign in with a one-time link. Proposal links can carry their own password and expiry.</p></div>
    <div><b>Leave any time</b><p>Export every proposal and record. Delete your account yourself, no email required.</p></div>
  </div>
</section>

<footer class="site-foot">
  <span class="foot-brand"><i aria-hidden="true"></i>Quote <span class="and">and</span> Sign</span>
  <nav aria-label="Product"><a href="/login">Sign in</a><a href="${esc(o.githubUrl)}" rel="noopener">GitHub</a><a href="/contact">Contact</a></nav>
  <nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/acceptable-use">Acceptable use</a><a href="/dpa">DPA</a></nav>
  <p class="foot-licence">Open-source software released under the AGPL-3.0 licence.</p>
</footer>
</div>
${pricingScript(o.nonce, clientItems, DEMO_CURRENCY, true)}
<script nonce="${o.nonce}">
(function(){var bs=[].slice.call(document.querySelectorAll("[data-interval]"));if(!bs.length)return;bs.forEach(function(b){b.addEventListener("click",function(){var i=b.dataset.interval;bs.forEach(function(x){x.setAttribute("aria-checked",String(x===b))});document.querySelectorAll("[data-price]").forEach(function(p){p.textContent=p.dataset[i]});document.querySelectorAll("[data-billed]").forEach(function(p){p.textContent=p.dataset[i]})})})})();
</script>
<script nonce="${o.nonce}">
(function(){
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
requestAnimationFrame(function(){document.body.classList.add("ready")});
var phone=document.getElementById("phone");if(!phone)return;
// Straighten as the pointer approaches, tilt back when it leaves.
var stage=phone.parentElement;
if(!reduce&&matchMedia("(hover:hover)").matches)stage.addEventListener("pointermove",function(e){var r=stage.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;phone.style.transform="rotateY("+(x*10)+"deg) rotateX("+(-y*8)+"deg)"});
stage.addEventListener("pointerleave",function(){phone.style.transform=""});
// One guided moment: switch an option off and back on so the total visibly changes.
document.querySelectorAll(".cur button").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".cur button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});if(window.qsSetCurrency)window.qsSetCurrency(b.dataset.cur)})});
var frames=document.getElementById("frames"),steps=document.getElementById("steps");
if(frames&&steps){var imgs=frames.querySelectorAll("img"),lis=steps.querySelectorAll("li"),cur=0,timer=null;
function show(i){cur=i;imgs.forEach(function(im,k){im.classList.toggle("on",k===i)});lis.forEach(function(li,k){li.setAttribute("aria-current",String(k===i))});frames.classList.remove("run");void frames.offsetWidth;frames.classList.add("run")}
function start(){if(timer)return;timer=setInterval(function(){show((cur+1)%imgs.length)},2800);frames.classList.add("run")}
function stop(){clearInterval(timer);timer=null;frames.classList.remove("run")}
lis.forEach(function(li){li.addEventListener("click",function(){stop();show(Number(li.dataset.i))})});
new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?start():stop()})},{threshold:.35}).observe(frames)}
var rec=document.getElementById("record");
if(rec){new IntersectionObserver(function(es,o){es.forEach(function(e){if(e.isIntersecting){rec.classList.add("play");o.disconnect()}})},{threshold:.3}).observe(rec)}
var sw=phone.querySelector('[data-item="d2"]');
if(sw&&!reduce){setTimeout(function(){sw.checked=false;sw.dispatchEvent(new Event("change"))},1800);setTimeout(function(){sw.checked=true;sw.dispatchEvent(new Event("change"))},3200)}
})();
</script>
</body>
</html>`;
}
