// Shared building blocks for the built-in templates: block helpers, the artwork paths and the types.
// Content is BlockNote partial-block JSON; amounts are in minor units.

export type TemplateItem = {
  name: string;
  description?: string;
  unitAmount: number;
  quantity: number;
  optional: boolean;
  selectedByDefault: boolean;
  taxRateBps: number | null;
  minQuantity?: number;
  maxQuantity?: number;
  billing?: "once" | "month" | "quarter" | "year";
  unit?: string;
};

export type Template = {
  id: string;
  name: string;
  summary: string;
  title: string;
  style: string; // default page style (shared/styles.ts)
  content: unknown[];
  group?: "core" | "trade"; // trade templates live under "By trade" in the picker and on the public pages
  trade?: string; // the category chip a trade template sits under
  items: TemplateItem[];
};

export type Band = "gray" | "brown" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";
export const h = (level: 1 | 2 | 3, text: string, band?: Band) => ({ type: "heading", props: { level, ...(band ? { backgroundColor: band } : {}) }, content: text });
export const p = (text: string) => ({ type: "paragraph", content: text });
export const li = (text: string) => ({ type: "bulletListItem", content: text });
export const num = (text: string) => ({ type: "numberedListItem", content: text });
export const quote = (text: string) => ({ type: "quote", content: text });
export const statement = (text: string) => ({ type: "statement", content: text });
export const grid = (items: { title: string; text: string }[], cols: 2 | 3 = 3) => ({ type: "featureGrid", props: { cols: String(cols), items: JSON.stringify(items) } });
export const testimonial = (q: string, name: string, role: string) => ({ type: "testimonial", props: { quote: q, name, role, photo: "" } });
export const table = (rows: string[][]) => ({ type: "table", content: { type: "tableContent", headerRows: 1, rows: rows.map((cells) => ({ cells })) } });
export const images = (list: { url: string; caption: string }[]) => ({ type: "imageRow", props: { images: JSON.stringify(list) } });
export const PRICING = { type: "pricingTable" };
export const ACCEPT = { type: "acceptBlock" };

// Abstract artwork that ships with the app, so a template never looks empty. Replace with your own.
export const ART = { cool: "/img/art/cool-1.svg", deep: "/img/art/cool-2.svg", warm: "/img/art/warm-1.svg", sage: "/img/art/sage-1.svg" };
