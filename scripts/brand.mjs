// Renders the PNG icons and the social image from the brand SVGs. Run once; outputs are committed.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = new URL("../public/brand/", import.meta.url);
const out = (n) => fileURLToPath(new URL(n, dir));
const browser = await chromium.launch();
const sizes = [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180], ["favicon-32.png", 32]];
for (const [name, px] of sizes) {
  const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  const svg = readFileSync(new URL(name === "favicon-32.png" ? "mark.svg" : "icon.svg", dir), "utf8");
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: out(name), omitBackground: true });
  await page.close();
}
// The social image: mark, wordmark and the one-line promise on the site's paper color.
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const font = readFileSync(new URL("../public/fonts/Geist-Variable.woff2", import.meta.url)).toString("base64");
await og.setContent(`<!doctype html><html><head><style>
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
html,body{margin:0;width:1200px;height:630px;background:#fbfaf7;font-family:Geist,system-ui,sans-serif;color:#191816}
.wrap{position:absolute;inset:0;padding:72px 84px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:600;letter-spacing:-.01em;color:#2b3f8c}
.brand i{width:22px;height:22px;border-radius:50%;background:#2b3f8c}
h1{font-size:84px;line-height:1.02;letter-spacing:-.045em;font-weight:650;margin:0;max-width:14ch}
h1 span{color:#2b3f8c}
p{font-size:28px;color:#5f5b55;margin:0}
.halo{position:absolute;right:-160px;top:-160px;width:640px;height:640px;border-radius:50%;background:radial-gradient(circle,rgba(43,63,140,.16),transparent 62%)}
</style></head><body><div class="halo"></div><div class="wrap"><div class="brand"><i></i>Quote <span style="font-weight:300">and</span> Sign</div><h1>Proposals your clients accept <span>on their phone.</span></h1><p>Open-source proposal software. Flat pricing, no per-document fees.</p></div></body></html>`);
await og.waitForTimeout(300);
await og.screenshot({ path: out("og.png") });
await browser.close();
console.log("brand assets rendered");
