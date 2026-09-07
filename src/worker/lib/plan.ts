// What an account can do right now. A free account inside its 14-day trial behaves like Pro.
import type { User } from "./db";

export const TRIAL_DAYS = 14;

/** What a plan unlocks. Free is the standard look and three live proposals; everything else is Pro. */
export type Caps = {
  liveLimit: number;
  seats: number;
  pdf: boolean; // PDF export of unsigned drafts (signed copies are always free)
  brand: boolean; // logo, color, page styles, sender name override
  protect: boolean; // link password, expiry, reminders
  notify: boolean; // "opened" emails
  payment: boolean; // payment link after signing
  countersign: boolean; // the sender signs after the client
  footerOff: boolean; // may hide "Made with Quote and Sign"
  images: number; // images that may be uploaded into proposals
  webhooks: boolean; // signed messages to a CRM or automation tool
};

export const PLANS = {
  free: { name: "Free", monthly: 0, yearly: 0, liveLimit: 3, seats: 0, pdf: false, brand: false, protect: false, notify: false, payment: false, countersign: false, footerOff: false, images: 10, webhooks: false },
  pro: { name: "Pro", monthly: 24, yearly: 19, liveLimit: Infinity, seats: 0, pdf: true, brand: true, protect: true, notify: true, payment: true, countersign: false, footerOff: true, images: 200, webhooks: false },
  business: { name: "Business", monthly: 69, yearly: 59, liveLimit: Infinity, seats: 10, pdf: true, brand: true, protect: true, notify: true, payment: true, countersign: true, footerOff: true, images: 500, webhooks: true },
} as const satisfies Record<string, Caps & { name: string; monthly: number; yearly: number }>;
export type PlanId = keyof typeof PLANS;
export type Interval = "month" | "year";

export type Effective = { id: PlanId; paid: PlanId; trial: boolean; trialEndsAt: number | null; trialDaysLeft: number };

export function effectivePlan(user: Pick<User, "plan" | "trialEndsAt">, now = new Date()): Effective {
  const paid = (user.plan in PLANS ? user.plan : "free") as PlanId;
  const ends = user.trialEndsAt ? user.trialEndsAt.getTime() : null;
  const trialing = paid === "free" && ends !== null && ends > now.getTime();
  return {
    id: trialing ? "pro" : paid,
    paid,
    trial: trialing,
    trialEndsAt: ends,
    trialDaysLeft: trialing && ends ? Math.max(1, Math.ceil((ends - now.getTime()) / 86_400_000)) : 0,
  };
}

/** The capabilities in force for an account right now. */
export function capsOf(user: Pick<User, "plan" | "trialEndsAt">, now = new Date()): Caps {
  const p = PLANS[effectivePlan(user, now).id];
  return { liveLimit: p.liveLimit, seats: p.seats, pdf: p.pdf, brand: p.brand, protect: p.protect, notify: p.notify, payment: p.payment, countersign: p.countersign, footerOff: p.footerOff, images: p.images, webhooks: p.webhooks };
}

export const trialEnd = (from = new Date()) => new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
