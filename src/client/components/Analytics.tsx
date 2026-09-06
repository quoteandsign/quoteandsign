import { useEffect, useState } from "react";
import { X, DeviceMobile, Desktop } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { Button, StatusBadge, Skeleton } from "./ui";

export type Analytics = {
  title: string;
  status: string;
  sentAt: number | null;
  acceptedAt: number | null;
  signerName: string | null;
  opens: number;
  people: number;
  firstViewedAt: number | null;
  lastViewedAt: number | null;
  readSeconds: number;
  questions: number;
  byDay: { day: string; opens: number }[];
  devices: { phone: number; desktop: number };
  countries: { country: string; opens: number }[];
  sections: { id: string; title: string; seconds: number }[];
};

/** "45 s", "4 min", "1 h 12 min". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function ago(ms: number): string {
  const d = Date.now() - ms;
  const m = Math.round(d / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

const fmtDay = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const daysBetween = (a: number, b: number) => Math.max(0, Math.round((b - a) / 86_400_000));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-stone-900/[.04] p-3.5 dark:bg-white/[.06]">
      <div className="text-[12px] text-graphite dark:text-stone-400">{label}</div>
      <div className="mt-0.5 text-[24px] font-semibold tabular-nums leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-graphite dark:text-stone-400">{sub}</div>}
    </div>
  );
}

/** A right-hand sheet with the full picture for one proposal. */
export function AnalyticsPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Analytics>(`/api/proposals/${id}/analytics`).then(setData, (e) => setError((e as Error).message));
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.opens) ?? [1]));
  const maxSec = Math.max(1, ...(data?.sections.map((s) => s.seconds) ?? [1]));
  const deviceTotal = (data?.devices.phone ?? 0) + (data?.devices.desktop ?? 0);

  return (
    <div role="dialog" aria-modal="true" aria-label="Proposal analytics" className="fixed inset-0 z-30 flex justify-end bg-stone-950/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto bg-white p-6 text-ink shadow-2xl sm:p-8 dark:bg-stone-900 dark:text-stone-50" onClick={(e) => e.stopPropagation()} data-test="analytics">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium uppercase tracking-wide text-graphite dark:text-stone-400">Analytics</div>
            <h2 className="mt-1 truncate text-[22px] font-semibold tracking-tight">{data?.title ?? "…"}</h2>
            {data && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-graphite dark:text-stone-400">
                <StatusBadge status={data.status} />
                {data.sentAt && <span>Sent {fmtDay(new Date(data.sentAt).toISOString().slice(0, 10))}</span>}
                {data.acceptedAt && data.sentAt && <span>Accepted by {data.signerName} in {daysBetween(data.sentAt, data.acceptedAt)} days</span>}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X size={18} weight="light" />
          </Button>
        </div>

        {error && <p className="mt-6 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{error}</p>}
        {!data && !error && (
          <div className="mt-6 grid gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        )}

        {data && data.opens === 0 && (
          <p className="mt-6 rounded-xl bg-stone-900/[.04] p-4 text-[14px] text-graphite dark:bg-white/[.06] dark:text-stone-400">
            Nobody has opened this yet. Once your client opens the link you will see when, from where, and how long they spend on each part.
          </p>
        )}

        {data && data.opens > 0 && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile label="Opens" value={String(data.opens)} sub={data.lastViewedAt ? `Last ${ago(data.lastViewedAt)}` : undefined} />
              <Tile label="People" value={String(data.people)} sub="devices seen" />
              <Tile label="Reading time" value={duration(data.readSeconds)} sub="all visits" />
              <Tile label="Questions" value={String(data.questions)} />
            </div>

            <section className="mt-8" aria-label="Opens by day">
              <h3 className="text-[13px] font-semibold">Opens, last 14 days</h3>
              <div className="mt-3 flex h-24 items-end gap-[3px]" role="img" aria-label={data.byDay.map((d) => `${fmtDay(d.day)}: ${d.opens}`).join(", ")}>
                {data.byDay.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${fmtDay(d.day)}: ${d.opens} ${d.opens === 1 ? "open" : "opens"}`}>
                    <div className="w-full rounded-t-[4px] bg-brand transition-[opacity] group-hover:opacity-80 dark:bg-indigo-400" style={{ height: `${Math.max(d.opens ? 6 : 2, (d.opens / maxDay) * 100)}%`, opacity: d.opens ? 1 : 0.25 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[11.5px] text-graphite dark:text-stone-400">
                <span>{fmtDay(data.byDay[0]!.day)}</span>
                <span>Today</span>
              </div>
            </section>

            <section className="mt-8" aria-label="Time per section">
              <h3 className="text-[13px] font-semibold">Time per section</h3>
              <p className="mt-0.5 text-[12px] text-graphite dark:text-stone-400">Where your client spent their reading time.</p>
              <ul className="mt-3 grid gap-2">
                {data.sections.map((s) => (
                  <li key={s.id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
                    <span className="truncate">{s.title}</span>
                    <span className="h-2 rounded-[4px] bg-stone-900/[.06] dark:bg-white/[.08]">
                      <span className="block h-full rounded-[4px] bg-brand dark:bg-indigo-400" style={{ width: `${(s.seconds / maxSec) * 100}%` }} />
                    </span>
                    <span className="w-14 text-right tabular-nums text-graphite dark:text-stone-400">{s.seconds ? duration(s.seconds) : "–"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <section aria-label="Devices">
                <h3 className="text-[13px] font-semibold">Devices</h3>
                <div className="mt-3 flex h-2 overflow-hidden rounded-[4px] bg-stone-900/[.06] dark:bg-white/[.08]">
                  <span className="bg-brand dark:bg-indigo-400" style={{ width: `${deviceTotal ? (data.devices.phone / deviceTotal) * 100 : 0}%` }} />
                  <span className="bg-brand/35 dark:bg-indigo-400/40" style={{ width: `${deviceTotal ? (data.devices.desktop / deviceTotal) * 100 : 0}%` }} />
                </div>
                <div className="mt-2 flex gap-4 text-[13px] text-graphite dark:text-stone-400">
                  <span className="inline-flex items-center gap-1.5"><DeviceMobile size={14} /> Phone {data.devices.phone}</span>
                  <span className="inline-flex items-center gap-1.5"><Desktop size={14} /> Desktop {data.devices.desktop}</span>
                </div>
              </section>
              <section aria-label="Where">
                <h3 className="text-[13px] font-semibold">Where</h3>
                {data.countries.length === 0 ? (
                  <p className="mt-3 text-[13px] text-graphite dark:text-stone-400">Location shows once the site is live.</p>
                ) : (
                  <ul className="mt-3 grid gap-1 text-[13px]">
                    {data.countries.map((c) => (
                      <li key={c.country} className="flex justify-between">
                        <span>{c.country}</span>
                        <span className="tabular-nums text-graphite dark:text-stone-400">{c.opens}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
