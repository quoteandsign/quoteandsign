import { useState, useRef, type FormEvent, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { api, ApiError } from "../lib/api";
import { useRouter } from "../lib/router";
import { Button, Input, Field, Wordmark } from "../components/ui";

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Request a new one.",
  invalid: "That link is not valid. Request a new one.",
  deleted: "This account was deleted.",
};

/** A single pen stroke that draws itself once under the last words of the headline. */
function PenStroke() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 320 18" className="absolute -bottom-2 left-0 h-[14px] w-full" aria-hidden="true" preserveAspectRatio="none">
      <motion.path
        d="M3 12 C 60 4, 120 16, 180 9 S 280 3, 317 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
      />
    </svg>
  );
}

export function Login() {
  const { search } = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [canResend, setCanResend] = useState(false);
  useEffect(() => {
    if (!sent) return;
    setCanResend(false);
    const t = window.setTimeout(() => setCanResend(true), 20_000);
    return () => window.clearTimeout(t);
  }, [sent]);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(true);
  // Turnstile: the server says whether a challenge is required. The widget script is loaded only then.
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    api<{ turnstileSiteKey: string | null }>("/auth/config").then((r) => setSiteKey(r.turnstileSiteKey), () => setSiteKey(null));
  }, []);
  useEffect(() => {
    if (!siteKey || !widget.current || sent) return;
    const render = () => {
      const t = (window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } }).turnstile;
      if (!t || !widget.current || widgetId.current) return;
      widgetId.current = t.render(widget.current, { sitekey: siteKey, callback: (token: string) => setChallenge(token), "expired-callback": () => setChallenge(null), "error-callback": () => setChallenge(null), theme: "auto" });
    };
    if (document.querySelector("script[data-turnstile]")) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.dataset.turnstile = "1";
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => { widgetId.current = null; };
  }, [siteKey, sent]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[search.get("error") ?? ""] ?? null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ok: true; devLink?: string }>("/auth/request", { method: "POST", json: { email, marketing, ...(challenge ? { turnstile: challenge } : {}) } });
      setChallenge(null);
      setDevLink(r.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <header className="flex h-20 items-center justify-between">
          <Wordmark className="text-[17px]" />
          <a href="/" className="text-[14px] text-graphite underline-offset-4 hover:text-ink hover:underline dark:text-stone-400 dark:hover:text-stone-100">
            Back to the homepage
          </a>
        </header>

        <div className="grid gap-12 py-8 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-x-20 lg:gap-y-8 lg:py-20">
          {/* On a phone: headline, then the form, then the three facts. On desktop: pitch left, form right. */}
          <section className="order-1">
            <h1 className="max-w-[14ch] text-[36px] font-[650] leading-[1.04] tracking-[-0.035em] text-ink sm:text-[56px] dark:text-stone-50">
              Proposals your clients accept{" "}
              <span className="relative inline-block whitespace-nowrap text-brand dark:text-indigo-300">
                on their phone.
                <PenStroke />
              </span>
            </h1>
            <p className="mt-7 max-w-[44ch] text-[17px] leading-[1.6] text-graphite dark:text-stone-400">
              Write it once. Send a link. See when it is opened, watch the options get toggled, and get a signed copy the moment they accept.
            </p>
          </section>
          <section className="order-3 lg:col-start-1">
            <dl className="grid max-w-md grid-cols-3 gap-6 border-t border-hairline pt-6 text-[13px] text-graphite lg:-mt-2 dark:border-white/10 dark:text-stone-400">
              <div>
                <dt className="font-medium text-ink dark:text-stone-200">Open source</dt>
                <dd>Read exactly what it does.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink dark:text-stone-200">Flat pricing</dt>
                <dd>No per-document fees.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink dark:text-stone-200">Your data</dt>
                <dd>Export everything, any time.</dd>
              </div>
            </dl>
          </section>

          <section className="order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-3">
            <div className="max-w-[400px] border-t-2 border-ink pt-6 lg:pt-8 dark:border-stone-200">
              {sent ? (
                <div aria-live="polite">
                  <h2 className="text-[24px] font-[650] tracking-[-0.02em]">Check your email</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-graphite dark:text-stone-400">
                    We sent a sign-in link to <span className="font-medium text-ink dark:text-stone-100">{email}</span>. It works once and expires in 15&nbsp;minutes.
                  </p>
                  {devLink && (
                    <div className="mt-6 border-l-2 border-brand pl-4 text-[13px] text-graphite dark:text-stone-400">
                      <p>Development mode. No email is sent.</p>
                      <a href={devLink} className="mt-2 inline-block font-medium text-brand underline underline-offset-4 dark:text-indigo-300">
                        Open the sign-in link
                      </a>
                    </div>
                  )}
                  <div className="mt-6 flex flex-wrap gap-1">
                    <Button variant="ghost" className="-ml-4" onClick={() => setSent(false)}>
                      Use a different email
                    </Button>
                    {canResend && (
                      <Button variant="ghost" disabled={busy} onClick={() => void submit({ preventDefault() {} } as FormEvent)}>
                        Send it again
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="grid gap-6">
                  <div>
                    <h2 className="text-[24px] font-[650] tracking-[-0.02em]">Sign in</h2>
                    <p className="mt-1.5 text-[15px] text-graphite dark:text-stone-400">No password. We email you a link.</p>
                  </div>
                  <Field label="Email" htmlFor="email" error={error}>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@studio.com"
                      className="h-12"
                    />
                  </Field>
                  <Button type="submit" size="lg" disabled={busy}>
                    {busy ? "Sending…" : "Email me a sign-in link"}
                  </Button>
                  {siteKey && <div ref={widget} className="min-h-[65px]" aria-label="Verification" />}
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-stone-600 dark:text-stone-400">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} data-test="marketing" />
                    <span>Send me product news and tips by email. A few a year, unsubscribe any time.</span>
                  </label>
                  <p className="text-[12.5px] leading-relaxed text-stone-500">By continuing you agree to the <a href="/terms" className="underline underline-offset-4 hover:text-ink dark:hover:text-stone-200">Terms</a> and acknowledge the <a href="/privacy" className="underline underline-offset-4 hover:text-ink dark:hover:text-stone-200">Privacy Policy</a>.</p>
                  <p className="text-[13px] text-graphite dark:text-stone-500">New here? The same link creates your account.</p>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
