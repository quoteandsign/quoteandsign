import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, X, CaretDown, CaretRight, Copy, FilePdf, FileArrowDown, BookmarkSimple, Check } from "@phosphor-icons/react";
import { Input, Button, NumberField, PlanTag, cn } from "../components/ui";
import { StyleSwatch } from "../components/StyleSwatch";
import { Link } from "../lib/router";
import { SUPPORTED_CURRENCIES } from "../../shared/pricing";
import { STYLES, styleOf } from "../../shared/styles";
import { LOOKS, isHex } from "../../shared/looks";

export type Details = {
  clientName: string;
  clientEmail: string;
  ccEmails: string[];
  notifyEmails: string[];
  currency: string;
  expiresAt: number | null; // ms, end of that day where the sender is
  hasPassword: boolean;
  taxRateBps: number;
  taxLabel: string;
  remind: boolean;
  paymentUrl: string;
  paymentLabel: string;
  countersign: boolean;
};

/** Per-proposal look. Empty colour or sender means "use the brand". */
export type Look = { style: string; colour: string; senderName: string; brandColour: string };

function dateValue(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function endOfDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime() : null;
}

// ---- Grouped list primitives. One card per topic, one hairline between rows, label left, control right.

const card = "overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]";

function Group({ title, hint, children, locked }: { title: string; hint?: string; children: ReactNode; locked?: "Pro" | "Business" | null }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <div className="px-1">
        <h4 className="flex items-center gap-2 text-[13px] font-semibold text-graphite dark:text-stone-400">{title}{locked && <PlanTag plan={locked} />}</h4>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-stone-500">{locked ? `Part of ${locked}. ` : ""}{hint}</p>}
      </div>
      <fieldset disabled={Boolean(locked)} className={cn(card, locked && "opacity-60")}>
        <div className="divide-y divide-hairline dark:divide-white/[.08]">{children}</div>
      </fieldset>
    </section>
  );
}

/**
 * A group that starts closed and says what is inside: the title on the left, the current value
 * on the right. Open it to change things. The rarely used settings live in these.
 */
function Disclosure({ id, title, summary, hint, locked, open, onToggle, children }: { id: string; title: string; summary: string; hint?: string; locked?: "Pro" | "Business" | null; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={card} aria-label={title} data-test={`opt-${id}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`opt-body-${id}`}
        onClick={onToggle}
        className="flex min-h-[54px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-stone-900/[.03] active:bg-stone-900/[.06] dark:hover:bg-white/[.05]"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[13.5px] font-semibold">{title}</span>
          {locked && <PlanTag plan={locked} />}
        </span>
        <span className={cn("min-w-0 max-w-[55%] truncate text-right text-[13px]", open ? "text-stone-400" : "text-stone-500")}>{summary}</span>
        <CaretDown size={14} weight="bold" className={cn("flex-none text-stone-400 transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]", open && "rotate-180")} />
      </button>
      {open && (
        <fieldset id={`opt-body-${id}`} disabled={Boolean(locked)} className={cn("border-t border-hairline dark:border-white/[.08]", locked && "opacity-60")}>
          {hint && <p className="px-4 pb-1 pt-3 text-[12.5px] leading-snug text-stone-500">{locked ? `Part of ${locked}. ` : ""}{hint}</p>}
          <div className="divide-y divide-hairline dark:divide-white/[.08]">{children}</div>
        </fieldset>
      )}
    </section>
  );
}

function Row({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="px-4 py-2">
      <div className="flex min-h-[40px] items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="shrink-0 text-[13.5px] font-medium">{label}</label>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
      </div>
      {hint && <p className="pb-1 text-[12px] text-stone-500">{hint}</p>}
    </div>
  );
}

/** Text typed straight into a row, right-aligned, no box until you focus it. */
const inline = "h-9 w-full min-w-0 rounded-lg bg-transparent px-2 text-right text-[14px] text-ink outline-none placeholder:text-stone-400 focus:bg-stone-900/[.04] disabled:opacity-60 dark:text-stone-100 dark:focus:bg-white/[.06]";

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cn("relative h-[26px] w-[44px] flex-none rounded-full transition-colors duration-200", checked ? "bg-brand" : "bg-stone-900/15 dark:bg-white/20", disabled && "opacity-60")}>
      <span className={cn("absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)]", checked && "translate-x-[18px]")} />
    </button>
  );
}

function ActionRow({ icon, children, onClick, href, muted, hint }: { icon: ReactNode; children: ReactNode; onClick?: () => void; href?: string; muted?: boolean; hint?: string }) {
  const cls = cn("group flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[13.5px] font-medium transition-colors hover:bg-stone-900/[.03] active:bg-stone-900/[.06] dark:hover:bg-white/[.05]", muted && "text-stone-500");
  const body = (
    <>
      <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg bg-stone-900/[.05] text-stone-700 dark:bg-white/[.08] dark:text-stone-300", muted && "text-stone-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint && <span className="block text-[12px] font-normal text-stone-500">{hint}</span>}
      </span>
      <CaretRight size={14} weight="bold" className="flex-none text-stone-400 transition-transform group-hover:translate-x-0.5" />
    </>
  );
  return href ? <a href={href} className={cls}>{body}</a> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

/** Everything a proposal can have beyond client, pricing and send. Lives on the Options tab. */
export function MoreOptions({
  details,
  onChange,
  onPassword,
  readOnly,
  look,
  onStyle,
  onColour,
  onSender,
  onSaveTemplate,
  onDuplicate,
  exportHref,
  canPdf,
  teamEmails,
  brandPaymentUrl,
  caps,
}: {
  brandPaymentUrl: string | null;
  caps: { brand: boolean; protect: boolean; payment: boolean; countersign: boolean };
  teamEmails: string[];
  details: Details;
  onChange: (d: Details) => void;
  onPassword: (pw: string) => Promise<void>;
  readOnly: boolean;
  look: Look;
  onStyle: (id: string) => void;
  onColour: (hex: string | null) => void;
  onSender: (name: string) => void;
  onSaveTemplate: () => void;
  onDuplicate: () => void;
  exportHref: string;
  canPdf: boolean;
}) {
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const effective = isHex(look.colour) ? look.colour : isHex(look.brandColour) ? look.brandColour : "#2b3f8c";
  const [hex, setHex] = useState(effective);
  useEffect(() => { setHex(effective); }, [effective]);
  const setNotify = (i: number, v: string) => onChange({ ...details, notifyEmails: details.notifyEmails.map((e, k) => (k === i ? v : e)) });
  const current = styleOf(look.style);
  const styleBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!styleOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStyleOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [styleOpen]);

  // What each closed group says about itself.
  const taxText = details.taxRateBps > 0 ? `${details.taxRateBps / 100}% ${details.taxLabel || "tax"}` : "no tax";
  const afterParts = [
    details.paymentUrl ? "Payment link" : brandPaymentUrl ? "Brand payment link" : null,
    details.countersign ? "Countersign" : null,
    details.notifyEmails.filter(Boolean).length ? `${details.notifyEmails.filter(Boolean).length} extra email${details.notifyEmails.filter(Boolean).length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-4" data-test="more-options">
      <Group title="Look" locked={caps.brand ? null : "Pro"}>
        {/* One row that reads as a menu: current style, current colour, a caret. Opens the full picker below it. */}
        <div ref={styleBox}>
          <button
            type="button"
            aria-expanded={styleOpen}
            aria-controls="style-picker"
            disabled={readOnly}
            onClick={() => setStyleOpen((o) => !o)}
            className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-stone-900/[.03] active:bg-stone-900/[.06] disabled:opacity-60 dark:hover:bg-white/[.05]"
            data-test="style-menu"
          >
            <StyleSwatch id={current.id} accent={effective} className="h-9 w-12" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">{current.name}</span>
              <span className="block truncate text-[12px] text-stone-500">{look.colour ? "Own colour for this proposal" : "Your brand colour"}</span>
            </span>
            <span aria-hidden="true" className="h-5 w-5 flex-none rounded-full ring-1 ring-inset ring-black/10" style={{ background: effective }} />
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-stone-900/[.05] pl-3 pr-2 text-[12.5px] font-medium text-stone-700 dark:bg-white/[.08] dark:text-stone-200">
              Change <CaretDown size={13} weight="bold" className={cn("transition-transform duration-200", styleOpen && "rotate-180")} />
            </span>
          </button>
          {styleOpen && (
            <div id="style-picker" className="grid gap-4 border-t border-hairline bg-stone-900/[.02] px-4 pb-4 pt-3 dark:border-white/[.08] dark:bg-white/[.03]">
              <div role="radiogroup" aria-label="Page style" className="grid grid-cols-3 gap-1.5">
                {STYLES.map((st) => {
                  const on = st.id === look.style;
                  return (
                    <button key={st.id} type="button" role="radio" aria-checked={on} disabled={readOnly} title={st.blurb} onClick={() => onStyle(st.id)} className={cn("flex flex-col items-start gap-1 rounded-xl p-1.5 text-left ring-1 ring-inset transition-[background-color,box-shadow] duration-200", on ? "bg-white shadow-[0_1px_2px_rgba(25,24,22,.1)] ring-brand dark:bg-stone-800 dark:ring-indigo-300" : "ring-transparent hover:bg-white/70 dark:hover:bg-white/[.06]")}>
                      <StyleSwatch id={st.id} accent={effective} className="h-9 w-full" />
                      <span className="flex w-full items-center justify-between px-0.5 text-[11.5px] font-medium">{st.name}{on && <Check size={11} weight="bold" className="text-brand dark:text-indigo-300" />}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
                  {LOOKS.map((l) => {
                    const on = l.accent === effective.toLowerCase();
                    return <button key={l.id} type="button" role="radio" aria-checked={on} aria-label={l.name} title={l.name} disabled={readOnly} onClick={() => { setHex(l.accent); onColour(l.accent); }} className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-[#fbfaf7] transition-transform hover:scale-110 dark:ring-offset-stone-900", on ? "ring-ink dark:ring-white" : "ring-transparent")} style={{ background: l.accent }} />;
                  })}
                  <label className="relative ml-auto flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 ring-1 ring-inset ring-stone-900/[.08] dark:bg-stone-800 dark:ring-white/10">
                    <span aria-hidden="true" className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: isHex(hex) ? hex : effective }} />
                    <input aria-label="Colour hex" value={hex} disabled={readOnly} maxLength={7} spellCheck={false} className="w-[68px] bg-transparent font-mono text-[12.5px] outline-none" onChange={(e) => { const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value; setHex(v); if (isHex(v)) onColour(v.toLowerCase()); }} />
                    <input type="color" aria-label="Pick any colour" disabled={readOnly} value={isHex(hex) ? hex : effective} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => { setHex(e.target.value); onColour(e.target.value.toLowerCase()); }} />
                  </label>
                </div>
                <p className="text-[12px] text-stone-500">
                  {look.colour ? (
                    <>This proposal has its own colour. <button type="button" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300" onClick={() => { onColour(null); setHex(isHex(look.brandColour) ? look.brandColour : "#2b3f8c"); }}>Back to my brand colour</button></>
                  ) : (
                    <>Your brand colour. Change it for every proposal under <Link href="/app/brand" className="font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Brand</Link>.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
        <Row label="Signed by" htmlFor="senderName">
          <input id="senderName" value={look.senderName} disabled={readOnly} maxLength={120} placeholder="Your business name" onChange={(e) => onSender(e.target.value)} className={inline} />
        </Row>
      </Group>

      <div className="grid gap-2">
        <h4 className="px-1 text-[13px] font-semibold text-graphite dark:text-stone-400">Settings for this proposal</h4>

        <Disclosure id="money" title="Money" summary={`${details.currency}, ${taxText}`} open={open.has("money")} onToggle={() => toggle("money")}>
          <Row label="Currency" htmlFor="currency">
            <span className="relative inline-flex items-center">
              <select id="currency" value={details.currency} disabled={readOnly} onChange={(e) => onChange({ ...details, currency: e.target.value })} className="h-9 appearance-none rounded-lg bg-stone-900/[.05] pl-3 pr-8 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60 dark:bg-white/[.08]">
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <CaretDown size={13} weight="bold" className="pointer-events-none absolute right-2.5 text-stone-500" />
            </span>
          </Row>
          <Row label="Tax rate" htmlFor="taxRate" hint="One rate for the whole proposal. Any line can be marked not taxable under Pricing.">
            <span className="flex w-28 items-center gap-1.5">
              <NumberField id="taxRate" value={details.taxRateBps === 0 ? null : details.taxRateBps} allowEmpty placeholder="0" max={10_000} decimals={2} disabled={readOnly} onChange={(v) => onChange({ ...details, taxRateBps: v ?? 0 })} />
              <span className="text-[13px] text-stone-500">%</span>
            </span>
          </Row>
          <Row label="Tax name" htmlFor="taxLabel">
            <input id="taxLabel" value={details.taxLabel} disabled={readOnly} maxLength={40} placeholder="HST, VAT…" onChange={(e) => onChange({ ...details, taxLabel: e.target.value })} className={cn(inline, "w-32")} />
          </Row>
        </Disclosure>

        <Disclosure id="deadline" title="Deadline" summary={details.expiresAt ? `Valid until ${fmtDate(details.expiresAt)}` : "None"} hint="After the date the client can still read the proposal, but not accept it." locked={caps.protect ? null : "Pro"} open={open.has("deadline")} onToggle={() => toggle("deadline")}>
          <Row label="Valid until" htmlFor="expires">
            <input id="expires" type="date" value={dateValue(details.expiresAt)} disabled={readOnly} onChange={(e) => onChange({ ...details, expiresAt: endOfDay(e.target.value) })} className={cn(inline, "w-auto")} />
          </Row>
          {details.expiresAt && (
            <Row label="Remind them 3 days before">
              <Toggle checked={details.remind} disabled={readOnly} onChange={(v) => onChange({ ...details, remind: v })} label="Remind the client 3 days before" />
            </Row>
          )}
        </Disclosure>

        <Disclosure id="access" title="Access" summary={details.hasPassword ? "Password set" : "Anyone with the link"} hint={details.hasPassword ? "A password is set. Enter a new one to change it, or remove it." : "Optional. Share the password with your client separately."} locked={caps.protect ? null : "Pro"} open={open.has("access")} onToggle={() => toggle("access")}>
          <Row label="Link password" htmlFor="pw">
            <input id="pw" type="text" autoComplete="off" spellCheck={false} maxLength={200} value={pw} disabled={readOnly} onChange={(e) => setPw(e.target.value)} placeholder={details.hasPassword ? "••••••••" : "None"} className={inline} />
            <Button variant="secondary" size="sm" disabled={readOnly || pwBusy || (!pw && !details.hasPassword)} onClick={async () => { setPwBusy(true); try { await onPassword(pw); setPw(""); } finally { setPwBusy(false); } }}>
              {pw ? "Set" : details.hasPassword ? "Remove" : "Set"}
            </Button>
          </Row>
        </Disclosure>

        <Disclosure id="after" title="After they sign" summary={afterParts.length ? afterParts.join(", ") : "Email to you"} hint={teamEmails.length ? `You and your team (${teamEmails.join(", ")}) get an email when the client signs.` : "You get an email when the client signs."} open={open.has("after")} onToggle={() => toggle("after")}>
          <Row label="Payment link" htmlFor="paymentUrl" hint={caps.payment ? "A button on the accepted page and in their signed-copy email. Any secure link: Stripe, PayPal, Interac, an invoice." : "Part of Pro."}>
            <input id="paymentUrl" type="url" inputMode="url" spellCheck={false} maxLength={500} value={details.paymentUrl} disabled={readOnly || !caps.payment} placeholder={brandPaymentUrl ? "Using your brand link" : "https://…"} onChange={(e) => onChange({ ...details, paymentUrl: e.target.value })} className={cn(inline, "text-left")} />
          </Row>
          {(details.paymentUrl || brandPaymentUrl) && (
            <Row label="Button says" htmlFor="paymentLabel">
              <input id="paymentLabel" value={details.paymentLabel} disabled={readOnly} maxLength={40} placeholder="Pay the deposit" onChange={(e) => onChange({ ...details, paymentLabel: e.target.value })} className={cn(inline, "w-44")} />
            </Row>
          )}
          <Row label="I will countersign" hint={caps.countersign ? "Your signature after the client's. Both go on the page, the PDF and the record." : "Part of Business."}>
            <span className="flex items-center gap-2">{!caps.countersign && <PlanTag plan="Business" />}<Toggle checked={details.countersign} disabled={readOnly || !caps.countersign} onChange={(v) => onChange({ ...details, countersign: v })} label="Countersign after the client signs" /></span>
          </Row>
          <div className="px-4 py-2">
            <div className="flex min-h-[40px] items-center justify-between gap-3">
              <span className="text-[13.5px] font-medium">Also email</span>
              {!readOnly && details.notifyEmails.length < 10 && (
                <button type="button" onClick={() => onChange({ ...details, notifyEmails: [...details.notifyEmails, ""] })} className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-brand hover:bg-brand/[.08] dark:text-indigo-300">
                  <Plus size={13} weight="bold" /> Add an email
                </button>
              )}
            </div>
            {details.notifyEmails.map((e, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5">
                <input aria-label={`Also notify ${i + 1}`} type="email" inputMode="email" spellCheck={false} maxLength={254} value={e} disabled={readOnly} onChange={(ev) => setNotify(i, ev.target.value)} placeholder="accounts@yourbusiness.com" autoFocus={e === ""} className={cn(inline, "text-left")} />
                {!readOnly && (
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange({ ...details, notifyEmails: details.notifyEmails.filter((_, k) => k !== i) })}>
                    <X size={16} weight="light" />
                  </Button>
                )}
              </div>
            ))}
            {details.notifyEmails.length === 0 && <p className="pb-1 text-[12px] text-stone-500">Anyone else who should hear about this one. Clients never see them.</p>}
          </div>
        </Disclosure>
      </div>

      <Group title="Copies and files">
        <ActionRow icon={<BookmarkSimple size={16} weight="light" />} onClick={onSaveTemplate} hint="Reuse this content and pricing for the next one.">Save as template</ActionRow>
        <ActionRow icon={<Copy size={16} weight="light" />} onClick={onDuplicate} hint="A fresh draft with the same content.">Duplicate</ActionRow>
        {canPdf ? (
          <ActionRow icon={<FilePdf size={16} weight="light" />} href={exportHref.replace(/\/export$/, "/pdf")} hint="The page as a file, for email or print.">Download PDF</ActionRow>
        ) : (
          <ActionRow icon={<FilePdf size={16} weight="light" />} href="/app/brand#plan" muted hint="Part of Pro. See plans under Brand.">Download PDF</ActionRow>
        )}
        <ActionRow icon={<FileArrowDown size={16} weight="light" />} href={exportHref} hint="Everything in this proposal as data.">Export JSON</ActionRow>
      </Group>
    </div>
  );
}
