import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui";

// The same choice the marketing pages ask for, inside the app. Google's script is fetched only
// after "Allow"; "Decline" is remembered too, and either can be changed under Settings, Advanced.

const KEY = "qs-consent";
const read = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

let loaded = false;
export function loadAnalytics(id: string) {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer ?? [];
  const gtag = (...a: unknown[]) => { w.dataLayer!.push(a); };
  w.gtag = gtag;
  gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

export function ConsentBanner() {
  const [id, setId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ analyticsId?: string | null }>("/auth/config").then((r) => {
      const got = r.analyticsId ?? null;
      setId(got);
      if (!got) return;
      const c = read();
      if (c === "granted") loadAnalytics(got);
      else if (c !== "denied") setOpen(true);
    }, () => {});
    const reopen = () => setOpen(true);
    window.addEventListener("qs-cookie-settings", reopen);
    return () => window.removeEventListener("qs-cookie-settings", reopen);
  }, []);
  if (!id || !open) return null;
  return (
    <div role="dialog" aria-label="Cookie choice" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-[560px] rounded-2xl bg-white p-4 text-[14px] leading-relaxed text-ink shadow-[0_20px_60px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.08] dark:bg-stone-900 dark:text-stone-100 dark:ring-white/10">
      <p className="mb-3"><b>Analytics cookies?</b> We would like to use Google Analytics to see which pages help people and which do not. It sets cookies and sends page views to Google. Nothing is loaded unless you allow it. <a href="/privacy" className="underline underline-offset-4">Privacy policy</a>.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { write("granted"); setOpen(false); loadAnalytics(id); }}>Allow</Button>
        <Button size="sm" variant="secondary" onClick={() => { write("denied"); setOpen(false); }}>Decline</Button>
      </div>
    </div>
  );
}

/** For a "Cookie settings" control anywhere in the app. */
export function openCookieSettings() {
  window.dispatchEvent(new Event("qs-cookie-settings"));
}
