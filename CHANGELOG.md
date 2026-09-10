# Changelog

All notable changes to Quote and Sign. Dates are the day the change went live at quoteandsign.com.

## 1.0.1 — 2026-09-10

### Public pages
- Every server-rendered page (templates, comparisons, legal, contact) now carries one real description, a
  canonical link and share-preview tags, plus breadcrumb structured data on the template and comparison pages.
- Unknown addresses answer with a real 404 instead of the app shell; a trailing slash redirects to the page.
- The homepage has a single h1; the sign-in page is no longer listed in the sitemap.
- llms.txt lists the pages as Markdown links, in sections, as the convention asks.
- Static files are cached at the edge: hashed build output and fonts for a year, brand and screenshots for a day.
- Template and comparison cards use h2 headings, thumbnail links carry a name, and header and footer links
  are tall enough to tap on a phone.

## 1.0.0 — 2026-09-07

First public release. Everything below is live on the hosted service and in this repository.

### Proposals
- Write in a block editor: headings, lists, tables, images and image rows, statements, feature grids,
  testimonials, embedded video (YouTube, Vimeo, Loom by link), and the pricing table.
- Six starting templates and six page styles; your logo, color and sender name on paid plans.
- Live pricing: required and optional lines, quantity ranges the client can change, recurring lines,
  one tax rate for the proposal with a per-line exemption, 16 currencies.
- Send by email with a personal note, or publish the link and share it yourself. Passwords, expiry
  dates and a reminder three days before expiry on paid plans.

### Accepting
- The client toggles options on their phone, types their name and taps Accept. The record stores the
  name, email, time, IP, consent text, the chosen options, and a SHA-256 fingerprint of the exact
  content shown, verifiable from the record file.
- Both parties get the signed PDF by email; a readable record page and a JSON record stay at the link.
  Business accounts can countersign.
- Questions and declines go to the sender with the client's message quoted; the client's email is
  only ever the reply-to.

### Accounts and plans
- Passwordless sign-in by one-time link. Free (three live proposals), Pro, Business (ten seats, shared
  templates, countersigning, webhooks). Fourteen-day Pro trial, no card. Billing through Polar as
  merchant of record.
- Export everything as one JSON file; delete the account with an emailed code, with signed records
  kept readable for the other party.
- Signed outbound webhooks on Business: sent, first opened, accepted, declined, countersigned.

### Security and privacy
- Every read and write scoped to the signed-in workspace; public pages reachable only by unguessable
  links; per-request nonce Content Security Policy on every page; same-origin checks on every write.
- Two independent security passes before release with every finding fixed and pinned by a test.
- Uploads limited to images, checked by content, served sandboxed. Recipients' IPs stored as keyed
  hashes except in the acceptance record itself. Google Analytics only on public pages and only after
  consent. Nightly encrypted backups kept 60 days; deleted data leaves backups within that window.
- Terms, privacy policy, acceptable use policy and data processing addendum reviewed against what the
  code actually does.

### For self-hosters
- One Cloudflare Worker, one D1 database, Resend for email, Polar for billing, Turnstile for the bot
  check. Runs on the free Cloudflare plan. See the README.
