import { useEffect, useState } from "react";
import { Plus, DotsThree, SignOut, FileText, UserCircle, Check, ArrowRight, X, MagnifyingGlass, PaperPlaneTilt, Eye, PenNib, ArrowsClockwise, ArrowSquareOut, Archive } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { ThemeToggle } from "../lib/theme";
import { Button, Skeleton, StatusBadge, Wordmark, cn } from "../components/ui";
import { AnalyticsPanel, duration, ago } from "../components/Analytics";
import { formatMoney } from "../../shared/pricing";

type Filter = "all" | "draft" | "sent" | "opened" | "signed" | "declined" | "archived";
const FILTERS: { id: Filter; label: string; test: (r: Row) => boolean }[] = [
  { id: "all", label: "All", test: (r) => r.status !== "archived" },
  { id: "draft", label: "Drafts", test: (r) => r.status === "draft" },
  { id: "sent", label: "Sent", test: (r) => r.status === "sent" || r.status === "viewed" || r.status === "expired" },
  { id: "opened", label: "Opened", test: (r) => r.viewCount > 0 && r.status !== "accepted" && r.status !== "declined" },
  { id: "signed", label: "Signed", test: (r) => r.status === "accepted" },
  { id: "declined", label: "Declined", test: (r) => r.status === "declined" },
  { id: "archived", label: "Archived", test: (r) => r.status === "archived" },
];
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

type Row = {
  id: string;
  publicId: string;
  title: string;
  clientName: string | null;
  status: string;
  sentAt: number | null;
  lastSentAt: number | null;
  sendCount: number;
  clientEmail: string | null;
  firstViewedAt: number | null;
  updatedAt: number;
  viewCount: number;
  acceptedAt: number | null;
  acceptedTotal: number | null;
  signerName: string | null;
  acceptMethod: string | null;
  countersign: boolean;
  countersignedAt: number | null;
  currency: string;
  expiresAt: number | null;
  declinedAt: number | null;
  declineReason: string | null;
  unreadQuestions: number;
  uniqueViewers: number;
  lastViewedAt: number | null;
  readSeconds: number;
};

/** One plain sentence about where a proposal stands. */
function line(r: Row): string {
  const who = r.clientName ? `${r.clientName} · ` : "";
  if (r.status === "draft") return `${who}Edited ${ago(r.updatedAt)}`;
  if (r.status === "accepted") return `${who}Accepted${r.acceptedTotal !== null ? ` for ${formatMoney(r.acceptedTotal, r.currency)}` : ""}${r.acceptedAt ? " · " + ago(r.acceptedAt) : ""}`;
  if (r.status === "archived") return `${who}Archived`;
  if (r.status === "declined") return `${who}Declined${r.declinedAt ? " " + ago(r.declinedAt) : ""}${r.declineReason ? ` · "${r.declineReason}"` : ""}`;
  if (r.status === "expired") return `${who}Expired${r.expiresAt ? " " + ago(r.expiresAt) : ""} · ${r.viewCount === 0 ? "never opened" : `opened ${r.viewCount === 1 ? "once" : `${r.viewCount} times`}`}`;
  if (r.viewCount === 0) return `${who}Sent ${r.sentAt ? ago(r.sentAt) : ""} · not opened yet`;
  const reading = r.readSeconds > 0 ? ` · ${duration(r.readSeconds)} reading` : "";
  return `${who}Opened ${r.viewCount === 1 ? "once" : `${r.viewCount} times`}${r.lastViewedAt ? ` · ${ago(r.lastViewedAt)}` : ""}${reading}`;
}

/**
 * Three stages under a live proposal: sent, opened, signed. A filled circle with a check is done,
 * a hollow one is still to come; the word under each carries the date, so nothing is color alone.
 */
function Journey({ row, onResend, note }: { row: Row; onResend: () => void; note?: string }) {
  const declined = row.status === "declined";
  const opens = row.viewCount;
  const stages: { key: string; label: string; sub: string; done: boolean; icon: React.ReactNode; tone?: "bad" }[] = [
    {
      key: "sent",
      label: row.sendCount > 1 ? `Sent ${row.sendCount}×` : "Sent",
      sub: row.lastSentAt ? fmtDay(row.lastSentAt) : row.sentAt ? fmtDay(row.sentAt) : "Link only",
      done: true,
      icon: <PaperPlaneTilt size={12} weight="bold" />,
    },
    {
      key: "opened",
      label: opens === 0 ? "Opened" : opens === 1 ? "Opened once" : `Opened ${opens}×`,
      sub: opens === 0 ? "Not yet" : `${row.lastViewedAt ? fmtDay(row.lastViewedAt) : ""}${row.readSeconds > 0 ? ` · ${duration(row.readSeconds)} read` : ""}`,
      done: opens > 0,
      icon: <Eye size={12} weight="bold" />,
    },
    declined
      ? { key: "signed", label: "Declined", sub: row.declinedAt ? fmtDay(row.declinedAt) : "", done: true, tone: "bad", icon: <X size={12} weight="bold" /> }
      : {
          key: "signed",
          label: row.acceptedAt ? (row.acceptMethod === "manual" ? "Marked accepted" : `Signed by ${row.signerName ?? "the client"}`) : "Signed",
          sub: row.acceptedAt ? `${fmtDay(row.acceptedAt)}${row.acceptedTotal !== null ? ` · ${formatMoney(row.acceptedTotal, row.currency)}` : ""}${row.countersignedAt ? " · countersigned" : ""}` : row.status === "expired" ? "Expired" : "Not yet",
          done: Boolean(row.acceptedAt),
          icon: <PenNib size={12} weight="bold" />,
        },
  ];
  const canResend = Boolean(row.clientEmail) && row.status !== "accepted";
  // On a phone there is no room for three steps: show the furthest one reached.
  const latest = [...stages].reverse().find((s) => s.done) ?? stages[0]!;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2" data-test="journey">
      <span className="flex items-center gap-2 sm:hidden" aria-label="Progress">
        <span aria-hidden="true" className={cn("grid h-[22px] w-[22px] flex-none place-items-center rounded-full", latest.tone === "bad" ? "bg-rose-600 text-white" : "bg-ink text-white dark:bg-white dark:text-ink")}>
          {latest.tone === "bad" ? latest.icon : <Check size={12} weight="bold" />}
        </span>
        <span className="leading-tight">
          <span className={cn("block text-[12.5px] font-medium", latest.tone === "bad" && "text-rose-700 dark:text-rose-300")}>{latest.label}</span>
          <span className="block text-[11.5px] text-stone-500 tabular-nums">{latest.sub}</span>
        </span>
      </span>
      <ol className="hidden items-center gap-0 sm:flex" aria-label="Progress">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-center">
            {i > 0 && <span aria-hidden="true" className={cn("mx-2 h-px w-6 sm:w-9", stages[i - 1]!.done && s.done ? "bg-ink/40 dark:bg-white/40" : "bg-stone-900/[.12] dark:bg-white/[.14]")} />}
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("grid h-[22px] w-[22px] place-items-center rounded-full", s.tone === "bad" ? "bg-rose-600 text-white" : s.done ? "bg-ink text-white dark:bg-white dark:text-ink" : "ring-[1.5px] ring-inset ring-stone-900/20 text-transparent dark:ring-white/25")}>
                {s.done ? (s.tone === "bad" ? s.icon : <Check size={12} weight="bold" />) : s.icon}
              </span>
              <span className="leading-tight">
                <span className={cn("block text-[12.5px] font-medium", s.done ? "" : "text-stone-500", s.tone === "bad" && "text-rose-700 dark:text-rose-300")}>{s.label}</span>
                <span className="block text-[11.5px] text-stone-500 tabular-nums">{s.sub}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <span className="flex items-center gap-1">
        {row.acceptedAt && row.countersign && !row.countersignedAt && (
          <Link href={`/app/p/${row.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3 text-[12.5px] font-semibold text-white shadow-[0_1px_2px_rgba(43,63,140,.3)] hover:bg-brand-strong">
            <PenNib size={13} weight="bold" /> Your turn: countersign
          </Link>
        )}
        {row.acceptedAt && (
          <a href={`/p/${row.publicId}`} target="_blank" rel="noreferrer" data-test="signed-copy" className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-brand hover:bg-brand/[.08] dark:text-indigo-300" title="The signed page, with the PDF and the record">
            Signed copy <ArrowSquareOut size={13} weight="bold" />
          </a>
        )}
        {canResend && (
          <button type="button" onClick={onResend} data-test="resend" className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]" title={`Email the link again to ${row.clientEmail}`}>
            <ArrowsClockwise size={13} weight="bold" /> Resend
          </button>
        )}
        {note && <span role="status" className="text-[12px] text-stone-500">{note}</span>}
      </span>
    </div>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [resent, setResent] = useState<Record<string, string>>({});
  const resend = async (row: Row) => {
    setResent((m) => ({ ...m, [row.id]: "Sending…" }));
    try {
      const r = await api<{ emailed: number }>(`/api/proposals/${row.id}/send`, { method: "POST", json: {} });
      setResent((m) => ({ ...m, [row.id]: r.emailed ? `Sent again to ${row.clientEmail}` : "Link ready" }));
      await load();
      setTimeout(() => setResent((m) => { const { [row.id]: _drop, ...rest } = m; return rest; }), 4000);
    } catch (e) {
      setResent((m) => ({ ...m, [row.id]: (e as Error).message }));
    }
  };
  // A short setup step until the profile has a business name, or until it is dismissed on this device.
  const promptKey = user ? `qs-setup-dismissed:${user.id}` : null;
  const [setupDismissed, setSetupDismissed] = useState(() => { try { return promptKey ? localStorage.getItem(promptKey) === "1" : true; } catch { return true; } });
  const needsSetup = Boolean(user) && !user?.brandName && !setupDismissed && !user?.workspace;
  const [inviteBusy, setInviteBusy] = useState(false);
  const answerInvite = async (accept: boolean) => {
    setInviteBusy(true);
    try {
      await api(accept ? "/api/team/join" : "/api/team/decline", { method: "POST", json: accept ? { inviteId: user?.pendingInvite?.id } : undefined });
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setInviteBusy(false);
    }
  };
  const dismissSetup = () => { setSetupDismissed(true); try { if (promptKey) localStorage.setItem(promptKey, "1"); } catch {} };

  const load = async () => {
    try {
      setRows((await api<{ proposals: Row[] }>("/api/proposals")).proposals);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-row-menu]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const act = async (fn: () => Promise<unknown>) => {
    setMenu(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copyLink = async (row: Row) => {
    setMenu(null);
    await navigator.clipboard.writeText(`${location.origin}/p/${row.publicId}`);
    setCopied(row.id);
    setTimeout(() => setCopied(null), 1500);
  };
  const rename = async (row: Row, title: string) => {
    setRenaming(null);
    const t = title.trim();
    if (!t || t === row.title) return;
    await act(() => api(`/api/proposals/${row.id}`, { method: "PUT", json: { title: t } }));
  };
  const duplicate = async (row: Row) => {
    setMenu(null);
    try {
      const r = await api<{ id: string }>(`/api/proposals/${row.id}/duplicate`, { method: "POST" });
      navigate(`/app/p/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (row: Row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return setMenu(null);
    await act(() => api(`/api/proposals/${row.id}`, { method: "DELETE" }));
  };

  const q = query.trim().toLowerCase();
  const matches = (r: Row) => !q || r.title.toLowerCase().includes(q) || (r.clientName ?? "").toLowerCase().includes(q) || (r.clientEmail ?? "").toLowerCase().includes(q);
  const everything = rows ?? [];
  const active = everything.filter((r) => matches(r) && FILTERS.find((f) => f.id === filter)!.test(r));
  const live = active.filter((r) => r.status === "sent" || r.status === "viewed").length;

  return (
    <div className="relative min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur-md dark:border-white/[.08] dark:bg-stone-950/80">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
          <Wordmark className="text-[17px]" />
          <div className="flex items-center gap-1">
            {user?.isAdmin && (
              <Link href="/app/admin" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-stone-700 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]">Admin</Link>
            )}
            <a href="/contact" className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-stone-700 hover:bg-stone-900/[.05] sm:inline-flex dark:text-stone-300 dark:hover:bg-white/[.07]">Help</a>
            <Link href="/app/brand" className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13.5px] font-medium text-stone-700 hover:bg-stone-900/[.05] sm:px-3 dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Settings">
              <UserCircle size={17} weight="light" /> <span className="hidden sm:inline">Settings</span>
            </Link>
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Sign out" title={`Sign out ${user?.email ?? ""}`} onClick={() => void logout()}>
              <SignOut size={18} weight="light" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-32 pt-12 sm:px-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[40px] font-[650] leading-none tracking-[-0.035em] sm:text-[48px]">Proposals</h1>
            {user?.workspace && <p className="mt-2 text-[13.5px] text-stone-500">Working in {user.workspace.ownerName}&apos;s team</p>}
            {!user?.workspace && user?.trial && <p className="mt-2 text-[13.5px] text-stone-500">Pro trial, {user.trialDaysLeft} {user.trialDaysLeft === 1 ? "day" : "days"} left. <Link href="/app/brand#plan" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">See plans</Link></p>}
            {!user?.workspace && user?.plan === "free" && rows && rows.length > 0 && <p className="mt-2 text-[13.5px] text-stone-500">{Math.max(0, 3 - live)} of 3 live proposals left on Free</p>}
          </div>
          <Button onClick={() => navigate("/app/templates")} aria-label="New proposal">
            <Plus size={18} weight="bold" /> <span className="hidden sm:inline">New proposal</span><span className="sm:hidden">New</span>
          </Button>
        </div>

        {error && <p className="mt-6 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{error}</p>}

        {!user?.workspace && user?.trial && user.trialDaysLeft <= 3 && (
          <section className="mt-8 rounded-[1.25rem] bg-brand/[.07] p-5 ring-1 ring-inset ring-brand/20 sm:p-6" data-test="trial-ending" aria-label="Trial ending">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Your Pro trial ends {user.trialDaysLeft === 1 ? "today" : `in ${user.trialDaysLeft} days`}</h2>
            <p className="mt-1 max-w-xl text-[14.5px] text-graphite dark:text-stone-400">After that you are on Free: three live proposals at a time and the standard look. Nothing is deleted. Keep everything you have been using from $19 a month.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => navigate("/app/brand#plan")}>See plans</Button>
            </div>
          </section>
        )}
        {user?.pendingInvite && (
          <section className="mt-8 rounded-[1.25rem] bg-brand/[.07] p-5 ring-1 ring-inset ring-brand/20 sm:p-6" data-test="invite" aria-label="Team invitation">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{user.pendingInvite.ownerName} invited you to their team</h2>
            <p className="mt-1 max-w-xl text-[14.5px] text-graphite dark:text-stone-400">Join and you work inside their account: the same proposals, templates and brand. You can leave at any time from your profile.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={inviteBusy} onClick={() => void answerInvite(true)}>Join the team</Button>
              <Button variant="ghost" disabled={inviteBusy} onClick={() => void answerInvite(false)}>Not now</Button>
            </div>
          </section>
        )}
        {needsSetup && (
          <section className="relative mt-8 rounded-[1.25rem] bg-brand/[.07] p-5 ring-1 ring-inset ring-brand/20 sm:p-6" data-test="setup-step" aria-label="Set up your brand">
            <button type="button" onClick={dismissSetup} aria-label="Not now" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-stone-500 hover:bg-stone-900/[.06] dark:hover:bg-white/10">
              <X size={15} weight="bold" />
            </button>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand dark:text-indigo-300">One step before your first proposal</div>
            <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em]">Set up your brand</h2>
            <p className="mt-1 max-w-xl text-[14.5px] text-graphite dark:text-stone-400">Your business name and color go on every proposal automatically. Add your team so they hear the moment a client signs. Two minutes, once.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => navigate("/app/brand")}>Set up brand <ArrowRight size={15} weight="bold" /></Button>
              <Button variant="ghost" onClick={dismissSetup}>Not now</Button>
            </div>
          </section>
        )}

        {rows && everything.length > 0 && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-test="toolbar">
            <label className="relative block w-full sm:max-w-xs">
              <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search proposals or clients" aria-label="Search proposals" className="h-10 w-full rounded-full bg-stone-900/[.05] pl-10 pr-4 text-[14px] outline-none transition-[background-color,box-shadow] placeholder:text-stone-400 focus:bg-white focus:shadow-[0_0_0_2px_rgba(43,63,140,.25)] dark:bg-white/[.07] dark:focus:bg-stone-900" />
            </label>
            <div role="radiogroup" aria-label="Filter proposals" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
              {FILTERS.map((f) => {
                const n = everything.filter((r) => matches(r) && f.test(r)).length;
                const on = filter === f.id;
                if (f.id === "archived" && n === 0 && !on) return null;
                return (
                  <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => setFilter(f.id)} className={cn("flex h-9 flex-none items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors", on ? "bg-ink text-white dark:bg-white dark:text-ink" : "text-graphite hover:bg-stone-900/[.05] dark:text-stone-400 dark:hover:bg-white/[.07]", f.id === "archived" && "ml-2 border-l border-hairline pl-4 dark:border-white/10")}>
                    {f.id === "archived" && <Archive size={14} weight="light" />}
                    {f.label}
                    <span className={cn("tabular-nums", on ? "text-white/60 dark:text-ink/50" : "text-stone-400")}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!rows ? (
          <div className="mt-10 grid gap-2">
            <Skeleton className="h-[72px] rounded-2xl" />
            <Skeleton className="h-[72px] rounded-2xl" />
            <Skeleton className="h-[72px] rounded-2xl" />
          </div>
        ) : active.length === 0 && everything.some((r) => r.status !== "archived") ? (
          <p className="mt-10 rounded-[1.25rem] bg-stone-900/[.03] px-6 py-10 text-center text-[14.5px] text-stone-500 dark:bg-white/[.04]">Nothing matches. <button type="button" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300" onClick={() => { setQuery(""); setFilter("all"); }}>Show everything</button></p>
        ) : active.length === 0 && needsSetup ? null : active.length === 0 ? (
          <div className="mt-10 grid place-items-center rounded-[1.5rem] bg-stone-900/[.04] px-6 py-24 text-center ring-1 ring-inset ring-stone-900/[.06] dark:bg-white/[.05] dark:ring-white/10">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand/12 text-brand dark:text-indigo-300">
              <FileText size={26} weight="light" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Your first proposal</h2>
            <p className="mt-1.5 max-w-sm text-[15px] text-stone-500">Pick a template, add your prices, send a link. Your client accepts on their phone.</p>
            <Button className="mt-6" size="lg" onClick={() => navigate("/app/templates")}>
              <Plus size={18} weight="bold" /> New proposal
            </Button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-hairline border-y border-hairline dark:divide-white/[.08] dark:border-white/[.08]">
            {active.map((row) => (
              <li key={row.id} data-row-menu className="relative flex items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {renaming === row.id ? (
                      <input
                        autoFocus
                        defaultValue={row.title}
                        maxLength={200}
                        aria-label="Proposal title"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(row, (e.target as HTMLInputElement).value);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={(e) => void rename(row, e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-brand/50 bg-white px-2 py-0.5 text-[17px] font-medium outline-none ring-2 ring-brand/20 dark:bg-stone-900"
                      />
                    ) : (
                      <Link href={`/app/p/${row.id}`} className="truncate text-[17px] font-medium tracking-[-0.01em] hover:text-brand dark:hover:text-indigo-300">
                        {row.title}
                      </Link>
                    )}
                    {row.clientName && row.status !== "draft" && row.status !== "archived" && <span className="truncate text-[14px] text-stone-500">for {row.clientName}</span>}
                    <StatusBadge status={row.status} />
                    {row.unreadQuestions > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-medium text-amber-800 dark:text-amber-300">{row.unreadQuestions === 1 ? "1 question" : `${row.unreadQuestions} questions`}</span>}
                  </div>
                  {row.status === "draft" || row.status === "archived" ? (
                    <p className="mt-0.5 truncate text-[13.5px] text-graphite dark:text-stone-400" data-test="row-line">{line(row)}</p>
                  ) : (
                    <Journey row={row} onResend={() => void resend(row)} note={resent[row.id]} />
                  )}
                </div>
                <Button variant="ghost" size="icon" aria-label="More" aria-haspopup="menu" aria-expanded={menu === row.id} onClick={() => setMenu(menu === row.id ? null : row.id)}>
                  {copied === row.id ? <Check size={18} weight="bold" /> : <DotsThree size={20} weight="bold" />}
                </Button>
                {menu === row.id && (
                  <div role="menu" className="absolute right-0 top-12 z-10 w-48 rounded-2xl border border-stone-900/10 bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(25,24,22,.35)] dark:border-white/10 dark:bg-stone-900">
                    <a role="menuitem" className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" href={`/p/${row.publicId}`} target="_blank" rel="noreferrer">Preview</a>
                    {row.status !== "draft" && row.status !== "archived" && (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void copyLink(row)}>Copy link</button>
                    )}
                    {row.status !== "accepted" && row.status !== "archived" && (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => { setMenu(null); setRenaming(row.id); }}>Rename</button>
                    )}
                    <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void duplicate(row)}>Duplicate</button>
                    {row.status !== "draft" && row.status !== "archived" && (
                      <button role="menuitem" data-test="analytics-summary" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => { setMenu(null); setAnalytics(row.id); }}>Analytics</button>
                    )}
                    {user?.plan !== "free" ? (
                      <a role="menuitem" className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" href={`/api/proposals/${row.id}/pdf`}>Download PDF</a>
                    ) : (
                      <a role="menuitem" className="block rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" href="/app/brand">PDF export · Pro</a>
                    )}
                    <a role="menuitem" className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" href={`/api/proposals/${row.id}/export`}>Export JSON</a>
                    {row.status !== "accepted" && row.status !== "archived" && row.status !== "declined" && (
                      <>
                        <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => { if (confirm(`Mark "${row.title}" as accepted? Use this when the client agreed by email, phone or on paper. It is recorded as marked by you.`)) void act(() => api(`/api/proposals/${row.id}/mark`, { method: "POST", json: { status: "accepted" } })); else setMenu(null); }}>Mark as accepted</button>
                        <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void act(() => api(`/api/proposals/${row.id}/mark`, { method: "POST", json: { status: "declined" } }))}>Mark as declined</button>
                      </>
                    )}
                    {row.status === "declined" && (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void act(() => api(`/api/proposals/${row.id}/mark`, { method: "POST", json: { status: "open" } }))}>Reopen</button>
                    )}
                    {row.status !== "archived" ? (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void act(() => api(`/api/proposals/${row.id}/archive`, { method: "POST" }))}>Archive</button>
                    ) : (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-900/[.05] dark:hover:bg-white/[.07]" onClick={() => void act(() => api(`/api/proposals/${row.id}/restore`, { method: "POST" }))}>Restore</button>
                    )}
                    {row.status !== "accepted" && (
                      <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-700 hover:bg-red-600/10 dark:text-red-400" onClick={() => void remove(row)}>Delete</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      </main>
      {analytics && <AnalyticsPanel id={analytics} onClose={() => setAnalytics(null)} />}
    </div>
  );
}
