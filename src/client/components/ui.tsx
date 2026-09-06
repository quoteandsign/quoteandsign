// Small owned primitives. Radius rule for the whole app: buttons are pills, inputs 10px,
// cards and panels 16px. One brand (teal). Neutral base is stone.

import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,color,opacity] duration-200 ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong",
        secondary: "bg-stone-900/[.06] text-stone-900 hover:bg-stone-900/[.1] dark:bg-white/[.08] dark:text-stone-50 dark:hover:bg-white/[.12]",
        ghost: "text-stone-700 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]",
        danger: "text-red-700 hover:bg-red-600/10 dark:text-red-400",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

const fieldBase =
  "w-full rounded-[10px] border border-stone-900/10 bg-white px-3.5 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-transparent focus:outline-2 focus:outline-brand dark:border-white/10 dark:bg-stone-900 dark:text-stone-50 dark:placeholder:text-stone-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[80px] py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />
));
Select.displayName = "Select";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-stone-700 dark:text-stone-300">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p> : hint ? <p className="text-[13px] text-stone-500">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex select-none items-center gap-2.5 text-sm text-stone-700 dark:text-stone-300", disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="relative inline-block h-6 w-10">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-stone-900/15 transition-colors duration-200 peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand dark:bg-white/20" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-stone-900/[.06] text-stone-600 dark:bg-white/10 dark:text-stone-300" },
  sent: { label: "Sent", cls: "bg-sky-500/10 text-sky-800 dark:text-sky-300" },
  viewed: { label: "Viewed", cls: "bg-brand/12 text-brand dark:text-indigo-300" },
  accepted: { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  declined: { label: "Declined", cls: "bg-rose-500/12 text-rose-800 dark:text-rose-300" },
  expired: { label: "Expired", cls: "bg-stone-900/[.06] text-stone-500 dark:bg-white/10 dark:text-stone-400" },
  archived: { label: "Archived", cls: "bg-stone-900/[.06] text-stone-500 dark:bg-white/10 dark:text-stone-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft!;
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium", s.cls)}>{s.label}</span>;
}

/**
 * A numeric field that saves on every keystroke (collapsing a row never loses a value) and tidies
 * its formatting when you leave it. Values are integers in hundredths (money minor units, or
 * basis points for percentages). Exponents and signs are rejected.
 */
export function NumberField({
  id, value, onChange, disabled, placeholder, min = 0, max, decimals = 2, allowEmpty = false, name,
}: {
  id: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; placeholder?: string;
  min?: number; max?: number; decimals?: number; allowEmpty?: boolean; name?: string;
}) {
  const format = (v: number | null) => (v === null ? "" : (v / 100).toFixed(decimals));
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const parse = (t: string): number | null => {
    const clean = t.replace(/[^0-9.]/g, "");
    if (clean === "" || clean === ".") return allowEmpty ? null : 0;
    let n = Math.round(parseFloat(clean) * 100);
    if (!Number.isFinite(n)) return allowEmpty ? null : 0;
    if (n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return n;
  };
  return (
    <Input
      id={id}
      name={name ?? id}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      className="text-right tabular-nums"
      value={text}
      onFocus={() => setFocused(true)}
      onKeyDown={(e) => {
        if (["e", "E", "-", "+"].includes(e.key)) e.preventDefault();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, "");
        setText(t);
        onChange(parse(t));
      }}
      onBlur={() => {
        setFocused(false);
        setText(format(parse(text)));
      }}
    />
  );
}

/** A small "Pro" or "Business" tag beside something the current plan does not include. */
export function PlanTag({ plan, className }: { plan: "Pro" | "Business"; className?: string }) {
  return (
    <a href="/app/brand#plan" className={cn("inline-flex h-5 items-center rounded-full bg-brand/12 px-2 text-[11px] font-semibold text-brand hover:bg-brand/20 dark:text-indigo-300", className)} title={`Part of ${plan}. See plans.`}>
      {plan}
    </a>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-stone-900/[.06] dark:bg-white/[.08]", className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-hairline bg-white dark:border-white/10 dark:bg-stone-900", className)}>{children}</div>;
}

export function Wordmark({ className, href = "/" }: { className?: string; href?: string | null }) {
  const inner = (
    <>
      <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" />
      <span>Quote <span className="font-light">and</span> Sign</span>
    </>
  );
  const cls = cn("inline-flex items-center gap-2 whitespace-nowrap font-semibold tracking-tight text-ink dark:text-stone-50", className);
  return href ? (
    <a href={href} className={cls} aria-label="Quote and Sign home">
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
