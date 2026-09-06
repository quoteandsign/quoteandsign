import { describe, it, expect } from "vitest";
import { computeTotals, formatMoney, lineSummary, describeTotals, type PricingLine } from "../src/shared/pricing";

const base: PricingLine[] = [
  { id: "a", position: 0, name: "Build", unitAmount: 450000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: 1300 },
  { id: "b", position: 1, name: "Copy", unitAmount: 120000, quantity: 1, optional: true, selectedByDefault: true, taxRateBps: 1300 },
  { id: "c", position: 2, name: "Pages", unitAmount: 60000, quantity: 0, minQuantity: 0, maxQuantity: 10, optional: true, selectedByDefault: false, taxRateBps: 0 },
];

describe("computeTotals", () => {
  it("uses defaults when the client made no choices", () => {
    const t = computeTotals(base);
    expect(t.subtotal).toBe(570000);
    expect(t.tax).toBe(74100);
    expect(t.total).toBe(644100);
    expect(t.lines.map((l) => l.selected)).toEqual([true, true, false]);
  });

  it("honours optional toggles and clamps quantities to the allowed range", () => {
    const t = computeTotals(base, { b: { selected: false }, c: { selected: true, quantity: 50 } });
    expect(t.lines[1]!.lineSubtotal).toBe(0);
    expect(t.lines[2]!.quantity).toBe(10);
    expect(t.lines[2]!.lineSubtotal).toBe(600000);
    expect(t.total).toBe(450000 + 58500 + 600000);
  });

  it("ignores quantity changes on items without a range and cannot switch off required items", () => {
    const t = computeTotals(base, { a: { selected: false, quantity: 9 } });
    expect(t.lines[0]!.selected).toBe(true);
    expect(t.lines[0]!.quantity).toBe(1);
  });

  it("applies the proposal default tax to lines without an override, and lets a line override it", () => {
    const items: PricingLine[] = [
      { id: "x", position: 0, name: "A", unitAmount: 10000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
      { id: "y", position: 1, name: "B", unitAmount: 10000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: 500 },
      { id: "z", position: 2, name: "C", unitAmount: 10000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: 0 },
    ];
    const t = computeTotals(items, {}, 1300);
    expect(t.lines.map((l) => l.tax)).toEqual([1300, 500, 0]);
    expect(t.tax).toBe(1800);
    expect(t.hasTax).toBe(true);
    const none = computeTotals(items.map((i) => ({ ...i, taxRateBps: null })), {}, 0);
    expect(none.tax).toBe(0);
    expect(none.hasTax).toBe(false);
  });

  it("lets a zero-start line stay at zero inside a range, and keeps recurring lines apart", () => {
    const items: PricingLine[] = [
      { id: "h", position: 0, name: "Hours", unitAmount: 12000, quantity: 0, minQuantity: 10, maxQuantity: 40, optional: false, selectedByDefault: true, taxRateBps: null, unit: "hour", billing: "month" },
      { id: "b", position: 1, name: "Build", unitAmount: 450000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
    ];
    const t = computeTotals(items, {}, 1300);
    expect(t.lines[0]!.quantity).toBe(0);
    expect(t.total).toBe(450000 + 58500);
    expect(t.recurring).toEqual([{ period: "month", subtotal: 0, tax: 0, total: 0 }]);
    const picked = computeTotals(items, { h: { quantity: 5 } }, 1300);
    expect(picked.lines[0]!.quantity).toBe(10);
    expect(picked.recurring[0]!.total).toBe(120000 + 15600);
    expect(computeTotals(items, { h: { quantity: 0 } }, 1300).lines[0]!.quantity).toBe(0);
    expect(lineSummary(picked.lines[0]!, "USD")).toBe("10 × $120.00 USD per hour per month");
    expect(lineSummary(t.lines[0]!, "USD")).toBe("$120.00 USD per hour per month");
    expect(lineSummary(t.lines[1]!, "USD")).toBe("");
    expect(describeTotals(picked, "USD")).toBe("$5,085.00 USD, plus $1,356.00 USD per month");
  });

  it("formats money", () => {
    expect(formatMoney(644100, "CAD")).toMatch(/6,441\.00/);
  });
});
