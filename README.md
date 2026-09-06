# Quote and Sign

**Open-source proposal & quote software.** The open alternative to Proposify, PandaDoc and Qwilr.

Web-native proposals your clients open on any device. Live pricing tables they can toggle. One-click
accept with a typed signature, timestamp and content hash. Know the moment they open it.

- **Flat pricing, no per-document fees.** Free for 3 live proposals. Pro $19/mo. Business $59/mo.
- **Cancel in one click.** Export everything as JSON or PDF, any time.
- **Self-host for free, forever.** AGPL-3.0. One `docker compose up`.
- **Your data stays yours.** Encrypted at rest and in transit. No tracking cookies.

## Status

Phase 0 — project skeleton. Not yet usable.

## Local development

Requires Node 22 or newer (Node 24 LTS recommended).

```bash
cp .dev.vars.example .dev.vars   # then set SESSION_SECRET to 32 random bytes (hex)
npm install --legacy-peer-deps   # BlockNote has an optional collab peer we do not use
npm run db:migrate:local
npm run db:seed:local            # sample user + proposal, local only
npm run dev                      # http://127.0.0.1:5173  — Ctrl+C stops everything
npm run dev:lan                  # same, but reachable from your phone on the home network
```

Everything runs in the foreground. Nothing is installed globally, nothing runs in the background.

## Stack

React + Vite on Cloudflare Workers · D1 · R2 · Tailwind v4 · BlockNote · pdf-lib · Hono · Drizzle ·
Polar (Merchant of Record) · Resend.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
