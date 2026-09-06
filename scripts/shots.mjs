// Visual check: sign in through the real magic-link flow and screenshot every screen.
// Usage: node scripts/shots.mjs <outDir>   (dev server on BASE, default 127.0.0.1:5199)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const out = process.argv[2] ?? ".shots";
mkdirSync(out, { recursive: true });

const watch = process.env.WATCH === "1";
const browser = await chromium.launch({ headless: !watch, slowMo: watch ? 350 : 0 });
const errors = [];
async function shoot(ctx, name, path, opts = {}) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: console ${m.text()}`); });
  await page.goto(BASE + path, { waitUntil: path === "/login" || path.startsWith("/contact") ? "load" : "networkidle" });
  if (opts.wait) await page.waitForSelector(opts.wait, { timeout: 15000 });
  if (opts.act) await opts.act(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: opts.full ?? false });
  return page;
}

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await shoot(ctx, `${label}-home`, "/", { full: true });
  await shoot(ctx, `${label}-login`, "/login", { wait: "form" });

  const res = await ctx.request.post(BASE + "/auth/request", { data: { email: "dev@example.com", turnstile: "local-test-key-accepts-any-token" } });
  const auth = await res.json();
  if (!auth.devLink) throw new Error(`sign-in link not returned (${res.status()}): ${auth.error ?? JSON.stringify(auth)}`);
  const p = await ctx.newPage();
  const u = new URL(auth.devLink);
  await p.goto(BASE + u.pathname + u.search, { waitUntil: "networkidle" });
  await p.waitForURL("**/app", { timeout: 15000 });
  await p.close();

  await shoot(ctx, `${label}-dashboard`, "/app", { wait: "main" });
  await shoot(ctx, `${label}-profile`, "/app/brand", { wait: "main", full: true });
  await shoot(ctx, `${label}-plan`, "/app/brand#plan", { wait: "[data-test=plan]", full: true });
  await shoot(ctx, `${label}-advanced`, "/app/brand#advanced", { wait: "[data-test=delete]", full: true });
  const created = await (await ctx.request.post(BASE + "/api/proposals", { data: { template: "web-project" } })).json();
  const href = `/app/p/${created.id}`;
  if (label === "desktop") {
    for (const [tpl, style] of [["consulting", "editorial"], ["web-project", "bold"], ["software", "night"], ["photography", "warm"], ["blank", "minimal"]]) {
      await shoot(ctx, `style-${style}`, `/t/${tpl}?style=${style}&accent=%230f6e4a`, { full: true });
    }
  }
  await shoot(ctx, `${label}-templates`, "/app/templates", { wait: "[data-template]", act: async (pg) => { await pg.waitForTimeout(1500); }, full: true });

  const ed = await shoot(ctx, `${label}-editor`, href, { wait: ".bn-editor" });
  await ed.locator(".bn-editor").click();
  await ed.keyboard.press("Control+End");
  await ed.keyboard.press("End");
  await ed.keyboard.press("Enter");
  await ed.keyboard.type("/");
  await ed.waitForTimeout(500);
  await ed.screenshot({ path: `${out}/${label}-editor-menu.png` });
  await ed.keyboard.press("Escape");
  await ed.keyboard.press("Backspace");
  await ed.keyboard.press("Backspace");
  await ed.waitForTimeout(300);
  if (label === "desktop") {
    const row = ed.locator("aside button[aria-expanded]").first();
    if (await row.count()) { await row.click(); await ed.waitForTimeout(300); await ed.screenshot({ path: `${out}/${label}-editor-pricing-open.png` }); await row.click(); }
    await ed.locator("aside").getByRole("tab", { name: /options/i }).click();
    await ed.locator("[data-test=style-menu]").click();
    await ed.waitForTimeout(300);
    await ed.screenshot({ path: `${out}/${label}-editor-options.png` });
    await ed.locator("aside").getByRole("tab", { name: /pricing/i }).click();
  }
  await ed.locator("header").getByRole("button", { name: /^send$|^share$/i }).click();
  await ed.waitForTimeout(400);
  await ed.screenshot({ path: `${out}/${label}-send.png` });
  await ed.getByRole("button", { name: "Close" }).click();
  if (label === "desktop" && process.env.MARKETING === "1") {
    mkdirSync("public/img", { recursive: true });
    const dashNew = await ctx.newPage();
    await dashNew.goto(BASE + "/app/templates", { waitUntil: "networkidle" });
    await dashNew.waitForSelector("[data-template]");
    await dashNew.waitForTimeout(1500);
    await dashNew.screenshot({ path: "public/img/step-template.jpg", type: "jpeg", quality: 82 });
    await dashNew.close();
    await ed.screenshot({ path: "public/img/step-editor.jpg", type: "jpeg", quality: 82 });
    await ed.locator("header").getByRole("button", { name: /^send$|^share$/i }).click();
    await ed.waitForTimeout(400);
    await ed.screenshot({ path: "public/img/step-send.jpg", type: "jpeg", quality: 82 });
    await ed.getByRole("button", { name: "Close" }).click();
  }
  if (label === "desktop") {
    await ed.evaluate(() => { localStorage.setItem("op-theme", "dark"); });
    await ed.reload({ waitUntil: "networkidle" });
    await ed.waitForSelector(".bn-editor");
    await ed.waitForTimeout(400);
    await ed.screenshot({ path: `${out}/${label}-editor-dark.png` });
    await ed.evaluate(() => { localStorage.setItem("op-theme", "light"); });
    await ed.reload({ waitUntil: "networkidle" });
    await ed.waitForSelector(".bn-editor");
  }
  const previewHref = await ed.locator('a[href^="/p/"]').first().getAttribute("href");
  if (previewHref) await shoot(ctx, `${label}-preview`, previewHref, { full: true });

  if (label === "desktop") {
    const sent = await (await ctx.request.post(BASE + `/api/proposals/${created.id}/send`)).json();
    const cctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const cp = await cctx.newPage();
    await cp.goto(BASE + new URL(sent.link).pathname, { waitUntil: "networkidle" });
    await cp.evaluate(async () => {
      const secs = [...document.querySelectorAll("section.sec[id]")].slice(0, 4).map((el, i) => ({ id: el.id, title: el.getAttribute("data-title") || el.id, seconds: 30 + i * 20 }));
      await fetch(location.pathname + "/engage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections: secs }) });
    });
    await cctx.close();
    const dl = await shoot(ctx, "desktop-dashboard-live", "/app", { wait: "[data-test=journey]" });
    await dl.locator("li[data-row-menu]").filter({ has: dl.locator("[data-test=journey]") }).first().getByRole("button", { name: "More" }).click();
    await dl.locator("[data-test=analytics-summary]").first().click();
    await dl.locator("[data-test=analytics]").getByText("Time per section").waitFor({ timeout: 10000 });
    await dl.waitForTimeout(500);
    await dl.screenshot({ path: `${out}/desktop-analytics.png` });
    await dl.close();
  }
  await ctx.request.delete(BASE + `/api/proposals/${created.id}`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "no page errors");
