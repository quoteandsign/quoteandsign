import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Plus, X, UploadSimple, DownloadSimple, Star } from "@phosphor-icons/react";
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
import { openCookieSettings } from "../components/ConsentBanner";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tab = "brand" | "notifications" | "plan" | "advanced";
const TABS: { id: Tab; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "notifications", label: "Notifications" },
  { id: "plan", label: "Plan" },
  { id: "advanced", label: "Advanced" },
];
const tabFromHash = (): Tab => {
  const h = location.hash.replace("#", "");
  if (h === "plan" || h === "team") return "plan";
  if (h === "notifications" || h === "advanced" || h === "brand") return h;
  if (location.search.includes("upgraded=1")) return "plan";
  return "brand";
};

const PLANS = [
  { id: "pro" as const, name: "Pro", month: 24, year: 19, blurb: "For freelancers and studios", popular: true, items: ["Unlimited proposals", "Your logo, color and page styles", "Passwords, expiry dates and reminders", "An email the moment it is opened", "PDF export and a payment link after signing", "Hide the Quote and Sign footer"] },
  { id: "business" as const, name: "Business", month: 69, year: 59, blurb: "For small agencies", popular: false, items: ["Everything in Pro", "Up to 10 team members, one brand", "Shared templates", "Countersign after the client", "Priority support"] },
];

function SectionTitle({ children, tag, hint }: { children: React.ReactNode; tag?: "Pro" | "Business" | null; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-[15px] font-semibold">{children}{tag && <PlanTag plan={tag} />}</div>
      {hint && <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-stone-500">{hint}</p>}
    </div>
  );
}

/** Set once. Every new proposal starts with these, and the team hears about every signing. */
export function Profile() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  // Arriving by an in-app link ("See plans") mounts this page with the hash already set; follow it.
  useEffect(() => { setTab(tabFromHash()); }, [location.hash]);
  const [name, setName] = useState(businessName(user?.brandName, user?.name));
  const [color, setColour] = useState(user?.brandColor ?? "#2b3f8c");
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
  const [deleteStep, setDeleteStep] = useState<"idle" | "sent">("idle");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<{ plan: string; paidPlan: string; interval: string | null; trial: boolean; trialDaysLeft: number; checkoutAvailable: boolean; yearlyAvailable: boolean; hasBilling: boolean }>("/api/billing").then(setBilling, () => {});
    void loadTeam();
    if (location.search.includes("upgraded=1")) setMessage("Thank you. Your plan updates as soon as the payment is confirmed, usually within a minute.");
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };
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
  const requestDeleteCode = async () => {
    setBusy("delete");
    setDeleteMsg(null);
    try {
      await api("/api/account/delete-code", { method: "POST" });
      setDeleteStep("sent");
    } catch (e) {
      setDeleteMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const deleteAccount = async () => {
    setBusy("delete");
    setDeleteMsg(null);
    try {
      await api("/api/account", { method: "DELETE", json: { code: deleteCode } });
      location.href = "/login?deleted=1";
    } catch (e) {
      setDeleteMsg((e as Error).message);
      setBusy(null);
    }
  };

  // Color, style and team follow the profile; the name is seeded once so a refresh never wipes what is being typed.
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
  const panel = "rounded-[1.25rem] bg-white p-5 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] sm:p-6 dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]";
  const paid = billing?.paidPlan === "pro" || billing?.paidPlan === "business";

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

      <main className="mx-auto max-w-3xl px-5 pb-32 pt-10 sm:px-8">
        <h1 className="text-[36px] font-[650] leading-none tracking-[-0.035em]">Settings</h1>
        <p className="mt-2.5 max-w-lg text-[15px] text-graphite dark:text-stone-400">
          Signed in as <span className="font-medium text-ink dark:text-stone-200">{user?.email}</span>. Everything here saves as you go.
        </p>

        <div role="tablist" aria-label="Settings" className="mt-8 grid grid-cols-4 gap-1 rounded-full bg-stone-900/[.06] p-1 dark:bg-white/[.08]">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`settings-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = TABS.findIndex((x) => x.id === tab);
                const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!.id;
                go(next);
                document.getElementById(`settings-tab-${next}`)?.focus();
              }}
              onClick={() => go(t.id)}
              className={cn("h-9 rounded-full text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200", tab === t.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite hover:text-ink dark:text-stone-400 dark:hover:text-stone-100")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------------- Brand ---------------- */}
        {tab === "brand" && (
          <div id="settings-panel-brand" role="tabpanel" aria-labelledby="settings-tab-brand" className="mt-6 grid gap-4">
            <section className={panel}>
              <SectionTitle hint="Shown on every proposal and in the emails your clients get.">Business name</SectionTitle>
              <label className="sr-only" htmlFor="brandName">Business name</label>
              <Input id="brandName" value={name} maxLength={120} placeholder="Northwind Studio" onChange={(e) => setName(e.target.value)} className="max-w-md text-[16px]" />
            </section>

            <section className={panel} data-test="logo">
              <SectionTitle tag={caps.brand ? null : "Pro"} hint="At the top of every proposal page, next to your name. PNG, JPEG or WebP; it is shrunk before upload.">Logo</SectionTitle>
              <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
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

            <section className={panel}>
              <SectionTitle tag={caps.brand ? null : "Pro"} hint="The cover, buttons and links take this color.">Brand color</SectionTitle>
              <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Brand color">
                  {LOOKS.map((l) => {
                    const on = l.accent === color.toLowerCase();
                    return (
                      <button key={l.id} type="button" role="radio" aria-checked={on} aria-label={l.name} title={l.name} onClick={() => pick(l.accent)} className={cn("grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] hover:scale-110 dark:ring-offset-stone-900", on ? "ring-ink dark:ring-white" : "ring-transparent")} style={{ background: l.accent }}>
                        {on && <Check size={15} weight="bold" className="text-white" />}
                      </button>
                    );
                  })}
                  <label className="ml-2 flex cursor-pointer items-center gap-2 rounded-full bg-stone-900/[.05] py-1.5 pl-1.5 pr-3.5 text-[13px] dark:bg-white/[.08]" title="Pick any color">
                    <span className="h-6 w-6 rounded-full ring-1 ring-inset ring-stone-900/15" style={{ background: isHex(color) ? color : "#2b3f8c" }} aria-hidden="true" />
                    Any color
                    <input type="color" onBlur={(e) => { if (e.target.value !== (user?.brandColor ?? "")) void save({ brandColor: e.target.value }); }} value={isHex(color) ? color : "#2b3f8c"} aria-label="Pick any color" onChange={(e) => { setColour(e.target.value); setHex(e.target.value); }} className="sr-only" />
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Input aria-label="Brand color hex" value={hex} maxLength={7} spellCheck={false} className="w-[130px] font-mono text-[13px]" onChange={(e) => { const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value; setHex(v); if (isHex(v)) pick(v.toLowerCase()); }} />
                  <span className="text-[13px] text-stone-500">Or paste your exact brand color.</span>
                </div>
              </fieldset>
            </section>

            <section className={panel}>
              <SectionTitle tag={caps.brand ? null : "Pro"} hint="How your pages read. Leave it on Automatic and each template keeps its own.">Style</SectionTitle>
              <fieldset disabled={!caps.brand} className={caps.brand ? "min-w-0" : "min-w-0 opacity-60"}>
                <div role="radiogroup" aria-label="Default style" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" role="radio" aria-checked={style === null} onClick={() => { setStyle(null); void save({ defaultStyle: null }); }} className={tile(style === null)}>
                    <span aria-hidden="true" className="grid h-12 w-full grid-cols-3 gap-1 rounded-md p-1 ring-1 ring-inset ring-current/10"><span className="rounded-[3px] bg-ink" /><span className="rounded-[3px] bg-[#f7f1e6] ring-1 ring-inset ring-stone-900/10" /><span className="rounded-[3px] bg-white ring-1 ring-inset ring-stone-900/10" /></span>
                    <span className="px-0.5 text-[13px] font-medium">Automatic</span>
                  </button>
                  {STYLES.map((st) => (
                    <button key={st.id} type="button" role="radio" aria-checked={st.id === style} title={st.blurb} onClick={() => { setStyle(st.id); void save({ defaultStyle: st.id }); }} className={tile(st.id === style)}>
                      <StyleSwatch id={st.id} accent={isHex(color) ? color : "#2b3f8c"} className="h-12 w-full" />
                      <span className="px-0.5 text-[13px] font-medium">{st.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className={panel} data-test="payment">
              <SectionTitle tag={caps.payment ? null : "Pro"} hint="A payment link shown as a button on the accepted page and in the signed-copy email. Any secure link works: Stripe, PayPal, Interac, an invoice page. A proposal can set its own.">After a client signs</SectionTitle>
              <fieldset disabled={!caps.payment} className={caps.payment ? "min-w-0" : "min-w-0 opacity-60"}>
                <div className="flex max-w-md gap-2">
                  <Input aria-label="Payment link" type="url" inputMode="url" spellCheck={false} maxLength={500} value={paymentUrl} placeholder="https://buy.stripe.com/…" onChange={(e) => setPaymentUrl(e.target.value)} onBlur={() => { const v = paymentUrl.trim(); if (v !== (user?.paymentUrl ?? "")) void save({ paymentUrl: v || null }); }} />
                </div>
              </fieldset>
            </section>
          </div>
        )}

        {/* ---------------- Notifications ---------------- */}
        {tab === "notifications" && (
          <div id="settings-panel-notifications" role="tabpanel" aria-labelledby="settings-tab-notifications" className="mt-6 grid gap-4">
            <section className={panel} data-test="team">
              <SectionTitle hint="These addresses are emailed, along with you, whenever a client opens, signs or asks a question. Clients never see them. Extra addresses take effect on a paid plan.">Who else hears from us</SectionTitle>
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
            <section className={panel}>
              <SectionTitle hint="What we send, and when.">What you get</SectionTitle>
              <ul className="grid gap-2 text-[13.5px] text-stone-700 dark:text-stone-300">
                {[
                  ["Opened", caps.notify ? "The first time a client opens a proposal." : "The first time a client opens a proposal. Part of Pro."],
                  ["Signed", "The moment a client accepts, with the signed PDF attached."],
                  ["Declined or asked a question", "Straight away, with what they wrote."],
                  ["Reminders", "Three days before a deadline, and a nudge if a proposal is never opened."],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-3"><span className="w-44 flex-none font-medium">{k}</span><span className="text-stone-500">{v}</span></li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* ---------------- Plan ---------------- */}
        {tab === "plan" && (
          <div id="settings-panel-plan" role="tabpanel" aria-labelledby="settings-tab-plan" className="mt-6 grid gap-4">
            <section id="plan" className={panel} data-test="plan">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">
                    {billing?.trial ? "Pro trial" : paid ? (billing?.paidPlan === "pro" ? "Pro" : "Business") : "Free"}
                    {paid && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Current plan</span>}
                  </div>
                  <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-stone-500">
                    {billing?.trial
                      ? `${billing.trialDaysLeft} ${billing.trialDaysLeft === 1 ? "day" : "days"} left with everything in Pro. After that, Free keeps three live proposals at a time and the standard look. Nothing is deleted.`
                      : paid
                        ? `Billed ${billing?.interval === "year" ? "yearly" : "monthly"}. Change the card, download invoices or cancel from the billing portal.`
                        : "Three live proposals at a time and the standard look. Pro unlocks the rest."}
                  </p>
                </div>
                {paid && <Button variant="secondary" disabled={busy !== null || !billing?.hasBilling} onClick={() => void portal()}>{busy === "portal" ? "Opening…" : "Manage billing"}</Button>}
              </div>
              {billing?.trial && (
                <div className="mt-4 max-w-md" aria-label="Trial progress">
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-900/[.08] dark:bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(((14 - billing.trialDaysLeft) / 14) * 100)}%` }} /></div>
                  <div className="mt-1 text-[12px] text-stone-500 tabular-nums">Day {14 - billing.trialDaysLeft + 1} of 14</div>
                </div>
              )}
              {billing && !billing.checkoutAvailable && <p className="mt-3 text-[12.5px] text-stone-500">Payments are not switched on yet. Nothing is charged today.</p>}
              {message && <p role="status" className="mt-3 rounded-xl bg-stone-900/[.04] p-3 text-[13.5px] dark:bg-white/[.06]">{message}</p>}
            </section>

            {!paid && (
              <section aria-label="Plans">
                <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-[15px] font-semibold">Choose a plan</h2>
                  <div role="radiogroup" aria-label="Billing" className="inline-grid grid-cols-2 gap-0.5 rounded-full bg-stone-900/[.06] p-0.5 dark:bg-white/[.08]">
                    {(["month", "year"] as const).map((i) => (
                      <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setInterval_(i)} className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors", interval === i ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite dark:text-stone-400")}>
                        {i === "year" ? <>Yearly <span className={cn("whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-semibold", interval === i ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : "bg-stone-900/[.06] text-stone-500 dark:bg-white/10")}>2 months free</span></> : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2" data-test="plan-cards">
                  {PLANS.map((p) => (
                    <div key={p.id} className={cn("relative flex flex-col rounded-[1.25rem] bg-white p-6 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset dark:bg-stone-900 dark:shadow-none", p.popular ? "ring-brand/60 dark:ring-indigo-300/50" : "ring-stone-900/[.035] dark:ring-white/[.08]")}>
                      {p.popular && <span className="absolute -top-2.5 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white"><Star size={11} weight="fill" /> Most popular</span>}
                      <div className="text-[15px] font-semibold">{p.name}</div>
                      <div className="text-[13px] text-stone-500">{p.blurb}</div>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-[38px] font-[650] leading-none tracking-[-0.03em] tabular-nums">${interval === "year" ? p.year : p.month}</span>
                        <span className="text-[13px] font-medium text-stone-500">/month</span>
                      </div>
                      <div className="mt-1.5 h-5 text-[12.5px] text-stone-500 tabular-nums">
                        {interval === "year" ? <>${p.year * 12} billed yearly <span className="text-stone-400 line-through">${p.month * 12}</span></> : "Billed monthly, cancel any time"}
                      </div>
                      <ul className="mb-6 mt-5 grid gap-2 text-[13.5px] text-stone-700 dark:text-stone-300">
                        {p.items.map((x) => (
                          <li key={x} className="flex gap-2.5"><Check size={15} weight="bold" className="mt-[3px] flex-none text-brand dark:text-indigo-300" />{x}</li>
                        ))}
                      </ul>
                      <Button className="mt-auto w-full" size="lg" variant="primary" disabled={busy !== null} onClick={() => void checkout(p.id)}>{busy === p.id ? "Opening…" : `Choose ${p.name}`}</Button>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[12.5px] text-stone-500">Prices in USD. Taxes are added at checkout where they apply. Cancel any time and take your data with you.</p>
              </section>
            )}

            <section className={panel} data-test="team-section">
              <SectionTitle>Team</SectionTitle>
              {user?.workspace ? (
                <>
                  <p className="mb-3 text-[13.5px] text-stone-500">You work inside {user.workspace.ownerName}&apos;s account. Proposals, templates and brand are theirs; only they can change the brand or billing.</p>
                  <Button variant="secondary" size="sm" onClick={() => void leaveTeam()}>Leave this team</Button>
                </>
              ) : (
                <>
                  <p className="mb-3 text-[13.5px] text-stone-500">
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
          </div>
        )}

        {/* ---------------- Advanced ---------------- */}
        {tab === "advanced" && (
          <div id="settings-panel-advanced" role="tabpanel" aria-labelledby="settings-tab-advanced" className="mt-6 grid gap-4">
            <section className={panel} data-test="footer">
              <SectionTitle tag={caps.footerOff ? null : "Pro"} hint='A small "Made with Quote and Sign" line at the bottom of every proposal page. On by default; paid plans can turn it off.'>Footer</SectionTitle>
              <label className={"flex max-w-md items-start gap-3 rounded-xl bg-stone-900/[.03] p-3 dark:bg-white/[.05] " + (caps.footerOff ? "cursor-pointer" : "opacity-60")} data-test="footer-switch">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" disabled={!caps.footerOff} checked={!user?.hideMadeWith} onChange={(e) => void save({ hideMadeWith: !e.target.checked })} />
                <span className="text-[13.5px]"><span className="font-medium">Show "Made with Quote and Sign" on my pages</span></span>
              </label>
            </section>

            <section className={panel} data-test="emails">
              <SectionTitle hint="Service emails (sign-in links, opened and signed notices, billing) always arrive. Product news is separate and only with your say-so.">Emails from us</SectionTitle>
              <label className="flex max-w-md cursor-pointer items-start gap-3 rounded-xl bg-stone-900/[.03] p-3 dark:bg-white/[.05]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={Boolean(user?.marketingOptIn)} onChange={(e) => void save({ marketingOptIn: e.target.checked })} />
                <span className="text-[13.5px]"><span className="font-medium">Send me product news and tips</span><span className="block text-[12.5px] text-stone-500">A few emails a year. Untick any time; this is your consent record.</span></span>
              </label>
            </section>

            <section className={panel}>
              <SectionTitle hint="Analytics cookies on the public pages are optional. Change your answer here.">Cookies</SectionTitle>
              <Button variant="secondary" size="sm" onClick={() => openCookieSettings()}>Cookie settings</Button>
            </section>

            <section className={panel} data-test="account">
              <SectionTitle hint="Everything you have made, as one file you can keep or move elsewhere.">Your data</SectionTitle>
              <a href="/api/account/export" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-900/[.06] px-3.5 text-[13px] font-medium hover:bg-stone-900/[.1] dark:bg-white/[.08] dark:hover:bg-white/[.14]">
                <DownloadSimple size={15} weight="light" /> Export everything
              </a>

              <div className="mt-6 rounded-2xl bg-red-600/[.05] p-4 ring-1 ring-inset ring-red-600/15" data-test="delete">
                <div className="text-[13.5px] font-semibold text-red-800 dark:text-red-300">Delete this account</div>
                <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-stone-600 dark:text-stone-400">
                  Drafts, templates and unsigned proposals are removed now. Signed proposals stay readable at their links, because they are your clients&apos; records too. To confirm it is you, we email a six-digit code to {user?.email}.
                </p>
                {deleteStep === "idle" ? (
                  <Button variant="secondary" size="sm" className="mt-3 text-red-700 dark:text-red-400" disabled={busy === "delete"} onClick={() => void requestDeleteCode()}>{busy === "delete" ? "Sending…" : "Email me a code"}</Button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input aria-label="Six-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={deleteCode} onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="w-[120px] font-mono text-[15px] tracking-[0.2em]" autoFocus />
                    <Button variant="secondary" size="md" disabled={deleteCode.length !== 6 || busy === "delete"} onClick={() => void deleteAccount()} className="text-red-700 dark:text-red-400">{busy === "delete" ? "Deleting…" : "Delete account"}</Button>
                    <button type="button" className="text-[12.5px] font-medium text-stone-500 underline underline-offset-4" onClick={() => void requestDeleteCode()}>Send a new code</button>
                  </div>
                )}
                {deleteMsg && <p role="alert" className="mt-2 text-[13px] text-red-700 dark:text-red-400">{deleteMsg}</p>}
              </div>
            </section>
          </div>
        )}

        <p className="mt-12 text-[14px] text-stone-500">
          <Link href="/app/templates" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Start a proposal</Link> or <Link href="/app" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">go back to your proposals</Link>.
        </p>
      </main>
    </div>
  );
}
