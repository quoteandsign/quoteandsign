import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Input, PlanTag } from "./ui";

// One webhook per workspace (Business). The secret is shown once, right after Save or Rotate.

type Hook = { id: string; url: string; events: string[]; active: boolean; failures: number; lastOkAt: number | null; lastError: string | null; createdAt: number };
type Delivery = { id: string; event: string; status: string; attempts: number; responseCode: number | null; createdAt: number };
type State = { webhook: Hook | null; deliveries: Delivery[]; events: readonly string[] };

const LABELS: Record<string, string> = {
  "proposal.sent": "Sent",
  "proposal.opened": "Opened for the first time",
  "proposal.accepted": "Accepted",
  "proposal.declined": "Declined",
  "proposal.countersigned": "Countersigned",
};

export function WebhookSettings({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api<State>("/api/webhooks").then((s) => {
      setState(s);
      setUrl(s.webhook?.url ?? "");
      setEvents(s.webhook?.events ?? [...s.events]);
    }, () => setState({ webhook: null, deliveries: [], events: Object.keys(LABELS) }));
  useEffect(() => { if (enabled) void load(); }, [enabled]);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  const save = () => run("save", async () => {
    const r = await api<{ webhook: Hook; secret?: string }>("/api/webhooks", { method: "PUT", json: { url: url.trim(), events, active: state?.webhook?.active ?? true } });
    if (r.secret) setSecret(r.secret);
    await load();
    setMsg(r.secret ? null : "Saved.");
  });
  const toggle = (active: boolean) => run("toggle", async () => {
    await api("/api/webhooks", { method: "PUT", json: { url: url.trim(), active } });
    await load();
  });
  const rotate = () => run("rotate", async () => {
    if (!confirm("Rotate the secret? Your receiving end must be updated with the new one.")) return;
    const r = await api<{ secret: string }>("/api/webhooks/rotate", { method: "POST" });
    setSecret(r.secret);
  });
  const test = () => run("test", async () => {
    await api("/api/webhooks/test", { method: "POST" });
    await new Promise((r) => setTimeout(r, 1500));
    await load();
    setMsg("Ping sent. The result is in the list below.");
  });
  const remove = () => run("delete", async () => {
    if (!confirm("Remove the webhook? Nothing more will be sent.")) return;
    await api("/api/webhooks", { method: "DELETE" });
    setSecret(null);
    await load();
  });

  const hook = state?.webhook ?? null;
  const allEvents = state?.events ?? Object.keys(LABELS);
  return (
    <fieldset disabled={!enabled} className={enabled ? "min-w-0" : "min-w-0 opacity-60"} data-test="webhooks">
      <div className="grid max-w-xl gap-3">
        <label className="grid gap-1 text-[13px]">
          <span className="font-medium">Address</span>
          <Input type="url" inputMode="url" spellCheck={false} maxLength={500} placeholder="https://hooks.zapier.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="grid gap-1.5 text-[13px]">
          <span className="font-medium">Send when a proposal is</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {allEvents.map((ev) => (
              <label key={ev} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
                {LABELS[ev] ?? ev}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!url.trim() || events.length === 0 || busy !== null} onClick={() => void save()}>{busy === "save" ? "Saving…" : hook ? "Save" : "Create webhook"}</Button>
          {hook && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void test()}>Send a test</Button>}
          {hook && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void rotate()}>Rotate secret</Button>}
          {hook && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void toggle(!hook.active)}>{hook.active ? "Switch off" : "Switch on"}</Button>}
          {hook && <Button size="sm" variant="secondary" className="text-red-700 dark:text-red-400" disabled={busy !== null} onClick={() => void remove()}>Remove</Button>}
        </div>
        {msg && <p role="status" className="text-[13px] text-stone-600 dark:text-stone-400">{msg}</p>}
        {secret && (
          <div className="rounded-xl bg-amber-500/10 p-3 text-[13px] ring-1 ring-inset ring-amber-600/20" data-test="webhook-secret">
            <div className="font-medium">Your signing secret. Copy it now; it is not shown again.</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded-lg bg-white px-2 py-1 font-mono text-[12.5px] dark:bg-stone-900">{secret}</code>
              <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "Copied" : "Copy"}</Button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-stone-600 dark:text-stone-400">Every message carries <code>X-QS-Signature: v1=…</code>, an HMAC-SHA256 of <code>timestamp.body</code> with this secret, and <code>X-QS-Timestamp</code>. Verify it before trusting a message.</p>
          </div>
        )}
        {hook && (
          <div className="text-[12.5px] text-stone-500">
            {hook.active ? "On" : "Off"}{hook.lastOkAt ? ` · last success ${new Date(hook.lastOkAt).toLocaleString()}` : ""}{hook.failures ? ` · ${hook.failures} failure${hook.failures === 1 ? "" : "s"} in a row` : ""}{hook.lastError ? ` (${hook.lastError})` : ""}
          </div>
        )}
        {state && state.deliveries.length > 0 && (
          <ul className="grid gap-1 text-[12.5px]" data-test="webhook-deliveries">
            {state.deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 rounded-lg bg-stone-900/[.03] px-2.5 py-1.5 dark:bg-white/[.05]">
                <span className="font-medium">{LABELS[d.event] ?? d.event}</span>
                <span className={d.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : d.status === "failed" ? "text-red-700 dark:text-red-400" : "text-stone-500"}>{d.status === "ok" ? `delivered (${d.responseCode})` : d.status === "failed" ? "gave up" : `retrying (${d.responseCode ? `HTTP ${d.responseCode}` : "no answer"})`}</span>
                <span className="text-stone-500">{new Date(d.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        {!enabled && <p className="text-[12.5px] text-stone-500"><PlanTag plan="Business" /> Webhooks send a signed message to your CRM, Zapier or Make when a proposal is sent, opened, accepted, declined or countersigned.</p>}
      </div>
    </fieldset>
  );
}
