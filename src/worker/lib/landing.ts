import { consentMarkup, CONSENT_CSS } from "./analytics";
// The homepage. Server-rendered for search engines. The hero is the product itself: a live
// proposal inside a phone, built from the same code the client page uses, so it cannot go stale.

import { esc } from "./render";
import { CSS as PAGE_CSS, pricingHtml, pricingScript, type ClientItem } from "./page";
import { computeTotals, formatMoney } from "../../shared/pricing";
import { TEMPLATES } from "../../shared/templates";
import { TEMPLATE_PAGES } from "./templatesPage";

const DEMO_CURRENCY = "USD";
const DEMO_ITEMS = [
  { id: "d1", position: 0, name: "Design and build", description: "Five pages, launched on your domain", unitAmount: 450000, quantity: 1, minQuantity: null, maxQuantity: null, optional: false, selectedByDefault: true, taxRateBps: null },
  { id: "d2", position: 1, name: "Copywriting", description: "Every page written and edited", unitAmount: 120000, quantity: 1, minQuantity: null, maxQuantity: null, optional: true, selectedByDefault: true, taxRateBps: null },
  { id: "d3", position: 2, name: "Extra pages", description: "Per additional page", unitAmount: 60000, quantity: 2, minQuantity: 0, maxQuantity: 10, optional: true, selectedByDefault: false, taxRateBps: null },
];

const LANDING_CSS = `
/* Clip sideways overflow at the viewport only: overflow on body would make it a scroll container and break sticky. */
html{overflow-x:hidden}
${CONSENT_CSS}
nav.main .brand,footer.site-foot .foot-brand{color:var(--accent)}
.brand .and,.foot-brand .and{font-weight:300}
.site{max-width:1160px;margin:0 auto;padding:0 24px}
@media(min-width:1800px){.site{max-width:1320px}}
@media(min-width:2200px){.site{max-width:1480px}}
@media(min-width:2600px) and (min-height:1500px){.site{max-width:1760px}}
nav.main{display:flex;align-items:center;justify-content:space-between;height:76px}
nav.main .links{display:flex;gap:28px;align-items:center;font-size:15px}
nav.main .links a{color:var(--fg);text-decoration:none;display:inline-block;padding:10px 0}
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
.phone{position:relative;z-index:1;width:min(392px,100%);background:#141311;border-radius:46px;padding:12px;box-shadow:0 2px 3px rgba(25,24,22,.12),0 60px 100px -40px rgba(25,24,22,.55),inset 0 0 0 1px rgba(255,255,255,.08);transform:none;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.32,.72,0,1)}
.phone.flat{transform:none}
.screen{background:var(--card);border-radius:36px;overflow:hidden;height:min(720px,72svh);min-height:560px;display:flex;flex-direction:column}
.statusbar{display:flex;justify-content:space-between;align-items:center;padding:14px 26px 6px;font-size:13px;font-weight:600;color:var(--fg)}
.statusbar .notch{width:110px;height:26px;border-radius:999px;background:#141311;margin:-4px auto 0}
.scroll{overflow-y:auto;padding:8px 18px 18px;scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}
.phone article{padding:0}
.phone .doc-title{font-size:24px;font-weight:650;letter-spacing:-.03em;margin:.4em 0 .4em;line-height:1.1}
.phone .brand{font-size:13px;margin-bottom:6px}
.phone .pricing{margin:.9em 0}
.phone .accept{padding:16px;margin:1em 0 0}
.phone .accept h2{font-size:17px}
.phone .accept p.lead{font-size:13.5px;margin-bottom:6px}
.phone .consent{font-size:12px;margin:12px 0}
.phone .sig{display:grid;gap:5px;min-height:44px;margin:8px 0 2px;padding:0 2px}
.phone .sig-name{font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:30px;line-height:1.05;letter-spacing:-.01em;color:var(--fg);opacity:0;transform:translateY(6px);transition:opacity .4s ease-out,transform .55s cubic-bezier(.32,.72,0,1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.phone .sig-line{height:1px;background:color-mix(in srgb,var(--fg) 30%,transparent);transform:scaleX(0);transform-origin:0 50%;transition:transform .6s cubic-bezier(.32,.72,0,1)}
.phone .sig.has .sig-name{opacity:1;transform:none}.phone .sig.has .sig-line{transform:none}
.phone .btn{padding:12px 18px;font-size:15px}
.phone .line{padding:12px 14px}
.phone .totals{padding:10px 14px 14px}
.phone .totals .grand{font-size:17px}
.phone .switch{width:36px;height:22px}.phone .switch::after{width:16px;height:16px}.phone .switch:checked::after{transform:translateX(14px)}
.lede-sm{font-size:14px;color:var(--muted);margin:0 0 .5em}
.done{margin-top:14px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--accent) 10%,transparent);font-size:13.5px}
.done b{display:block}
.try{position:absolute;right:-10px;top:-12px;transform:rotate(3deg);background:var(--fg);color:var(--bg);font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;z-index:2}
@media(max-width:979px){.stage{order:2;overflow:hidden;margin:0 -20px;padding:16px 20px}.try{right:8px}.phone{transform:none;transition:none}.stage .halo{width:100%;max-width:520px}
/* On a phone the mock is a picture, not a second page: it does not scroll or catch taps. */
.screen{height:auto;min-height:0;aspect-ratio:9/19}.scroll{overflow:hidden;pointer-events:none;touch-action:pan-y}}
.cur{position:relative;z-index:1;display:flex;gap:6px;align-items:center;margin-top:18px;font-size:13px;color:var(--muted)}
.cur span{margin-right:4px}
.cur button{font:inherit;font-size:13px;font-weight:600;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;transition:background-color .15s,border-color .15s}
.cur button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}

section.band{padding:88px 0;border-top:1px solid var(--line)}
section.band h2{font-size:clamp(30px,3.6vw,42px);letter-spacing:-.035em;line-height:1.05;margin:0 0 14px;font-weight:650;max-width:20ch;text-wrap:balance}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ws .w{display:inline-block}
.ready .rv .ws .w{opacity:0;transform:translateY(.5em) rotate(1.5deg);filter:blur(4px);transition:opacity .5s cubic-bezier(.32,.72,0,1),transform .65s cubic-bezier(.32,.72,0,1),filter .45s ease-out;transition-delay:calc(var(--i,0) * 36ms)}
.ready .rv.in .ws .w{opacity:1;transform:none;filter:none}
.ws .w:nth-child(1){--i:0}.ws .w:nth-child(2){--i:1}.ws .w:nth-child(3){--i:2}.ws .w:nth-child(4){--i:3}.ws .w:nth-child(5){--i:4}.ws .w:nth-child(6){--i:5}.ws .w:nth-child(7){--i:6}.ws .w:nth-child(8){--i:7}.ws .w:nth-child(9){--i:8}.ws .w:nth-child(10){--i:9}.ws .w:nth-child(11){--i:10}.ws .w:nth-child(12){--i:11}.ws .w:nth-child(13){--i:12}.ws .w:nth-child(14){--i:13}.ws .w:nth-child(15){--i:14}.ws .w:nth-child(16){--i:15}.ws .w:nth-child(17){--i:16}.ws .w:nth-child(18){--i:17}.ws .w:nth-child(19){--i:18}.ws .w:nth-child(20){--i:19}.ws .w:nth-child(21){--i:20}.ws .w:nth-child(22){--i:21}.ws .w:nth-child(23){--i:22}.ws .w:nth-child(24){--i:23}
.ready .rise-kids > :not(h2){opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.32,.72,0,1),transform .8s cubic-bezier(.32,.72,0,1)}.ready .rise-kids.in > :not(h2){opacity:1;transform:none}
.ready .rv2{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.32,.72,0,1),transform .8s cubic-bezier(.32,.72,0,1)}
.ready .rv2.in{opacity:1;transform:none}
::selection{background:color-mix(in srgb,var(--accent) 20%,transparent)}
html{scrollbar-color:rgba(25,24,22,.28) transparent}
body{caret-color:var(--accent)}
@media(prefers-reduced-motion:reduce){.ready .rv .ws .w,.ready .rv2,.ready .rise-kids > :not(h2){opacity:1;transform:none;filter:none;transition:none}}
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

.ink{background:#191816;color:#fbfaf7;padding:96px 0;margin:0 calc(50% - 50vw);padding-inline:calc(50vw - 50%);overflow-x:clip;position:relative}
.ink::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(42% 55% at 10% 15%,color-mix(in srgb,var(--accent) 30%,transparent),transparent 70%),radial-gradient(30% 45% at 90% 85%,rgba(255,196,150,.12),transparent 70%)}
.ink > .site{position:relative;z-index:1}
.ink > .site{padding:0}
.ink h2{color:#fbfaf7}
.ink .sub{color:#b8b3aa}
.ink .grid{display:grid;gap:40px;margin-top:48px;align-items:start}
@media(min-width:900px){.ink .grid{grid-template-columns:minmax(0,520px) minmax(0,1fr);gap:72px}}
@media(min-width:1800px){.ink .grid{grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:80px}.state{width:min(560px,100%)}.receipt{max-width:560px}}
.receipt{background:#fbfaf7;color:#191816;border-radius:10px;padding:28px 28px 24px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);max-width:460px;font-size:14px;transform:rotate(-1.2deg)}
.receipt .top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:12px}
.receipt .top b{font-size:17px;letter-spacing:-.02em}
.receipt dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 18px}
.receipt dt{color:var(--muted)}
.receipt dd{margin:0;font-variant-numeric:tabular-nums}
.receipt code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all}
.receipt .sig{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-family:"Geist";font-style:italic;font-size:22px;letter-spacing:-.02em;color:var(--accent)}
.flow{list-style:none;margin:0 0 36px;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:12px;position:relative}
.flow li{position:relative;padding-top:18px;font-size:14px;color:#a8a399;opacity:.62;transition:opacity .5s,color .5s}
.flow li::before{content:"";position:absolute;left:0;top:0;height:2px;width:100%;background:rgba(255,255,255,.14)}
.flow li::after{content:"";position:absolute;left:0;top:0;height:2px;width:0;background:var(--accent);transition:width .8s cubic-bezier(.32,.72,0,1)}
.flow li b{display:block;color:#fbfaf7;font-size:15px;margin-bottom:2px}
.flow li time{font-variant-numeric:tabular-nums}
.play .flow li{opacity:1}
.play .flow li::after{width:100%}
.play .flow li:nth-child(1)::after{transition-delay:.1s}.play .flow li:nth-child(2)::after{transition-delay:1.75s}.play .flow li:nth-child(3)::after{transition-delay:3.5s}.play .flow li:nth-child(4)::after{transition-delay:5.25s}.play .flow li:nth-child(5)::after{transition-delay:7.2s}
.play .flow li:nth-child(2){transition-delay:1.75s}.play .flow li:nth-child(3){transition-delay:3.5s}.play .flow li:nth-child(4){transition-delay:5.25s}.play .flow li:nth-child(5){transition-delay:7.2s}
.flow li{cursor:pointer;border-radius:8px;outline-offset:6px}.flow li:hover{color:#d8d3c9}
.manual .flow li,.manual .flow li::after,.manual .state,.manual .receipt{transition-delay:0s!important;animation:none!important}
.manual .flow li{opacity:.62}.manual .flow li.on{opacity:1}.manual .flow li.on::after{width:100%}
.manual .state{opacity:0;transform:translateY(18px) scale(.98);filter:blur(6px);transition:opacity .45s cubic-bezier(.32,.72,0,1),transform .5s cubic-bezier(.32,.72,0,1),filter .4s}
.manual .state.show{opacity:1;transform:none;filter:none}
.manual .receipt{opacity:0;transition:opacity .4s}.manual .receipt.show{opacity:1;transform:rotate(-1.2deg) scale(1) translateY(0)}
.stack{position:relative;min-height:340px;display:grid;grid-template-columns:minmax(0,1fr);align-items:start}
.stack > *{grid-area:1/1;min-width:0;max-width:100%}
.state{align-self:start;justify-self:start;width:min(440px,100%);background:#fbfaf7;color:#191816;border-radius:18px;padding:22px 24px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);opacity:0;transform:translateY(18px) scale(.98);filter:blur(6px)}
.state .k{display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:600;color:var(--muted);text-transform:none;margin:0 0 10px}
.state .k i{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.state h4{margin:0 0 6px;font-size:19px;letter-spacing:-.02em;line-height:1.2}
.state p{margin:0;font-size:14px;color:var(--muted);line-height:1.5}
.state .rows{display:grid;gap:8px;margin-top:12px}
.state .row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;padding:10px 12px;border-radius:10px;background:var(--soft)}
.state .row b{font-weight:600}.state .row .sw{width:34px;height:20px;border-radius:999px;background:var(--accent);position:relative;flex:none}.state .row .sw::after{content:"";position:absolute;top:3px;right:3px;width:14px;height:14px;border-radius:50%;background:#fff}
.state .row .sw.off{background:var(--line)}.state .row .sw.off::after{right:auto;left:3px}
.state .tot{display:flex;justify-content:space-between;font-weight:650;font-size:16px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.state .signed{font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:40px;line-height:1;letter-spacing:-.01em;margin:8px 0 10px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.state .env{display:grid;gap:8px;margin-top:12px}.state .env div{display:flex;align-items:center;gap:10px;font-size:14px;padding:10px 12px;border-radius:10px;background:var(--soft)}
.state .env span{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);font-size:11px;font-weight:700}
@keyframes st-in{to{opacity:1;transform:none;filter:none}}
@keyframes st-out{to{opacity:0;transform:translateY(-16px) scale(1.02);filter:blur(6px)}}
.play .state.s1{animation:st-in .55s cubic-bezier(.32,.72,0,1) .1s forwards,st-out .45s cubic-bezier(.32,.72,0,1) 1.75s forwards}
.play .state.s2{animation:st-in .55s cubic-bezier(.32,.72,0,1) 1.8s forwards,st-out .45s cubic-bezier(.32,.72,0,1) 3.5s forwards}
.play .state.s3{animation:st-in .55s cubic-bezier(.32,.72,0,1) 3.55s forwards,st-out .45s cubic-bezier(.32,.72,0,1) 5.25s forwards}
.play .state.s4{animation:st-in .55s cubic-bezier(.32,.72,0,1) 5.3s forwards,st-out .45s cubic-bezier(.32,.72,0,1) 7s forwards}
.receipt{opacity:0;transform:rotate(-1.2deg) scale(1.06) translateY(8px);transition:opacity .6s cubic-bezier(.32,.72,0,1) 7.2s,transform .6s cubic-bezier(.32,.72,0,1) 7.2s}
@media(prefers-reduced-motion:reduce){.state{display:none}}
.play .receipt{opacity:1;transform:rotate(-1.2deg) scale(1) translateY(0)}
@media(max-width:1100px){.flow{grid-template-columns:repeat(3,1fr)}}
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
footer.site-foot a{color:inherit;text-decoration:none}footer.site-foot nav a{display:inline-block;padding:8px 0}
footer.site-foot a:hover{color:var(--fg)}
footer.site-foot .foot-licence{grid-column:1/-1;margin:0;font-size:13px}
@media(max-width:700px){footer.site-foot{grid-template-columns:1fr;gap:16px;padding:36px 0 44px}footer.site-foot nav{gap:8px 18px}}

/* ---- Showpiece layer ---------------------------------------------------------------------- */
.navwrap{position:sticky;top:12px;z-index:10;height:0;padding:0 14px;pointer-events:none}
nav.main{pointer-events:auto;height:58px;max-width:1080px;margin:0 auto;padding:0 8px 0 20px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid rgba(25,24,22,.08);box-shadow:0 1px 2px rgba(25,24,22,.04),0 18px 50px -24px rgba(25,24,22,.35);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4)}
nav.main .links{gap:4px}
nav.main .links a{padding:8px 12px;border-radius:999px;font-size:14.5px;font-weight:500;color:var(--muted);transition:color .2s cubic-bezier(.32,.72,0,1),background-color .25s cubic-bezier(.32,.72,0,1)}
nav.main .links a:hover{color:var(--fg);background:var(--soft)}
nav.main .links a.cta{color:var(--bg);background:var(--fg);padding:10px 18px;font-weight:600;margin-left:6px}
nav.main .links a.cta:hover{background:#000}
@media(max-width:600px){.navwrap{top:8px;padding:0 8px}nav.main{height:52px;padding:0 6px 0 16px}nav.main .links{gap:2px}}

.hero{position:relative;min-height:min(calc(100svh - 20px),940px);padding:118px 0 72px;isolation:isolate;overflow-x:clip;margin:0 calc(50% - 50vw);padding-inline:calc(50vw - 50%)}
.hero .mesh{position:absolute;top:-30%;bottom:-10%;left:-10%;right:-10%;z-index:-1;pointer-events:none;background:radial-gradient(38% 42% at 18% 22%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%),radial-gradient(30% 34% at 86% 14%,rgba(190,170,255,.42),transparent 70%),radial-gradient(34% 36% at 74% 78%,rgba(255,214,170,.5),transparent 70%),radial-gradient(28% 30% at 22% 86%,rgba(170,220,232,.55),transparent 70%);filter:blur(34px);animation:qs-drift 26s ease-in-out infinite alternate;mask-image:linear-gradient(to bottom,#000 70%,transparent)}
@keyframes qs-drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(2%,-2%,0) scale(1.05)}}
.hero h1{font-size:clamp(40px,4.9vw,62px);letter-spacing:-.035em;line-height:1.04;font-weight:640;max-width:14ch}
.hero .kicker{margin:0 0 18px;font-size:14px;font-weight:500;color:var(--muted)}
.hero .specs{list-style:none;margin:28px 0 0;padding:22px 0 0;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:14.5px;color:var(--fg)}
.hero .specs li{position:relative;padding-left:18px}
.hero .specs li::before{content:"";position:absolute;left:0;top:.55em;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.hero .mesh{display:none}
.stage .halo{display:none}
.moment.m1,.moment.m3{display:none}
.moment.m2{right:-22%;top:44%}
.hero .lede{font-size:20px;max-width:42ch;margin:30px 0 38px}
.ctas .primary{height:54px;padding:0 26px;font-size:16px;box-shadow:none}
.ctas .primary i{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16);font-style:normal;transition:transform .35s cubic-bezier(.32,.72,0,1),background-color .3s}
.ctas .primary:hover i{transform:translateX(3px);background:rgba(255,255,255,.26)}
.ctas .primary:hover{filter:brightness(1.05)}
.ctas .secondary{height:56px}
.stage{padding:24px 0 8px}
@supports(animation-timeline:scroll()){.hero .stage{animation:qs-stage linear both;animation-timeline:scroll(root);animation-range:0 70vh}}
@keyframes qs-stage{to{transform:translateY(-6%) scale(.96);opacity:.55}}
.moment{position:absolute;z-index:3;max-width:230px;display:grid;gap:3px;padding:12px 14px 12px 16px;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(25,24,22,.05),0 24px 50px -24px rgba(25,24,22,.45);border:1px solid rgba(25,24,22,.07);font-size:13px;color:var(--muted);min-width:180px;pointer-events:none}
.moment b{display:flex;align-items:center;gap:8px;color:var(--fg);font-size:14px;letter-spacing:-.01em}
.moment b i{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none}
.moment.m1{left:-16%;top:5%;animation:qs-float 7s ease-in-out infinite}
.moment.m2{right:-16%;top:38%;animation:qs-float 8s ease-in-out .8s infinite}
.moment.m3{left:-14%;bottom:9%;padding-top:10px;animation:qs-float 7.5s ease-in-out 1.6s infinite}
.moment .sign{font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:26px;line-height:1;letter-spacing:-.01em;color:var(--fg);margin:2px 0 4px}
.moment .amt{font-variant-numeric:tabular-nums;color:var(--fg);font-weight:600}
.moment .amt s{color:var(--muted);font-weight:400;margin-right:6px}
@keyframes qs-float{0%,100%{translate:0 0}50%{translate:0 -7px}}
.ready .moment{animation-name:rise,qs-float;animation-duration:.9s,7s;animation-timing-function:cubic-bezier(.32,.72,0,1),ease-in-out;animation-fill-mode:forwards,none;animation-iteration-count:1,infinite}
.ready .moment.m1{animation-delay:.9s,1.8s}.ready .moment.m2{animation-delay:1.25s,2.3s}.ready .moment.m3{animation-delay:1.6s,2.9s}
.moment{opacity:0;transform:translateY(14px)}
@media(max-width:979px){.moment{display:none}.hero{min-height:0;padding:96px 0 48px}}
@media(prefers-reduced-motion:reduce){.hero .mesh{animation:none}.moment{opacity:1;transform:none;animation:none!important}.hero .stage{animation:none}}

section.band{padding:120px 0}
section.band h2{font-size:clamp(34px,4.4vw,56px);letter-spacing:-.045em;line-height:.98;margin:0 0 18px;max-width:18ch}
section.band .sub{font-size:19px;max-width:48ch}
.ink{padding:120px 0}.ink h2{font-size:clamp(34px,4.4vw,56px);letter-spacing:-.045em;line-height:.98;margin:0 0 18px;max-width:18ch}
.receipt .sig{font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:30px;letter-spacing:-.01em;color:var(--fg)}

/* How it works: the picture stays put while the steps scroll past it. */
@media(min-width:960px){.how{align-items:start;gap:64px;grid-template-columns:1.4fr .6fr}.frames{position:sticky;top:100px}.steps{gap:0;padding:8vh 0 10vh}.steps li{min-height:40vh;display:flex;flex-direction:column;justify-content:center;padding:24px 0 24px 26px;border:0;background:transparent;position:relative;opacity:.32;transform:translateX(6px);transition:opacity .5s cubic-bezier(.32,.72,0,1),transform .6s cubic-bezier(.32,.72,0,1)}.steps li::before{content:"";position:absolute;left:0;top:50%;width:10px;height:10px;border-radius:50%;background:var(--accent);transform:translateY(-50%) scale(.4);opacity:0;transition:transform .5s cubic-bezier(.34,1.45,.64,1),opacity .3s}.steps li[aria-current="true"]{opacity:1;transform:none;background:transparent;border:0}.steps li[aria-current="true"]::before{opacity:1;transform:translateY(-50%) scale(1)}}
.steps h3{font-size:24px;letter-spacing:-.03em;margin:6px 0 8px}
.steps p{font-size:16.5px}
.frames{border-radius:22px;overflow:visible;background:transparent;box-shadow:none;border:0;isolation:isolate}
.frames img{border-radius:22px;border:1px solid rgba(25,24,22,.12);box-shadow:0 2px 3px rgba(25,24,22,.08),0 50px 90px -40px rgba(25,24,22,.5);transition:opacity .9s cubic-bezier(.32,.72,0,1),transform 1s cubic-bezier(.32,.72,0,1),filter .8s ease-out;will-change:transform,opacity}
.frames img[data-state=next]{opacity:.55;transform:translateY(34px) scale(.94);filter:blur(1.5px);z-index:1}
.frames img[data-state=next]+img[data-state=next]{transform:translateY(64px) scale(.9);opacity:.3;z-index:0}
.frames img.on{opacity:1;transform:none;filter:none;z-index:3}
.frames img[data-state=past]{opacity:0;transform:translateY(-40px) scale(1.04);filter:blur(8px);z-index:0}
.frames .bar{border-radius:0 0 22px 22px;z-index:4}
.frames .no{position:absolute;right:16px;top:14px;z-index:5;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--fg);background:rgba(255,255,255,.86);border:1px solid rgba(25,24,22,.08);border-radius:999px;padding:5px 10px;backdrop-filter:blur(8px)}
@media(prefers-reduced-motion:reduce){.frames img{transition:none}.frames img[data-state=next],.frames img[data-state=past]{filter:none}}

/* Seven templates, each a real page. */
.tpls{padding:120px 0 96px;border-top:1px solid var(--line)}
.tpls h2{font-size:clamp(34px,4.4vw,56px);letter-spacing:-.045em;line-height:.98;margin:0 0 18px;max-width:18ch;text-wrap:balance}
.tpls .sub{color:var(--muted);font-size:19px;max-width:48ch;margin:0;line-height:1.55}
.tpls .head{display:grid;justify-items:center;text-align:center;gap:8px}
.tpls .head h2{margin-inline:auto}.tpls .head .sub{margin-inline:auto}.tpls .head a{margin-top:10px}
.tpls .head a{color:var(--fg);font-weight:600;text-decoration:none;border-bottom:1.5px solid var(--line);padding-bottom:2px}
.tpls .head a:hover{border-color:var(--fg)}
.strip{display:flex;gap:22px;margin:40px calc(50% - 50vw) 0;padding:12px calc(50vw - 50% + 24px) 24px;scroll-padding-left:calc(50vw - 50% + 24px);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)}
.strip::-webkit-scrollbar{display:none}
.tcard{flex:none;width:min(clamp(340px,26vh,520px),78vw);scroll-snap-align:start;text-decoration:none;color:inherit;display:grid;gap:12px;transition:transform .5s cubic-bezier(.32,.72,0,1),opacity .7s cubic-bezier(.32,.72,0,1)}
.tcard:hover{transform:translateY(-8px) scale(1.05);z-index:2;position:relative}
.ready .tpls .tcard{opacity:0;transform:translateX(120px) rotate(2.5deg)}
.ready .tpls.in .tcard{opacity:1;transform:none;transition:opacity .8s cubic-bezier(.32,.72,0,1),transform 1s cubic-bezier(.32,.72,0,1)}
.ready .tpls.in .tcard:hover{transform:translateY(-6px);transition:transform .5s cubic-bezier(.32,.72,0,1)}
.ready .tpls.in .tcard:nth-child(1){transition-delay:0s}.ready .tpls.in .tcard:nth-child(2){transition-delay:0.09s}.ready .tpls.in .tcard:nth-child(3){transition-delay:0.18s}.ready .tpls.in .tcard:nth-child(4){transition-delay:0.27s}.ready .tpls.in .tcard:nth-child(5){transition-delay:0.36s}.ready .tpls.in .tcard:nth-child(6){transition-delay:0.45s}.ready .tpls.in .tcard:nth-child(7){transition-delay:0.54s}.ready .tpls.in .tcard:nth-child(8){transition-delay:0.63s}
.ready .tpls.in .tcard:hover{transition-delay:0s}
.tcard iframe{transition:transform 4.5s cubic-bezier(.45,.05,.3,1)}
.tcard:hover iframe{transform:scale(.25) translateY(var(--travel,-66.6%));transition-duration:var(--dur,4.5s)}
.tcard:not(:hover) iframe{transition:transform 1.2s cubic-bezier(.32,.72,0,1)}
@media(prefers-reduced-motion:reduce){.ready .tpls .tcard{opacity:1;transform:none}.tcard iframe,.tcard:hover iframe{transition:none;transform:scale(.25)}}
.tcard .thumb{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(25,24,22,.06),0 40px 80px -40px rgba(25,24,22,.45);border:1px solid rgba(25,24,22,.08)}
.tcard iframe{position:absolute;left:0;top:0;width:400%;height:1200%;transform:scale(.25);transform-origin:0 0;border:0;pointer-events:none}
.tcard .thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent 72%,rgba(25,24,22,.08))}
.tcard .thumb::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(260px circle at var(--mx,50%) var(--my,40%),rgba(255,255,255,.4),transparent 65%);mix-blend-mode:soft-light;opacity:0;transition:opacity .45s cubic-bezier(.32,.72,0,1)}
.tcard:hover .thumb::before{opacity:1}
.tcard b{font-size:17px;letter-spacing:-.015em}
.tcard span{display:block;color:var(--muted);font-size:14px;line-height:1.5}
.tcard .style{display:inline-block;margin-left:8px;font-size:11.5px;font-weight:600;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);padding:2px 8px;border-radius:999px;vertical-align:2px}

/* The close: one line, one signature, one button. */
.close{position:relative;padding:140px 0 150px;text-align:center;isolation:isolate;overflow:hidden;margin:0 calc(50% - 50vw);padding-inline:calc(50vw - 50%)}
.close .mesh{position:absolute;inset:-20% -10%;z-index:-1;pointer-events:none;background:radial-gradient(40% 40% at 30% 40%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 70%),radial-gradient(34% 34% at 74% 60%,rgba(255,214,170,.45),transparent 70%),radial-gradient(28% 28% at 60% 20%,rgba(190,170,255,.35),transparent 70%);filter:blur(40px)}
.close h2{font-size:clamp(38px,5.6vw,72px);letter-spacing:-.05em;line-height:.96;margin:0 auto 18px;max-width:14ch;text-wrap:balance}
.close .sub{color:var(--muted);font-size:19px;max-width:44ch;margin:0 auto}
.close .signature{display:inline-grid;justify-items:stretch;margin:44px auto 40px;max-width:80vw;position:relative}
.close .signature span{display:block;font-family:"Newsreader",Georgia,serif;font-style:italic;font-weight:500;font-size:clamp(38px,5vw,54px);letter-spacing:-.01em;color:var(--fg)}
.close .signature svg{width:100%;height:18px;overflow:visible}
.close .signature path{stroke:var(--accent);stroke-width:2.5;fill:none;stroke-linecap:round;stroke-dasharray:440;stroke-dashoffset:440}
.close.in .signature path{animation:draw 1.1s cubic-bezier(.32,.72,0,1) .3s forwards}
.close .ctas{justify-content:center}
@media(prefers-reduced-motion:reduce){.close .signature path{stroke-dashoffset:0;animation:none}}

/* ---- Scripted motion (html.gs): the CSS-native effects step aside and GSAP takes over. ---- */
html.gs .rise{opacity:1;transform:none;animation:none!important}
html.gs .moment{opacity:1;transform:none;animation:none!important}
html.gs .hero .stage{animation:none}
html.gs .ready .rv .ws .w,html.gs .ready .rv2,html.gs .ready .rise-kids > :not(h2),html.gs .ready .tpls .tcard{opacity:1;transform:none;filter:none;transition:none;transition-delay:0s}
html.gs .ws{display:inline-block;overflow:hidden;padding:0 .06em .12em 0;vertical-align:top}
html.gs .frames img,html.gs .steps li{transition:none}
html.gs #how.pinned{box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;padding:88px 0 150px}
html.gs #how.pinned .how{margin-top:32px}
html.gs #how.pinned .frames{position:relative;top:auto}
html.gs #how.pinned .frames .bar{display:none}
html.gs #how.pinned .steps{display:grid;padding:0;gap:0;min-height:220px;align-content:center}
html.gs #how.pinned .steps li{grid-area:1/1;min-height:0;padding:0 0 0 26px;opacity:1;transform:none}
html.gs #how.pinned .steps li::before{opacity:1;transform:translateY(-50%) scale(1)}
html.gs .tpls{position:relative;border-top:0}
html.gs .tpls.pinned{box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;padding:120px 0 150px;overflow:visible}
html.gs .tpls.pinned .strip{margin-inline:0;padding-inline:0;position:relative;z-index:1}
html.gs .tpls.pinned::before,html.gs .tpls.pinned::after{content:"";position:absolute;top:0;bottom:0;width:140px;z-index:2;pointer-events:none}
html.gs .tpls.pinned::before{left:calc(50% - 50vw);background:linear-gradient(90deg,var(--bg),transparent)}
html.gs .tpls.pinned::after{right:calc(50% - 50vw);background:linear-gradient(270deg,var(--bg),transparent)}
html.gs .tpls.pinned .strip{overflow:visible;mask-image:none;scroll-snap-type:none;padding-bottom:12px}
html.gs .tcard{transition:none}
html.gs .tcard .thumb{transition:transform .5s cubic-bezier(.32,.72,0,1)}
html.gs .tcard:hover .thumb{transform:translateY(-8px) scale(1.06)}
html.gs .tcard:hover{z-index:2;position:relative}
html.gs .close .signature path{animation:none}

html.lenis,html.lenis body{height:auto}
html.lenis{scroll-behavior:auto}
.lenis.lenis-smooth{scroll-behavior:auto!important}
.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}
.lenis.lenis-stopped{overflow:hidden}
.navwrap nav.main{transition:transform .5s cubic-bezier(.32,.72,0,1),opacity .35s}
.navwrap.hide nav.main{transform:translateY(-130%);opacity:0;pointer-events:none}
html.gs .plan .price{font-variant-numeric:tabular-nums}

/* One load sequence. Everything else on the page is still. */
.rise{opacity:0;transform:translateY(14px)}
.ready .rise{animation:rise .9s cubic-bezier(.32,.72,0,1) forwards}
.ready .rise.d1{animation-delay:.08s}.ready .rise.d2{animation-delay:.18s}.ready .rise.d3{animation-delay:.28s}
.ready .hero h1 .u path{animation:draw 1s cubic-bezier(.32,.72,0,1) .7s forwards}
@keyframes rise{to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.rise{opacity:1;transform:none;animation:none!important}.hero h1 .u path{stroke-dashoffset:0;animation:none!important}.phone{transform:none;transition:none}}

/* ---- Mobile layer: phones and small tablets. Everything above 979px is untouched. ---------- */
.tpls .sub .m,.compare-m{display:none}
@media(max-width:979px){
.site{padding:0 20px}
.hero{padding:84px calc(50vw - 50%) 20px;gap:26px;min-height:0}
.hero h1{font-size:clamp(40px,11.4vw,54px);max-width:none}
.hero .lede{font-size:17px;line-height:1.5;margin:18px 0 24px;max-width:none}
.ctas{flex-direction:column;align-items:stretch;gap:6px}
.ctas .primary{display:flex;width:100%;justify-content:center}
.hero .specs{grid-template-columns:1fr;gap:8px;margin-top:22px;padding-top:18px}
.hero .kicker{font-size:13px;margin-bottom:12px}
.ctas .secondary{justify-content:center;border:0;height:44px}
.hero .fine{font-size:13px;text-align:center;margin-top:6px}
.stage{order:2;margin:0;padding:6px 0 0;overflow:visible}
.stage .halo{display:none}
.phone{width:100%;border-radius:34px;padding:10px;transform:none;transition:none}
.screen{height:auto;min-height:0;aspect-ratio:auto;border-radius:26px}
.scroll{overflow:visible;pointer-events:auto;touch-action:auto;padding:4px 14px 14px}
.phone .consent{position:static;box-shadow:none}
.cur{display:none}
.try{right:6px;top:-10px}
section.band,.tpls{padding:60px 0}
.ink{padding:60px 0}
.ink > .site{padding:0 20px}
.close{padding:72px calc(50vw - 50%) 64px}
section.band h2,.tpls h2,.ink h2,.close h2{font-size:clamp(30px,8.6vw,40px);letter-spacing:-.04em}
section.band .sub,.tpls .sub,.ink .sub,.close .sub{font-size:16.5px;line-height:1.5}
.how{gap:18px;margin-top:26px}
.frames .no,.frames .bar{display:none}
.steps{gap:0}
.steps li,.steps li[aria-current="true"]{padding:14px 0;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent}
.steps h3{font-size:19px;margin:2px 0 4px}.steps p{font-size:15px}
.tpls .sub .d{display:none}.tpls .sub .m{display:inline}
.strip{gap:16px;margin-top:26px;padding:12px calc(50vw - 39vw) 20px;scroll-padding:0;mask-image:none}
.tcard{width:78vw;scroll-snap-align:center;gap:10px}
.tcard > span:not(.thumb){display:none}
.tcard .thumb{transition:transform .6s cubic-bezier(.32,.72,0,1)}
.tcard.mid .thumb{transform:translateY(-6px) scale(1.05)}
.tcard.mid iframe{transform:scale(.25) translateY(var(--travel,-66.6%));transition-duration:var(--dur,4.5s)}
.flow{grid-template-columns:1fr;gap:12px;margin:0 0 22px}
.flow li{padding-top:14px;font-size:14px}
.ink .grid{gap:22px;margin-top:22px}
.ink ul.points li:nth-child(2),.ink ul.points li:nth-child(3){display:none}
.ink ul.points li{font-size:15.5px}
.stack{min-height:0}
.plans{gap:14px;margin-top:18px}
.plan{padding:22px 20px 20px}
.foot-note{display:none}
.compare{display:none}
.compare-m{display:block;margin-top:22px}
.compare-m ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.compare-m li{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line);font-size:16px;line-height:1.45}
.compare-m li::before{content:"";flex:none;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-top:.5em}
.compare-m a{display:inline-block;margin-top:16px;color:var(--fg);font-weight:600;text-decoration:none;border-bottom:1.5px solid var(--line);padding-bottom:2px}
.trust{gap:18px;margin-top:22px}
.trust .long{display:none}
.trust p{font-size:15px}
.trust b{font-size:16px}
.close .signature{display:none}
.close .ctas{align-items:center}
.close .ctas .primary{width:auto;min-width:220px;justify-content:center;gap:12px}
footer.site-foot{padding:30px 0 40px}
/* second pass */
nav.main{background:rgba(255,255,255,.93)}
.hero{padding-bottom:0}
.phone .lede-sm{display:none}
.phone .line .unit{grid-column:1 / -1;text-align:right;margin-top:4px}
.phone .sig{min-height:0;margin:0}.phone .sig.has{min-height:44px;margin:8px 0 2px}
html.gs .tpls{border-top:1px solid var(--line)}
.tpls .sub .d2{display:none}
.tcard{transition:transform .6s cubic-bezier(.32,.72,0,1),opacity .6s cubic-bezier(.32,.72,0,1)}
.tcard .thumb,.tcard b{transition:transform .6s cubic-bezier(.32,.72,0,1),opacity .6s cubic-bezier(.32,.72,0,1)}
.tcard:not(.mid) .thumb{opacity:.45;transform:scale(.92)}
.tcard:not(.mid) b{opacity:.45}
.tcard.mid .thumb{opacity:1;transform:none}
.tcard.mid iframe{transform:scale(.25);transition:none;animation:qs-peek 8s cubic-bezier(.45,.05,.3,1) 1.4s infinite alternate}
.ink .receipt{transform:none!important;max-width:100%}
.receipt code{font-size:11px}
.close .sub{margin-bottom:28px}
.close .ctas .primary{width:100%;min-width:0;justify-content:space-between}
/* third pass */
.hero{padding-top:116px}
.hero h1{margin-top:0}
.screen{height:596px;aspect-ratio:auto;position:relative}
.scroll{overflow-y:auto;pointer-events:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:36px}
.screen::after{content:"";position:absolute;left:0;right:0;bottom:0;height:22px;pointer-events:none;background:linear-gradient(to bottom,transparent,var(--card));border-radius:0 0 26px 26px}
.tcard.mid iframe{animation:none;transform:scale(.25)}
.flow{display:none}
/* the record card itself, straight away: no cycling cards on a phone */
.ink .state{display:none}
.ink .receipt{opacity:1!important;transition:none!important}
.ink .sub{margin-bottom:0}
.receipt dl{grid-template-columns:1fr;gap:2px 0}.receipt dt{font-size:12.5px;margin-top:8px}.receipt dt:first-child{margin-top:0}
.receipt dd{min-width:0}.receipt code{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.ink + section.band{border-top:0}
.ctas .secondary{text-decoration:underline;text-underline-offset:5px;text-decoration-color:var(--line);text-decoration-thickness:1.5px}
.ink .grid{margin-top:20px}
}
@keyframes qs-peek{to{transform:scale(.25) translateY(var(--travel,-66.6%))}}
`;

/* The homepage choreography. Runs only when the vendor scripts loaded; the page is complete without it. */
const MOTION_JS = String.raw`
(function(){
if(!window.gsap||!window.ScrollTrigger)return;
var root=document.documentElement;root.classList.add("gs");
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches,desktop=matchMedia("(min-width:960px)").matches,fine=matchMedia("(hover:hover) and (pointer:fine)").matches;
gsap.registerPlugin(ScrollTrigger);
var E="power4.out",q=gsap.utils.toArray;
/* Smooth scrolling, only where it helps: fine pointers, motion allowed. */
var lenis=null;
if(!reduce&&fine&&window.Lenis){lenis=new Lenis({lerp:.09,smoothWheel:true,wheelMultiplier:.95});lenis.on("scroll",ScrollTrigger.update);gsap.ticker.add(function(t){lenis.raf(t*1000)});gsap.ticker.lagSmoothing(0);
document.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener("click",function(e){var id=a.getAttribute("href").slice(1);var el=id&&document.getElementById(id);if(!el)return;e.preventDefault();lenis.scrollTo(el,{offset:-88,duration:1.2});history.replaceState(null,"","#"+id)})})}
/* The nav steps aside while you read down, and comes back the moment you scroll up. */
var nav=document.querySelector(".navwrap");if(nav){var last=0;ScrollTrigger.create({start:0,end:"max",onUpdate:function(s){var y=s.scroll();if(y>last+6&&y>240)nav.classList.add("hide");else if(y<last-6)nav.classList.remove("hide");last=y}})}
if(reduce){gsap.set(".rise,.moment,#phone,.cur,.rv .ws .w,.rise-kids > *,.rv2,.tpls .head > *,.tcard,.plan",{clearProps:"all",autoAlpha:1});return}
/* 1. Hero: the scroll parallax is set up first (so a refresh reverts to the resting state), then one composed entrance. */
var heroST={trigger:".hero",start:"top top",end:"bottom top",scrub:1};
gsap.to(".hero .mesh",{yPercent:-16,ease:"none",immediateRender:true,scrollTrigger:heroST});
gsap.to(".hero > div:not(.mesh):not(.stage)",{yPercent:-8,autoAlpha:.25,ease:"none",immediateRender:true,scrollTrigger:heroST});
gsap.to("#phone",{yPercent:-9,ease:"none",immediateRender:true,scrollTrigger:heroST});
gsap.to(".moment.m1",{yPercent:-55,ease:"none",immediateRender:true,scrollTrigger:heroST});
gsap.to(".moment.m2",{yPercent:-30,ease:"none",immediateRender:true,scrollTrigger:heroST});
gsap.to(".moment.m3",{yPercent:-75,ease:"none",immediateRender:true,scrollTrigger:heroST});
var intro=gsap.timeline({defaults:{ease:E}});
intro.from(".hero h1",{y:44,autoAlpha:0,duration:1.1},0)
.from(".hero .lede",{y:30,autoAlpha:0,duration:1},.14)
.from(".hero .ctas",{y:26,autoAlpha:0,duration:.9},.26)
.from(".hero .fine",{y:20,autoAlpha:0,duration:.9},.34)
.from("#phone",{y:60,autoAlpha:0,duration:1.4,ease:"power3.out"},.12)
.from(".cur",{autoAlpha:0,y:12,duration:.8},.95)
.from(".moment",{y:26,scale:.94,autoAlpha:0,duration:.9,stagger:.26},1.0);
gsap.to(".moment",{y:-7,duration:3.2,ease:"sine.inOut",yoyo:true,repeat:-1,stagger:{each:.7},delay:2.2});
/* 2. Headings arrive word by word; blocks rise once. */
q(".rv").forEach(function(h){var w=h.querySelectorAll(".ws .w");if(!w.length)return;gsap.from(w,{yPercent:110,autoAlpha:0,filter:"blur(6px)",duration:.9,ease:E,stagger:.045,scrollTrigger:{trigger:h,start:"top 86%",once:true}})});
q(".rise-kids").forEach(function(s){var kids=[].slice.call(s.children).filter(function(c){return c.tagName!=="H2"});if(kids.length)gsap.from(kids,{y:36,autoAlpha:0,filter:"blur(6px)",duration:1,ease:E,stagger:.1,scrollTrigger:{trigger:s,start:"top 80%",once:true}})});
q(".rv2,.close h2,.close .sub,.close .signature,.close .ctas").forEach(function(el){gsap.from(el,{y:36,autoAlpha:0,filter:"blur(6px)",duration:1,ease:E,scrollTrigger:{trigger:el,start:"top 88%",once:true}})});
gsap.from(".tpls .head > *",{y:30,autoAlpha:0,filter:"blur(6px)",duration:1.4,ease:"power2.out",stagger:.12,scrollTrigger:{trigger:".tpls",start:"top 92%",once:true}});
/* 3. How it works: pinned; the scrollbar turns the cards and the copy. */
var how=document.getElementById("how"),frames=document.getElementById("frames"),lis=q("#steps li"),no=document.getElementById("frameNo");
if(how&&frames&&desktop){var imgs=q("#frames img");how.classList.add("pinned");
imgs.forEach(function(im,i){im.setAttribute("data-state",i?"next":"on")});
gsap.set(imgs,{yPercent:function(i){return i*5},scale:function(i){return 1-i*.05},autoAlpha:function(i){return i===0?1:i===1?.38:.18},filter:function(i){return i?"blur(2px)":"blur(0px)"},transformOrigin:"50% 100%"});
gsap.set(lis,{autoAlpha:function(i){return i?0:1},y:function(i){return i?34:0}});
var setStep=function(i){lis.forEach(function(li,k){li.setAttribute("aria-current",String(k===i))});imgs.forEach(function(im,k){im.classList.toggle("on",k===i)});if(no)no.textContent=(i+1)+" / "+imgs.length};
/* Each card holds for H, then swaps over T. The active step flips halfway through a swap. */
var H=1,T=.55,tl=null;
var mid=function(el){return function(){return "top "+Math.max(0,Math.round((innerHeight-el.offsetHeight)/2))+"px"}};
tl=gsap.timeline({scrollTrigger:{trigger:how,start:mid(how),end:"+=140%",scrub:.9,pin:true,anticipatePin:1,invalidateOnRefresh:true},onUpdate:function(){var t=tl.time(),i=0;for(var k=1;k<imgs.length;k++){if(t>=H*k+T*(k-1)+T/2)i=k}setStep(i)}});
for(var i=1;i<imgs.length;i++){var at=H*i+T*(i-1);
tl.to(imgs[i-1],{yPercent:-12,scale:1.03,autoAlpha:0,filter:"blur(4px)",duration:T,ease:"none"},at)
.to(imgs[i],{yPercent:0,scale:1,autoAlpha:1,filter:"blur(0px)",duration:T,ease:"none"},at);
if(imgs[i+1])tl.to(imgs[i+1],{yPercent:5,scale:.95,autoAlpha:.38,filter:"blur(2px)",duration:T,ease:"none"},at);
tl.to(lis[i-1],{autoAlpha:0,y:-30,duration:T/2,ease:"none"},at).to(lis[i],{autoAlpha:1,y:0,duration:T/2,ease:"none"},at+T/2)}
tl.to({},{duration:H})}
/* 4. Templates: pinned, the gallery slides sideways with the scroll and leans with your speed. */
var tpls=document.getElementById("templates"),strip=tpls&&tpls.querySelector(".strip"),cards=strip?q(".tcard"):[];
if(strip&&desktop){tpls.classList.add("pinned");
gsap.from(cards,{x:140,rotate:2,autoAlpha:0,duration:1.8,ease:"power2.out",stagger:.12,scrollTrigger:{trigger:tpls,start:"top 95%",once:true}});
var dist=function(){return Math.max(0,strip.scrollWidth-strip.clientWidth+24)};
var skew=gsap.quickTo(cards,"skewX",{duration:.55,ease:"power3"});
ScrollTrigger.create({trigger:tpls,start:mid(tpls),end:function(){return "+="+(dist()+320)},pin:true,anticipatePin:1,invalidateOnRefresh:true});
/* The slide begins when the section's top passes 70% of the screen, and ends where the pin ends, so the cards are already moving as you arrive. */
gsap.to(strip,{x:function(){return -dist()},ease:"none",scrollTrigger:{trigger:tpls,start:"top 85%",end:function(){return "+="+(dist()+320+innerHeight*.85)},scrub:1.4,invalidateOnRefresh:true,onUpdate:function(s){skew(gsap.utils.clamp(-7,7,s.getVelocity()/-320))}}})}
else if(cards.length){gsap.from(cards,{x:120,rotate:2.5,autoAlpha:0,duration:1,ease:E,stagger:.08,scrollTrigger:{trigger:tpls,start:"top 80%",once:true}})}
if(fine)cards.forEach(function(c){var th=c.querySelector(".thumb");if(!th)return;c.addEventListener("pointermove",function(e){var r=th.getBoundingClientRect();th.style.setProperty("--mx",((e.clientX-r.left)/r.width*100).toFixed(1)+"%");th.style.setProperty("--my",((e.clientY-r.top)/r.height*100).toFixed(1)+"%")})});
/* 4b. The record plays once, on its own, when its top has reached the upper third of the screen. */
var rec=document.getElementById("record");
if(rec){rec.dataset.scrub="1";ScrollTrigger.create({trigger:rec,start:"top 34%",once:true,onEnter:function(){rec.classList.add("play")}})}
/* 5. Plans rise and the prices count up once. */
gsap.from(".plan",{y:44,autoAlpha:0,duration:1,ease:E,stagger:.1,scrollTrigger:{trigger:".plans",start:"top 82%",once:true}});
q("[data-price]").forEach(function(el){var n=parseInt(el.textContent,10);if(!isFinite(n))return;var o={v:0};gsap.to(o,{v:n,duration:1.3,ease:"power3.out",scrollTrigger:{trigger:el,start:"top 85%",once:true},onUpdate:function(){if(el.dataset.counted!=="done")el.textContent=String(Math.round(o.v))},onComplete:function(){if(el.dataset.counted!=="done")el.textContent=String(n);el.dataset.counted="done"}})});
/* 6. The close: the signature draws with the scroll. */
var path=document.querySelector(".close .signature path");
if(path)gsap.fromTo(path,{strokeDashoffset:440},{strokeDashoffset:0,ease:"none",scrollTrigger:{trigger:".close",start:"top 70%",end:"center 45%",scrub:1}});
addEventListener("load",function(){ScrollTrigger.refresh()});
})();
`;

export function renderLanding(o: { nonce: string; appUrl: string; githubUrl: string; analytics?: string | null }): string {
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
<div class="navwrap"><nav class="main" aria-label="Main">
  <a href="/" class="brand home"><span class="dot" aria-hidden="true"></span><span>Quote <span class="and">and</span> Sign</span></a>
  <div class="links">
    <a href="/templates" class="sm-hide">Templates</a>
    <a href="#plans" class="sm-hide">Pricing</a>
    <a href="/compare" class="sm-hide">Compare</a>
    <a href="${esc(o.githubUrl)}" rel="noopener" class="sm-hide">GitHub</a>
    <a href="/login">Sign in</a>
    <a href="/login" class="cta">Start free</a>
  </div>
</nav></div>
<div class="site">

<section class="hero">
  <div class="mesh" aria-hidden="true"></div>
  <div>
    <p class="kicker rise">Proposal software for freelancers and agencies</p>
    <h1 class="rise">Send a proposal as a link. Get it signed.</h1>
    <p class="lede rise d1">Your client opens it anywhere, switches the options on or off, sees the total change, and signs with their name. The signed copy lands in both inboxes as a PDF. Nothing to print, nothing to chase.</p>
    <div class="ctas rise d2">
      <a class="primary" href="/login">Start free</a>
      <a class="secondary" href="#record">See what your client gets</a>
    </div>
    <p class="fine rise d3">Fourteen days of Pro, then free for three live proposals. No card needed. <a href="${esc(o.githubUrl)}" rel="noopener">Open source</a>.</p>
    <ul class="specs rise d3" aria-label="What is included">
      <li>Live pricing the client can change</li>
      <li>Typed signature with a content hash</li>
      <li>Signed PDF to both sides</li>
      <li>Flat pricing, free plan</li>
    </ul>
  </div>

  <div class="stage rise d1">
    <div class="halo" aria-hidden="true"></div>
    <div class="moment m1" aria-hidden="true"><b><i></i>Opened</b>Tuesday 10:02, on a phone</div>
    <div class="moment m2" aria-hidden="true"><b>Extra pages: 3</b><span class="amt"><s>$5,700.00</s>$7,500.00 USD</span></div>
    <div class="moment m3" aria-hidden="true"><b><i></i>Accepted</b><span class="sign">Sophie Bennett</span>for Bramble &amp; Co · Tuesday 10:07</div>
    <div class="phone" id="phone">
      <span class="try">Try it</span>
      <div class="screen">
        <div class="statusbar"><span>9:41</span><span class="notch" aria-hidden="true"></span><span>100%</span></div>
        <div class="scroll">
          <form id="acceptForm" action="#" method="post">
          <article>
            <div class="brand"><span class="dot" aria-hidden="true"></span><span>Northwind Studio</span></div>
            <p class="doc-title">Website redesign for Bramble &amp; Co</p>
            <p class="lede-sm">A fast, mobile-first site that turns visitors into enquiries. Live in six weeks.</p>
            ${pricingHtml(DEMO_ITEMS, DEMO_CURRENCY, false)}
            <section class="accept" id="accept">
              <h2>Accept this proposal</h2>
              <p class="lead">Type your name to sign.</p>
              <label class="f" for="demoName">Full name</label>
              <input class="t" id="demoName" name="signerName" required minlength="2" placeholder="Your name" autocomplete="off">
              <div class="sig" id="sigPreview" aria-hidden="true"><span class="sig-name" id="sigName"></span><span class="sig-line"></span></div>
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

<section class="band rise-kids" id="how">
  <h2 class="rv"><span class="sr">A proposal in minutes, not an afternoon.</span><span class="ws" aria-hidden="true"><span class="w">A</span> <span class="w">proposal</span> <span class="w">in</span> <span class="w">minutes,</span> <span class="w">not</span> <span class="w">an</span> <span class="w">afternoon.</span></span></h2>
  <p class="sub">Pick a template, set your prices, press Send. Nothing to attach, nothing to print, nothing to chase.</p>
  <div class="how">
    <div class="frames" id="frames" aria-label="The app, step by step">
      <img src="/img/step-template.jpg" width="1440" height="900" alt="Choosing a template: Website project, Consulting project, Monthly retainer, Photography package, Software build" class="on" loading="lazy" decoding="async">
      <img src="/img/step-editor.jpg" width="1440" height="900" alt="The editor: the proposal as a page on the left, pricing lines with optional items on the right" loading="lazy" decoding="async">
      <img src="/img/step-send.jpg" width="1440" height="900" alt="The send dialog with the client link ready to copy" loading="lazy" decoding="async">
      <div class="bar" aria-hidden="true"></div>
      <span class="no" id="frameNo" aria-hidden="true">1 / 3</span>
    </div>
    <ol class="steps" id="steps">
      <li aria-current="true" data-i="0"><span class="n">Step 1</span><h3>Pick a template</h3><p>Seven starting points written by people who send proposals for a living. Every word is editable.</p></li>
      <li aria-current="false" data-i="1"><span class="n">Step 2</span><h3>Set your prices</h3><p>Add lines, mark what is optional, and decide which quantities the client may change.</p></li>
      <li aria-current="false" data-i="2"><span class="n">Step 3</span><h3>Send the link</h3><p>Optionally with a password and an expiry date. You get an email the first time it is opened.</p></li>
    </ol>
  </div>
</section>

<section class="tpls" id="templates">
  <div class="head">
    <h2 class="rv"><span class="sr">Starting points that are already pages.</span><span class="ws" aria-hidden="true"><span class="w">Starting</span> <span class="w">points</span> <span class="w">that</span> <span class="w">are</span> <span class="w">already</span> <span class="w">pages.</span></span></h2>
    <p class="sub"><span class="d2">Not a document you fill in. </span>A page your client scrolls, with your prices already live. <span class="d2">Pick one, change the words, send. </span><span class="d">Hover to read one.</span><span class="m">Swipe through them.</span></p>
    <a href="/templates">See all templates</a>
  </div>
  <div class="strip" aria-label="Templates">
    ${TEMPLATES.filter((t) => t.id !== "blank").map((t) => { const page = TEMPLATE_PAGES.find((p) => p.id === t.id); return `<a class="tcard" href="${page ? `/templates/${page.slug}` : "/templates"}"><span class="thumb"><iframe src="/t/${esc(t.id)}?thumb=1" title="${esc(t.name)} preview" tabindex="-1" loading="lazy"></iframe></span><b>${esc(t.name)}<em class="style">${esc(t.style)}</em></b><span>${esc(t.summary)}</span></a>`; }).join("")}
  </div>
</section>

<section class="ink" id="record">
  <div class="site">
    <h2 class="rv"><span class="sr">What you both get the moment they accept.</span><span class="ws" aria-hidden="true"><span class="w">What</span> <span class="w">you</span> <span class="w">both</span> <span class="w">get</span> <span class="w">the</span> <span class="w">moment</span> <span class="w">they</span> <span class="w">accept.</span></span></h2>
    <p class="sub">Not a screenshot of a signature. A record that proves what was agreed, when, and by whom.</p>
    <ol class="flow" aria-label="What happens after you send">
      <li role="button" tabindex="0" data-state="1" aria-label="Show: opened"><b>Opened</b><time>Tue 10:02</time><br>You get an email.</li>
      <li role="button" tabindex="0" data-state="2" aria-label="Show: options chosen"><b>Options chosen</b><time>Tue 10:05</time><br>Copywriting kept, extra pages set to 0.</li>
      <li role="button" tabindex="0" data-state="3" aria-label="Show: accepted"><b>Accepted</b><time>Tue 10:07</time><br>Sophie at Bramble &amp; Co types her name and taps Accept.</li>
      <li role="button" tabindex="0" data-state="4" aria-label="Show: copies sent"><b>Copies sent</b><time>Tue 10:07</time><br>Both inboxes, with the record below.</li>
      <li role="button" tabindex="0" data-state="5" aria-label="Show: the record"><b>The record</b><time>Kept</time><br>Name, time, hash and the agreed total.</li>
    </ol>
    <div class="grid">
      <div class="stack" aria-hidden="true">
      <div class="state s1"><p class="k"><i></i>Opened · Tue 10:02</p><h4>Bramble &amp; Co opened your proposal</h4><p>On a phone, from the email you sent. You get one notification, not ten.</p></div>
      <div class="state s2"><p class="k"><i></i>Options chosen · Tue 10:05</p><h4>Copywriting kept, extra pages off</h4><div class="rows"><div class="row"><b>Copywriting</b><span class="sw"></span></div><div class="row"><b>Extra pages</b><span class="sw off"></span></div></div><div class="tot"><span>Total</span><span>${esc(formatMoney(totals.total, DEMO_CURRENCY))}</span></div></div>
      <div class="state s3"><p class="k"><i></i>Accepted · Tue 10:07</p><div class="signed">Sophie Bennett</div><p>Typed her name, ticked the consent line, tapped Accept.</p></div>
      <div class="state s4"><p class="k"><i></i>Copies sent · Tue 10:07</p><h4>Both inboxes, within seconds</h4><div class="env"><div><span>PDF</span>To you: signed copy and the record</div><div><span>PDF</span>To Sophie: her signed copy</div></div></div>
      <div class="receipt" aria-label="Example acceptance record">
        <div class="top"><b>Website redesign for Bramble &amp; Co</b><span>Accepted</span></div>
        <dl>
          <dt>Signed by</dt><dd>Sophie Bennett, Bramble &amp; Co</dd>
          <dt>When</dt><dd>4 September 2026, 14:07 UTC</dd>
          <dt>Total</dt><dd>${esc(formatMoney(totals.total, DEMO_CURRENCY))}</dd>
          <dt>Options</dt><dd>Copywriting included, extra pages 0</dd>
          <dt>Content hash</dt><dd><code>${sampleHash}</code></dd>
        </dl>
        <div class="sig">Sophie Bennett</div>
      </div>
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

<section class="band rise-kids" id="plans">
  <h2 class="rv"><span class="sr">Flat pricing. The total you see is the total you pay.</span><span class="ws" aria-hidden="true"><span class="w">Flat</span> <span class="w">pricing.</span> <span class="w">The</span> <span class="w">total</span> <span class="w">you</span> <span class="w">see</span> <span class="w">is</span> <span class="w">the</span> <span class="w">total</span> <span class="w">you</span> <span class="w">pay.</span></span></h2>
  <p class="sub">No per-user seats, no per-document fees. Monthly or yearly, cancel any time and take your data with you.</p>
  <div class="interval" role="radiogroup" aria-label="Billing"><button type="button" role="radio" aria-checked="true" data-interval="year">Yearly <span>2 months free</span></button><button type="button" role="radio" aria-checked="false" data-interval="month">Monthly</button></div>
  <div class="plans">
    <div class="plan"><div class="name">Free</div><div class="price">$0</div><p class="for">After a 14-day Pro trial</p><ul><li>3 live proposals at a time</li><li>Live pricing and one-tap accept</li><li>Signed copies by email, PDF attached</li><li>Seven templates, the standard look</li><li>Export any time</li></ul><a href="/login">Start free</a></div>
    <div class="plan hot"><div class="name">Pro <span class="tag">Most chosen</span></div><div class="price">$<span data-price data-year="19" data-month="24">19</span><small>/month</small></div><p class="for"><span data-billed data-year="Billed $228 a year" data-month="Billed monthly">Billed $228 a year</span> · For freelancers and studios</p><ul><li>Unlimited proposals</li><li>Your logo, color and six page styles</li><li>Passwords, expiry dates and reminders</li><li>An email the moment it is opened</li><li>PDF export and a payment link after signing</li><li>No Quote and Sign footer</li></ul><a href="/login?plan=pro">Start with Pro</a></div>
    <div class="plan"><div class="name">Business</div><div class="price">$<span data-price data-year="59" data-month="69">59</span><small>/month</small></div><p class="for"><span data-billed data-year="Billed $708 a year" data-month="Billed monthly">Billed $708 a year</span> · For small agencies</p><ul><li>Everything in Pro</li><li>Up to 10 team members, one brand</li><li>Shared templates</li><li>Countersign after the client</li><li>Webhooks: every sent, opened, accepted or declined proposal lands in your CRM, Zapier or Make</li><li>Priority support</li></ul><a href="/login?plan=business">Start with Business</a></div>
  </div>
  <p class="foot-note">Prices in USD. Unlimited means what it says for a working business: up to 200 new proposals and 40 sends a day per account, which is more than anyone writes by hand. <a href="/terms">The terms</a> carry the fair-use line so nobody can script tens of thousands.</p>
</section>

<section class="band rise-kids" id="compare">
  <h2 class="rv"><span class="sr">How it compares.</span><span class="ws" aria-hidden="true"><span class="w">How</span> <span class="w">it</span> <span class="w">compares.</span></span></h2>
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
        <tr><td>CRM and automation</td><td class="us">Signed webhooks on every event, on Business. Works with Zapier, Make, n8n, HubSpot, Pipedrive</td><td>Native connectors on higher tiers, often per-seat</td></tr>
        <tr><td>Export everything</td><td class="us">Any time, JSON and PDF</td><td>Varies</td></tr>
      </tbody>
    </table>
  </div></div>
  <p class="foot-note"><sup>1</sup> From qwilr.com/pricing, September 2026.</p>
  <div class="compare-m">
    <ul aria-label="How it compares, in short">
      <li>Flat price per month, from $0. Never per user.</li>
      <li>No per-document fees.</li>
      <li>Your client can change options after you send. The total updates live.</li>
      <li>Open source, and you can export everything any time.</li>
    </ul>
    <a href="/compare">See the full comparison</a>
  </div>
</section>

<section class="band rise-kids" id="trust">
  <h2 class="rv"><span class="sr">Built to be trusted with a contract.</span><span class="ws" aria-hidden="true"><span class="w">Built</span> <span class="w">to</span> <span class="w">be</span> <span class="w">trusted</span> <span class="w">with</span> <span class="w">a</span> <span class="w">contract.</span></span></h2>
  <div class="trust">
    <div><b>Open source, AGPL</b><p>The code is public. Anyone can read every line and check that it does what this page says.</p></div>
    <div><b>Encrypted at rest and in transit</b><p>Every proposal, record and upload is encrypted where it is stored and on its way to you. Card details are handled by our payment provider and never touch our servers.</p></div>
    <div><b>No passwords to leak</b><p>You sign in with a one-time link. Proposal links can carry their own password and expiry.</p></div>
    <div class="long"><b>Plays well with your tools</b><p>Business accounts get a signed webhook: one address, a JSON message the moment a proposal is sent, opened, accepted, declined or countersigned. Ids, names and amounts only, never your client's email or the document. Verify the signature and trust it.</p></div>
    <div><b>Leave any time</b><p>Export every proposal and record. Delete your account yourself, with a code we email you, and signed records stay readable for your clients.</p></div>
  </div>
</section>

<section class="close rv2" id="start">
  <div class="mesh" aria-hidden="true"></div>
  <h2>Your next proposal, sent before lunch.</h2>
  <p class="sub">Fourteen days of Pro, no card. Then free for three live proposals, for as long as you like.</p>
  <div class="signature" aria-hidden="true"><span>Your next client</span><svg viewBox="0 0 420 18" preserveAspectRatio="none"><path d="M4 12 C 60 2, 120 16, 200 8 S 330 4, 416 11"/></svg></div>
  <div class="ctas"><a class="primary" href="/login">Start free <i aria-hidden="true">&rarr;</i></a><a class="secondary" href="/templates">Browse the templates</a></div>
</section>

<footer class="site-foot">
  <span class="foot-brand"><i aria-hidden="true"></i>Quote <span class="and">and</span> Sign</span>
  <nav aria-label="Product"><a href="/templates">Templates</a><a href="/compare">Compare</a><a href="/login">Sign in</a><a href="${esc(o.githubUrl)}" rel="noopener">GitHub</a><a href="/contact">Contact</a></nav>
  <nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/acceptable-use">Acceptable use</a><a href="/dpa">DPA</a>${o.analytics ? `<a href="#" data-cookie-settings>Cookie settings</a>` : ""}</nav>
  <p class="foot-licence">Open-source software released under the AGPL-3.0 licence.</p>
</footer>
</div>
${pricingScript(o.nonce, clientItems, DEMO_CURRENCY, true)}
<script nonce="${o.nonce}" src="/vendor/gsap.min.js"></script>
<script nonce="${o.nonce}" src="/vendor/ScrollTrigger.min.js"></script>
<script nonce="${o.nonce}" src="/vendor/lenis.min.js"></script>
<script nonce="${o.nonce}">${MOTION_JS}</script>
<script nonce="${o.nonce}">
(function(){var bs=[].slice.call(document.querySelectorAll("[data-interval]"));if(!bs.length)return;bs.forEach(function(b){b.addEventListener("click",function(){var i=b.dataset.interval;bs.forEach(function(x){x.setAttribute("aria-checked",String(x===b))});document.querySelectorAll("[data-price]").forEach(function(p){p.dataset.counted="done";p.textContent=p.dataset[i]});document.querySelectorAll("[data-billed]").forEach(function(p){p.textContent=p.dataset[i]})})})})();
</script>
<script nonce="${o.nonce}">
(function(){
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches,GS=document.documentElement.classList.contains("gs");
requestAnimationFrame(function(){document.body.classList.add("ready")});
var phone=document.getElementById("phone");if(!phone)return;
// Straighten as the pointer approaches, tilt back when it leaves.
var stage=phone.parentElement;
if(!reduce&&matchMedia("(hover:hover)").matches)stage.addEventListener("pointermove",function(e){var r=stage.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;phone.style.transform="rotateY("+(x*10)+"deg) rotateX("+(-y*8)+"deg)"});
stage.addEventListener("pointerleave",function(){phone.style.transform=""});
// One guided moment: switch an option off and back on so the total visibly changes.
document.querySelectorAll(".cur button").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".cur button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});if(window.qsSetCurrency)window.qsSetCurrency(b.dataset.cur)})});
// Each template thumbnail scrolls exactly to the end of its page on hover, at a speed that suits its length.
document.querySelectorAll(".tcard iframe").forEach(function(fr){var fit=function(){try{var d=fr.contentDocument;if(!d||!d.documentElement)return;var own=fr.clientHeight,win=own/3,doc=0;[].forEach.call(d.body.children,function(el){if(el.tagName==="SCRIPT"||el.tagName==="STYLE"||el.hidden)return;var r=el.getBoundingClientRect();if(r.height>0)doc=Math.max(doc,r.bottom+d.defaultView.scrollY)});if(!doc)doc=d.documentElement.scrollHeight;var travel=Math.max(0,Math.min(own-win,(doc-win)*.9));fr.style.setProperty("--travel",(-travel)+"px");fr.style.setProperty("--dur",(1.2+3.6*travel/(own-win)).toFixed(2)+"s")}catch(e){}};fr.addEventListener("load",fit);if(fr.contentDocument&&fr.contentDocument.readyState==="complete")fit()});
var stripEl=document.querySelector(".tpls .strip");
if(stripEl&&matchMedia("(hover:none)").matches){var mcards=[].slice.call(stripEl.querySelectorAll(".tcard")),mraf=0;var pickMid=function(){mraf=0;var r=stripEl.getBoundingClientRect(),mid=r.left+r.width/2,best=null,bd=1e9;mcards.forEach(function(c){var cr=c.getBoundingClientRect(),d=Math.abs(cr.left+cr.width/2-mid);if(d<bd){bd=d;best=c}});mcards.forEach(function(c){c.classList.toggle("mid",c===best)})};stripEl.addEventListener("scroll",function(){if(!mraf)mraf=requestAnimationFrame(pickMid)},{passive:true});addEventListener("resize",pickMid);setTimeout(pickMid,50);
if(!reduce){var autoT=null,autoStop=false,autoVis=false;var goTo=function(i){var c=mcards[i];if(!c)return;stripEl.scrollTo({left:c.offsetLeft-(stripEl.clientWidth-c.offsetWidth)/2,behavior:"smooth"})};
var tick=function(){if(autoStop||!autoVis||document.hidden)return;var cur=mcards.findIndex(function(c){return c.classList.contains("mid")});goTo((cur+1)%mcards.length)};
var startAuto=function(){if(autoT||autoStop)return;autoT=setInterval(tick,2600)};var stopAuto=function(){clearInterval(autoT);autoT=null};
new IntersectionObserver(function(es){es.forEach(function(e){autoVis=e.isIntersecting;autoVis?startAuto():stopAuto()})},{threshold:.35}).observe(stripEl);
["touchstart","pointerdown","wheel"].forEach(function(ev){stripEl.addEventListener(ev,function(){autoStop=true;stopAuto()},{passive:true})})}}
var frames=document.getElementById("frames"),steps=document.getElementById("steps");
if(frames&&steps&&!GS){var imgs=frames.querySelectorAll("img"),lis=steps.querySelectorAll("li"),cur=0,timer=null;imgs.forEach(function(im,k){im.setAttribute("data-state",k===0?"on":"next")});
var no=document.getElementById("frameNo");function state(i){imgs.forEach(function(im,k){im.classList.toggle("on",k===i);im.setAttribute("data-state",k<i?"past":k===i?"on":"next")});if(no)no.textContent=(i+1)+" / "+imgs.length}
function show(i){cur=i;state(i);lis.forEach(function(li,k){li.setAttribute("aria-current",String(k===i))});frames.classList.remove("run");void frames.offsetWidth;frames.classList.add("run")}
function start(){if(timer)return;timer=setInterval(function(){show((cur+1)%imgs.length)},2800);frames.classList.add("run")}
function stop(){clearInterval(timer);timer=null;frames.classList.remove("run")}
lis.forEach(function(li){li.addEventListener("click",function(){stop();show(Number(li.dataset.i))})});
if(matchMedia("(min-width:960px)").matches&&!reduce){var sraf=0;function pickStep(){sraf=0;var mid=innerHeight*.5,best=0,bd=1e9;lis.forEach(function(li,k){var r=li.getBoundingClientRect();var d=Math.abs(r.top+r.height/2-mid);if(d<bd){bd=d;best=k}});if(best!==cur){state(best);lis.forEach(function(li,k){li.setAttribute("aria-current",String(k===best))});cur=best}}
addEventListener("scroll",function(){if(!sraf)sraf=requestAnimationFrame(pickStep)},{passive:true});pickStep()}else{new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?start():stop()})},{threshold:.35}).observe(frames)}}
var rvs=GS?[]:[].slice.call(document.querySelectorAll(".rv,.rv2,.rise-kids,.tpls"));if(rvs.length){var rio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");rio.unobserve(e.target)}})},{rootMargin:"0px 0px -10% 0px",threshold:.05});rvs.forEach(function(el){if(el.getBoundingClientRect().top<innerHeight*.9)el.classList.add("in");else rio.observe(el)});
var allIn=function(){rvs.forEach(function(el){el.classList.add("in");rio.unobserve(el)})};
addEventListener("scroll",function(){if(innerHeight+scrollY>=document.documentElement.scrollHeight-8)allIn()},{passive:true})}
var rec=document.getElementById("record");
if(rec&&!rec.dataset.scrub){new IntersectionObserver(function(es,o){es.forEach(function(e){if(e.isIntersecting){rec.classList.add("play");o.disconnect()}})},{threshold:.3}).observe(rec)}
if(rec){var flowLis=[].slice.call(rec.querySelectorAll(".flow li")),stateEls=[].slice.call(rec.querySelectorAll(".state")),rcpt=rec.querySelector(".receipt");
var showState=function(n){rec.classList.remove("play");rec.classList.add("manual");stateEls.forEach(function(st,i){st.classList.toggle("show",i===n-1)});if(rcpt)rcpt.classList.toggle("show",n===5);flowLis.forEach(function(li,i){li.classList.toggle("on",i<n)})};
flowLis.forEach(function(li){li.addEventListener("click",function(){showState(Number(li.dataset.state))});li.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();showState(Number(li.dataset.state))}})})}
var sw=phone.querySelector('[data-item="d2"]'),nm=document.getElementById("demoName"),sc=phone.querySelector(".scroll"),touched=false;
phone.addEventListener("pointerdown",function(){touched=true},{once:true});
if(sw&&!reduce){setTimeout(function(){sw.checked=false;sw.dispatchEvent(new Event("change"))},1800);setTimeout(function(){sw.checked=true;sw.dispatchEvent(new Event("change"))},3200)}
// Then the phone scrolls to the signature and the name writes itself. Touching the phone stops it; focusing the field clears it.
if(nm&&sc&&!reduce&&matchMedia("(min-width:980px)").matches){
nm.addEventListener("focus",function(){if(nm.dataset.auto){delete nm.dataset.auto;nm.value="";nm.dispatchEvent(new Event("input"))}});
setTimeout(function(){if(touched||document.hidden||scrollY>innerHeight*.6||document.activeElement===nm)return;var acc=phone.querySelector(".accept");sc.scrollTo({top:Math.max(0,acc.offsetTop-24),behavior:"smooth"});
setTimeout(function(){if(touched)return;var s="Sophie Bennett",k=0;nm.dataset.auto="1";var iv=setInterval(function(){if(touched||!nm.dataset.auto){clearInterval(iv);return}k++;nm.value=s.slice(0,k);nm.dispatchEvent(new Event("input"));if(k>=s.length)clearInterval(iv)},70)},900)},4600)}
})();
</script>
${o.analytics ? consentMarkup(o.nonce, o.analytics) : ""}
</body>
</html>`;
}
