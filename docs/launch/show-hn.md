# Show HN

Post as a link to https://github.com/quoteandsign/quoteandsign (HN prefers the repo for open source; the site is in the comment). Tuesday to Thursday, 8 to 10 am Eastern. Reply to every comment within the first two hours.

## Title (80 characters max)

Show HN: Quote and Sign – open-source proposals clients accept on their phone

## First comment (post immediately after submitting)

I built this because every proposal tool I tried charged per user, charged again per document, and locked the document the moment it was sent.

Quote and Sign is a proposal and quote tool where you write once, send a link instead of a PDF, and the client toggles the optional items, watches the total change, types their name and taps Accept. Both sides get a signed PDF and a record page with a SHA-256 fingerprint of exactly what was accepted, so either party can prove later that nothing changed.

Technical notes people here might care about:

- The whole thing is one Cloudflare Worker: marketing site, app, public proposal pages, API, PDF rendering and the daily cron. D1 (SQLite) for data, images stored as blobs after the browser shrinks them to WebP. It runs on Cloudflare's free plan.
- Public pages are server-rendered HTML with a per-request nonce CSP and no client framework. The app is React with BlockNote for the editor.
- Sign-in is passwordless (one-time email link, single-use, enforced with a conditional UPDATE). No password hashes to leak.
- Acceptance is bound to a hash of the rendered content the client saw; the status flip is one conditional UPDATE, so double-accepts and edit-during-accept races lose cleanly.
- Business accounts get signed outbound webhooks (HMAC over timestamp.body) so it plugs into a CRM through Zapier, Make or n8n.
- AGPL-3.0. Two independent security passes before release, with every finding fixed and pinned by a test; the audit report method is in the repo's history.

Pricing is flat: free for three live proposals, $19 a month for unlimited, $59 for a team of ten. No per-document fees.

Happy to answer anything about the Workers/D1 constraints (the 500 MB free-tier database limit shaped a few decisions), the acceptance record design, or why AGPL.

Site: https://quoteandsign.com
