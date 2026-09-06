import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, X } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { ThemeToggle } from "../lib/theme";
import { Wordmark, cn } from "../components/ui";
import { TEMPLATES } from "../../shared/templates";

// Each card is the real client page, scaled down, already in your brand color and style.
const FRAME_W = 1200;
const FRAME_H = 1500;

type Saved = { id: string; name: string; title: string; style: string | null; accentColor: string | null; createdAt: number };

function Thumb({ src, name }: { src: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e!.contentRect.width / FRAME_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[16/10] overflow-hidden sm:aspect-[4/3] rounded-[calc(1.5rem-0.375rem)] bg-paper dark:bg-stone-950">
      <iframe src={src} title={`${name} preview`} tabIndex={-1} aria-hidden="true" loading="lazy" className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})` }} />
    </div>
  );
}

function Card({ id, name, blurb, src, previewHref, busy, onUse, onDelete }: { id: string; name: string; blurb: string; src: string; previewHref: string; busy: boolean; onUse: () => void; onDelete?: () => void }) {
  return (
    <article data-template={id} className="group relative rounded-[1.5rem] bg-stone-900/[.04] p-1.5 ring-1 ring-inset ring-stone-900/[.06] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(25,24,22,.35)] dark:bg-white/[.05] dark:ring-white/10">
      <button type="button" disabled={busy} onClick={onUse} className="block w-full text-left" aria-label={`Use ${name}`}>
        <Thumb src={src} name={name} />
        <div className="px-3 pb-3 pt-3">
          <div className="text-[16px] font-semibold tracking-[-0.01em]">{busy ? "Creating…" : name}</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-stone-500">{blurb}</div>
        </div>
      </button>
      <a href={previewHref} target="_blank" rel="noopener" className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1 rounded-full bg-white/90 px-2.5 text-[12.5px] font-medium text-stone-700 opacity-0 ring-1 ring-inset ring-stone-900/10 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 dark:bg-stone-800 dark:text-stone-200 dark:ring-white/10">
        Preview <ArrowUpRight size={12} weight="bold" />
      </a>
      {onDelete && (
        <button type="button" aria-label={`Delete template ${name}`} onClick={onDelete} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-stone-500 opacity-0 ring-1 ring-inset ring-stone-900/10 transition-opacity hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100 dark:bg-stone-800 dark:ring-white/10">
          <X size={13} weight="bold" />
        </button>
      )}
    </article>
  );
}

// The currency a new proposal starts in, from the browser's region. Changeable per proposal.
function localCurrency(): string {
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const map: Record<string, string> = { CA: "CAD", US: "USD", GB: "GBP", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", JP: "JPY", IN: "INR", SG: "SGD", MX: "MXN", BR: "BRL", ZA: "ZAR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR" };
  return map[region] ?? "USD";
}

export function Templates() {
  const { navigate } = useRouter();
  const { user } = useAuth();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const q = (base: string, style: string | null | undefined, thumb: boolean) => {
    const p = new URLSearchParams();
    if (thumb) p.set("thumb", "1");
    if (style) p.set("style", style);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const loadSaved = () => api<{ templates: Saved[] }>("/api/templates").then((r) => setSaved(r.templates), () => {});
  useEffect(() => {
    void loadSaved();
  }, []);

  const create = async (key: string, body: Record<string, unknown>) => {
    setCreating(key);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/proposals", { method: "POST", json: { ...body, currency: localCurrency() } });
      navigate(`/app/p/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(null);
    }
  };
  const remove = async (t: Saved) => {
    if (!confirm(`Delete the template "${t.name}"? Proposals made from it are not affected.`)) return;
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" });
      await loadSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur-md dark:border-white/[.08] dark:bg-stone-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2">
            <Link href="/app" className="grid h-9 w-9 place-items-center rounded-full text-stone-600 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Back to proposals">
              <ArrowLeft size={18} weight="light" />
            </Link>
            <Wordmark className="text-[17px]" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-32 pt-12 sm:px-8">
        <h1 className="text-[40px] font-[650] leading-none tracking-[-0.035em] sm:text-[48px]">New proposal</h1>
        <p className="mt-3 max-w-lg text-[16px] text-graphite dark:text-stone-400">
          Pick a starting point. It opens in the editor already in your color, and every word and price is yours to change.
          {!user?.brandName && (
            <>
              {" "}
              <Link href="/app/brand" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Set your brand</Link> once and it shows here.
            </>
          )}
        </p>

        {error && <p role="alert" className="mt-6 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{error}</p>}

        {saved.length > 0 && (
          <section className="mt-10" aria-labelledby="saved-h" data-test="saved-templates">
            <h2 id="saved-h" className="text-[18px] font-semibold tracking-[-0.01em]">Your templates</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((t) => (
                <Card key={t.id} id={`u-${t.id}`} name={t.name} blurb={t.title} src={q(`/t/u/${t.id}`, user?.defaultStyle ?? t.style, true)} previewHref={q(`/t/u/${t.id}`, user?.defaultStyle ?? t.style, false)} busy={creating === t.id} onUse={() => void create(t.id, { userTemplate: t.id })} onDelete={() => void remove(t)} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10" aria-labelledby="starters-h">
          {saved.length > 0 && <h2 id="starters-h" className="text-[18px] font-semibold tracking-[-0.01em]">Templates</h2>}
          <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", saved.length > 0 && "mt-4")}>
            {TEMPLATES.map((t) => (
              <Card key={t.id} id={t.id} name={t.name} blurb={t.summary} src={q(`/t/${t.id}`, user?.defaultStyle ?? t.style, true)} previewHref={q(`/t/${t.id}`, user?.defaultStyle ?? t.style, false)} busy={creating === t.id} onUse={() => void create(t.id, { template: t.id })} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
