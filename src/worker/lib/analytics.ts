// Optional Google Analytics on the marketing pages, loaded only after the visitor agrees.
// The measurement id is set in the admin area and kept in the settings table. Proposal pages
// never carry analytics: a client reading a proposal did not sign up for anything.

import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "./db";

export const ANALYTICS_KEY = "analytics_id";
/** GA4 measurement ids (G-XXXX) and Tag Manager containers (GTM-XXXX). */
export const ANALYTICS_ID = /^(G-[A-Z0-9]{4,20}|GTM-[A-Z0-9]{4,12})$/;

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string | null): Promise<void> {
  if (value === null || value === "") {
    await db.delete(schema.settings).where(eq(schema.settings.key, key));
    return;
  }
  await db.insert(schema.settings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

/** The configured analytics id, or null when analytics is off. */
export async function analyticsId(d1: D1Database): Promise<string | null> {
  try {
    const v = await getSetting(getDb(d1), ANALYTICS_KEY);
    return v && ANALYTICS_ID.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** What the page's Content Security Policy must allow for Google's script to load and report. */
export function analyticsCsp(id: string | null): { script: string; connect: string; img: string } {
  if (!id) return { script: "", connect: "", img: "" };
  return {
    script: " https://www.googletagmanager.com",
    connect: " https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
    img: " https://www.googletagmanager.com https://*.google-analytics.com",
  };
}

export const CONSENT_CSS = `
.consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:60;max-width:560px;margin:0 auto;background:var(--card,#fff);color:var(--fg,#191816);border:1px solid var(--line,#e6e2da);border-radius:16px;padding:16px 18px;box-shadow:0 20px 60px -20px rgba(25,24,22,.35);font-size:14px;line-height:1.55}
.consent p{margin:0 0 12px}.consent a{color:inherit}
.consent .row{display:flex;gap:8px;flex-wrap:wrap}
.consent button{font:inherit;font-weight:600;border-radius:999px;padding:9px 16px;border:1px solid var(--line,#e6e2da);background:transparent;color:inherit;cursor:pointer}
.consent button.yes{background:var(--accent,#2b3f8c);color:#fff;border-color:transparent}
.consent[hidden]{display:none}`;

/**
 * The consent banner and the loader. Nothing from Google is fetched until "Allow" is clicked;
 * the choice lives in the visitor's browser and a "Cookie settings" link reopens the banner.
 */
export function consentMarkup(nonce: string, id: string): string {
  return `
<div class="consent" id="consent" hidden role="dialog" aria-label="Cookie choice">
  <p><b>Analytics cookies?</b> We would like to use Google Analytics to see which pages help people and which do not. It sets cookies and sends page views to Google. Nothing is loaded unless you allow it. <a href="/privacy">Privacy policy</a>.</p>
  <div class="row"><button type="button" class="yes" id="consentYes">Allow</button><button type="button" id="consentNo">Decline</button></div>
</div>
<script nonce="${nonce}">
(function(){
  var ID=${JSON.stringify(id)},KEY="qs-consent",box=document.getElementById("consent");
  function read(){try{return localStorage.getItem(KEY)}catch(e){return null}}
  function write(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  function load(){
    if(window.__qsGa)return;window.__qsGa=true;
    window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
    gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
    gtag("js",new Date());gtag("config",ID,{anonymize_ip:true});
    var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(ID);document.head.appendChild(s);
  }
  function show(){if(box)box.hidden=false}
  function hide(){if(box)box.hidden=true}
  var c=read();
  if(c==="granted")load();else if(c!=="denied")show();
  var yes=document.getElementById("consentYes"),no=document.getElementById("consentNo");
  if(yes)yes.addEventListener("click",function(){write("granted");hide();load()});
  if(no)no.addEventListener("click",function(){write("denied");hide()});
  document.querySelectorAll("[data-cookie-settings]").forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();show()})});
})();
</script>`;
}
