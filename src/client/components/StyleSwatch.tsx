/** A tiny picture of a page style: the cover treatment plus two lines of "text". */
export function StyleSwatch({ id, accent, className = "h-10 w-14" }: { id: string; accent: string; className?: string }) {
  const cover =
    id === "bold" ? accent
    : id === "night" ? `radial-gradient(100% 100% at 100% 0%, ${accent}, #0e0e11 70%)`
    : id === "warm" ? "#f7f1e6"
    : id === "editorial" || id === "minimal" ? "#ffffff"
    : `linear-gradient(135deg, color-mix(in srgb, ${accent} 78%, #000), ${accent})`;
  const lightText = id === "night" || id === "bold" || id === "classic";
  const ground = id === "night" ? "#0e0e11" : id === "warm" ? "#f7f1e6" : "#fff";
  const line = id === "night" ? "#3a3a40" : "#d6d3d1";
  return (
    <span className={"grid flex-none overflow-hidden rounded-md ring-1 ring-inset ring-stone-900/10 dark:ring-white/10 " + className} style={{ background: ground, gridTemplateRows: "1fr 1fr" }} aria-hidden="true">
      <span className="relative" style={{ background: cover, borderBottom: id === "editorial" ? `2px solid ${accent}` : undefined }}>
        <span className={"absolute left-[12%] top-[30%] h-[14%] w-[50%] rounded-sm " + (lightText ? "bg-white/90" : "bg-stone-900/80")} />
      </span>
      <span className="grid content-start gap-[3px] px-[12%] pt-[10%]">
        <span className="h-[3px] w-[60%] rounded-sm" style={{ background: line }} />
        <span className="h-[3px] w-[40%] rounded-sm" style={{ background: id === "minimal" ? line : accent, opacity: id === "minimal" ? 1 : 0.6 }} />
      </span>
    </span>
  );
}
