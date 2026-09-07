import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/shadcn";
import { FormattingToolbar, FormattingToolbarController, SideMenuController, SuggestionMenuController, blockTypeSelectItems, useCreateBlockNote, BlockTypeSelect, FileCaptionButton, FileReplaceButton, FileDeleteButton, BasicTextStyleButton, TextAlignButton, ColorStyleButton, NestBlockButton, UnnestBlockButton, CreateLinkButton } from "@blocknote/react";
import { ArrowLeft, PaperPlaneTilt, Eye, Check, LinkSimple, X, Plus, DeviceMobile, Globe } from "@phosphor-icons/react";
import { api, ApiError } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { useTheme, ThemeToggle } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { Button, StatusBadge, Skeleton, Input, Field, cn } from "../components/ui";
import { schema, slashItems, PricingContext } from "../editor/blocks";
import { PricingPanel , type PricingFocus } from "../editor/PricingPanel";
import { MoreOptions, type Details } from "../editor/MoreOptions";
import { BlockMenu } from "../editor/BlockMenu";
import { ProposalSideMenu } from "../editor/SideMenu";
import { styleOf } from "../../shared/styles";
import { businessName } from "../../shared/names";
import { isHex, readableOn } from "../../shared/looks";
import { shrinkImage } from "../lib/image";
import { en as bnEn } from "@blocknote/core/locales";
import { SuggestionMenu } from "@blocknote/core/extensions";
import type { PricingLine } from "../../shared/pricing";

type Question = { id: string; name: string; email: string | null; body: string; createdAt: number; unread: boolean };

type Loaded = {
  proposal: {
    id: string;
    publicId: string;
    title: string;
    clientName: string | null;
    clientEmail: string | null;
    currency: string;
    content: unknown[];
    status: string;
    expiresAt: number | null;
    hasPassword: boolean;
    viewCount: number;
    taxRateBps: number;
    taxLabel: string | null;
    senderName: string | null;
    accentColor: string | null;
    ccEmails: string[] | null;
    notifyEmails: string[] | null;
    remind: boolean;
    style: string | null;
    paymentUrl: string | null;
    paymentLabel: string | null;
    declinedAt: number | null;
    declineReason: string | null;
    countersign: boolean;
  };
  items: PricingLine[];
  acceptance: { signerName: string; acceptedAt: number; totalAmount: number; currency: string; countersignedAt: number | null; countersignerName: string | null } | null;
};

type Debounced<T extends unknown[]> = ((...args: T) => void) & { pending: () => boolean; flush: () => void };
function useDebounced<T extends unknown[]>(fn: (...args: T) => void, ms: number): Debounced<T> {
  const t = useRef<number | null>(null);
  const held = useRef<T | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  return useMemo(() => {
    const run = (...args: T) => {
      held.current = args;
      if (t.current) window.clearTimeout(t.current);
      t.current = window.setTimeout(() => {
        t.current = null;
        held.current = null;
        latest.current(...args);
      }, ms);
    };
    return Object.assign(run, {
      pending: () => t.current !== null,
      flush: () => {
        if (t.current === null || !held.current) return;
        window.clearTimeout(t.current);
        const args = held.current;
        t.current = null;
        held.current = null;
        latest.current(...args);
      },
    });
  }, [ms]);
}

export function Editor({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (error) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="rounded-xl bg-red-600/10 p-4 text-sm text-red-800 dark:text-red-300">{error}</p>
        <Link href="/app" className="mt-4 inline-block text-sm underline">Back to proposals</Link>
      </div>
    );
  }
  return data ? <EditorLoaded initial={data} /> : <Loader id={id} onLoad={setData} onError={setError} />;
}

function Loader({ id, onLoad, onError }: { id: string; onLoad: (d: Loaded) => void; onError: (e: string) => void }) {
  useEffect(() => {
    api<Loaded>(`/api/proposals/${id}`).then(onLoad, (e) => onError(e instanceof ApiError && e.status === 404 ? "That proposal does not exist." : (e as Error).message));
  }, [id, onLoad, onError]);
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-8 h-6 w-full" />
      <Skeleton className="mt-3 h-6 w-5/6" />
    </div>
  );
}

const accentOf = (hex: string | null | undefined) => (isHex(hex) ? hex : "#2b3f8c");

function EditorLoaded({ initial }: { initial: Loaded }) {
  const { proposal } = initial;
  const readOnly = proposal.status === "accepted" || proposal.status === "archived";
  const { user, refresh } = useAuth();
  const { navigate } = useRouter();
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [title, setTitle] = useState(proposal.title);
  const [status, setStatus] = useState(proposal.status);
  const [items, setItems] = useState<PricingLine[]>(initial.items);
  const [details, setDetails] = useState<Details>({
    clientName: proposal.clientName ?? "",
    clientEmail: proposal.clientEmail ?? "",
    ccEmails: proposal.ccEmails ?? [],
    notifyEmails: proposal.notifyEmails ?? [],
    currency: proposal.currency,
    expiresAt: proposal.expiresAt,
    hasPassword: proposal.hasPassword,
    taxRateBps: proposal.taxRateBps ?? 0,
    taxLabel: proposal.taxLabel ?? "",
    remind: proposal.remind ?? true,
    paymentUrl: proposal.paymentUrl ?? "",
    paymentLabel: proposal.paymentLabel ?? "",
    countersign: proposal.countersign ?? false,
  });
  const [senderName, setSenderName] = useState(proposal.senderName ?? "");
  const [accent, setAccent] = useState(proposal.accentColor ?? "");
  const [pageStyle, setPageStyle] = useState(styleOf(proposal.style).id);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [splash, setSplash] = useState<string | null>(null); // a moment of confirmation after Send
  const [tab, setTab] = useState<"pricing" | "options">("pricing");

  // Every write goes through one chain so requests can never land out of order.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const latest = useRef({ details, items });
  latest.current = { details, items };
  const lastError = useRef<string | null>(null);
  const enqueue = (work: () => Promise<void>): Promise<boolean> => {
    pending.current += 1;
    setSaveState("saving");
    const p = chain.current.then(work).then(
      () => true,
      (e: unknown) => {
        lastError.current = e instanceof ApiError ? e.message : "Could not save.";
        setSaveState("error");
        setSaveError(lastError.current);
        return false;
      },
    ).then((ok) => {
      pending.current -= 1;
      if (ok && pending.current === 0) {
        lastError.current = null;
        setSaveState("saved");
        setSaveError(null);
      }
      return ok;
    });
    chain.current = p.then(() => undefined);
    return p;
  };
  const save = (patch: Record<string, unknown>) => enqueue(() => api(`/api/proposals/${proposal.id}`, { method: "PUT", json: patch }).then(() => undefined));
  const putItems = (list: PricingLine[]) =>
    enqueue(() => api(`/api/proposals/${proposal.id}/items`, { method: "PUT", json: list.map((it) => ({ ...it, name: it.name || "Untitled item", description: it.description || null })) }).then(() => undefined));
  const detailsPatch = (d: Details) => ({
    clientName: d.clientName,
    clientEmail: d.clientEmail,
    ccEmails: d.ccEmails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    notifyEmails: d.notifyEmails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    currency: d.currency,
    expiresAt: d.expiresAt,
    taxRateBps: d.taxRateBps,
    taxLabel: d.taxLabel,
    remind: d.remind,
    paymentUrl: d.paymentUrl.trim(),
    paymentLabel: d.paymentLabel,
    countersign: d.countersign,
  });
  const saveTitle = useDebounced((t: string) => void save({ title: t || "Untitled proposal" }), 600);
  const saveDetails = useDebounced((d: Details) => void save(detailsPatch(d)), 600);
  const saveItems = useDebounced((list: PricingLine[]) => void putItems(list), 800);
  const saveSender = useDebounced((v: string) => void save({ senderName: v || null }), 600);
  const dirty = useRef(false);
  const debouncePending = () => [saveTitle, saveDetails, saveItems, saveSender].some((f) => f.pending());

  const editor = useCreateBlockNote({
    schema,
    tables: { headers: true },
    initialContent: proposal.content.length ? (proposal.content as any) : undefined,
    dictionary: { ...bnEn, placeholders: { ...bnEn.placeholders, emptyDocument: "Type / to add pricing, headings, cards…", default: "Type / for blocks, or just write" } },
    uploadFile: async (file: File) => {
      const small = await shrinkImage(file, 1400);
      const fd = new FormData();
      fd.append("file", small);
      const r = await fetch("/api/account/images", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? "Could not upload the image.");
      return j.url;
    },
  });
  const saveContent = useDebounced(() => void save({ content: editor.document }), 800);
  // Phones have no hover, so the side menu's plus never shows. This does the same from a fixed button.
  const addBlockHere = () => {
    const doc = editor.document as { id: string; type: string; content?: unknown }[];
    let target = doc[doc.length - 1];
    try {
      target = editor.getTextCursorPosition().block as typeof target;
    } catch {
      /* nothing focused yet: append at the end */
    }
    if (!target) return;
    const empty = target.type === "paragraph" && Array.isArray(target.content) && target.content.length === 0;
    const at = empty ? target : editor.insertBlocks([{ type: "paragraph" }], target, "after")[0]!;
    editor.setTextCursorPosition(at);
    editor.focus();
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
  };
  const flushAll = () => [saveTitle, saveDetails, saveItems, saveSender, saveContent].forEach((f) => f.flush());
  const bandCss = useSectionBands(editor);
  const toolbarBlockTypes = useMemo(() => {
    const keep = new Set(["paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem"]);
    return blockTypeSelectItems(editor.dictionary as any).filter((i) => keep.has(i.type) && !(i.type === "heading" && Number(i.props?.level) > 3) && !i.props?.isToggleable);
  }, [editor]);
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    const off = editor.onSelectionChange(() => {
      const text = window.getSelection()?.toString() ?? "";
      setHasSelection(Boolean(editor.getSelection()) && text.length > 0);
    });
    return typeof off === "function" ? off : undefined;
  }, [editor]);
  useEffect(() => {
    if (readOnly) return;
    const off = editor.onChange(() => { dirty.current = true; saveContent(); });
    return typeof off === "function" ? off : undefined;
  }, [editor, saveContent, readOnly]);
  useEffect(() => { if (saveState === "saved" && pending.current === 0 && !debouncePending() && !saveContent.pending()) dirty.current = false; }, [saveState]);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || pending.current > 0 || debouncePending() || saveContent.pending()) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  // Older proposals start with an H1 that repeats the title. The cover carries it now.
  useEffect(() => {
    if (readOnly) return;
    const first = (editor.document as any[])[0];
    if (!first || first.type !== "heading" || Number(first.props?.level) !== 1) return;
    const text = Array.isArray(first.content) ? first.content.map((n: any) => n.text ?? "").join("").trim() : "";
    if (text === proposal.title.trim()) editor.removeBlocks([first]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    api<{ messages: Question[] }>(`/api/proposals/${proposal.id}/messages`).then((r) => setQuestions(r.messages), () => {});
  }, [proposal.id]);

  const onDetails = (d: Details) => { dirty.current = true; setDetails(d); saveDetails(d); };
  const onItems = (list: PricingLine[]) => { dirty.current = true; setItems(list); saveItems(list); };
  const onPassword = async (pw: string) => {
    if (await save({ password: pw })) setDetails((d) => ({ ...d, hasPassword: pw !== "" }));
  };

  const brandName = businessName(user?.brandName, user?.name);
  const brandColour = user?.brandColor ?? "";
  const shownName = senderName || brandName;
  const shownColour = accentOf(accent || brandColour);

  // ---- Send ----
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [counter, setCounter] = useState<{ countersignerName: string | null } | null>(initial.acceptance ? { countersignerName: initial.acceptance.countersignerName } : null);
  const [counterName, setCounterName] = useState(user?.name ?? "");
  const [counterBusy, setCounterBusy] = useState(false);
  const [counterError, setCounterError] = useState<string | null>(null);
  const countersign = async () => {
    setCounterBusy(true);
    setCounterError(null);
    try {
      const r = await api<{ countersignerName: string }>(`/api/proposals/${proposal.id}/countersign`, { method: "POST", json: { name: counterName.trim() } });
      setCounter({ countersignerName: r.countersignerName });
    } catch (e) {
      setCounterError((e as Error).message);
    } finally {
      setCounterBusy(false);
    }
  };
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const link = `${location.origin}/p/${proposal.publicId}`;
  const live = status !== "draft";
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  // email=false publishes the link without emailing anyone.
  const send = async (email = true) => {
    setSendBusy(true);
    setSendError(null);
    try {
      flushAll();
      const ok = (await save({ content: editor.document, title: title || "Untitled proposal", ...detailsPatch(latest.current.details) })) && (await putItems(latest.current.items));
      if (!ok) throw new Error(lastError.current ?? "Could not save.");
      const r = await api<{ link: string; emailed: number }>(`/api/proposals/${proposal.id}/send`, { method: "POST", json: { message: message.trim() || undefined, email } });
      if (status === "draft" || status === "declined") setStatus("sent");
      setSendOpen(false);
      setSplash(r.emailed ? `Sent to ${r.emailed === 1 ? recipients[0] : `${r.emailed} people`}` : "Link is live");
      setTimeout(() => setSplash(null), 1700);
      setNotice(r.emailed ? `Sent to ${r.emailed === 1 ? recipients[0] : `${r.emailed} people`}.` : "The link is live. Share it however you like.");
      setTimeout(() => setNotice(null), 5000);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSendBusy(false);
    }
  };
  const recipients = [details.clientEmail, ...details.ccEmails].map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  useEffect(() => {
    if (!sendOpen && !tplOpen && !phoneOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSendOpen(false); setTplOpen(false); setPhoneOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendOpen, tplOpen, phoneOpen]);

  // ---- Save as template / duplicate ----
  const [tplName, setTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const saveTemplate = async () => {
    setTplBusy(true);
    setTplError(null);
    try {
      flushAll();
      const ok = (await save({ content: editor.document, title: title || "Untitled proposal", ...detailsPatch(latest.current.details) })) && (await putItems(latest.current.items));
      if (!ok) throw new Error(lastError.current ?? "Could not save.");
      const name = tplName.trim() || title || "My template";
      await api("/api/templates", { method: "POST", json: { proposalId: proposal.id, name } });
      setTplOpen(false);
      setNotice(`Saved as a template. Find "${name}" under Your templates when you start a new proposal.`);
      setTimeout(() => setNotice(null), 5000);
    } catch (e) {
      setTplError((e as Error).message);
    } finally {
      setTplBusy(false);
    }
  };
  const duplicate = async () => {
    try {
      const r = await api<{ id: string }>(`/api/proposals/${proposal.id}/duplicate`, { method: "POST" });
      navigate(`/app/p/${r.id}`);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  // Which pricing line the preview asked for, and a counter so the same line can be asked for twice.
  const [pricingFocus, setPricingFocus] = useState<PricingFocus>({ id: null, n: 0 });
  const pricingCtx = useMemo(
    () => ({ items, currency: details.currency, defaultTaxBps: details.taxRateBps, taxLabel: details.taxLabel, openPricing: (lineId?: string) => { setTab("pricing"); setPricingFocus((f) => ({ id: lineId ?? null, n: f.n + 1 })); } }),
    [items, details.currency, details.taxRateBps, details.taxLabel],
  );

  return (
    <PricingContext.Provider value={pricingCtx}>
      <div className="min-h-dvh bg-[#f3f1ec] dark:bg-stone-950">
        <header className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur-md dark:border-white/[.08] dark:bg-stone-950/80">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:px-6">
            <Link href="/app" className="grid h-9 w-9 place-items-center rounded-full text-stone-600 hover:bg-stone-900/[.05] dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Back to proposals">
              <ArrowLeft size={18} weight="light" />
            </Link>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-stone-700 dark:text-stone-200" title={title}>
              {title || "Untitled proposal"}
            </span>
            <StatusBadge status={status} />
            <span className="text-[12px] text-stone-400" aria-live="polite" title={saveError ?? (saveState === "saving" ? "Saving…" : "Saved")} data-test="save-state" data-state={saveState}>
              <span className="hidden sm:inline">{saveState === "saving" ? "Saving…" : saveState === "error" ? <span className="text-red-700 dark:text-red-400">Not saved</span> : "Saved"}</span>
              <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full sm:hidden", saveState === "saving" ? "animate-pulse bg-amber-500" : saveState === "error" ? "bg-red-600" : "bg-emerald-500")} />
            </span>
            <a href={`/p/${proposal.publicId}`} className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm text-stone-700 hover:bg-stone-900/[.05] sm:inline-flex dark:text-stone-300 dark:hover:bg-white/[.07]">
              <Eye size={16} weight="light" /> Preview
            </a>
            <button type="button" onClick={() => { flushAll(); setPhoneOpen(true); }} className="hidden h-9 w-9 place-items-center rounded-full text-stone-700 hover:bg-stone-900/[.05] sm:grid dark:text-stone-300 dark:hover:bg-white/[.07]" aria-label="Preview on a phone" title="See it the way your client will, on a phone" data-test="phone-preview">
              <DeviceMobile size={18} weight="light" />
            </button>
            <ThemeToggle />
            {!readOnly && (
              <Button size="sm" onClick={() => { setSendError(null); setSendOpen(true); }}>
                <PaperPlaneTilt size={15} weight="light" /> {status === "draft" ? "Send" : status === "declined" ? "Send again" : "Share"}
              </Button>
            )}
          </div>
        </header>

        {readOnly && initial.acceptance && (
          <div className="border-b border-brand/20 bg-brand/[.08] px-4 py-2 text-center text-sm">
            Accepted by <strong>{initial.acceptance.signerName}</strong> on {new Date(initial.acceptance.acceptedAt).toLocaleDateString("en-CA", { dateStyle: "long" })}.
            {counter?.countersignerName ? <> Countersigned by <strong>{counter.countersignerName}</strong>.</> : " Editing is locked to preserve the record."}
          </div>
        )}
        {readOnly && initial.acceptance && initial.proposal.countersign && !counter?.countersignerName && (
          <div className="border-b border-hairline bg-white px-4 py-3 dark:border-white/10 dark:bg-stone-900" data-test="countersign">
            <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
              <span className="mr-auto text-sm">Your turn: countersign to complete the record.</span>
              <Input aria-label="Your full name" value={counterName} maxLength={120} placeholder="Your full name" onChange={(e) => setCounterName(e.target.value)} className="h-9 w-56" />
              <Button size="sm" disabled={counterBusy || counterName.trim().length < 2} onClick={() => void countersign()}>{counterBusy ? "Signing…" : "Countersign"}</Button>
              {counterError && <span className="text-[13px] text-red-700 dark:text-red-400">{counterError}</span>}
            </div>
          </div>
        )}
        {status === "declined" && (
          <div className="border-b border-rose-500/20 bg-rose-500/[.07] px-4 py-2 text-center text-sm" data-test="declined-banner">
            {initial.proposal.clientName || "Your client"} passed on this{initial.proposal.declinedAt ? ` on ${new Date(initial.proposal.declinedAt).toLocaleDateString("en-CA", { dateStyle: "long" })}` : ""}.{initial.proposal.declineReason ? <> They said: <em>{initial.proposal.declineReason}</em>.</> : ""} Revise it and send again to reopen it.
          </div>
        )}
        {status === "archived" && !initial.acceptance && (
          <div className="border-b border-hairline bg-stone-900/[.04] px-4 py-2 text-center text-sm dark:border-white/10 dark:bg-white/[.05]">This proposal is archived. Restore it from the dashboard to edit or send it again.</div>
        )}
        {notice && <div role="status" className="border-b border-brand/20 bg-brand/[.08] px-4 py-2 text-center text-sm">{notice}</div>}
        {saveError && <div role="alert" className="border-b border-red-600/20 bg-red-600/[.07] px-4 py-2 text-center text-sm text-red-800 dark:text-red-300">{saveError}</div>}

        <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[1fr_400px]">
          <main className="relative min-w-0 px-3 py-6 sm:px-10 sm:py-12">
            <div data-style={pageStyle} className={cn(pageStyle === "night" ? "sheet-dark" : "sheet-light", "sheet relative mx-auto max-w-[900px] overflow-hidden rounded-[6px] bg-white shadow-[0_1px_1px_rgba(25,24,22,.05),0_30px_60px_-30px_rgba(25,24,22,.28)] dark:shadow-[0_0_0_1px_rgba(255,255,255,.08),0_30px_60px_-30px_rgba(0,0,0,.8)]")}>
              <Cover
                title={title}
                readOnly={readOnly}
                onTitle={(t) => { setTitle(t); saveTitle(t); }}
                clientName={details.clientName}
                onClientName={(v) => onDetails({ ...details, clientName: v })}
                senderName={shownName}
                onSenderName={(v) => { setSenderName(v); saveSender(v); }}
                color={shownColour}
                pageStyle={pageStyle}
              />
              <style>{bandCss}</style>
              <div className="px-6 pb-10 pt-6 sm:px-20 sm:pb-20 sm:pt-10">
                <BlockNoteView editor={editor} editable={!readOnly} theme={pageStyle === "night" ? "dark" : "light"} slashMenu={false} sideMenu={false} formattingToolbar={false} className={hasSelection ? "has-selection" : undefined}>
                  <SideMenuController sideMenu={ProposalSideMenu} />
                  <FormattingToolbarController formattingToolbar={() => (
                    // The stock toolbar minus the file gadgets the client page cannot honour (preview toggle, rename, download).
                    <FormattingToolbar>
                      <BlockTypeSelect items={toolbarBlockTypes} key="blockTypeSelect" />
                      <FileCaptionButton key="fileCaptionButton" />
                      <FileReplaceButton key="replaceFileButton" />
                      <FileDeleteButton key="fileDeleteButton" />
                      <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
                      <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
                      <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
                      <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
                      <TextAlignButton textAlignment="left" key="textAlignLeftButton" />
                      <TextAlignButton textAlignment="center" key="textAlignCenterButton" />
                      <TextAlignButton textAlignment="right" key="textAlignRightButton" />
                      <ColorStyleButton key="colorStyleButton" />
                      <NestBlockButton key="nestBlockButton" />
                      <UnnestBlockButton key="unnestBlockButton" />
                      <CreateLinkButton key="createLinkButton" />
                    </FormattingToolbar>
                  )} />
                  <SuggestionMenuController triggerCharacter="/" getItems={async (q) => slashItems(editor as any, q)} suggestionMenuComponent={BlockMenu} />
                </BlockNoteView>
              </div>
            </div>
          </main>

          <aside className="px-4 pb-24 pt-4 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:pl-2 lg:pr-5" aria-label="Proposal settings">
            <div className="grid gap-4">
              <section className="min-w-0 rounded-[1.25rem] bg-white p-4 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]" data-test="send-card">
                <h3 className="mb-3 text-[13px] font-semibold text-graphite dark:text-stone-400">Send to</h3>
                <div className="grid gap-3">
                  <Field label="Client" htmlFor="clientName">
                    <Input id="clientName" maxLength={200} value={details.clientName} disabled={readOnly} onChange={(e) => onDetails({ ...details, clientName: e.target.value })} placeholder="Acme Bakery" />
                  </Field>
                  <Field label="Their email" htmlFor="clientEmail">
                    <div className="grid gap-2">
                      <Input id="clientEmail" type="email" inputMode="email" spellCheck={false} maxLength={254} value={details.clientEmail} disabled={readOnly} onChange={(e) => onDetails({ ...details, clientEmail: e.target.value })} placeholder="owner@acmebakery.com" />
                      {details.ccEmails.map((e, i) => (
                        <div key={i} className="flex gap-1.5">
                          <Input aria-label={`Recipient ${i + 2}`} type="email" inputMode="email" spellCheck={false} maxLength={254} value={e} disabled={readOnly} autoFocus={e === ""} placeholder="another@acmebakery.com" onChange={(ev) => onDetails({ ...details, ccEmails: details.ccEmails.map((x, k) => (k === i ? ev.target.value : x)) })} />
                          {!readOnly && (
                            <Button variant="ghost" size="icon" aria-label="Remove recipient" onClick={() => onDetails({ ...details, ccEmails: details.ccEmails.filter((_, k) => k !== i) })}>
                              <X size={16} weight="light" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {!readOnly && details.ccEmails.length < 10 && (
                        <button type="button" onClick={() => onDetails({ ...details, ccEmails: [...details.ccEmails, ""] })} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-brand hover:bg-brand/[.08] dark:text-indigo-300">
                          <Plus size={14} weight="bold" /> Add another recipient
                        </button>
                      )}
                    </div>
                  </Field>
                  {!readOnly && (
                    <Button size="lg" className="mt-1 w-full" onClick={() => { setSendError(null); setSendOpen(true); }} data-test="send-button">
                      <PaperPlaneTilt size={16} weight="light" /> {status === "draft" ? "Send" : "Send again"}
                    </Button>
                  )}
                  {/* The client link, always here: copy it from the panel without opening anything. */}
                  <div className="min-w-0 overflow-hidden rounded-xl bg-stone-900/[.04] p-1.5 pl-3 dark:bg-white/[.06]" data-test="link-row">
                    <div className="flex items-center gap-2">
                      <Globe size={15} weight="light" className="flex-none text-stone-500" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-stone-700 dark:text-stone-300" title={link}>{link.replace(/^https?:\/\//, "")}</span>
                      {live || readOnly ? (
                        <Button size="sm" variant="secondary" onClick={() => void copy()} aria-label="Copy link" className="bg-white dark:bg-stone-800" data-test="copy-link">
                          {copied ? <Check size={14} weight="bold" /> : <LinkSimple size={14} weight="light" />} {copied ? "Copied" : "Copy"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={sendBusy} onClick={() => void send(false).then(() => copy())} className="bg-white dark:bg-stone-800" data-test="publish-link">
                          <LinkSimple size={14} weight="light" /> {sendBusy ? "…" : "Publish and copy"}
                        </Button>
                      )}
                    </div>
                    <p className="px-0.5 pb-1 pt-1.5 text-[12px] text-stone-500">
                      {live ? "Live. Anyone with the link can read it." : "Not live yet. Send it by email, or publish the link and share it yourself."}
                    </p>
                  </div>
                </div>
              </section>

              <div role="tablist" aria-label="Proposal settings" className="grid grid-cols-2 gap-1 rounded-full bg-stone-900/[.06] p-1 dark:bg-white/[.08]">
                {(["pricing", "options"] as const).map((t) => (
                  <button
                    key={t}
                    id={`tab-${t}`}
                    role="tab"
                    aria-selected={tab === t}
                    aria-controls={`panel-${t}`}
                    tabIndex={tab === t ? 0 : -1}
                    onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const next = t === "pricing" ? "options" : "pricing"; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}
                    onClick={() => setTab(t)}
                    className={cn(
                      "h-9 rounded-full text-[13px] font-medium capitalize transition-[background-color,color,box-shadow] duration-200",
                      tab === t ? "bg-white text-ink shadow-[0_1px_2px_rgba(25,24,22,.12)] dark:bg-stone-800 dark:text-stone-50" : "text-graphite hover:text-ink dark:text-stone-400 dark:hover:text-stone-100",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "pricing" && (
                <section id="pricing-panel" role="tabpanel" aria-labelledby="tab-pricing" className="rounded-[1.25rem] bg-white p-4 shadow-[0_1px_1px_rgba(25,24,22,.04),0_12px_32px_-20px_rgba(25,24,22,.35)] ring-1 ring-inset ring-stone-900/[.035] dark:bg-stone-900 dark:shadow-none dark:ring-white/[.08]">
                  <PricingPanel items={items} currency={details.currency} defaultTaxBps={details.taxRateBps} taxLabel={details.taxLabel} onChange={onItems} onTax={(bps, label) => onDetails({ ...details, taxRateBps: bps, taxLabel: label })} readOnly={readOnly} focus={pricingFocus} />
                </section>
              )}

              {tab === "options" && <section id="panel-options" role="tabpanel" aria-labelledby="tab-options"><MoreOptions
                teamEmails={user?.notifyEmails ?? []}
                details={details}
                onChange={onDetails}
                onPassword={onPassword}
                readOnly={readOnly}
                look={{ style: pageStyle, color: accent, senderName, brandColour }}
                onStyle={(id) => { setPageStyle(id); void save({ style: id }); }}
                onColour={(hex) => { setAccent(hex ?? ""); void save({ accentColor: hex }); }}
                onSender={(v) => { setSenderName(v); saveSender(v); }}
                onSaveTemplate={() => { setTplName(title); setTplError(null); setTplOpen(true); }}
                onDuplicate={() => void duplicate()}
                exportHref={`/api/proposals/${proposal.id}/export`}
                canPdf={user?.plan !== "free"}
                brandPaymentUrl={user?.paymentUrl ?? null}
                caps={user?.caps ?? { brand: true, protect: true, payment: true, countersign: false }}
              /></section>}

              {questions.length > 0 && (
                <section className="rounded-2xl bg-amber-500/[.08] p-4 ring-1 ring-inset ring-amber-500/20" aria-label="Questions from your client">
                  <h3 className="text-[13px] font-semibold">Questions from your client</h3>
                  <ul className="mt-2 grid gap-2">
                    {questions.map((q) => (
                      <li key={q.id} className="text-[13.5px]">
                        <span className="font-medium">{q.name}</span>: <span className="text-stone-700 dark:text-stone-300">{q.body}</span>
                        {q.email && <a href={`mailto:${q.email}?subject=${encodeURIComponent("Re: your question")}`} className="ml-2 text-[12.5px] font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Reply</a>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </aside>
        </div>

        {!readOnly && !sendOpen && !tplOpen && !phoneOpen && (
          <button type="button" onClick={addBlockHere} aria-label="Add a block" data-test="add-block-mobile" className="fixed bottom-5 right-5 z-20 grid h-13 w-13 place-items-center rounded-full bg-brand text-white shadow-[0_10px_30px_-8px_rgba(43,63,140,.7)] transition-transform active:scale-95 lg:hidden">
            <Plus size={22} weight="bold" />
          </button>
        )}
        {tplOpen && (
          <div role="dialog" aria-modal="true" aria-label="Save as template" className="fixed inset-0 z-30 grid place-items-end bg-stone-950/40 backdrop-blur-sm sm:place-items-center" onClick={() => setTplOpen(false)}>
            <div className="w-full rounded-t-2xl bg-white p-6 text-stone-900 shadow-2xl sm:w-[440px] sm:rounded-2xl dark:bg-stone-900 dark:text-stone-50" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold tracking-tight">Save as template</h2>
              <p className="mt-1 text-sm text-stone-500">Keeps the content, pricing, style and color. Client details are not saved.</p>
              <label className="mt-5 block text-[13px] font-medium" htmlFor="tplName">Template name</label>
              <Input id="tplName" autoFocus value={tplName} maxLength={80} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveTemplate(); }} className="mt-1.5" placeholder="Website project, standard" />
              {tplError && <p className="mt-3 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{tplError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setTplOpen(false)}>Cancel</Button>
                <Button disabled={tplBusy} onClick={() => void saveTemplate()}>{tplBusy ? "Saving…" : "Save template"}</Button>
              </div>
            </div>
          </div>
        )}

        {phoneOpen && (
          <div role="dialog" aria-modal="true" aria-label="Phone preview" className="fixed inset-0 z-30 grid place-items-center bg-stone-950/50 p-4 backdrop-blur-sm" onClick={() => setPhoneOpen(false)}>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div className="h-[min(780px,88dvh)] w-[390px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2.4rem] bg-white p-2.5 shadow-[0_40px_100px_-30px_rgba(0,0,0,.6)] ring-1 ring-white/20 dark:bg-stone-900">
                <iframe title="Your proposal on a phone" src={`/p/${proposal.publicId}?frame=1`} className="h-full w-full rounded-[1.9rem] border-0 bg-white" data-test="phone-frame" />
              </div>
              <button type="button" onClick={() => setPhoneOpen(false)} aria-label="Close" className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-stone-700 shadow-lg ring-1 ring-stone-900/10 dark:bg-stone-800 dark:text-stone-200">
                <X size={16} weight="bold" />
              </button>
              <p className="mt-3 text-center text-[13px] text-white/80">This is the live client page at phone width.</p>
            </div>
          </div>
        )}
        {splash && (
          <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-40 grid place-items-center">
            <div className="qs-splash flex flex-col items-center gap-3 rounded-[2rem] bg-white/95 px-10 py-8 shadow-[0_30px_80px_-30px_rgba(25,24,22,.45)] ring-1 ring-inset ring-stone-900/[.06] backdrop-blur dark:bg-stone-900/95 dark:ring-white/10">
              <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                <circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" strokeWidth="3" className="qs-splash-ring text-brand" />
                <path d="M22 37.5 L31.5 47 L50 27" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="qs-splash-check text-brand" />
              </svg>
              <div className="text-[17px] font-semibold tracking-[-0.01em]">{splash}</div>
            </div>
          </div>
        )}
        {sendOpen && (
          <div role="dialog" aria-modal="true" aria-label="Send proposal" className="fixed inset-0 z-30 grid place-items-end bg-stone-950/40 backdrop-blur-sm sm:place-items-center" onClick={() => setSendOpen(false)}>
            <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 text-stone-900 shadow-2xl sm:w-[460px] sm:rounded-2xl dark:bg-stone-900 dark:text-stone-50" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{live ? "Send again" : "Send proposal"}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {recipients.length
                      ? `We email the link to ${recipients.length === 1 ? recipients[0] : recipients.length === 2 ? recipients.join(" and ") : `${recipients.length} people`}${live ? "." : " and mark this proposal as sent."}`
                      : "Add an email and we send it, or publish the link and share it yourself."}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSendOpen(false)}>
                  <X size={18} weight="light" />
                </Button>
              </div>
              <div className="mt-5 grid gap-3">
                <Field label={details.ccEmails.length ? "Recipients" : "Their email"} htmlFor="sendEmail">
                  <div className="grid gap-2">
                    <Input id="sendEmail" type="email" inputMode="email" spellCheck={false} maxLength={254} value={details.clientEmail} autoFocus={!details.clientEmail} onChange={(e) => onDetails({ ...details, clientEmail: e.target.value })} placeholder="owner@acmebakery.com" />
                    {details.ccEmails.map((e, i) => (
                      <div key={i} className="flex gap-1.5">
                        <Input aria-label={`Recipient ${i + 2}`} type="email" inputMode="email" spellCheck={false} maxLength={254} value={e} placeholder="another@acmebakery.com" onChange={(ev) => onDetails({ ...details, ccEmails: details.ccEmails.map((x, k) => (k === i ? ev.target.value : x)) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove recipient" onClick={() => onDetails({ ...details, ccEmails: details.ccEmails.filter((_, k) => k !== i) })}>
                          <X size={16} weight="light" />
                        </Button>
                      </div>
                    ))}
                    {details.ccEmails.length < 10 && (
                      <button type="button" onClick={() => onDetails({ ...details, ccEmails: [...details.ccEmails, ""] })} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-brand hover:bg-brand/[.08] dark:text-indigo-300">
                        <Plus size={14} weight="bold" /> Add another recipient
                      </button>
                    )}
                  </div>
                </Field>
                {recipients.length > 0 && (
                  <Field label="A note in the email" htmlFor="sendMessage" hint="Optional. Goes above the link, in your words.">
                    <textarea id="sendMessage" value={message} maxLength={1000} rows={3} onChange={(e) => setMessage(e.target.value)} placeholder={`Hi ${details.clientName || "there"}, here is the proposal we talked about. Happy to answer anything.`} className="w-full resize-none rounded-xl border border-hairline bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-stone-400 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 dark:border-white/15" />
                  </Field>
                )}
                {sendError && <p className="rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{sendError}</p>}
                <Button size="lg" disabled={sendBusy} onClick={() => void send(recipients.length > 0)} data-test="send-confirm">
                  {sendBusy ? "Sending…" : recipients.length ? (live ? "Send again" : "Send") : live ? "Done" : "Publish the link"}
                </Button>
                <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl bg-stone-900/[.04] p-1.5 pl-3 dark:bg-white/[.06]">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-600 dark:text-stone-300" title={link}>{link.replace(/^https?:\/\//, "")}</span>
                  <Button size="sm" variant="secondary" onClick={() => void copy()} className="bg-white dark:bg-stone-800">{copied ? <Check size={14} weight="bold" /> : <LinkSimple size={14} weight="light" />} {copied ? "Copied" : "Copy"}</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PricingContext.Provider>
  );
}

/** The cover the client sees first. Title, client and sender are edited in place. */
function Cover(p: { title: string; readOnly: boolean; onTitle: (t: string) => void; clientName: string; onClientName: (v: string) => void; senderName: string; onSenderName: (v: string) => void; color: string; pageStyle: string }) {
  const style = styleOf(p.pageStyle);
  const accent = p.color;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [p.title, p.pageStyle]);
  const paper = style.paperCover;
  const lightAccent = !paper && style.id !== "night" && readableOn(accent) !== "#ffffff";
  const ink = paper ? "text-ink" : lightAccent ? "text-[#2f2e2b]" : "text-white";
  const coverBg: React.CSSProperties =
    style.id === "bold" ? { background: accent }
    : style.id === "night" ? { background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, ${accent} 55%, #000) 0%, #0e0e11 62%)` }
    : paper ? { background: style.id === "warm" ? "#f7f1e6" : "var(--sheet-bg)", borderBottom: style.id === "editorial" ? `6px solid ${accent}` : undefined }
    : { backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${accent} 78%, #000) 0%, ${accent} 55%, color-mix(in srgb, ${accent} 72%, #fff) 100%)` };
  const field = paper || lightAccent
    ? "-mx-1.5 rounded-md border border-transparent bg-transparent px-1.5 text-inherit outline-none transition-colors hover:border-black/15 focus:border-black/30 focus:bg-black/[.04] placeholder:text-black/35 disabled:hover:border-transparent"
    : "-mx-1.5 rounded-md border border-transparent bg-transparent px-1.5 text-white outline-none transition-colors hover:border-white/35 focus:border-white/70 focus:bg-white/10 placeholder:text-white/60 disabled:hover:border-transparent";
  return (
    <div className={cn("cover relative overflow-hidden px-6 pb-10 pt-14 sm:px-20 sm:pb-12 sm:pt-20", ink)} style={coverBg} data-test="cover" data-cover-style={style.id}>
      {(style.id === "classic" || style.id === "warm" || style.id === "night") && (
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-[40%] -right-[10%] aspect-square w-[60%] rounded-full" style={{ background: style.id === "classic" ? "radial-gradient(circle, rgba(255,255,255,.18), transparent 65%)" : `radial-gradient(circle, color-mix(in srgb, ${accent} ${style.id === "night" ? "50%" : "60%"}, transparent), transparent 64%)`, filter: style.id === "night" ? "blur(20px)" : undefined }} />
      )}
      <div className="relative">
        <label className="mb-3 flex items-center gap-1.5 text-[14px] opacity-90">
          <span className="whitespace-nowrap">Prepared for</span>
          <input value={p.clientName} disabled={p.readOnly} maxLength={200} aria-label="Client name" placeholder="your client" onChange={(e) => p.onClientName(e.target.value)} className={field + " min-w-[12ch] max-w-full py-0.5 text-[14px] [field-sizing:content]"} />
        </label>
        <textarea
          ref={titleRef}
          value={p.title}
          readOnly={p.readOnly}
          rows={1}
          maxLength={200}
          aria-label="Proposal title"
          placeholder="Untitled proposal"
          onChange={(e) => p.onTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          className={field + " cover-title block w-full max-w-[16ch] resize-none overflow-hidden py-0 text-[clamp(34px,5.5vw,56px)] font-[650] leading-[1.02] tracking-[-0.04em]"}
        />
        <label className="mt-7 flex items-center gap-1.5 text-[15px]">
          <span className="whitespace-nowrap opacity-90">By</span>
          <input value={p.senderName} disabled={p.readOnly} maxLength={120} aria-label="Sender name" placeholder="your business name" onChange={(e) => p.onSenderName(e.target.value)} className={field + " min-w-[10ch] max-w-full py-0.5 text-[15px] font-medium [field-sizing:content]"} />
        </label>
      </div>
    </div>
  );
}

const BAND_COLOURS = new Set(["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);

/** A heading's highlight color becomes the band of its whole section, exactly as on the client page. */
function useSectionBands(editor: { document: unknown; onChange: (cb: () => void) => unknown }): string {
  const [css, setCss] = useState("");
  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const doc = editor.document as { id: string; type: string; props?: Record<string, unknown> }[];
      const rules: string[] = [];
      let color: string | null = null;
      let ids: string[] = [];
      const flush = () => {
        if (color && ids.length) {
          const sel = (id: string) => `.bn-editor > .bn-block-group > [data-id="${id}"]`;
          const bg = `color-mix(in srgb, var(--bn-colors-highlights-${color}-background) var(--band-mix), var(--sheet-bg))`;
          rules.push(`${ids.map(sel).join(",")}{background:${bg};margin-block:0;padding-block:.35em;margin-inline:calc(var(--sheet-pad) * -1);padding-inline:var(--sheet-pad)}`);
          rules.push(`${sel(ids[0]!)}{padding-top:44px;margin-top:20px}${sel(ids[0]!)} .bn-block,${sel(ids[0]!)} .bn-block-content{background:transparent!important}${sel(ids[0]!)} h2{margin-top:0}`);
          rules.push(`${sel(ids[ids.length - 1]!)}{padding-bottom:36px;margin-bottom:20px}`);
        }
        ids = [];
        color = null;
      };
      for (const b of Array.isArray(doc) ? doc : []) {
        const level = b.type === "heading" ? Number(b.props?.level) : 0;
        if (level === 1 || level === 2) {
          flush();
          const bgc = String(b.props?.backgroundColor ?? "default");
          color = BAND_COLOURS.has(bgc) ? bgc : null;
        }
        if (color) ids.push(b.id);
      }
      flush();
      setCss(rules.join("\n"));
    };
    compute();
    const off = editor.onChange(() => { if (!frame) frame = requestAnimationFrame(compute); });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (typeof off === "function") off();
    };
  }, [editor]);
  return css;
}
