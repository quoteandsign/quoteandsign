import { useRef, useState, type ReactNode } from "react";
import { Plus, Trash, ArrowUp, ArrowDown, CaretDown } from "@phosphor-icons/react";
import { Button, Input, Textarea, Switch, Field, NumberField, cn } from "../components/ui";
import { computeTotals, formatMoney, lineSummary, priceLabel, periodRow, billingOf, BILLING, type PricingLine } from "../../shared/pricing";

function newItem(position: number): PricingLine {
  return {
    id: crypto.randomUUID(),
    position,
    name: "",
    description: "",
    unitAmount: 0,
    quantity: 1,
    minQuantity: null,
    maxQuantity: null,
    optional: false,
    selectedByDefault: true,
    taxRateBps: null,
  };
}

export const MAX_UNIT_AMOUNT = 1_000_000_000; // matches the server
export const MAX_QUANTITY = 100_000;

/** Keep min <= max and the default quantity inside the range. */
function withValidRange(it: PricingLine, patch: Partial<PricingLine>): Partial<PricingLine> {
  const next = { ...it, ...patch };
  if (next.minQuantity != null && next.maxQuantity != null) {
    if ("minQuantity" in patch && next.minQuantity > next.maxQuantity) next.maxQuantity = next.minQuantity;
    if ("maxQuantity" in patch && next.maxQuantity < next.minQuantity) next.minQuantity = next.maxQuantity;
  }
  // A line may start at zero even with a minimum: zero means "nothing chosen yet".
  if (next.minQuantity != null && next.quantity !== 0 && next.quantity < next.minQuantity) next.quantity = next.minQuantity;
  if (next.maxQuantity != null && next.quantity > next.maxQuantity) next.quantity = next.maxQuantity;
  return next;
}

function Chip({ children, on }: { children: ReactNode; on?: boolean }) {
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", on ? "bg-brand/12 text-brand dark:text-indigo-300" : "bg-stone-900/[.05] text-stone-500 dark:bg-white/[.07] dark:text-stone-400")}>
      {children}
    </span>
  );
}

export function PricingPanel({ items, currency, defaultTaxBps, taxLabel, onChange, onTax, readOnly }: { items: PricingLine[]; currency: string; defaultTaxBps: number; taxLabel: string; onChange: (items: PricingLine[]) => void; onTax: (bps: number, label: string) => void; readOnly: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const justAdded = useRef<string | null>(null);
  const update = (id: string, patch: Partial<PricingLine>) => onChange(items.map((it) => (it.id === id ? { ...it, ...withValidRange(it, patch) } : it)));
  const remove = (id: string) => {
    onChange(items.filter((it) => it.id !== id).map((it, i) => ({ ...it, position: i })));
    if (open === id) setOpen(null);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = items.findIndex((it) => it.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next.map((it, k) => ({ ...it, position: k })));
  };
  const add = () => {
    const it = newItem(items.length);
    justAdded.current = it.id;
    onChange([...items, it]);
    setOpen(it.id);
  };
  const totals = computeTotals(items, {}, defaultTaxBps);

  return (
    <div className="grid gap-3">
      {items.length > 0 && (
        <div className="flex items-baseline justify-between gap-3 px-1 pb-1">
          <span className="text-[13px] text-stone-500">Total if the client keeps the defaults</span>
          <span className="text-right">
            {totals.hasOnce && <span data-test="one-time-total" className="block whitespace-nowrap text-[20px] font-semibold tabular-nums tracking-tight">{formatMoney(totals.total, currency)}</span>}
            {totals.recurring.filter((r) => r.total > 0 || !totals.hasOnce).map((r) => <span key={r.period} className="block whitespace-nowrap text-[14px] font-medium tabular-nums text-stone-600 dark:text-stone-300">{formatMoney(r.total, currency)} {periodRow(r.period).toLowerCase()}</span>)}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/[.07] dark:bg-stone-900 dark:ring-white/[.08]">
        {items.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="font-medium">No line items yet</p>
            <p className="mt-1 text-[13px] text-stone-500">Each line can be required or optional, with a quantity your client can change.</p>
          </div>
        )}
        {items.map((it, i) => {
          const isOpen = open === it.id;
          const range = it.minQuantity != null || it.maxQuantity != null;
          const line = totals.lines.find((l) => l.id === it.id);
          const shownQty = line?.quantity ?? it.quantity;
          return (
            <div key={it.id} className={cn("border-t border-stone-900/[.06] first:border-t-0 dark:border-white/[.07]", isOpen && "bg-stone-900/[.02] dark:bg-white/[.03]")}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : it.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-900/[.025] dark:hover:bg-white/[.04]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-[15px] font-medium", !it.name && "text-stone-400")}>{it.name || "Untitled item"}</span>
                    <span className={cn("shrink-0 text-[15px] tabular-nums", it.optional && !it.selectedByDefault && "text-stone-400 line-through decoration-stone-300", shownQty === 0 && "text-stone-500")} title={it.optional && !it.selectedByDefault ? "Off by default: not in the total unless the client switches it on" : undefined}>
                      {shownQty === 0 ? priceLabel(it.unitAmount, currency, it.unit, it.billing) : formatMoney(it.unitAmount * shownQty, currency)}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {shownQty > 0 && lineSummary({ quantity: shownQty, unitAmount: it.unitAmount, unit: it.unit ?? null, billing: billingOf(it.billing) }, currency) && (
                      <span className="text-[12px] text-stone-500 tabular-nums">{lineSummary({ quantity: shownQty, unitAmount: it.unitAmount, unit: it.unit ?? null, billing: billingOf(it.billing) }, currency)}</span>
                    )}
                    {shownQty === 0 && <Chip>Client picks how many</Chip>}
                    {billingOf(it.billing) !== "once" && <Chip on>{BILLING.find((b) => b.id === billingOf(it.billing))!.label}</Chip>}
                    {it.optional && <Chip on={it.selectedByDefault}>{it.selectedByDefault ? "Optional · on" : "Optional · off"}</Chip>}
                    {range && shownQty > 0 && <Chip>Client sets quantity</Chip>}
                    {it.taxRateBps === 0 && defaultTaxBps > 0 && <Chip>No tax</Chip>}
                    {it.taxRateBps !== null && it.taxRateBps !== 0 && <Chip>{it.taxRateBps / 100}% tax on this line</Chip>}
                  </span>
                </span>
                <CaretDown size={16} weight="bold" className={cn("mt-1 shrink-0 text-stone-400 transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="grid gap-3 px-4 pb-4">
                  <Field label="Name" htmlFor={`n-${it.id}`}>
                    <Input id={`n-${it.id}`} name="itemName" maxLength={200} value={it.name} disabled={readOnly} autoFocus={justAdded.current === it.id && !it.name} onChange={(e) => update(it.id, { name: e.target.value })} placeholder="Design and build" />
                  </Field>
                  <Field label="Description" htmlFor={`d-${it.id}`}>
                    <Textarea id={`d-${it.id}`} name="itemDescription" maxLength={1000} value={it.description ?? ""} disabled={readOnly} onChange={(e) => update(it.id, { description: e.target.value })} placeholder="What is included" className="min-h-[56px]" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label={`Price (${currency})`} htmlFor={`p-${it.id}`}>
                      <NumberField id={`p-${it.id}`} value={it.unitAmount} disabled={readOnly} max={MAX_UNIT_AMOUNT} onChange={(v) => update(it.id, { unitAmount: v ?? 0 })} />
                    </Field>
                    <Field label="Qty" htmlFor={`q-${it.id}`}>
                      <Input id={`q-${it.id}`} name="itemQuantity" inputMode="numeric" pattern="[0-9]*" disabled={readOnly} className="text-right tabular-nums" value={it.quantity} onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); update(it.id, { quantity: Math.min(MAX_QUANTITY, Number.isFinite(n) ? n : 0) }); }} />
                    </Field>
                  </div>
                  <div className="grid gap-2.5">
                    <Field label="Billed" htmlFor={`b-${it.id}`}>
                      <div id={`b-${it.id}`} role="radiogroup" aria-label="Billing" className="grid h-11 grid-cols-4 gap-0.5 rounded-xl bg-stone-900/[.06] p-0.5 dark:bg-white/[.08]">
                        {BILLING.map((b) => {
                          const on = billingOf(it.billing) === b.id;
                          return (
                            <button key={b.id} type="button" role="radio" aria-checked={on} disabled={readOnly} onClick={() => update(it.id, { billing: b.id })} className={cn("rounded-[10px] text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200", on ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite hover:text-ink dark:text-stone-400 dark:hover:text-stone-100")}>
                              {b.label}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                    <Field label="Unit" htmlFor={`u-${it.id}`}>
                      <Input id={`u-${it.id}`} name="itemUnit" maxLength={24} disabled={readOnly} value={it.unit ?? ""} placeholder="hour, page, seat (optional)" onChange={(e) => update(it.id, { unit: e.target.value.trim() || null })} />
                    </Field>
                  </div>
                  <p className="-mt-1 text-[12px] text-stone-500">
                    Reads as <span className="font-medium text-stone-700 dark:text-stone-300">{priceLabel(it.unitAmount, currency, it.unit, it.billing)}</span>{billingOf(it.billing) !== "once" ? ". Recurring lines get their own total under the one-time total." : "."}
                  </p>
                  <div className="grid gap-2.5 rounded-xl bg-stone-900/[.03] p-3 dark:bg-white/[.04]">
                    <Switch disabled={readOnly} checked={it.taxRateBps !== 0} label={defaultTaxBps > 0 ? `Taxable, ${defaultTaxBps / 100}% ${taxLabel || "tax"}` : "Taxable, once a tax rate is set"} onChange={(v) => update(it.id, { taxRateBps: v ? null : 0 })} />
                    <Switch disabled={readOnly} checked={it.optional} label="Client can leave this out" onChange={(v) => update(it.id, { optional: v, selectedByDefault: v ? it.selectedByDefault : true })} />
                    {it.optional && <Switch disabled={readOnly} checked={it.selectedByDefault} label="Included unless they switch it off" onChange={(v) => update(it.id, { selectedByDefault: v })} />}
                    <Switch
                      disabled={readOnly}
                      checked={range}
                      label="Client can change the quantity"
                      onChange={(v) => update(it.id, v ? { minQuantity: 0, maxQuantity: Math.max(it.quantity, 10) } : { minQuantity: null, maxQuantity: null })}
                    />
                    {range && (
                      <p className="text-[12px] text-stone-500">
                        {it.quantity === 0 ? "Starts at zero: the client picks a number in the range, or leaves it out." : `Starts at ${it.quantity}; the client can pick anything in the range.`}
                      </p>
                    )}
                    {range && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <Field label="Min" htmlFor={`mn-${it.id}`}>
                          <Input id={`mn-${it.id}`} name="itemMin" inputMode="numeric" pattern="[0-9]*" disabled={readOnly} className="text-right tabular-nums" value={it.minQuantity ?? 0} onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); update(it.id, { minQuantity: Math.min(MAX_QUANTITY, Number.isFinite(n) ? n : 0) }); }} />
                        </Field>
                        <Field label="Max" htmlFor={`mx-${it.id}`}>
                          <Input id={`mx-${it.id}`} name="itemMax" inputMode="numeric" pattern="[0-9]*" disabled={readOnly} className="text-right tabular-nums" value={it.maxQuantity ?? 0} onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); update(it.id, { maxQuantity: Math.min(MAX_QUANTITY, Number.isFinite(n) ? n : 0) }); }} />
                        </Field>
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center justify-between">
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(it.id, -1)}>
                          <ArrowUp size={16} weight="light" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(it.id, 1)}>
                          <ArrowDown size={16} weight="light" />
                        </Button>
                      </div>
                      <Button variant="danger" size="sm" onClick={() => remove(it.id)}>
                        <Trash size={15} weight="light" /> Remove
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            onClick={add}
            className="flex w-full items-center justify-center gap-2 border-t border-dashed border-stone-900/[.12] px-4 py-3.5 text-[14px] font-medium text-brand transition-colors hover:bg-brand/[.05] dark:border-white/[.12] dark:text-indigo-300"
          >
            <Plus size={15} weight="bold" /> Add line item
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-900/[.07] dark:bg-stone-900 dark:ring-white/[.08]" data-test="tax-row">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pricing-tax-rate" className="text-[13.5px] font-medium">Tax</label>
            <div className="flex items-center gap-2">
              <span className="flex w-24 items-center gap-1.5">
                <NumberField id="pricing-tax-rate" value={defaultTaxBps === 0 ? null : defaultTaxBps} allowEmpty placeholder="0" max={10_000} decimals={2} disabled={readOnly} onChange={(v) => onTax(v ?? 0, taxLabel)} />
                <span className="text-[13px] text-stone-500">%</span>
              </span>
              <Input id="pricing-tax-label" aria-label="Tax name" value={taxLabel} disabled={readOnly} maxLength={40} placeholder="HST, VAT…" onChange={(e) => onTax(defaultTaxBps, e.target.value)} className="h-11 w-28" />
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-stone-500 tabular-nums">
            {totals.hasTax
              ? `Applies to every taxable line. Subtotal ${formatMoney(totals.subtotal, currency)}, tax ${formatMoney(totals.tax, currency)}.`
              : "One rate for the whole proposal. Switch a line to not taxable if it is exempt."}
          </p>
        </div>
      )}
    </div>
  );
}
