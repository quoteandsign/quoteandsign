import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Plus, X, UploadSimple, DownloadSimple } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";
import { PlanTag } from "../components/ui";
import { shrinkImage } from "../lib/image";
import { ThemeToggle } from "../lib/theme";
import { Button, Input, Wordmark, cn } from "../components/ui";
import { StyleSwatch } from "../components/StyleSwatch";
import { STYLES } from "../../shared/styles";
import { LOOKS, isHex } from "../../shared/looks";
import { businessName } from "../../shared/names";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Set once. Every new proposal starts with these, and the team hears about every signing. */
export function Profile() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(businessName(user?.brandName, user?.name));
  const [colour, setColour] = useState(user?.brandColor ?? "#2b3f8c");
  const [hex, setHex] = useState(user?.brandColor ?? "#2b3f8c");
  const [style, setStyle] = useState<string | null>(user?.defaultStyle ?? null);
  const [team, setTeam] = useState<string[]>(user?.notifyEmails ?? []);
  const [paymentUrl, setPaymentUrl] = useState(user?.paymentUrl ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [billing, setBilling] = useState<{ plan: string; paidPlan: string; interval: string | null; trial: boolean; trialDaysLeft: number; checkoutAvailable: boolean; yearlyAvailable: boolean; hasBilling: boolean } | null>(null);
  const [interval, setInterval_] = useState<"month" | "year">("year");
  const caps = user?.caps ?? { brand: true, protect: true, payment: true, countersign: false, footerOff: false, pdf: true, notify: true, seats: 0, liveLimit: 3 };
  const [crew, setCrew] = useState<{ seats: number; isOwner: boolean; members: { id: string; email: string; joined: boolean }[] } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const loadTeam = () => api<{ seats: number; isOwner: boolean; members: { id: string; email: string; joined: boolean }[] }>("/api/team").then(setCrew, () => {});
  const invite = async () => {
    setTeamMsg(null);
    try {
      await api("/api/team/invite", { method: "POST", json: { email: inviteEmail } });
      setInviteEmail("");
      await loadTeam();
    } catch (e) {
      setTeamMsg((e as Error).message);
    }
  };
  const removeMember = async (id: string) => {
    await api(`/api/team/${id}`, { method: "DELETE" });
    await loadTeam();
  };
  const leaveTeam = async () => {
    if (!confirm("Leave this team? You go back to your own account.")) return;
    await api("/api/team/leave", { method: "POST" });
    location.href = "/app";
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<{ plan: string; paidPlan: string; interval: string | null; trial: boolean; trialDaysLeft: number; checkoutAvailable: boolean; yearlyAvailable: boolean; hasBilling: boolean }>("/api/billing").then(setBilling, () => {});
    void loadTeam();
    if (location.search.includes("upgraded=1")) setMessage("Thank you. Your plan updates as soon as the payment is confirmed, usually within a minute.");
  }, []);
  const upload = async (original: File) => {
    setBusy("logo");
    setMessage(null);
    try {
      const file = await shrinkImage(original, 512);
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/account/logo", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not upload.");
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const removeLogo = async () => {
    setBusy("logo");
    try {
      await api("/api/account/logo", { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const checkout = async (plan: "pro" | "business", billedInterval: "month" | "year" = interval) => {
    setBusy(plan);
    setMessage(null);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: { plan, interval: billedInterval } });
      location.href = r.url;
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(null);
    }
  };
  const portal = async () => {
    setBusy("portal");
    try {
      const r = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      location.href = r.url;
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(null);
    }
  };
  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await api("/api/account", { method: "DELETE", json: { confirm: confirmDelete } });
      location.href = "/login?deleted=1";
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(null);
    }
  };

  // Colour, style and team follow the profile; the name is seeded once so a refresh never wipes what is being typed.
  useEffect(() => {
    if (user?.brandColor) {
      setColour(user.brandColor);
      setHex(user.brandColor);
    }
    setStyle(user?.defaultStyle ?? null);
  }, [user?.brandColor, user?.defaultStyle]);

  const save = async (patch: Record<string, unknown>) => {
    setState("saving");
    try {
      await api("/auth/me", { method: "PUT", json: patch });
      await refresh();
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    if (name === businessName(user?.brandName, user?.name)) return;
    const t = setTimeout(() => void save({ brandName: name }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  useEffect(() => {
    const valid = team.filter((e) => EMAIL.test(e));
    if (JSON.stringify(valid) === JSON.stringify(user?.notifyEmails ?? [])) return;
    const t = setTimeout(() => void save({ notifyEmails: valid }), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const pick = (c: string) => {
    setColour(c);
    setHex(c);
    void save({ brandColor: c });
  };
  const tile = (on: boolean) =>
    cn("flex flex-col items-start gap-2 rounded-xl p-2 text-left ring-1 ring-inset transition-colors", on ? "bg-ink text-white ring-ink dark:bg-white dark:text-ink dark:ring-white" : "ring-stone-900/[.08] hover:bg-stone-900/[.04] dark:ring-white/10 dark:hover:bg-white/[.06]");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur-md dark:border-white/[.08] dark:bg-stone-950/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2">
            <Link href="/app" className="grid h-9 w-9 place-items-center rounded-full text-stone-600 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Back to proposals">
              <ArrowLeft size={18} weight="light" />
            </Link>
            <Wordmark className="text-[17px]" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-stone-500" aria-live="polite">
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Could not save" : ""}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-32 pt-12 sm:px-8">
        <h1 className="text-[40px] font-[650] leading-none tracking-[-0.035em]">Brand</h1>
        <p className="mt-3 max-w-lg text-[16px] text-graphite dark:text-stone-400">
          Set this once. Every new proposal starts with your name, colour and style, and your team hears the moment a client signs. Signed in as <span className="font-medium text-ink dark:text-stone-200">{user?.email}</span>.
        </p>

        <h2 className="mt-12 text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-500">How your pages look</h2>
        <section className="mt-6">
          <label className="block text-[14px] font-semibold" htmlFor="brandName">Business name</label>
          <p className="mb-2 text-[13px] text-stone-500">Shown on every proposal and in the emails your clients get.</p>
          <Input id="brandName" value={name} maxLength={120} placeholder="Northwind Studio" onChange={(e) => setName(e.target.value)} className="max-w-md text-[16px]" />
        </section>

        <section className="mt-10" data-test="logo">
          <div className="flex items-center gap-2 text-[14px] font-semibold">Logo{!caps.brand && <PlanTag plan="Pro" />}</div>
          <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
          <p className="mb-3 text-[13px] text-stone-500">Shown at the top of every proposal page, next to your name. PNG, JPEG or WebP, up to 1 MB.</p>
          <div className="flex flex-wrap items-center gap-3">
            {user?.brandLogoKey ? (
              <img src={`/files/${user.brandLogoKey}`} alt="Your logo" className="h-12 max-w-[200px] rounded-md object-contain ring-1 ring-inset ring-stone-900/10" />
            ) : (
              <span className="grid h-12 w-24 place-items-center rounded-md bg-stone-900/[.05] text-[12px] text-stone-500 dark:bg-white/[.08]">No logo yet</span>
            )}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a logo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <Button variant="secondary" size="sm" disabled={busy === "logo"} onClick={() => fileInput.current?.click()}>
              <UploadSimple size={15} weight="light" /> {busy === "logo" ? "Uploading…" : user?.brandLogoKey ? "Replace" : "Upload logo"}
            </Button>
            {user?.brandLogoKey && (
              <Button variant="ghost" size="sm" disabled={busy === "logo"} onClick={() => void removeLogo()}>Remove</Button>
            )}
          </div>
          </fieldset>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2 text-[14px] font-semibold">Brand colour{!caps.brand && <PlanTag plan="Pro" />}</div>
          <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
          <p className="mb-3 text-[13px] text-stone-500">The cover, buttons and links take this colour.</p>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Brand colour">
            {LOOKS.map((l) => {
              const on = l.accent === colour.toLowerCase();
              return (
                <button key={l.id} type="button" role="radio" aria-checked={on} aria-label={l.name} title={l.name} onClick={() => pick(l.accent)} className={cn("grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-paper transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] hover:scale-110 dark:ring-offset-stone-950", on ? "ring-ink dark:ring-white" : "ring-transparent")} style={{ background: l.accent }}>
                  {on && <Check size={15} weight="bold" className="text-white" />}
                </button>
              );
            })}
            <label className="ml-2 flex cursor-pointer items-center gap-2 rounded-full bg-stone-900/[.05] py-1.5 pl-1.5 pr-3.5 text-[13px] dark:bg-white/[.08]" title="Pick any colour">
              <span className="h-6 w-6 rounded-full ring-1 ring-inset ring-stone-900/15" style={{ background: isHex(colour) ? colour : "#2b3f8c" }} aria-hidden="true" />
              Any colour
              <input type="color" onBlur={(e) => { if (e.target.value !== (user?.brandColor ?? "")) void save({ brandColor: e.target.value }); }} value={isHex(colour) ? colour : "#2b3f8c"} aria-label="Pick any colour" onChange={(e) => pick(e.target.value)} className="sr-only" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Input aria-label="Brand colour hex" value={hex} maxLength={7} spellCheck={false} className="w-[130px] font-mono text-[13px]" onChange={(e) => { const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value; setHex(v); if (isHex(v)) pick(v.toLowerCase()); }} />
            <span className="text-[13px] text-stone-500">Or paste your exact brand colour.</span>
          </div>
          </fieldset>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2 text-[14px] font-semibold">Style{!caps.brand && <PlanTag plan="Pro" />}</div>
          <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
          <p className="mb-3 text-[13px] text-stone-500">How your pages read. Leave it on Automatic and each template keeps its own.</p>
          <div role="radiogroup" aria-label="Default style" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" role="radio" aria-checked={style === null} onClick={() => { setStyle(null); void save({ defaultStyle: null }); }} className={tile(style === null)}>
              <span aria-hidden="true" className="grid h-12 w-full grid-cols-3 gap-1 rounded-md p-1 ring-1 ring-inset ring-current/10"><span className="rounded-[3px] bg-ink" /><span className="rounded-[3px] bg-[#f7f1e6] ring-1 ring-inset ring-stone-900/10" /><span className="rounded-[3px] bg-white ring-1 ring-inset ring-stone-900/10" /></span>
              <span className="px-0.5 text-[13px] font-medium">Automatic</span>
            </button>
            {STYLES.map((st) => (
              <button key={st.id} type="button" role="radio" aria-checked={st.id === style} title={st.blurb} onClick={() => { setStyle(st.id); void save({ defaultStyle: st.id }); }} className={tile(st.id === style)}>
                <StyleSwatch id={st.id} accent={isHex(colour) ? colour : "#2b3f8c"} className="h-12 w-full" />
                <span className="px-0.5 text-[13px] font-medium">{st.name}</span>
              </button>
            ))}
          </div>
          </fieldset>
        </section>

        <section className="mt-10" data-test="payment">
          <div className="flex items-center gap-2 text-[14px] font-semibold">After a client signs{!caps.payment && <PlanTag plan="Pro" />}</div>
          <fieldset disabled={!caps.payment} className={caps.payment ? "min-w-0" : "min-w-0 opacity-60"}>
          <p className="mb-3 text-[13px] text-stone-500">A payment link shown as a button on the accepted page and in the signed-copy email. Any secure link works: Stripe, PayPal, Interac, an invoice page. A proposal can set its own.</p>
          <div className="flex max-w-md gap-2">
            <Input aria-label="Payment link" type="url" inputMode="url" spellCheck={false} maxLength={500} value={paymentUrl} placeholder="https://buy.stripe.com/…" onChange={(e) => setPaymentUrl(e.target.value)} onBlur={() => { const v = paymentUrl.trim(); if (v !== (user?.paymentUrl ?? "")) void save({ paymentUrl: v || null }); }} />
          </div>
          </fieldset>
        </section>
        <section className="mt-10" data-test="footer">
          <div className="flex items-center gap-2 text-[14px] font-semibold">Footer{!caps.footerOff && <PlanTag plan="Pro" />}</div>
          <p className="mb-3 text-[13px] text-stone-500">A small "Made with Quote and Sign" line at the bottom of every proposal page. On by default; paid plans can turn it off.</p>
          <label className={"flex max-w-md items-start gap-3 rounded-xl bg-stone-900/[.03] p-3 dark:bg-white/[.05] " + (caps.footerOff ? "cursor-pointer" : "opacity-60")} data-test="footer-switch">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" disabled={!caps.footerOff} checked={!user?.hideMadeWith} onChange={(e) => void save({ hideMadeWith: !e.target.checked })} />
            <span className="text-[13.5px]"><span className="font-medium">Show "Made with Quote and Sign" on my pages</span></span>
          </label>
        </section>


        <h2 className="mt-14 border-t border-hairline pt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-500 dark:border-white/10">Notifications</h2>
        <section className="mt-6" data-test="team">
          <div className="text-[14px] font-semibold">Who else hears from us</div>
          <p className="mb-3 text-[13px] text-stone-500">These addresses are emailed, along with you, whenever a client signs or asks a question. Clients never see them.</p>
          <div className="grid max-w-md gap-2">
            {team.map((e, i) => (
              <div key={i} className="flex gap-1.5">
                <Input aria-label={`Team email ${i + 1}`} type="email" inputMode="email" spellCheck={false} maxLength={254} value={e} placeholder="ops@yourbusiness.com" autoFocus={e === ""} onChange={(ev) => setTeam(team.map((x, k) => (k === i ? ev.target.value : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remove team email" onClick={() => setTeam(team.filter((_, k) => k !== i))}>
                  <X size={16} weight="light" />
                </Button>
              </div>
            ))}
            {team.length < 10 && (
              <button type="button" onClick={() => setTeam([...team, ""])} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-brand hover:bg-brand/[.08] dark:text-indigo-300">
                <Plus size={14} weight="bold" /> Add a team email
              </button>
            )}
          </div>
        </section>

        <section className="mt-10" data-test="emails">
          <div className="text-[14px] font-semibold">Emails from us</div>
          <p className="mb-3 text-[13px] text-stone-500">Service emails (sign-in links, opened and signed notices, billing) always arrive. Product news is separate and only with your say-so.</p>
          <label className="flex max-w-md cursor-pointer items-start gap-3 rounded-xl bg-stone-900/[.03] p-3 dark:bg-white/[.05]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={Boolean(user?.marketingOptIn)} onChange={(e) => void save({ marketingOptIn: e.target.checked })} />
            <span className="text-[13.5px]"><span className="font-medium">Send me product news and tips</span><span className="block text-[12.5px] text-stone-500">A few emails a year. Untick any time; this is your consent record.</span></span>
          </label>
        </section>

        <h2 className="mt-14 border-t border-hairline pt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-500 dark:border-white/10">Account</h2>
        <section id="plan" className="mt-6" data-test="plan">
          <div className="text-[14px] font-semibold">Plan</div>
          <p className="mb-4 text-[13px] text-stone-500">
            {billing?.trial
              ? `You are on the Pro trial, ${billing.trialDaysLeft} ${billing.trialDaysLeft === 1 ? "day" : "days"} left. After that, Free keeps three live proposals at a time and the standard look. Nothing is deleted.`
              : billing?.paidPlan === "pro" || billing?.paidPlan === "business"
                ? `You are on ${billing.paidPlan === "pro" ? "Pro" : "Business"}, billed ${billing.interval === "year" ? "yearly" : "monthly"}.`
                : "You are on Free: three live proposals at a time and the standard look. Pro unlocks the rest."}
          </p>
          {billing?.trial && (
            <div className="mb-5 max-w-md" aria-label="Trial progress">
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-900/[.08] dark:bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(((14 - billing.trialDaysLeft) / 14) * 100)}%` }} /></div>
              <div className="mt-1 text-[12px] text-stone-500 tabular-nums">Day {14 - billing.trialDaysLeft + 1} of 14</div>
            </div>
          )}
          {(billing?.paidPlan === "free" || !billing) && (
            <>
              <div role="radiogroup" aria-label="Billing" className="mb-4 inline-grid grid-cols-2 gap-0.5 rounded-full bg-stone-900/[.06] p-0.5 dark:bg-white/[.08]">
                {(["year", "month"] as const).map((i) => (
                  <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setInterval_(i)} className={"h-8 rounded-full px-4 text-[13px] font-medium transition-colors " + (interval === i ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite dark:text-stone-400")}>
                    {i === "year" ? "Yearly, 2 months free" : "Monthly"}
                  </button>
                ))}
              </div>
              <div className="grid max-w-2xl gap-3 sm:grid-cols-2" data-test="plan-cards">
                {([
                  { id: "pro" as const, name: "Pro", month: 24, year: 19, blurb: "For freelancers and studios", items: ["Unlimited proposals", "Your logo, colour and page styles", "Passwords, expiry and reminders", "An email the moment it is opened", "PDF export of drafts, payment link after signing", "Hide the Quote and Sign footer"] },
                  { id: "business" as const, name: "Business", month: 69, year: 59, blurb: "For small agencies", items: ["Everything in Pro", "Up to 10 team members, one brand", "Shared templates", "Countersign after the client", "Priority support"] },
                ]).map((p) => (
                  <div key={p.id} className="flex flex-col rounded-[1.25rem] bg-white p-5 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]">
                    <div className="text-[15px] font-semibold">{p.name}</div>
                    <div className="mt-2 text-[34px] font-[650] leading-none tracking-[-0.03em] tabular-nums">${interval === "year" ? p.year : p.month}<span className="ml-1 text-[13px] font-medium tracking-normal text-stone-500">/month</span></div>
                    <div className="mt-1 text-[12.5px] text-stone-500">{interval === "year" ? `Billed $${p.year * 12} a year` : "Billed monthly"} · {p.blurb}</div>
                    <ul className="mt-4 grid gap-1.5 text-[13.5px] text-stone-700 dark:text-stone-300">{p.items.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-brand" />{x}</li>)}</ul>
                    <Button className="mt-5" variant={p.id === "pro" ? "primary" : "secondary"} disabled={busy !== null} onClick={() => void checkout(p.id)}>{busy === p.id ? "Opening…" : `Choose ${p.name}`}</Button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-stone-500">Prices in USD. Cancel any time and take your data with you.</p>
            </>
          )}
          {billing && billing.paidPlan !== "free" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy !== null || !billing.hasBilling} onClick={() => void portal()}>{busy === "portal" ? "Opening…" : "Manage billing"}</Button>
            </div>
          )}
          {billing && !billing.checkoutAvailable && <p className="mt-2 text-[12.5px] text-stone-500">Payments are not switched on yet. Nothing is charged today.</p>}
          {message && <p role="status" className="mt-3 rounded-xl bg-stone-900/[.04] p-3 text-[13.5px] dark:bg-white/[.06]">{message}</p>}
        </section>

        <section className="mt-10" data-test="team-section">
          <div className="text-[14px] font-semibold">Team</div>
          {user?.workspace ? (
            <>
              <p className="mb-3 text-[13px] text-stone-500">You work inside {user.workspace.ownerName}&apos;s account. Proposals, templates and brand are theirs; only they can change the brand or billing.</p>
              <Button variant="secondary" size="sm" onClick={() => void leaveTeam()}>Leave this team</Button>
            </>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-stone-500">
                {crew && crew.seats > 0
                  ? `Business includes up to ${crew.seats} people. They sign in with their own email and work inside this account.`
                  : "Teams are part of the Business plan: up to 10 people working inside one account, with one brand and shared templates."}
              </p>
              {crew && crew.members.length > 0 && (
                <ul className="mb-3 grid max-w-md gap-1.5">
                  {crew.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-stone-900/[.04] px-3 py-2 text-[13.5px] dark:bg-white/[.06]">
                      <span className="truncate">{m.email} <span className="text-stone-500">{m.joined ? "" : "· invited"}</span></span>
                      <button type="button" onClick={() => void removeMember(m.id)} className="text-[12.5px] font-medium text-stone-500 hover:text-red-700">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              {crew && crew.seats > 0 && crew.members.length < crew.seats && (
                <div className="flex max-w-md gap-2">
                  <Input aria-label="Invite by email" type="email" inputMode="email" value={inviteEmail} placeholder="colleague@yourbusiness.com" onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void invite(); }} />
                  <Button variant="secondary" disabled={!inviteEmail} onClick={() => void invite()}>Invite</Button>
                </div>
              )}
              {teamMsg && <p role="alert" className="mt-2 text-[13px] text-red-700 dark:text-red-400">{teamMsg}</p>}
            </>
          )}
        </section>

        <section className="mt-10" data-test="account">
          <div className="text-[14px] font-semibold">Your data</div>
          <p className="mb-3 text-[13px] text-stone-500">Everything you have made, as one file. Or close the account for good.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/account/export" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-900/[.06] px-3.5 text-[13px] font-medium hover:bg-stone-900/[.1] dark:bg-white/[.08] dark:hover:bg-white/[.14]">
              <DownloadSimple size={15} weight="light" /> Export everything
            </a>
          </div>
          <div className="mt-6 rounded-2xl bg-red-600/[.05] p-4 ring-1 ring-inset ring-red-600/15">
            <div className="text-[13.5px] font-semibold text-red-800 dark:text-red-300">Delete this account</div>
            <p className="mt-1 text-[12.5px] text-stone-600 dark:text-stone-400">Drafts, templates and unsigned proposals are removed now. Signed proposals stay readable at their links, because they are your clients' records too. Type DELETE to confirm.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input aria-label="Type DELETE to confirm" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" className="w-[140px] font-mono text-[13px]" />
              <Button variant="secondary" disabled={confirmDelete !== "DELETE" || busy === "delete"} onClick={() => void deleteAccount()} className="text-red-700 dark:text-red-400">{busy === "delete" ? "Deleting…" : "Delete account"}</Button>
            </div>
          </div>
        </section>
        <p className="mt-14 border-t border-hairline pt-8 text-[14px] text-stone-500 dark:border-white/10">
          Everything here is saved as you go. <Link href="/app/templates" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Start a proposal</Link> or <Link href="/app" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">go back to your proposals</Link>.
        </p>
      </main>
    </div>
  );
}
