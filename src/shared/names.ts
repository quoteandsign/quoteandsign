/** A business name never shows an email address. Anything with "@" is treated as unset. */
export function businessName(brandName: string | null | undefined, name: string | null | undefined, fallback = ""): string {
  const clean = (v: string | null | undefined) => (v && !v.includes("@") ? v.trim() : "");
  return clean(brandName) || clean(name) || fallback;
}
