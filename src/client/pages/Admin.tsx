import { useEffect, useState } from "react";
import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { ThemeToggle } from "../lib/theme";
import { Button, Input, Skeleton, Wordmark, cn } from "../components/ui";
import { ago } from "../components/Analytics";
import { formatMoney } from "../../shared/pricing";

// The admin area: who is here, what they are doing, and the messages waiting for an answer.
// Only accounts listed in ADMIN_EMAILS see it; everyone else gets a 404 from the API.

type Overview = { users: number; byPlan: Record<string, number>; trialing: number; newUsers30: number; proposals: number; sent30: number; accepted30: number; acceptedTotal30: number; openTickets: number; subscribers: number; images: number; storageBytes: number; storageLimitBytes: number };
type Person = { id: string; email: string; brandName: string | null; plan: string; effective: string; interval: string | null; trialEndsAt: number | null; createdAt: number; marketingOptIn: boolean; proposals: number; accepted: number; lastSeen: number | null };
type Ticket = { id: string; kind: string; name: string; email: string; subject: string; status: string; userId: string | null; createdAt: number; updatedAt: number };
type Message = { id: string; from: string; body: string; createdAt: number };

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[1.25rem] bg-white p-4 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]">
      <div className="text-[12.5px] text-stone-500">{label}</div>
      <div className="mt-1 text-[26px] font-[650] leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-stone-500">{sub}</div>}
    </div>
  );
}

export function Admin() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<"overview" | "tickets" | "people" | "settings">(() => (new URLSearchParams(location.search).get("ticket") ? "tickets" : "overview"));
  const [gaId, setGaId] = useState("");
  const [gaState, setGaState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [gaError, setGaError] = useState<string | null>(null);
  useEffect(() => { api<{ analyticsId: string | null }>("/api/admin/settings").then((r) => setGaId(r.analyticsId ?? ""), () => {}); }, []);
  const saveGa = async () => {
    setGaState("saving");
    setGaError(null);
    try {
      const r = await api<{ analyticsId: string | null }>("/api/admin/settings", { method: "PUT", json: { analyticsId: gaId } });
      setGaId(r.analyticsId ?? "");
      setGaState("saved");
      setTimeout(() => setGaState("idle"), 1500);
    } catch (e) {
      setGaState("error");
      setGaError((e as Error).message);
    }
  };
  const [overview, setOverview] = useState<Overview | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticketStatus, setTicketStatus] = useState<"open" | "closed">("open");
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(location.search).get("ticket"));
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Message[] } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadTickets = () => api<{ tickets: Ticket[] }>(`/api/admin/tickets?status=${ticketStatus}`).then((r) => setTickets(r.tickets), (e) => setError((e as Error).message));
  useEffect(() => {
    api<Overview>("/api/admin/overview").then(setOverview, (e) => setError((e as Error).message));
    api<{ people: Person[] }>("/api/admin/people").then((r) => setPeople(r.people), () => {});
  }, []);
  useEffect(() => { void loadTickets(); }, [ticketStatus]);
  useEffect(() => {
    if (!openId) return setThread(null);
    api<{ ticket: Ticket; messages: Message[] }>(`/api/admin/tickets/${openId}`).then(setThread, (e) => setError((e as Error).message));
  }, [openId]);

  const send = async (close: boolean) => {
    if (!openId || !reply.trim()) return;
    setBusy(true);
    try {
      await api(`/api/admin/tickets/${openId}/reply`, { method: "POST", json: { body: reply.trim(), close } });
      setReply("");
      const t = await api<{ ticket: Ticket; messages: Message[] }>(`/api/admin/tickets/${openId}`);
      setThread(t);
      await loadTickets();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (id: string, status: "open" | "closed") => {
    await api(`/api/admin/tickets/${id}/status`, { method: "POST", json: { status } });
    await loadTickets();
    if (openId === id) setThread((t) => (t ? { ...t, ticket: { ...t.ticket, status } } : t));
  };

  const q = query.trim().toLowerCase();
  const shownPeople = (people ?? []).filter((p) => !q || p.email.includes(q) || (p.brandName ?? "").toLowerCase().includes(q));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur-md dark:border-white/[.08] dark:bg-stone-950/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/app" className="grid h-9 w-9 place-items-center rounded-full text-stone-600 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Back to proposals"><ArrowLeft size={18} weight="light" /></Link>
            <Wordmark className="text-[17px]" />
            <span className="rounded-full bg-stone-900/[.06] px-2 py-0.5 text-[11.5px] font-semibold text-stone-600 dark:bg-white/10 dark:text-stone-300">Admin</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-32 pt-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[40px] font-[650] leading-none tracking-[-0.035em]">Admin</h1>
          <div role="tablist" className="grid grid-cols-4 gap-1 rounded-full bg-stone-900/[.06] p-1 dark:bg-white/[.08]">
            {(["overview", "tickets", "people", "settings"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-full px-4 text-[13px] font-medium capitalize transition-colors", tab === t ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite hover:text-ink dark:text-stone-400")}>
                {t}{t === "tickets" && overview && overview.openTickets > 0 ? ` · ${overview.openTickets}` : ""}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mt-6 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{error}</p>}

        {tab === "overview" && (
          !overview ? <div className="mt-8 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-[1.25rem]" />)}</div> : (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Stat label="Accounts" value={String(overview.users)} sub={`${overview.newUsers30} new in 30 days · ${overview.trialing} on trial`} />
              <Stat label="Paying" value={String((overview.byPlan.pro ?? 0) + (overview.byPlan.business ?? 0))} sub={`${overview.byPlan.pro ?? 0} Pro · ${overview.byPlan.business ?? 0} Business`} />
              <Stat label="Signed in 30 days" value={String(overview.accepted30)} sub={`${formatMoney(overview.acceptedTotal30, "USD")} one-time, across currencies`} />
              <Stat label="Proposals" value={String(overview.proposals)} sub={`${overview.sent30} sent in 30 days`} />
              <Stat label="Open tickets" value={String(overview.openTickets)} />
              <Stat label="Email subscribers" value={String(overview.subscribers)} sub="Ticked the box at sign-in" />
              <Stat label="Image storage" value={`${(overview.storageBytes / 1048576).toFixed(0)} MB`} sub={`${overview.images} images · free tier stops at ${Math.round(overview.storageLimitBytes / 1048576)} MB${overview.storageBytes > overview.storageLimitBytes * 0.7 ? " · time to move to Workers Paid" : ""}`} />
            </div>
          )
        )}

        {tab === "tickets" && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
            <div>
              <div role="radiogroup" className="mb-3 inline-grid grid-cols-2 gap-0.5 rounded-full bg-stone-900/[.06] p-0.5 dark:bg-white/[.08]">
                {(["open", "closed"] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={ticketStatus === s} onClick={() => setTicketStatus(s)} className={cn("h-8 rounded-full px-4 text-[13px] font-medium capitalize", ticketStatus === s ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite dark:text-stone-400")}>{s}</button>)}
              </div>
              <ul className="divide-y divide-hairline rounded-[1.25rem] bg-white ring-1 ring-inset ring-stone-900/[.035] dark:divide-white/[.08] dark:bg-stone-900 dark:ring-white/[.08]" data-test="ticket-list">
                {tickets?.length === 0 && <li className="px-4 py-8 text-center text-[13.5px] text-stone-500">Nothing here.</li>}
                {(tickets ?? []).map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpenId(t.id)} className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-stone-900/[.03] dark:hover:bg-white/[.05]", openId === t.id && "bg-stone-900/[.04] dark:bg-white/[.06]")}>
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-[14px] font-medium">{t.subject}</span><span className="flex-none text-[11.5px] text-stone-500">{ago(t.updatedAt)}</span></div>
                      <div className="truncate text-[12.5px] text-stone-500">{t.name} · {t.email} · {t.kind}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {!thread ? (
                <p className="rounded-[1.25rem] bg-stone-900/[.03] px-6 py-16 text-center text-[14px] text-stone-500 dark:bg-white/[.04]">Pick a ticket.</p>
              ) : (
                <div className="rounded-[1.25rem] bg-white p-5 ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:ring-white/[.08]" data-test="ticket-thread">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{thread.ticket.subject}</h2>
                      <p className="text-[13px] text-stone-500">{thread.ticket.name} · <a className="underline underline-offset-4" href={`mailto:${thread.ticket.email}`}>{thread.ticket.email}</a> · {thread.ticket.kind} · opened {fmtDay(thread.ticket.createdAt)} · #{thread.ticket.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void setStatus(thread.ticket.id, thread.ticket.status === "open" ? "closed" : "open")}>{thread.ticket.status === "open" ? "Close" : "Reopen"}</Button>
                  </div>
                  <ol className="mt-5 grid gap-3">
                    {thread.messages.map((m) => (
                      <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-[14px] whitespace-pre-wrap", m.from === "admin" ? "ml-auto bg-brand/10" : "bg-stone-900/[.04] dark:bg-white/[.06]")}>
                        <div className="mb-1 text-[11.5px] text-stone-500">{m.from === "admin" ? "You" : thread.ticket.name} · {ago(m.createdAt)}</div>
                        {m.body}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 grid gap-2">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={5000} placeholder="Write a reply. It goes out by email." aria-label="Reply" className="w-full resize-y rounded-xl border border-hairline bg-transparent px-3 py-2 text-[14px] outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20 dark:border-white/15" />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy || !reply.trim()} onClick={() => void send(false)}>{busy ? "Sending…" : "Send reply"}</Button>
                      <Button variant="secondary" disabled={busy || !reply.trim()} onClick={() => void send(true)}>Send and close</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <section className="mt-8 max-w-xl rounded-[1.25rem] bg-white p-6 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]" data-test="admin-settings">
            <div className="text-[15px] font-semibold">Google Analytics</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-stone-500">Paste the measurement id from Google Analytics (it starts with G-), or a Tag Manager container id (GTM-). Leave it empty to turn analytics off. It runs on the homepage, sign-in, contact and legal pages, and only after a visitor clicks Allow in the cookie notice. Proposal pages never carry it.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Input aria-label="Google Analytics id" value={gaId} onChange={(e) => setGaId(e.target.value)} placeholder="G-XXXXXXXXXX" className="w-[220px] font-mono text-[14px]" spellCheck={false} />
              <Button size="md" disabled={gaState === "saving"} onClick={() => void saveGa()}>{gaState === "saving" ? "Saving…" : gaState === "saved" ? "Saved" : "Save"}</Button>
            </div>
            {gaError && <p role="alert" className="mt-2 text-[13px] text-red-700 dark:text-red-400">{gaError}</p>}
          </section>
        )}

        {tab === "people" && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email or business" aria-label="Search people" className="h-10 w-full max-w-xs rounded-full bg-stone-900/[.05] px-4 text-[14px] outline-none placeholder:text-stone-400 focus:bg-white focus:shadow-[0_0_0_2px_rgba(43,63,140,.25)] dark:bg-white/[.07] dark:focus:bg-stone-900" />
              <a href="/api/admin/subscribers.csv" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-900/[.05] px-3.5 text-[13px] font-medium hover:bg-stone-900/[.08] dark:bg-white/[.08]"><DownloadSimple size={15} weight="light" /> Subscribers CSV</a>
            </div>
            <div className="mt-4 overflow-x-auto rounded-[1.25rem] bg-white ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:ring-white/[.08]">
              <table className="w-full text-[13.5px]">
                <thead className="text-left text-[12px] text-stone-500"><tr><th className="px-4 py-3 font-medium">Account</th><th className="px-3 py-3 font-medium">Plan</th><th className="px-3 py-3 font-medium">Proposals</th><th className="px-3 py-3 font-medium">Signed</th><th className="px-3 py-3 font-medium">Emails</th><th className="px-3 py-3 font-medium">Joined</th><th className="px-3 py-3 font-medium">Last seen</th></tr></thead>
                <tbody className="divide-y divide-hairline dark:divide-white/[.08]">
                  {shownPeople.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5"><div className="font-medium">{p.brandName || "No name yet"}</div><div className="text-[12.5px] text-stone-500">{p.email}</div></td>
                      <td className="px-3 py-2.5 capitalize">{p.effective}{p.plan === "free" && p.effective === "pro" ? " (trial)" : ""}{p.interval ? ` · ${p.interval}ly` : ""}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.proposals}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.accepted}</td>
                      <td className="px-3 py-2.5">{p.marketingOptIn ? "Yes" : "No"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtDay(p.createdAt)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.lastSeen ? ago(p.lastSeen) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!user && <Button className="mt-8" onClick={() => navigate("/login")}>Sign in</Button>}
      </main>
    </div>
  );
}
