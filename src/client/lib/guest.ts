import { ApiError } from "./api";
import { TEMPLATES } from "../../shared/templates";
import type { PricingLine } from "../../shared/pricing";

/**
 * Trying the editor without an account.
 *
 * /try/<template> opens the real editor on a proposal that lives only in this browser. The
 * editor talks to the API as usual; requests for a "guest-" proposal are answered here from
 * localStorage instead of the network. Pressing Send parks the draft and goes to sign-in; once
 * the link is used, the templates page uploads the draft through the normal endpoints.
 */
export const GUEST_PREFIX = "guest-";
const DRAFT_KEY = "qs-guest-draft";
const storeKey = (template: string) => `qs-guest:${template}`;

type GuestProposal = Record<string, unknown> & { id: string; publicId: string; title: string; content: unknown[]; currency: string; status: string; style: string | null; accentColor: string | null; template: string };
export type GuestDraft = { template: string; proposal: GuestProposal; items: PricingLine[]; savedAt: number };

export const isGuestPath = (path: string) => path.includes(`/api/proposals/${GUEST_PREFIX}`);
export const isGuestId = (id: string) => id.startsWith(GUEST_PREFIX);

const read = <T>(key: string): T | null => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the draft lives in memory only */ } };
const drop = (key: string) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

const rid = () => crypto.randomUUID();
/** Blocks in templates ship without ids; the editor needs them. */
const withIds = (blocks: unknown[]): unknown[] =>
  blocks.map((b) => {
    const o = (b && typeof b === "object" ? { ...(b as Record<string, unknown>) } : {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(o.id)) o.id = rid();
    if (Array.isArray(o.children)) o.children = withIds(o.children);
    return o;
  });

function localCurrency(): string {
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const map: Record<string, string> = { CA: "CAD", US: "USD", GB: "GBP", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", JP: "JPY", IN: "INR", SG: "SGD", MX: "MXN", BR: "BRL", ZA: "ZAR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR" };
  return map[region] ?? "USD";
}

/** The browser-side proposal for a template: what was saved here before, or a fresh copy. */
export function guestDraft(template: string): GuestDraft {
  const saved = read<GuestDraft>(storeKey(template));
  if (saved && saved.proposal && Array.isArray(saved.items)) return saved;
  const t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[0]!;
  const proposal: GuestProposal = {
    id: GUEST_PREFIX + t.id, publicId: "guest", template: t.id,
    title: t.title, clientName: null, clientEmail: null, currency: localCurrency(), content: withIds(t.content), status: "draft",
    expiresAt: null, hasPassword: false, viewCount: 0, taxRateBps: 0, taxLabel: null, senderName: null, accentColor: null, ccEmails: [], notifyEmails: [],
    remind: false, style: t.style, paymentUrl: null, paymentLabel: null, declinedAt: null, declineReason: null, countersign: false, coverArt: true,
  };
  const items: PricingLine[] = t.items.map((it, i) => ({ id: rid(), position: i, name: it.name, description: it.description ?? null, unitAmount: it.unitAmount, quantity: it.quantity, minQuantity: it.minQuantity ?? null, maxQuantity: it.maxQuantity ?? null, optional: it.optional, selectedByDefault: it.selectedByDefault, taxRateBps: it.taxRateBps, billing: it.billing ?? "once", unit: it.unit ?? null }));
  return { template: t.id, proposal, items, savedAt: Date.now() };
}

const save = (d: GuestDraft) => { d.savedAt = Date.now(); write(storeKey(d.template), d); };

/** Answers an API call for a guest proposal. Throws ApiError like the network would. */
export async function guestApi<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const m = path.match(/^\/api\/proposals\/(guest-[a-z-]+)(?:\/([a-z-]+))?$/);
  if (!m) throw new ApiError(401, "Sign in to do this. Press Send when your proposal is ready.", "guest");
  const template = m[1]!.slice(GUEST_PREFIX.length);
  const action = m[2] ?? "";
  const d = guestDraft(template);
  if (method === "GET" && !action) return { proposal: d.proposal, items: d.items, acceptance: null } as T;
  if (method === "GET" && action === "messages") return { messages: [] } as T;
  if (method === "PUT" && !action) {
    const patch = (init.json ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) if (k !== "id" && k !== "publicId" && k !== "status") (d.proposal as Record<string, unknown>)[k] = v;
    save(d);
    return { ok: true } as T;
  }
  if (method === "PUT" && action === "items") {
    d.items = (init.json as PricingLine[]).map((it, i) => ({ ...it, id: it.id || rid(), position: i }));
    save(d);
    return { ok: true } as T;
  }
  if (method === "POST" && action === "send") {
    // Park the draft, then sign in. The templates page finishes the job after the magic link.
    write(DRAFT_KEY, d);
    try { localStorage.setItem("qs-after-login", "/app/templates?guest=1"); } catch { /* ignore */ }
    location.assign("/login?guest=1");
    return new Promise<T>(() => {});
  }
  throw new ApiError(401, "Sign in to do this. Press Send when your proposal is ready.", "guest");
}

export const pendingDraft = (): GuestDraft | null => read<GuestDraft>(DRAFT_KEY);

/** After sign-in: create the real proposal from the parked draft through the normal API. */
export async function uploadDraft(api: <R>(path: string, init?: RequestInit & { json?: unknown }) => Promise<R>): Promise<string | null> {
  const d = pendingDraft();
  if (!d) return null;
  const p = d.proposal as Record<string, unknown>;
  const created = await api<{ id: string }>("/api/proposals", { method: "POST", json: { template: d.template, currency: p.currency } });
  const keep = ["title", "clientName", "clientEmail", "currency", "content", "taxRateBps", "taxLabel", "ccEmails", "notifyEmails", "remind", "navHidden", "coverArt", "paymentLabel"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of keep) if (p[k] !== undefined && p[k] !== null) patch[k] = p[k];
  await api(`/api/proposals/${created.id}`, { method: "PUT", json: patch });
  // Looks are plan-gated; a fresh account is on trial, so they go through. If not, keep going without them.
  const looks: Record<string, unknown> = {};
  if (p.style) looks.style = p.style;
  if (p.accentColor) looks.accentColor = p.accentColor;
  if (p.senderName) looks.senderName = p.senderName;
  if (Object.keys(looks).length) await api(`/api/proposals/${created.id}`, { method: "PUT", json: looks }).catch(() => {});
  await api(`/api/proposals/${created.id}/items`, { method: "PUT", json: d.items.map(({ id, position: _p, ...rest }) => ({ ...rest, id: /^[0-9a-f-]{36}$/.test(id) ? id : undefined, name: rest.name || "Untitled item", description: rest.description || null })) });
  drop(DRAFT_KEY);
  drop(storeKey(d.template));
  return created.id;
}
