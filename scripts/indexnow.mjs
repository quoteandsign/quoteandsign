// Tell IndexNow (Bing, and the assistants that search through it) about every public page.
// Runs on the operator's machine after a deploy, because IndexNow throttles requests coming from
// Cloudflare's shared outbound addresses; the Worker's daily attempt stays as a backup.
const site = process.env.APP_URL ?? "https://quoteandsign.com";
const key = (await (await fetch(`${site}/indexnow.txt`)).text()).trim();
if (!/^[0-9a-f]{32}$/.test(key)) throw new Error("could not read the IndexNow key from the site");
const xml = await (await fetch(`${site}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const body = JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/indexnow.txt`, urlList: urls });
const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body });
console.log(`IndexNow: ${res.status} for ${urls.length} pages${res.status === 200 || res.status === 202 ? " (accepted)" : ""}`);
if (!(res.status === 200 || res.status === 202)) process.exitCode = 1;
