# Reddit

Read each subreddit's rules the day you post. Post as text, not a link. Do not post to more than one subreddit on the same day. Answer questions in plain language and never argue.

## r/freelance

**Title:** I built a proposal tool with flat pricing because per-seat pricing made no sense for one person

**Body:**

I send a handful of proposals a month and every tool I tried priced me like a sales team: per user, then per document on top.

So I built Quote and Sign. You write the proposal, your client gets a link, they toggle the optional items on their phone and tap Accept, and you both get a signed PDF and a record of exactly what was agreed. Pricing is flat: free for three live proposals at a time, $19 a month for unlimited.

Two things I would genuinely like feedback on from people who send proposals for a living:
- Is "the client can change quantities within a range you set" useful to you, or do you want the price locked?
- What do you do today when a client wants to accept but has one change?

It is open source (AGPL) at github.com/quoteandsign/quoteandsign, and the hosted version is at quoteandsign.com. Fourteen-day trial, no card.

## r/webdev

**Title:** Shipped a full SaaS on Cloudflare's free tier: one Worker, D1, no servers. Notes on what that constrained.

**Body:**

Quote and Sign is a proposal tool (write a proposal, client accepts on their phone). The interesting part for this sub is that the whole product is one Cloudflare Worker: marketing site, React app, public proposal pages, API, PDF rendering with pdf-lib, and the daily cron.

Things the free tier forced:
- D1 caps a database at 500 MB on the free plan, so uploaded images are shrunk to WebP in the browser before they are stored as blobs, with a hard 400 KB cap on the server and an admin gauge that warns before the limit.
- No queues without the paid plan, so webhooks are sent from the same request that sends the email (ctx.waitUntil) and a nightly cron retries failures with a fair share per account.
- Rate limiting is D1-backed fixed windows, because the free WAF allows one rule.
- Public pages are plain server-rendered HTML with a nonce CSP; the React app only loads for signed-in users.

Passwordless sign-in, acceptance bound to a hash of the rendered content, signed outbound webhooks. AGPL-3.0, 110 tests, two security passes before release.

Code: github.com/quoteandsign/quoteandsign. Happy to answer questions about any of the above.

## r/selfhosted

**Title:** Quote and Sign: self-hostable proposal and e-acceptance tool (AGPL), runs on a free Cloudflare account

**Body:**

Sharing a project that fits here: an open-source tool for sending proposals or quotes as a link and getting them accepted with a typed signature and a verifiable record.

Self-hosting facts:
- Hosting: one Cloudflare Worker plus a D1 database. Fits the free plan. No VPS, no Docker, no database to run.
- Email: Resend (free tier is enough for a small business). Payments: Polar, optional; leave it unset and there is simply no paid plan.
- Setup: clone, `npm install`, set three or four values in `wrangler.jsonc`, run the migrations, `npm run deploy`. The README has the exact steps.
- Data: everything exports as JSON and PDF. Images live in the database, so there is one thing to back up. A nightly encrypted backup job for GitHub Actions is described in the README.

Licence is AGPL-3.0. The hosted version at quoteandsign.com is the same code.

I maintain it alone, so the README is the supported setup and issues are for bugs; I cannot offer individual self-host support. Feedback on the setup steps is very welcome.
