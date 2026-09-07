# Quote and Sign

[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-2b3f8c)](./LICENSE) [![Release](https://img.shields.io/github/v/release/quoteandsign/quoteandsign?color=2b3f8c)](https://github.com/quoteandsign/quoteandsign/releases) [![Live](https://img.shields.io/badge/hosted-quoteandsign.com-2b3f8c)](https://quoteandsign.com)

**Status:** 1.0, live at quoteandsign.com. Issues here are for bugs in the software; see [CHANGELOG.md](./CHANGELOG.md) for what shipped.

**Open-source proposal and quote software.** Write a proposal once, send a link, and get a signed
copy the moment your client accepts. The open alternative to Proposify, PandaDoc and Qwilr.

Hosted at [quoteandsign.com](https://quoteandsign.com), or run your own copy on a free Cloudflare
account (see [Self-hosting](#self-hosting)).

- **Proposals clients open on any device.** A link, not an attachment. Live pricing they can toggle,
  quantities they can change, totals that update as they read.
- **Accept with a typed signature.** Timestamp, IP hash, consent text and a SHA-256 hash of the exact
  content that was signed. Both sides get a PDF and a readable signing record.
- **Know the moment it is opened.** Reading time per section, resend from the dashboard, expiry
  reminders and a nudge if it is never opened.
- **Flat pricing, no per-document fees.** Free for three live proposals. Pro $24 a month or $19 a
  month billed yearly. Business $69 a month or $59 billed yearly, with ten seats and countersigning.
- **Your data is yours.** Export everything as one file, or delete the account, from the settings
  page. Signed proposals stay readable at their link for both parties.
- **AGPL-3.0.** Every line is public. Read it, run it, improve it.

## How it is built

One Cloudflare Worker serves everything: the marketing site, the app, the public proposal pages,
the API, the PDFs and the daily cron. There is no server to keep up and nothing to patch.

| Part | Choice |
|---|---|
| Runtime | Cloudflare Workers, with [Hono](https://hono.dev) for routing |
| Database | Cloudflare D1 (SQLite) through [Drizzle](https://orm.drizzle.team). Uploaded images live in the database too, shrunk to WebP in the browser first |
| App | React 19, Vite, Tailwind v4, [BlockNote](https://www.blocknotejs.org) for the editor |
| Public pages | Server-rendered HTML with a strict Content Security Policy, no client framework |
| PDF | [pdf-lib](https://pdf-lib.js.org), rendered on the Worker |
| Email | [Resend](https://resend.com) |
| Payments | [Polar](https://polar.sh) as merchant of record. Card data never touches this code |
| Bot check | Cloudflare Turnstile on sign-in and the contact form |

Sign-in is passwordless: a link by email that works once. There are no password hashes to lose.

## Local development

Requires Node 22 or newer. Nothing runs in the background: `Ctrl+C` stops everything.

```bash
cp .dev.vars.example .dev.vars   # then set SESSION_SECRET to any 32+ random characters
npm install --legacy-peer-deps   # BlockNote lists an optional collaboration peer we do not use
npm run db:migrate:local
npm run db:seed:local            # a sample account and proposal, local only
npm run dev                      # http://127.0.0.1:5173
npm run dev:lan                  # same, reachable from your phone on the home network
```

With no email provider configured, sign-in links and every notification print to the terminal,
and the sign-in page shows the link directly. Payments run against Polar's sandbox until you point
them at a live organization.

### Checks

```bash
npm run check   # TypeScript
npm test        # unit and API tests, run inside the Workers runtime
npm run e2e     # browser checks against a running dev server (needs Playwright)
```

## Self-hosting

A copy of Quote and Sign fits inside Cloudflare's free plan: Workers, D1 and the cron trigger are
all included, and the free plan stops rather than bills if a limit is reached. You need a Cloudflare
account, a domain on it, a Resend account for email, and optionally a Polar organization if you
want to charge for plans. Budget about an hour.

1. **Clone and install.** `npm install --legacy-peer-deps`, then `npx wrangler login`.
2. **Database.** `npx wrangler d1 create quoteandsign` and put the id it prints into
   `wrangler.jsonc` under `d1_databases`. Then `npm run db:migrate:remote`.
3. **Settings.** In `wrangler.jsonc` set `APP_URL` to your domain, `EMAIL_FROM` to an address on a
   domain you will verify in Resend, `ADMIN_EMAILS` and `SUPPORT_EMAIL` to your own address, and the
   two `routes` entries to your domain. Remove the Polar product ids and `POLAR_SERVER` unless you
   are charging for plans.
4. **Secrets.** Each with `npx wrangler secret put NAME`:
   - `SESSION_SECRET`: at least 32 random characters. Generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `RESEND_API_KEY`: from Resend, after verifying your sending domain there.
   - `TURNSTILE_SECRET` (and `TURNSTILE_SITE_KEY` in `vars`): from a Turnstile widget in the
     Cloudflare dashboard, allowed on your domain. Optional; without them there is no bot check.
   - `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET`: only if you charge for plans. Create four
     subscription products in Polar and put their ids in `vars`, set `POLAR_SERVER` to
     `production`, and point a Polar webhook at `https://your-domain/billing/webhook` with the
     `checkout`, `order` and `subscription` events.
5. **Deploy.** `npm run deploy`. Cloudflare attaches the custom domains from `wrangler.jsonc` and
   schedules the daily cron. The first deploy may ask you to register a workers.dev subdomain;
   the config keeps it switched off so the site answers only on your domain.
6. **Sign in** at `https://your-domain/login` with one of the `ADMIN_EMAILS`. That account gets an
   Admin link with an overview, contact-form tickets and the marketing-consent export.

Backups: D1 keeps a few days of point-in-time history on its own. For longer retention, a nightly
`npx wrangler d1 export quoteandsign --remote --output db.sql`, encrypted and stored somewhere
private, is enough. A GitHub Actions job is a free place to run it.

## Webhooks (Business)

Settings, Advanced, Webhooks: one https address per workspace. A JSON message is POSTed when a proposal
is sent, first opened, accepted, declined or countersigned. The body carries ids, the title, client name,
currency, total and timestamps, never the client's email, the content or any IP address.

Headers: `X-QS-Event`, `X-QS-Delivery` (unique id, use it to ignore repeats), `X-QS-Timestamp` (ms),
`X-QS-Signature: v1=<hex>` where hex is HMAC-SHA256 over `timestamp + "." + rawBody` with the secret
shown once when the webhook is created or rotated. Verify before trusting a message:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
export function verify(rawBody, headers, secret) {
  const ts = headers["x-qs-timestamp"];
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false; // five-minute window
  const expected = "v1=" + createHmac("sha256", secret).update(ts + "." + rawBody).digest("hex");
  const given = headers["x-qs-signature"] ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

Delivery: two attempts right away, then one a night for up to five in total. Twenty consecutive
failures switch the webhook off and email the owner. At most 60 deliveries an hour per workspace.
Addresses must be public https on port 443; IP literals, local names and our own hosts are refused.

## Security

- Every read and write is scoped to the signed-in workspace. Public proposal pages are reachable
  only by an unguessable 122-bit id, and can also take a password and an expiry date.
- The acceptance stores a snapshot of exactly what was signed, plus its hash. The signing record
  page recomputes the hash so anyone can confirm the content was not changed afterwards.
- Cross-site writes are refused before any handler runs. Public pages carry a strict CSP, HSTS,
  and no cookies at all for images.
- Uploads are checked by their bytes, not their file name, and only images are accepted.
- Rate limits on sign-in, sending, accepting and PDF rendering, at the application level, on top
  of anything you add at Cloudflare's edge.

Found a problem? Please report it through the [contact form](https://quoteandsign.com/contact?kind=abuse)
rather than a public issue, and give us a few days to fix it before writing about it.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md) for the sign-off
rule. Issues are for bugs in the software. Help with running your own copy is not offered.
Security problems go to [SECURITY.md](./SECURITY.md), not a public issue.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE). You may run your own copy under that licence; if you
offer it to others as a service, you must publish your changes under the same licence.
