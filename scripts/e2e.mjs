// Functional pass through the real browser. Types real values, asserts real numbers.
// Usage: node scripts/e2e.mjs   (dev server on BASE, default http://127.0.0.1:5199; WATCH=1 to see it)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const watch = process.env.WATCH === "1";
const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: Boolean(cond), detail });
  if (!cond) console.log("FAIL", name, detail);
};
// Dev mail is logged by the server; the run script writes that log to SERVER_LOG.
import { readFileSync } from "node:fs";
const logText = () => { try { return process.env.SERVER_LOG ? readFileSync(process.env.SERVER_LOG, "utf8") : ""; } catch { return ""; } };
const logSize = () => logText().length;
const logSince = async (n) => { for (let i = 0; i < 20; i++) { const t = logText(); if (t.length > n) return t.slice(n); await new Promise((r) => setTimeout(r, 250)); } return ""; };
const money = (minor, cur) => new Intl.NumberFormat("en", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(minor / 100) + " " + cur;

const browser = await chromium.launch({ headless: !watch, slowMo: watch ? 250 : 0 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
ctx.on("page", (p) => {
  p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()}: ${m.text()}`); });
});
const get = async (path) => (await ctx.request.get(BASE + path)).json();

try {
  // ---- Sign in through the real flow --------------------------------------------------
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", "e2e@example.com");
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  const link = page.getByRole("link", { name: /open the sign-in link/i });
  await link.waitFor({ timeout: 10000 });
  const href = new URL(await link.getAttribute("href"));
  await page.goto(BASE + href.pathname + href.search, { waitUntil: "networkidle" });
  await page.waitForURL("**/app", { timeout: 15000 });
  ok("sign-in via magic link lands on the dashboard", page.url().endsWith("/app"));
  await ctx.request.put(BASE + "/auth/me", { data: { brandName: "", brandColor: null, defaultStyle: null, notifyEmails: [] } });
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("qs-setup-dismissed")) localStorage.removeItem(k); });
  await page.reload({ waitUntil: "networkidle" });
  const setup = page.locator("[data-test=setup-step]");
  ok("a new account is asked to set up its profile first", (await setup.count()) === 1 && (await setup.innerText()).includes("Set up your brand"));

  // ---- Profile: set once --------------------------------------------------------------------
  await setup.getByRole("button", { name: /set up brand/i }).click();
  await page.waitForURL("**/app/brand", { timeout: 10000 });
  await page.getByLabel("Business name").fill("Northwind Studio");
  await page.getByRole("radio", { name: "Forest" }).click();
  await page.waitForTimeout(1200);
  const me1 = (await get("/auth/me")).user;
  ok("brand page saves the business name and colour", me1.brandName === "Northwind Studio" && me1.brandColor === "#0f6e4a", JSON.stringify(me1));
  await page.getByRole("textbox", { name: /brand colour hex/i }).fill("#0f766e");
  await page.waitForTimeout(1000);
  ok("a pasted hex becomes the brand colour", (await get("/auth/me")).user.brandColor === "#0f766e");
  await page.locator("[data-test=team]").getByRole("button", { name: /add a team email/i }).click();
  await page.getByLabel("Team email 1").fill("ops@northwind.example");
  await page.waitForTimeout(1200);
  ok("team emails are saved on the profile", JSON.stringify((await get("/auth/me")).user.notifyEmails) === JSON.stringify(["ops@northwind.example"]));
  await page.getByLabel("Payment link").fill("https://pay.northwind.example/deposit");
  await page.getByLabel("Payment link").blur();
  await page.waitForTimeout(900);
  ok("a brand payment link is saved from the Brand page", (await get("/auth/me")).user.paymentUrl === "https://pay.northwind.example/deposit");
  // Logo: a real PNG goes up and shows on the client page; the plan and data sections are there.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.locator("[data-test=logo] input[type=file]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(1500);
  const meLogo = (await get("/auth/me")).user;
  ok("a logo uploads from the profile and is stored under the account", /^logos\//.test(meLogo.brandLogoKey ?? ""), String(meLogo.brandLogoKey));
  const tpLogo = await (await ctx.request.get(BASE + "/t/web-project")).text();
  ok("the logo shows at the top of the proposal page", tpLogo.includes("/files/" + meLogo.brandLogoKey));
  ok("the plan section is honest that payments are not on yet", (await page.locator("[data-test=plan]").innerText()).includes("Payments are not switched on yet"));
  ok("the data section offers a full export", (await page.locator("[data-test=account] a[href='/api/account/export']").count()) === 1);
  ok("the team section explains Business teams to a non-Business account", (await page.locator("[data-test=team-section]").innerText()).includes("Teams are part of the Business plan"));
  ok("the plan section shows the 14-day Pro trial", /Pro trial, 14 days left/.test(await page.locator("[data-test=plan]").innerText()), await page.locator("[data-test=plan]").innerText());
  const exp = await ctx.request.get(BASE + "/api/account/export");
  ok("the export is one JSON file with the profile in it", exp.status() === 200 && (await exp.json()).profile.email === "e2e@example.com");
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  ok("the setup step goes away once the profile has a name", (await page.locator("[data-test=setup-step]").count()) === 0);

  // ---- New proposal: pick a template, land in the editor -------------------------------
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /new proposal/i }).first().click();
  await page.waitForURL("**/app/templates", { timeout: 10000 });
  await page.waitForSelector("[data-template]");
  ok("New proposal shows the six templates and nothing else to decide", (await page.locator("[data-template]").count()) === 6 && (await page.getByRole("radio").count()) === 0);
  ok("the gallery never shows an email address", !(await page.locator("main").innerText()).includes("@"));
  const tp = await ctx.request.get(BASE + "/t/web-project");
  const tpHtml = await tp.text();
  ok("template preview renders the real client page", tp.status() === 200 && tpHtml.includes("Website redesign") && tpHtml.includes("Prepared for Alex Morgan") && tpHtml.includes("Northwind Studio"));
  ok("template preview may be framed by our own gallery only", tp.headers()["x-frame-options"] === "SAMEORIGIN");
  ok("unknown template preview is 404", (await ctx.request.get(BASE + "/t/nope")).status() === 404);
  await page.getByRole("button", { name: "Use Website project" }).click();
  await page.waitForURL("**/app/p/*", { timeout: 15000 });
  await page.waitForSelector(".bn-editor");
  const templId = page.url().split("/").pop();
  const g0 = await get("/api/proposals/" + templId);
  ok("the new proposal uses the template's style and the brand colour", g0.proposal.style === "bold" && g0.proposal.accentColor === null);
  ok("editor cover carries the title and the brand name", (await page.locator("[data-test=cover] textarea").inputValue()) === "Website redesign" && (await page.locator("[data-test=cover] input[aria-label='Sender name']").inputValue()) === "Northwind Studio");
  ok("no email anywhere in the editor", !(await page.locator("main").innerText()).includes("@"));
  const bandBg = await page.evaluate(() => {
    const h = [...document.querySelectorAll(".bn-editor h2")].find((x) => x.textContent?.trim() === "What you get");
    const outer = h?.closest(".bn-block-outer");
    return outer ? getComputedStyle(outer).backgroundColor : "";
  });
  ok("a highlighted heading bands its whole section in the editor", bandBg !== "" && bandBg !== "rgba(0, 0, 0, 0)", bandBg);

  // ---- Cover: client and sender edited in place --------------------------------------------
  await page.locator("[data-test=cover] input[aria-label='Client name']").fill("Bramble & Co");
  await page.locator("[data-test=cover] input[aria-label='Sender name']").fill("Northwind Studio Inc");
  await page.waitForTimeout(1200);
  const g1 = await get("/api/proposals/" + templId);
  ok("client name typed on the cover is saved to the proposal", g1.proposal.clientName === "Bramble & Co");
  ok("sender name typed on the cover is this proposal's sender; the business name stays put", g1.proposal.senderName === "Northwind Studio Inc" && (await get("/auth/me")).user.brandName === "Northwind Studio", JSON.stringify([g1.proposal.senderName, (await get("/auth/me")).user.brandName]));
  await page.locator("[data-test=cover] input[aria-label='Sender name']").fill("");
  await page.waitForTimeout(900);
  const titleBox = page.locator("[data-test=cover] textarea");
  ok("cover title never shows a scrollbar", await titleBox.evaluate((el) => getComputedStyle(el).overflowY === "hidden" && el.scrollHeight <= el.clientHeight + 2));

  // ---- The panel: client email is right there; everything else is under More options ------
  const aside = page.locator("aside");
  ok("the panel shows client, email, send and pricing; options wait on their own tab", (await aside.locator("[data-test=send-card]").count()) === 1 && (await aside.locator("[data-test=send-button]").count()) === 1 && (await page.locator("header").getByRole("button", { name: /^send$/i }).count()) === 1 && (await aside.locator("[data-test=more-options]").count()) === 0 && (await aside.getByRole("tab").count()) === 2);
  await page.fill("#clientEmail", "cfo@bramble.example");
  await aside.locator("[data-test=send-card]").getByRole("button", { name: /add another recipient/i }).click();
  await page.getByLabel("Recipient 2").fill("ops@bramble.example");
  await aside.getByRole("tab", { name: /options/i }).click();
  await aside.getByRole("button", { name: /add an email/i }).click();
  await page.getByLabel("Also notify 1").fill("accounts@northwind.example");
  await page.locator("[data-test=phone-preview]").click();
  const phoneFrame = page.locator("[data-test=phone-frame]");
  await phoneFrame.waitFor({ timeout: 10000 });
  const phoneDoc = page.frameLocator("[data-test=phone-frame]");
  await phoneDoc.locator("h1").waitFor({ timeout: 15000 });
  ok("the phone preview shows the live client page at phone width", Math.round((await phoneFrame.boundingBox()).width) === 370 && (await phoneDoc.locator("h1").innerText()) === "Website redesign" && (await phoneDoc.locator(".ribbon").count()) === 0);
  await page.keyboard.press("Escape");
  await aside.locator("[data-test=style-menu]").click();
  ok("the style row opens a picker with every style and colour", (await aside.getByRole("radiogroup", { name: "Page style" }).getByRole("radio").count()) === 6 && (await aside.getByRole("radiogroup", { name: "Accent colour" }).getByRole("radio").count()) === 6);
  await aside.getByRole("radiogroup", { name: "Page style" }).getByRole("radio", { name: "Editorial" }).click();
  await aside.getByRole("textbox", { name: /colour hex/i }).fill("#6941c6");
  await page.getByLabel("Signed by").fill("Alex at Northwind");
  await page.waitForTimeout(1300);
  const g2 = await get("/api/proposals/" + templId);
  ok("recipient, notify list, style, colour and sender override are saved", g2.proposal.clientEmail === "cfo@bramble.example" && JSON.stringify(g2.proposal.ccEmails) === JSON.stringify(["ops@bramble.example"]) && JSON.stringify(g2.proposal.notifyEmails) === JSON.stringify(["accounts@northwind.example"]) && g2.proposal.style === "editorial" && g2.proposal.accentColor === "#6941c6" && g2.proposal.senderName === "Alex at Northwind", JSON.stringify([g2.proposal.ccEmails, g2.proposal.notifyEmails, g2.proposal.style, g2.proposal.accentColor, g2.proposal.senderName]));
  ok("the cover follows the style and the sender override", (await page.locator("[data-test=cover]").getAttribute("data-cover-style")) === "editorial" && (await page.locator("[data-test=cover] input[aria-label='Sender name']").inputValue()) === "Alex at Northwind");
  await aside.getByRole("button", { name: /back to my brand colour/i }).click();
  await page.waitForTimeout(1000);
  ok("one click returns the proposal to the brand colour", (await get("/api/proposals/" + templId)).proposal.accentColor === null);

  // ---- The plus button opens the block menu right there ----------------------------------------
  const h2Terms = page.locator(".bn-editor h2", { hasText: "Terms" });
  await h2Terms.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await page.waitForTimeout(300);
  const yBefore = await page.evaluate(() => window.scrollY);
  await h2Terms.hover();
  await page.waitForTimeout(300);
  await page.locator(".bn-side-menu button").first().click();
  await page.waitForTimeout(500);
  const yAfter = await page.evaluate(() => window.scrollY);
  ok("clicking the plus keeps the page where it is and opens the block menu", Math.abs(yAfter - yBefore) < 60 && (await page.getByText("Pricing table", { exact: true }).count()) > 0, JSON.stringify({ yBefore, yAfter }));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(1000);

  // ---- Save as template, use it from the gallery ------------------------------------------
  await aside.getByRole("button", { name: /save as template/i }).click();
  await page.getByRole("textbox", { name: /template name/i }).fill("Bramble starter");
  await page.getByRole("button", { name: /^save template$/i }).click();
  await page.getByRole("status").waitFor({ timeout: 10000 });
  const tplList = await get("/api/templates");
  ok("Save as template keeps the proposal as a reusable template", tplList.templates.some((t) => t.name === "Bramble starter"));
  await page.goto(BASE + "/app/templates", { waitUntil: "networkidle" });
  const savedSec = page.locator("[data-test=saved-templates]");
  await savedSec.waitFor({ timeout: 10000 });
  ok("saved templates show first, with a live preview", (await savedSec.getByText("Bramble starter").count()) === 1 && (await savedSec.locator("iframe").getAttribute("src")).includes("/t/u/"));
  await savedSec.getByRole("button", { name: /^Use Bramble starter/ }).click();
  await page.waitForURL("**/app/p/*", { timeout: 15000 });
  const fromSaved = await get("/api/proposals/" + page.url().split("/").pop());
  ok("a proposal made from a saved template carries its content and look", fromSaved.proposal.title === "Website redesign" && fromSaved.items.length === 4 && fromSaved.proposal.style === "editorial");
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  await ctx.request.delete(BASE + "/api/proposals/" + fromSaved.proposal.id);
  for (const t of tplList.templates) await ctx.request.delete(BASE + "/api/templates/" + t.id);

  // ---- Client side: a question and reading time reach the sender ---------------------------
  const sent = await (await ctx.request.post(BASE + "/api/proposals/" + templId + "/send")).json();
  const qctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const qp = await qctx.newPage();
  await qp.goto(BASE + new URL(sent.link).pathname, { waitUntil: "networkidle" });
  ok("the client page carries every heading as a section in its nav", (await qp.locator(".topnav .links").innerText()).includes("What you get"));
  ok("the client page uses the sender override", (await qp.locator(".cover").innerText()).includes("Alex at Northwind"));
  await qp.fill("#askName", "Sam Client");
  await qp.fill("#askEmail", "sam@bramble.example");
  await qp.fill("#askBody", "Is delivery included in the price?");
  await qp.getByRole("button", { name: /send question/i }).click();
  await qp.locator("#askDone").waitFor({ state: "visible", timeout: 10000 });
  ok("client can send a question from the proposal page", await qp.locator("#askDone").isVisible());
  const engaged = await qp.evaluate(async () => {
    const secs = [...document.querySelectorAll("section.sec[id]")].slice(0, 3).map((el, i) => ({ id: el.id, title: el.getAttribute("data-title") || el.id, seconds: 40 + i * 10 }));
    const r = await fetch(location.pathname + "/engage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections: secs }) });
    return { status: r.status, first: secs[1]?.title };
  });
  ok("reading time beacons are accepted from the client page", engaged.status === 204, String(engaged.status));
  await qctx.close();
  const an = await get("/api/proposals/" + templId + "/analytics");
  ok("analytics report reading time per section in document order", an.readSeconds === 150 && an.sections.some((x) => x.title === engaged.first && x.seconds === 50) && an.opens >= 1 && an.byDay.length === 14, JSON.stringify({ read: an.readSeconds, opens: an.opens }));
  const qs = await get("/api/proposals/" + templId + "/messages");
  ok("the question is stored for the sender", qs.messages.length === 1 && qs.messages[0].email === "sam@bramble.example");
  await page.goto(BASE + "/app/p/" + templId, { waitUntil: "networkidle" });
  await page.waitForSelector(".bn-editor");
  ok("the question shows in the editor panel", (await page.locator("aside").getByText("Is delivery included in the price?").count()) === 1);

  // ---- Dashboard: one sentence per proposal, analytics one click away ------------------------
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  const rowA = page.locator("[data-row-menu]").filter({ has: page.locator(`a[href="/app/p/${templId}"]`) });
  const journey = await rowA.locator("[data-test=journey]").innerText();
  ok("the row shows the journey: sent, opened once with reading time, not yet signed", /Sent/.test(journey) && /Opened once/.test(journey) && /3 min read/.test(journey) && /Not yet/.test(journey), journey);
  await rowA.locator("[data-test=resend]").click();
  await rowA.getByText(/Sent again to cfo@bramble.example/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  ok("resending from the row emails the client again and the row counts it", /Sent 2×/.test(await rowA.locator("[data-test=journey]").innerText()), await rowA.locator("[data-test=journey]").innerText());
  await page.fill("[aria-label='Search proposals']", "bramble");
  await page.waitForTimeout(300);
  const shown = await page.locator("main > ul > li[data-row-menu]").count();
  const all = (await get("/api/proposals")).proposals.filter((p) => p.status !== "archived").length;
  ok("search narrows the list to the client", shown >= 1 && (await rowA.count()) === 1 && shown < all, JSON.stringify({ shown, all, rowA: await rowA.count(), toolbar: await page.locator("[data-test=toolbar]").count(), value: await page.locator("[aria-label='Search proposals']").inputValue().catch(() => "n/a") }));
  await page.getByRole("radio", { name: /^Declined/ }).click();
  ok("a filter with no matches explains itself", (await page.getByText("Nothing matches").count()) === 1);
  await page.getByRole("button", { name: /show everything/i }).click();
  await rowA.getByRole("button", { name: "More" }).click();
  await rowA.locator("[data-test=analytics-summary]").click();
  const panel = page.locator("[data-test=analytics]");
  await panel.getByText("Time per section").waitFor({ timeout: 10000 });
  ok("Analytics opens the full picture", (await panel.getByText("Opens, last 14 days").count()) === 1 && (await panel.getByText(engaged.first, { exact: true }).count()) >= 1);
  await page.keyboard.press("Escape");
  ok("Escape closes the analytics panel", (await panel.count()) === 0);

  // ---- Rename and duplicate from the row menu -------------------------------------------------
  await rowA.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const box = page.getByRole("textbox", { name: "Proposal title" });
  await box.fill("Bramble website, v2");
  await box.press("Enter");
  await page.waitForTimeout(800);
  ok("renaming from the dashboard saves the new title", (await get("/api/proposals/" + templId)).proposal.title === "Bramble website, v2");
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  const rowM = page.locator("[data-row-menu]").filter({ has: page.locator(`a[href="/app/p/${templId}"]`) });
  await rowM.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.waitForURL("**/app/p/*", { timeout: 15000 });
  const dupId = page.url().split("/").pop();
  const gDup = await get("/api/proposals/" + dupId);
  ok("Duplicate opens a fresh draft copy in the editor", dupId !== templId && gDup.proposal.status === "draft" && gDup.proposal.title.endsWith("(copy)") && gDup.proposal.clientEmail === "cfo@bramble.example");
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  await ctx.request.delete(BASE + "/api/proposals/" + dupId);
  await ctx.request.delete(BASE + "/api/proposals/" + templId);
  await ctx.request.put(BASE + "/auth/me", { data: { brandName: "" } });

  // ---- Every template creates a proposal -----------------------------------------------
  for (const t of ["blank", "web-project", "consulting", "retainer", "photography", "software"]) {
    const r = await ctx.request.post(BASE + "/api/proposals", { data: { template: t } });
    const { id } = await r.json();
    const g = await get(`/api/proposals/${id}`);
    ok(`template "${t}" creates a proposal with content`, r.status() === 201 && Array.isArray(g.proposal.content) && g.proposal.content.length > 0);
    await ctx.request.delete(BASE + `/api/proposals/${id}`);
  }

  // ---- Editor: pricing panel math --------------------------------------------------------
  const created = await (await ctx.request.post(BASE + "/api/proposals", { data: { template: "web-project" } })).json();
  const pid = created.id;
  await page.goto(BASE + `/app/p/${pid}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bn-editor");
  const total = () => page.locator("aside").locator("[data-test=one-time-total]").innerText();
  ok("initial total is 4,500 + 1,200 (copywriting on by default)", (await total()) === money(570000, "USD"), await total());
  await page.getByRole("button", { name: /Design and build/ }).first().click();
  const qty = page.locator('input[id^="q-"]').first();
  await qty.fill("2");
  await page.waitForTimeout(150);
  ok("row header shows 2 x price after qty change", (await page.getByText(/2 × \$4,500\.00 USD/).count()) > 0);
  ok("total updates to 9,000 + 1,200", (await total()) === money(1020000, "USD"), await total());
  const price = page.locator('input[id^="p-"]').first();
  await price.fill("5000");
  await price.blur();
  await page.waitForTimeout(150);
  ok("total updates to 10,000 + 1,200 after price change", (await total()) === money(1120000, "USD"), await total());

  // ---- Default tax (Options tab) applies to every line; a line can override it -----------------
  const tabs = (name) => page.locator("aside").getByRole("tab", { name }).click();
  await tabs(/options/i);
  await page.fill("#taxRate", "13");
  await page.fill("#taxLabel", "HST");
  await tabs(/pricing/i);
  await page.getByRole("button", { name: /Design and build/ }).first().click();
  ok("default 13 % tax applies to all lines: (10,000 + 1,200) x 1.13", (await total()) === money(1265600, "USD"), await total());
  ok("in-document preview shows the tax label HST", (await page.locator(".bn-editor").getByText("HST", { exact: true }).count()) > 0);
  const tax0 = page.locator('input[id^="t-"]').first();
  await tax0.fill("0");
  await page.waitForTimeout(150);
  ok("a 0 override on one line removes tax there only: 10,000 + 1,356", (await total()) === money(1135600, "USD"), await total());
  await tax0.fill("");
  await page.waitForTimeout(150);
  ok("clearing the override returns to the default rate", (await total()) === money(1265600, "USD"), await total());
  await tabs(/options/i);
  await page.fill("#taxRate", "");
  await tabs(/pricing/i);
  ok("removing the default leaves no tax: 11,200", (await total()) === money(1120000, "USD"), await total());
  await page.getByRole("button", { name: /Design and build/ }).first().click();
  ok("no tax rows in the preview when the rate is zero", (await page.locator(".bn-editor").getByText("Subtotal").count()) === 0);
  await tax0.fill("13");
  await tax0.blur();
  await page.waitForTimeout(150);
  ok("with no proposal rate yet, the first rate typed on a line becomes the rate for every line: 11,200 x 1.13", (await total()) === money(1265600, "USD"), await total());
  await page.waitForTimeout(200);
  const previewTotal = await page.locator(".bn-editor").getByText(/^(Total|One-time) /).first().innerText();
  ok("in-document pricing preview matches the panel total", previewTotal.includes(money(1265600, "USD")), previewTotal);
  await page.waitForTimeout(1200);
  const saved = await get(`/api/proposals/${pid}`);
  const first = saved.items.find((i) => i.name === "Design and build");
  ok("autosave persisted qty 2, price 5,000, and the 13 % rate landed on the proposal, not the line", first && first.quantity === 2 && first.unitAmount === 500000 && first.taxRateBps === null && saved.proposal.taxRateBps === 1300, JSON.stringify([first, saved.proposal.taxRateBps]));

  // ---- Client and currency ----------------------------------------------------------------
  await page.fill("#clientName", "Bramble & Co");
  await page.fill("#clientEmail", "hello@bramble.example");
  await tabs(/options/i);
  await page.selectOption("#currency", "CAD");
  await page.waitForTimeout(1000);
  await tabs(/pricing/i);
  const d2 = await get(`/api/proposals/${pid}`);
  ok("client, email and currency autosave", d2.proposal.clientName === "Bramble & Co" && d2.proposal.clientEmail === "hello@bramble.example" && d2.proposal.currency === "CAD");
  ok("panel total switches to CAD", (await total()) === money(1265600, "CAD"), await total());

  // ---- Send ------------------------------------------------------------------------------------
  await page.locator("header").getByRole("button", { name: /^send$/i }).click();
  const sendDialog = page.getByRole("dialog");
  ok("the send dialog carries the client email and a place for a note", (await sendDialog.locator("#sendEmail").inputValue()) === "hello@bramble.example" && (await sendDialog.locator("#sendMessage").count()) === 1);
  await sendDialog.locator("#sendMessage").fill("Hi Bramble team, here is the proposal we discussed.");
  const sendLog = logSize();
  await sendDialog.getByRole("button", { name: /^send$/i }).click();
  const linkInput = page.getByRole("dialog").locator("input[readonly]");
  await linkInput.waitFor({ timeout: 10000 });
  const publicUrl = await linkInput.inputValue();
  ok("send returns a public link", /\/p\/[0-9a-f-]{36}$/.test(publicUrl), publicUrl);
  ok("the note travels in the email above the link", (await logSince(sendLog)).includes("Hi Bramble team, here is the proposal we discussed."));
  await page.getByRole("button", { name: "Close" }).click();
  const afterSend = await get(`/api/proposals/${pid}`);
  ok("status is sent", afterSend.proposal.status === "sent", afterSend.proposal.status);
  ok("the panel offers Send again and Copy link after sending", (await page.locator("aside").getByRole("button", { name: /send again/i }).count()) === 1 && (await page.locator("aside").getByRole("button", { name: /copy link/i }).count()) === 1);

  // ---- Client side: anonymous phone --------------------------------------------------------
  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await client.newPage();
  cp.on("pageerror", (e) => errors.push(`client: ${e.message}`));
  const pubPath = new URL(publicUrl).pathname;
  await cp.goto(BASE + pubPath, { waitUntil: "networkidle" });
  await cp.evaluate(() => window.scrollTo(0, 1500));
  await cp.waitForTimeout(700);
  const scrolledTo = await cp.evaluate(() => window.scrollY);
  ok("scrolling down the client page stays down (the nav highlighter never pulls the page up)", scrolledTo >= 1400, String(scrolledTo));
  const ctotal = () => cp.locator("[data-total]").innerText();
  ok("client page opens with the sender's total in CAD", (await ctotal()) === money(1265600, "CAD"), await ctotal());
  const copy = saved.items.find((i) => i.name === "Copywriting");
  const pages = saved.items.find((i) => i.name === "Extra pages");
  await cp.locator(`[data-item="${copy.id}"]`).click({ force: true });
  await cp.waitForTimeout(150);
  ok("client switches copywriting off: total drops by 1,200", (await ctotal()) === money(1130000, "CAD"), await ctotal());
  await cp.locator(`[data-item="${pages.id}"]`).click({ force: true });
  await cp.locator(`[data-qty="${pages.id}"]`).fill("3");
  await cp.waitForTimeout(150);
  ok("client adds 3 extra pages at 600, taxed like everything else: (10,000 + 1,800) x 1.13", (await ctotal()) === money(1333400, "CAD"), await ctotal());
  await cp.fill("#signerName", "Alex Morgan");
  await cp.fill("#signerEmail", "alex@bramble.example");
  await cp.check('input[name="consent"]');
  await cp.getByRole("button", { name: /accept proposal/i }).click();
  await cp.waitForURL(/accepted=1/, { timeout: 15000 });
  ok("acceptance redirects to the accepted page", cp.url().includes("accepted=1"));
  ok("accepted page names the signer", (await cp.locator("body").innerText()).includes("Accepted by Alex Morgan"));
  const rec = await (await client.request.get(BASE + pubPath + "/record.json")).json();
  ok("record total equals what the client chose (13,334 CAD)", rec.acceptance.totalAmount === 1333400 && rec.acceptance.currency === "CAD");
  ok("record hash is 64 hex chars and matches current content", /^[0-9a-f]{64}$/.test(rec.acceptance.contentHash) && rec.acceptance.contentHashMatchesCurrentContent === true);
  ok("record lists 3 extra pages and no copywriting", rec.acceptance.selectedItems.some((s) => s.id === pages.id && s.quantity === 3) && !rec.acceptance.selectedItems.some((s) => s.id === copy.id));
  await client.close();

  // ---- Sender side after acceptance ----------------------------------------------------------------
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  ok("dashboard shows Accepted badge", (await page.getByText("Accepted", { exact: true }).count()) > 0);
  await page.goto(BASE + `/app/p/${pid}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bn-editor");
  ok("accepted proposal is locked in the editor", (await page.getByText(/Editing is locked/).count()) > 0);
  const del = await ctx.request.delete(BASE + `/api/proposals/${pid}`);
  ok("accepted proposal cannot be deleted (409)", del.status() === 409, String(del.status()));

  // ---- Archive and delete a draft via the dashboard menu -------------------------------------------
  const draft = await (await ctx.request.post(BASE + "/api/proposals", { data: { template: "retainer" } })).json();
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  const row = page.locator("[data-row-menu]").filter({ has: page.locator(`a[href="/app/p/${draft.id}"]`) });
  await row.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForTimeout(600);
  ok("archiving removes the row from the main list and shows an Archived filter", (await row.count()) === 0 && (await page.getByRole("radio", { name: /^Archived/ }).count()) === 1);
  await page.getByRole("radio", { name: /^Archived/ }).click();
  const arow = page.locator("main > ul > li[data-row-menu]").filter({ has: page.locator(`a[href="/app/p/${draft.id}"]`) });
  ok("the Archived filter lists it with its Archived badge", (await arow.count()) === 1 && (await arow.innerText()).includes("Archived"));
  page.once("dialog", (d) => d.accept());
  await arow.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.waitForTimeout(600);
  ok("delete removes the proposal", (await ctx.request.get(BASE + `/api/proposals/${draft.id}`)).status() === 404);
  await ctx.request.post(BASE + `/api/proposals/${pid}/archive`);
} catch (e) {
  ok("script completed without throwing", false, e.message);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.pass ? "" : "  → " + r.detail}`);
if (errors.length) console.log("\nPAGE ERRORS:\n" + errors.join("\n"));
else console.log("\nno page errors");
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
