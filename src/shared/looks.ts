// Color looks offered in the template gallery. Each is an accent the cover, buttons and
// links take. The sender can change it at any time from the cover.
export type Look = { id: string; name: string; accent: string };

export const LOOKS: Look[] = [
  { id: "ink", name: "Ink", accent: "#2b3f8c" },
  { id: "forest", name: "Forest", accent: "#0f6e4a" },
  { id: "plum", name: "Plum", accent: "#6941c6" },
  { id: "ember", name: "Ember", accent: "#b54708" },
  { id: "rose", name: "Rose", accent: "#c11574" },
  { id: "slate", name: "Slate", accent: "#37404a" },
];

/** Text color that reads on a given accent: ink on light colors, white on dark ones. */
export function readableOn(hex: string): "#2f2e2b" | "#ffffff" {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const lin = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(m[1]!) + 0.7152 * lin(m[2]!) + 0.0722 * lin(m[3]!);
  return L > 0.42 ? "#2f2e2b" : "#ffffff";
}

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
