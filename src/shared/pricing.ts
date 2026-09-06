// Shared pricing math. Runs on the server (source of truth at acceptance) and in the
// browser (live total while the client toggles optional items). Money is in minor units.

/** How a line is billed. One-time lines add up to the total; recurring lines get their own subtotal per period. */
export type Billing = "once" | "month" | "quarter" | "year";
export const BILLING: { id: Billing; label: string; per: string; row: string }[] = [
  { id: "once", label: "One-time", per: "", row: "One-time" },
  { id: "month", label: "Monthly", per: "month", row: "Per month" },
  { id: "quarter", label: "Quarterly", per: "quarter", row: "Per quarter" },
  { id: "year", label: "Yearly", per: "year", row: "Per year" },
];
export const billingOf = (b: string | null | undefined): Billing => (b === "month" || b === "quarter" || b === "year" ? b : "once");

export type PricingLine = {
  id: string;
  position: number;
  name: string;
  description?: string | null;
  unitAmount: number; // minor units
  quantity: number;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  optional: boolean;
  selectedByDefault: boolean;
  taxRateBps: number | null; // null = use the proposal default; 1300 = 13 %
  billing?: string | null; // Billing; null = once
  unit?: string | null; // "hour", "page", "seat"; null = no unit word
};

// What the client chose on the public page: which optional items are on, and quantities
// where the sender allowed a range.
export type Selection = Record<string, { selected?: boolean; quantity?: number }>;

export type ComputedLine = {
  id: string;
  name: string;
  description: string | null;
  unitAmount: number;
  quantity: number;
  optional: boolean;
  selected: boolean;
  lineSubtotal: number;
  tax: number;
  billing: Billing;
  unit: string | null;
};

export type RecurringTotal = { period: Billing; subtotal: number; tax: number; total: number };

export type Totals = {
  lines: ComputedLine[];
  /** One-time lines only. */
  subtotal: number;
  tax: number;
  total: number;
  /** True when at least one selectable line carries a non-zero rate. Drives whether tax rows show. */
  hasTax: boolean;
  /** True when any line is billed once, so the one-time total is worth showing. */
  hasOnce: boolean;
  /** One entry per period that has at least one line, in month / quarter / year order. */
  recurring: RecurringTotal[];
};

export const MAX_QUANTITY = 100_000;

function clamp(n: number, min: number | null | undefined, max: number | null | undefined): number {
  let v = Math.floor(Number.isFinite(n) ? n : 0);
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  if (v > MAX_QUANTITY) v = MAX_QUANTITY;
  if (v < 0) v = 0;
  return v;
}

/**
 * The quantity a line is priced at. Inside the sender's range, except that a line the sender
 * started at zero may stay at zero: zero means "none yet", the range applies once a number is picked.
 */
export function quantityFor(item: Pick<PricingLine, "quantity" | "minQuantity" | "maxQuantity">, chosen: number | undefined): number {
  const allowsRange = item.minQuantity != null || item.maxQuantity != null;
  if (!allowsRange) return item.quantity;
  const raw = chosen ?? item.quantity;
  if (raw === 0 && item.quantity === 0) return 0;
  return clamp(raw, item.minQuantity, item.maxQuantity);
}

/** Effective tax rate for a line: its own override, else the proposal default. */
export function effectiveTaxBps(item: Pick<PricingLine, "taxRateBps">, defaultTaxBps: number): number {
  return item.taxRateBps ?? defaultTaxBps;
}

export function computeTotals(items: PricingLine[], selection: Selection = {}, defaultTaxBps = 0): Totals {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const lines: ComputedLine[] = sorted.map((item) => {
    const choice = selection[item.id] ?? {};
    const selected = item.optional ? (choice.selected ?? item.selectedByDefault) : true;
    const quantity = quantityFor(item, choice.quantity);
    const lineSubtotal = selected ? item.unitAmount * quantity : 0;
    const tax = Math.round((lineSubtotal * effectiveTaxBps(item, defaultTaxBps)) / 10000);
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? null,
      unitAmount: item.unitAmount,
      quantity,
      optional: item.optional,
      selected,
      lineSubtotal,
      tax,
      billing: billingOf(item.billing),
      unit: item.unit || null,
    };
  });
  const once = lines.filter((l) => l.billing === "once");
  const subtotal = once.reduce((s, l) => s + l.lineSubtotal, 0);
  const tax = once.reduce((s, l) => s + l.tax, 0);
  const recurring: RecurringTotal[] = (["month", "quarter", "year"] as Billing[])
    .filter((p) => lines.some((l) => l.billing === p))
    .map((period) => {
      const ls = lines.filter((l) => l.billing === period);
      const sub = ls.reduce((s, l) => s + l.lineSubtotal, 0);
      const t = ls.reduce((s, l) => s + l.tax, 0);
      return { period, subtotal: sub, tax: t, total: sub + t };
    });
  const hasTax = sorted.some((item) => effectiveTaxBps(item, defaultTaxBps) > 0);
  return { lines, subtotal, tax, total: subtotal + tax, hasTax, hasOnce: once.length > 0, recurring };
}

/** "$4,500.00 USD", "$4,500.00 CAD", "€4,500.00 EUR": symbol plus code, never ambiguous. */
export function formatMoney(minor: number, currency: string, locale = "en"): string {
  try {
    // Amounts are always stored in hundredths, so always show two decimals (also for yen, rupees, etc.).
    const n = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
    return `${n} ${currency}`;
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** "$120.00 USD per hour", "$150.00 USD per month", "$50.00 USD per seat per month". */
export function priceLabel(unitAmount: number, currency: string, unit?: string | null, billing?: string | null): string {
  const b = billingOf(billing);
  const per = BILLING.find((x) => x.id === b)!.per;
  return formatMoney(unitAmount, currency) + (unit ? ` per ${unit}` : "") + (per ? ` per ${per}` : "");
}

/**
 * The small line under an item: nothing for a plain "1 × price, one-time"; the price alone when the
 * quantity is zero (nothing chosen yet); otherwise "10 × $120.00 USD per hour".
 */
export function lineSummary(l: Pick<ComputedLine, "quantity" | "unitAmount" | "unit" | "billing">, currency: string): string {
  if (l.quantity === 0) return priceLabel(l.unitAmount, currency, l.unit, l.billing);
  if (l.quantity === 1 && !l.unit && l.billing === "once") return "";
  return `${l.quantity} × ${priceLabel(l.unitAmount, currency, l.unit, l.billing)}`;
}

export const periodRow = (period: Billing): string => BILLING.find((b) => b.id === period)!.row;

/** One sentence for emails and lists: "$4,500.00 USD, plus $150.00 USD per month". */
export function describeTotals(t: { total: number; hasOnce?: boolean; recurring: { period: Billing; total: number }[] }, currency: string): string {
  const rec = t.recurring.filter((r) => r.total > 0).map((r) => `${formatMoney(r.total, currency)} per ${BILLING.find((b) => b.id === r.period)!.per}`);
  if (!rec.length) return formatMoney(t.total, currency);
  if (t.hasOnce === false || (t.total === 0 && rec.length)) return rec.join(" and ");
  return `${formatMoney(t.total, currency)}, plus ${rec.join(" and ")}`;
}

export const SUPPORTED_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "JPY", "INR", "SGD", "MXN", "BRL", "ZAR"] as const;
