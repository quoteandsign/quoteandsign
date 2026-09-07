import { consentMarkup, CONSENT_CSS } from "./analytics";
// The legal pages: Terms, Privacy, Acceptable Use, and a standard DPA. Server-rendered like the
// homepage, plain English, one HTML response each. Review by a lawyer before launch is still the
// right call; these are a careful starting point, not legal advice.
import { esc } from "./render";

export const LEGAL = {
  operator: "Quote and Sign",
  shortName: "Quote and Sign",
  privacyOfficer: "the Privacy Officer", // the person's name is given on request, as PIPEDA allows
  province: "Ontario", // governing law and courts; change if the business is registered elsewhere
  effective: "September 6, 2026",
  contact: "hello@quoteandsign.com",
  abuse: "abuse@quoteandsign.com",
  privacyEmail: "privacy@quoteandsign.com",
} as const;

const CSS = `
@font-face{font-family:"Geist";src:url("/fonts/Geist-Variable.woff2") format("woff2");font-weight:100 900;font-display:swap}
:root{--bg:#fbfaf7;--fg:#191816;--muted:#5f5b55;--line:#e6e2da;--accent:#2b3f8c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 "Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.top{max-width:760px;margin:0 auto;padding:22px 20px;display:flex;justify-content:space-between;align-items:center;font-size:14px}
.top .brand{font-weight:600;color:var(--fg);text-decoration:none;display:flex;gap:10px;align-items:center}.top .brand i{width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block}
.top nav a{color:var(--muted);text-decoration:none;margin-left:18px}.top nav a:hover{color:var(--fg)}
main{max-width:760px;margin:0 auto;padding:24px 20px 96px}
h1{font-size:clamp(34px,5vw,46px);line-height:1.05;letter-spacing:-.035em;margin:24px 0 8px;font-weight:650}
.eff{color:var(--muted);font-size:14px;margin:0 0 36px}
h2{font-size:22px;letter-spacing:-.02em;margin:40px 0 10px;font-weight:650}
h3{font-size:17px;margin:24px 0 6px;font-weight:600}
p,li{max-width:68ch}ul{padding-left:1.2em}li{margin:.35em 0}
.box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:20px 0}
.muted{color:var(--muted)}
footer{max-width:760px;margin:0 auto;padding:0 20px 48px;font-size:13.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px 20px}footer a{color:inherit;text-decoration:none}footer a:hover{color:var(--fg)}
@media(max-width:600px){.top nav a{margin-left:12px}}
`;

function shell(title: string, body: string, nonce: string, extraHead = "", analytics: string | null = null): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(LEGAL.shortName)}</title>
<meta name="description" content="${esc(title)} for ${esc(LEGAL.shortName)}.">
<link rel="icon" href="/brand/mark.svg" type="image/svg+xml">
<link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/brand/site.webmanifest">
<meta name="theme-color" content="#2b3f8c">
<style nonce="${nonce}">${CSS}${CONSENT_CSS}</style>
${extraHead}
</head>
<body>
<div class="top"><a class="brand" href="/"><i></i>${esc(LEGAL.shortName)}</a><nav><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/acceptable-use">Acceptable use</a><a href="/dpa">DPA</a></nav></div>
<main>
${body}
</main>
<footer><span>${esc(LEGAL.operator)}</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/acceptable-use">Acceptable use</a><a href="/dpa">DPA</a>${analytics ? `<a href="#" data-cookie-settings>Cookie settings</a>` : ""}<a href="/">Home</a></footer>
${analytics ? consentMarkup(nonce, analytics) : ""}
</body>
</html>`;
}

/** The contact form: a ticket for us, an acknowledgement for them. Turnstile when configured. */
export function renderContact(nonce: string, o: { siteKey: string | null; email?: string | null; name?: string | null; kind?: string | null; analytics?: string | null }): string {
  const kinds: [string, string][] = [["question", "A question"], ["billing", "Billing"], ["bug", "Something is broken"], ["abuse", "Report a proposal or email"], ["other", "Something else"]];
  return shell("Contact", `
<h1>Contact</h1>
<p class="eff">Ask anything about ${esc(LEGAL.shortName)}, report a problem, or flag a proposal page or email that should not exist. We answer by email, usually within one business day.</p>
<form id="contact" class="box" novalidate>
  <p><label for="name">Your name</label><br><input id="name" name="name" required maxlength="120" value="${esc(o.name ?? "")}"></p>
  <p><label for="email">Email</label><br><input id="email" name="email" type="email" required maxlength="254" value="${esc(o.email ?? "")}"></p>
  <p><label for="kind">About</label><br><select id="kind" name="kind">${kinds.map(([v, l]) => `<option value="${v}"${v === o.kind ? " selected" : ""}>${l}</option>`).join("")}</select></p>
  <p><label for="subject">Subject</label><br><input id="subject" name="subject" required maxlength="160"></p>
  <p><label for="message">Message</label><br><textarea id="message" name="message" required minlength="5" maxlength="5000" rows="6"></textarea></p>
  <p class="hp"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></p>
  ${o.siteKey ? `<div class="cf-turnstile" data-sitekey="${esc(o.siteKey)}"></div>` : ""}
  <p><button type="submit" id="send">Send message</button></p>
  <p class="err" id="err" role="alert"></p>
</form>
<p class="ok" id="done" hidden></p>
<p class="muted">Reports about a specific proposal page or email are handled first. Include the link.</p>
<style nonce="${nonce}">
label{font-size:13.5px;font-weight:600}input,select,textarea{font:inherit;width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:6px}
textarea{resize:vertical}input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
button{font:inherit;font-weight:600;font-size:15px;padding:12px 22px;border:0;border-radius:999px;background:var(--accent);color:#fff;cursor:pointer}button[disabled]{opacity:.6}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.err{color:#b91c1c;font-size:14px;min-height:1.2em}.ok{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px}
</style>
<script nonce="${nonce}">
(function(){var f=document.getElementById("contact");if(!f)return;f.addEventListener("submit",function(e){e.preventDefault();var b=document.getElementById("send"),err=document.getElementById("err");err.textContent="";
var fd=new FormData(f);var body={name:fd.get("name"),email:fd.get("email"),kind:fd.get("kind"),subject:fd.get("subject"),message:fd.get("message"),website:fd.get("website")||""};var t=fd.get("cf-turnstile-response");if(t)body.turnstile=t;
if(!body.name||!body.email||!body.subject||!body.message||String(body.message).length<5){err.textContent="Add your name, a working email, a subject and a message.";return}
b.disabled=true;b.textContent="Sending…";
fetch("/api/contact",{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){if(x.ok){f.hidden=true;var d=document.getElementById("done");d.hidden=false;d.textContent="Thanks. Your message is in, reference #"+x.j.ref+". Look out for a reply from us by email."}else{err.textContent=x.j.error||"Something went wrong.";b.disabled=false;b.textContent="Send message";if(window.turnstile){try{window.turnstile.reset()}catch(e){}}}}).catch(function(){err.textContent="Network error. Try again.";b.disabled=false;b.textContent="Send message"})})})();
</script>
`, nonce, o.siteKey ? `<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "", o.analytics ?? null);
}

export function renderTerms(nonce: string, analytics: string | null = null): string {
  return shell("Terms of Service", `
<h1>Terms of Service</h1>
<p class="eff">Effective ${LEGAL.effective}. These terms are a contract between you and ${esc(LEGAL.operator)} ("we", "us"). By creating an account or using the service you agree to them. If you use the service for a company, you confirm you may bind that company.</p>

<h2>1. What the service is</h2>
<p>${esc(LEGAL.shortName)} lets you write a proposal or quote, send a link to your client, and receive an electronic acceptance. We provide the tool. We are not a party to any agreement between you and your client, we do not review proposals, and we give no legal, tax or business advice. The words, prices and terms in a proposal are yours.</p>

<h2>2. Accounts</h2>
<ul>
<li>You sign in with a one-time link sent to your email. Keep that inbox secure; anyone with access to it can use your account.</li>
<li>You must be at least 18 and provide a working email address. One person may hold one account; a Business plan may add team members who each use their own email.</li>
<li>You are responsible for everything done through your account, including by team members you invite.</li>
<li>Service emails (sign-in links, "your proposal was accepted", trial and billing notices) are part of the service. Product news is separate, optional, and can be turned off from any such email or under Settings, Notifications.</li>
</ul>

<h2>3. Plans, trials and billing</h2>
<ul>
<li>New accounts get a 14-day trial of the Pro plan. When it ends the account moves to the Free plan; nothing is deleted, and signed proposals stay online.</li>
<li>Paid plans are billed monthly or yearly in advance through our payment provider, Polar, which is the merchant of record and handles payment details and applicable sales tax. We never see your card number.</li>
<li>Prices are shown on the pricing page and in your account before you pay. We may change prices with at least 30 days' notice by email; changes apply at your next renewal.</li>
<li>You can cancel at any time from your account. Cancelling stops future charges; the current period runs to its end and is not refunded, except where the law requires a refund or we choose to give one.</li>
<li>Unlimited proposals on paid plans means unlimited for ordinary business use. Automated or bulk creation, or use as general storage, is not ordinary use and we may limit it after telling you.</li>
</ul>

<h2>4. Electronic acceptance</h2>
<p>When a client accepts a proposal, we record the name they typed, their email address, the time, their IP address, the consent sentence they saw, the options they chose, and a cryptographic fingerprint of the exact proposal content. That record is made available to both parties and is designed to meet the requirements of the Canadian PIPEDA and provincial electronic commerce laws, the United States ESIGN and UETA acts, and the EU eIDAS regulation for ordinary electronic signatures.</p>
<p>Whether a given acceptance is binding depends on the laws that apply to you and your client, the content of the proposal, and facts we do not control. We do not guarantee that any acceptance is enforceable. If a document needs a witnessed, notarised or qualified signature, use a service designed for that.</p>

<h2>5. Your content</h2>
<ul>
<li>You own what you put in the service. You give us the limited licence needed to store it, show it to the people you send it to, email copies, and produce PDFs, for as long as your account or the signed record exists.</li>
<li>You are responsible for having the right to use everything you upload, including logos and images, and for what your proposals say.</li>
<li>Signed proposals are a record for two parties. If you delete your account, drafts and unsigned proposals are removed, and signed proposals remain readable at their links with your contact details removed, so your former clients keep their copy.</li>
<li>You can export everything at any time as JSON and PDF, from the Settings page.</li>
</ul>

<h2>6. Acceptable use</h2>
<p>The <a href="/acceptable-use">Acceptable Use Policy</a> is part of these terms. In short: no illegal content, no fraud or impersonation, no spam, no malware, no use of the service to store files, and nothing that harms the people you send proposals to. We may remove content, suspend or close accounts that break it, and we may report unlawful activity.</p>

<h2>7. Availability and changes</h2>
<p>We aim for the service to be available at all times but do not promise it. We may change or discontinue features. We will give reasonable notice of changes that remove something you rely on, and you can export your data at any time.</p>

<h2>8. Open source</h2>
<p>The software is released under the GNU AGPL v3. You may run your own copy under that licence. These terms cover the hosted service only.</p>

<h2>9. Disclaimer of warranties</h2>
<p>The service is provided "as is" and "as available". To the fullest extent the law allows, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, non-infringement, accuracy, and that the service will be uninterrupted or error-free. Some jurisdictions do not allow certain disclaimers; in that case they apply to the extent permitted.</p>

<h2>10. Limitation of liability</h2>
<div class="box">
<p>To the fullest extent the law allows: we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, lost business, lost data or lost deals, however caused. Our total liability for all claims arising out of or relating to the service is limited to the amount you paid us in the 12 months before the claim, or CAD $50 if you paid nothing.</p>
<p>Nothing in these terms limits liability that cannot be limited by law, including for fraud, gross negligence, or death or personal injury caused by negligence.</p>
</div>

<h2>11. Indemnity</h2>
<p>You will defend and indemnify us against claims, losses and costs (including reasonable legal fees) arising from your content, your proposals, your dealings with your clients, or your breach of these terms.</p>

<h2>12. Termination</h2>
<p>You may close your account at any time from the Settings page. We may suspend or close an account for breach of these terms or the Acceptable Use Policy, for non-payment, or where required by law. Sections 4, 5, 9, 10, 11 and 14 survive termination.</p>

<h2>13. Changes to these terms</h2>
<p>We may update these terms. For material changes we will email account holders at least 14 days before they take effect. Continued use after that date is acceptance of the new terms.</p>

<h2>14. Governing law</h2>
<p>These terms are governed by the laws of ${esc(LEGAL.province)} and the federal laws of Canada that apply there. Courts located in ${esc(LEGAL.province)} have exclusive jurisdiction, except that either party may seek an injunction anywhere. If you are a consumer with non-waivable rights under the law of your own country, those rights are unaffected.</p>

<h2>15. Contact</h2>
<p>Use the <a href="/contact">contact form</a>. Reports about a proposal page or email go through the <a href="/contact?kind=abuse">same form</a> and are handled first.</p>
`, nonce, "", analytics);
}

export function renderPrivacy(nonce: string, analytics: string | null = null): string {
  return shell("Privacy Policy", `
<h1>Privacy Policy</h1>
<p class="eff">Effective ${LEGAL.effective}. This policy explains what ${esc(LEGAL.shortName)} collects, why, and what you can do about it. It is written to meet Canada's PIPEDA, the EU and UK GDPR, and the California CCPA. The service is operated by ${esc(LEGAL.operator)}, based in ${esc(LEGAL.province)}, Canada, which is the controller of the data described here (except your clients' data in your proposals, where you are the controller and we act for you under the <a href="/dpa">Data Processing Addendum</a>). A designated Privacy Officer is accountable for this policy and can be reached through the <a href="/contact?kind=other">contact form</a>; their name and a postal address are provided on request.</p>
<div class="box"><p><strong>In short:</strong> we collect what is needed to send proposals and record acceptances, we never sell or share personal information for advertising, we use no trackers on proposal pages, and Google Analytics runs on the public pages only if you allow it. Account holders can export or delete everything themselves.</p></div>

<h2>Who this covers</h2>
<ul>
<li><strong>Account holders</strong>: people who sign in and send proposals.</li>
<li><strong>Recipients</strong>: people who open a proposal link, ask a question, decline or accept.</li>
<li><strong>Visitors</strong>: people who read the homepage.</li>
</ul>

<h2>What we collect and why</h2>
<h3>Account holders</h3>
<ul>
<li>Email address, to sign you in with a one-time link and to send you service emails such as "your proposal was opened".</li>
<li>Business name, color, logo, page style, payment link and team email addresses, to put on your proposals.</li>
<li>Your proposals: the text, prices, client names and client email addresses you enter.</li>
<li>Billing status from our payment provider (which plan, whether it is active). Card details never reach us.</li>
<li>A security log of sign-ins, sends and account changes, with a hashed IP address, kept 12 months.</li>
<li>If you leave the product-news box ticked when signing up, or tick it later, we record that choice with the time and a hashed IP address, and send you occasional product emails (a few a year). Every one has an unsubscribe link, and the setting is under Settings, Notifications.</li>
<li>Messages you send through the contact form, with the email address you give, so we can reply.</li>
</ul>
<h3>Recipients</h3>
<ul>
<li>When a proposal is opened: the time, a hashed IP address, the browser type and country, and how long each section stayed on screen. The sender sees counts and timings, never your IP address. These records belong to the proposal and are deleted with it.</li>
<li>When you ask a question or decline: the name, email and message you type, sent to the sender.</li>
<li>When you accept: the name you type, your email address, the time, your IP address and browser, the options you chose and the consent sentence you agreed to. This is the acceptance record. It exists to prove who agreed to what and when, and is shared with the sender and emailed to you. Your IP address is kept in the record because it is part of that proof.</li>
</ul>
<h3>Visitors</h3>
<p>Our hosting provider keeps short-lived server logs (IP address, page requested, time) to run the network and stop attacks. On the public pages (the homepage, sign-in, contact and these legal pages) we may also use Google Analytics, but only after you allow it in the cookie notice. If you allow it, Google receives the pages you view, a shortened IP address, and a browser identifier stored in a cookie; we use it to see which pages help people. Google's handling of that data is described in Google's privacy policy. Proposal pages your clients open never carry Google Analytics. No advertising trackers anywhere.</p>

<h2>Cookies</h2>
<p><b>Strictly necessary:</b> one cookie keeps you signed in, and one remembers a proposal password you entered. Neither tracks you across sites. Your theme choice is stored in your browser only.</p>
<p><b>Analytics, only with your consent:</b> if you click Allow in the cookie notice, Google Analytics sets its cookies (names beginning with <code>_ga</code>) for up to two years. Click Decline and none are set. You can change your mind at any time using the "Cookie settings" link at the bottom of any public page, or by clearing cookies for this site.</p>

<h2>Legal bases (GDPR)</h2>
<ul>
<li>Performance of a contract: providing the service to account holders.</li>
<li>Legitimate interests: security logs, fraud prevention, the acceptance record, service emails.</li>
<li>Consent: nothing is sent to you for marketing without it. You can withdraw consent at any time.</li>
<li>Legal obligation: keeping records where the law requires.</li>
</ul>

<h2>Who else sees data</h2>
<p>We use three service providers for the product and no others: <strong>Cloudflare</strong> (hosting, database, image storage and network security; data is encrypted at rest and in transit), <strong>Polar</strong> (payments; they see your email and billing details), and <strong>Resend</strong> (email delivery; they see the addresses and content of emails we send). <strong>Google</strong> (Google Analytics) receives data only from visitors to the public pages who clicked Allow, and never anything from proposals or accounts. We do not sell personal information and we do not share it for advertising. We disclose data when the law requires it or to protect people from harm, and we will tell you if we lawfully can.</p>

<h2>Where data lives</h2>
<p>Our infrastructure runs on Cloudflare's global network; data may be stored and processed in Canada, the United States and the EU. Transfers out of the EU and UK rely on standard contractual clauses held by our subprocessors.</p>

<h2>How long we keep it</h2>
<ul>
<li>Drafts and unsigned proposals: until you delete them or your account.</li>
<li>Signed proposals and acceptance records: as long as either party may need them, because they are the proof of an agreement. When an account is deleted, signed records stay readable at their links with the sender's contact details removed.</li>
<li>Sign-in links: 15 minutes. Sessions: 30 days. Security logs: 12 months. Rate-limit counters: 24 hours. Expired rows are removed by a nightly job.</li>
<li>Contact form messages: 12 months after the conversation closes.</li>
<li>Deleted accounts: your email address, name, logo and notification addresses are erased at once. An anonymous stub of the account remains only so that signed proposals keep working for your former clients.</li>
<li>Emails sent through Resend: per Resend's retention, typically 30 days of logs.</li>
</ul>

<h2>Your rights</h2>
<p>You can access, correct, export or delete your data. Account holders can do all of this from the Settings page: export everything as one file, or delete the account with a code we email you. Recipients, and anyone else, can ask through the <a href="/contact?kind=other">contact form</a> what we hold about them and have it corrected or deleted; we may ask you to confirm the email address the request is about. We answer within 30 days and never charge for it. Nothing changes in how we treat you for exercising a right. You may also complain to your privacy regulator: in Canada the Office of the Privacy Commissioner, in the EU your national authority, in the UK the ICO.</p>

<h2>Security</h2>
<p>Passwordless sign-in, encryption at rest and in transit, unguessable proposal links, optional link passwords and expiry, rate limits, strict content security policies, and uploads limited to images checked by content. No system is perfectly secure; if a breach creates a real risk of significant harm we will notify affected people and the regulator as soon as feasible, and in any case within 72 hours of confirming it where the GDPR applies.</p>

<h2>Children</h2>
<p>The service is for business use by adults. We do not knowingly collect data from anyone under 18.</p>

<h2>Changes</h2>
<p>We will post changes here with a new effective date and email account holders about material changes.</p>

<h2>Contact</h2>
<p>The Privacy Officer, ${esc(LEGAL.operator)}, through the <a href="/contact?kind=other">contact form</a>. The officer's name and a postal address are provided on request.</p>
`, nonce, "", analytics);
}

export function renderAcceptableUse(nonce: string, analytics: string | null = null): string {
  return shell("Acceptable Use Policy", `
<h1>Acceptable Use Policy</h1>
<p class="eff">Effective ${LEGAL.effective}. Part of the <a href="/terms">Terms of Service</a>. It exists to protect the people who receive proposals, other users, and the service itself.</p>

<h2>You may not use ${esc(LEGAL.shortName)} to</h2>
<ul>
<li>Send anything illegal, defamatory, harassing, hateful, or that infringes someone's copyright, trademark or privacy.</li>
<li>Pretend to be someone else or a business you do not represent, or make a proposal look like it comes from another company.</li>
<li>Commit fraud, phishing or scams, including fake invoices, fake deposits or "accept to claim" tricks.</li>
<li>Send unsolicited bulk proposals or use the sending feature as a mailing tool. Every recipient should be someone who expects to hear from you.</li>
<li>Upload anything other than images for your own proposals. The service is not file storage.</li>
<li>Upload malware, or link to it.</li>
<li>Probe, scan or attack the service, bypass rate limits or security controls, or automate account creation.</li>
<li>Collect data about recipients beyond what the service shows you.</li>
<li>Resell access or share one account between unrelated businesses.</li>
</ul>

<h2>What we do</h2>
<p>We may remove content, disable links, suspend or close accounts, and preserve or disclose records where required by law. For serious or repeated breaches we close the account without refund. Where the law requires, we report unlawful content to the authorities.</p>

<h2>Report abuse</h2>
<p>If a proposal page or email from this service is fraudulent, infringing or harmful, report it through the <a href="/contact?kind=abuse">contact form</a> with the link. We act on valid reports within two business days and take down clear cases immediately. Copyright owners may send a notice with the work, the location and their contact details; we follow the notice-and-notice rules of the Canadian Copyright Act and honour DMCA-style notices.</p>
`, nonce, "", analytics);
}

export function renderDpa(nonce: string, analytics: string | null = null): string {
  return shell("Data Processing Addendum", `
<h1>Data Processing Addendum</h1>
<p class="eff">Effective ${LEGAL.effective}. This addendum applies when you, an account holder, use ${esc(LEGAL.shortName)} to process personal data of your clients and the GDPR, UK GDPR or a similar law makes you the controller and us the processor. It forms part of the <a href="/terms">Terms of Service</a>. No signature is needed; it applies automatically.</p>

<h2>1. Roles</h2>
<p>You are the controller of the personal data in your proposals and of your recipients' data. We are the processor. For our own account data (your email, billing status, security logs) we are the controller and the <a href="/privacy">Privacy Policy</a> applies.</p>

<h2>2. Details of processing</h2>
<ul>
<li><strong>Subject matter</strong>: hosting, sending and recording acceptance of proposals.</li>
<li><strong>Duration</strong>: the life of your account, plus the retention of signed records described in the Privacy Policy.</li>
<li><strong>Nature and purpose</strong>: storage, display to recipients, email delivery, PDF generation, engagement counts, acceptance records.</li>
<li><strong>Data subjects</strong>: your clients and the people who open your proposals.</li>
<li><strong>Categories of data</strong>: names, email addresses, business details, prices and terms, IP addresses and browser details of recipients, typed signatures.</li>
</ul>

<h2>3. Our obligations</h2>
<ul>
<li>Process personal data only on your documented instructions, which are the Terms and your use of the product features, unless the law requires otherwise, in which case we tell you first where we may.</li>
<li>Keep the data confidential and ensure anyone with access is bound by confidentiality.</li>
<li>Apply the security measures in the Privacy Policy, and not reduce them during the term.</li>
<li>Help you respond to data subject requests: the product lets you export and delete, and we assist with the rest within 30 days.</li>
<li>Tell you without undue delay, and within 72 hours, if we become aware of a personal data breach affecting your data, with the information you need for your own notifications.</li>
<li>Delete or return the data at the end of the service, subject to the signed-record retention that protects both parties to an agreement and to legal holds.</li>
<li>Make available the information needed to show compliance and allow audits, at your cost and on reasonable notice, no more than once a year unless a regulator requires otherwise.</li>
</ul>

<h2>4. Subprocessors</h2>
<p>You authorise the subprocessors listed in the Privacy Policy: Cloudflare, Polar and Resend. Google Analytics, when enabled, processes only our own visitor data on the public pages and never your proposals or your clients' data, so it is not a subprocessor under this addendum. We will email account holders at least 14 days before adding a new one; you may object, and if we cannot resolve it you may close your account and export your data.</p>

<h2>5. International transfers</h2>
<p>Data may be processed in Canada, the United States and the EU. Canada holds an EU adequacy decision for PIPEDA-covered organisations. Transfers to the United States rely on standard contractual clauses in our subprocessors' agreements.</p>

<h2>6. Liability</h2>
<p>Liability under this addendum is subject to the limitations in the Terms of Service, to the extent the applicable law allows.</p>

<h2>7. Contact</h2>
<p>The Privacy Officer, ${esc(LEGAL.operator)}, through the <a href="/contact?kind=other">contact form</a>.</p>
`, nonce, "", analytics);
}
