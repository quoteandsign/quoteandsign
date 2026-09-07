import { createContext, useContext, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, createHeadingBlockSpec } from "@blocknote/core";
import { createReactBlockSpec, getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from "@blocknote/react";
import { Table, CheckCircle, TextAa, SquaresFour, ChatCircleText, Images, FilmSlate } from "@phosphor-icons/react";
import { computeTotals, formatMoney, lineSummary, periodRow, type PricingLine } from "../../shared/pricing";
import { videoEmbed } from "../../shared/video";
import { shrinkImage } from "../lib/image";

// The editor shows a live preview of the pricing table inside the document. The data
// itself lives in the pricing panel; this context hands it to the block.
export const PricingContext = createContext<{ items: PricingLine[]; currency: string; defaultTaxBps: number; taxLabel: string; openPricing: (lineId?: string) => void }>({
  items: [],
  currency: "USD",
  defaultTaxBps: 0,
  taxLabel: "",
  openPricing: () => {},
});

// Keys typed inside a block's own inputs must not reach the editor's shortcuts.
const stop = (e: KeyboardEvent) => e.stopPropagation();
const fieldCls =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-inherit outline-none transition-colors hover:border-stone-900/10 focus:border-brand/50 focus:bg-white placeholder:text-stone-400 dark:hover:border-white/10 dark:focus:bg-stone-900";

function PricingPreview() {
  const { items, currency, defaultTaxBps, taxLabel, openPricing } = useContext(PricingContext);
  const totals = computeTotals(items, {}, defaultTaxBps);
  return (
    <div className="my-4 w-full select-none overflow-hidden rounded-2xl bg-stone-50 text-[15px] ring-1 ring-stone-900/[.07] dark:bg-stone-950/40 dark:ring-white/10" contentEditable={false}>
      {items.length === 0 ? (
        <div className="p-5 text-center">
          <div className="font-medium">Pricing table</div>
          <p className="mt-1 text-sm text-stone-500">No line items yet.</p>
          <button onClick={() => openPricing()} className="mt-3 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white">
            Add pricing
          </button>
        </div>
      ) : (
        <>
          {totals.lines.map((l) => (
            <div key={l.id} role="button" tabIndex={0} title="Edit this line" onClick={() => openPricing(l.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPricing(l.id); } }} className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-3 border-b border-stone-900/[.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-brand/[.06] focus-visible:bg-brand/[.06] focus-visible:outline-none dark:border-white/[.08]">
              <span className={l.optional ? "mt-[3px] inline-block h-[18px] w-[30px] rounded-full " + (l.selected ? "bg-brand" : "bg-stone-300 dark:bg-stone-700") : "w-[30px]"} aria-hidden="true">
                {l.optional && <span className={"block h-[14px] w-[14px] translate-y-[2px] rounded-full bg-white shadow-sm " + (l.selected ? "translate-x-[14px]" : "translate-x-[2px]")} />}
              </span>
              <div className="min-w-0">
                <div className={"font-medium " + (l.selected ? "" : "text-stone-400 line-through")}>{l.name}</div>
                {l.description && <div className="text-[13.5px] text-stone-500">{l.description}</div>}
                {lineSummary(l, currency) && <div className="text-[12.5px] text-stone-500 tabular-nums">{lineSummary(l, currency)}</div>}
              </div>
              <div className={"whitespace-nowrap tabular-nums " + (l.selected ? "" : "text-stone-400")}>{l.quantity === 0 ? "" : formatMoney(l.lineSubtotal, currency)}</div>
            </div>
          ))}
          <div className="bg-white px-5 py-3.5 dark:bg-stone-900">
            {totals.hasTax && (
              <div className="mb-2 grid gap-0.5 text-[13px] text-stone-500 tabular-nums">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
                <div className="flex justify-between"><span>{taxLabel || "Tax"}</span><span>{formatMoney(totals.tax, currency)}</span></div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button onClick={() => openPricing()} className="text-sm font-medium text-brand dark:text-indigo-300">
                Edit pricing
              </button>
              <div className="text-right text-base font-semibold tabular-nums">
                {totals.hasOnce && <div>{totals.recurring.length ? "One-time " : "Total "}{formatMoney(totals.total, currency)}</div>}
                {totals.recurring.filter((r) => r.total > 0 || !totals.hasOnce).map((r) => <div key={r.period} className="text-[14px]">{periodRow(r.period)} {formatMoney(r.total, currency)}</div>)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AcceptPreview() {
  return (
    <div className="my-4 w-full select-none rounded-2xl bg-stone-50 p-6 ring-1 ring-stone-900/[.07] dark:bg-stone-950/40 dark:ring-white/10" contentEditable={false}>
      <div className="text-[20px] font-semibold tracking-tight">Accept this proposal</div>
      <p className="mt-1 text-[14px] text-stone-500">Your client types their name, agrees, and clicks Accept. Both of you get a signed copy.</p>
      <div className="mt-5 grid gap-3">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-stone-500">Full name</div>
          <div className="h-11 rounded-[10px] bg-white ring-1 ring-stone-900/10 dark:bg-stone-900 dark:ring-white/10" />
        </div>
        <div className="flex items-start gap-2.5 text-[13px] text-stone-500">
          <span className="mt-0.5 h-4 w-4 flex-none rounded-[4px] ring-1 ring-stone-900/20 dark:ring-white/20" />
          <span>I have read this proposal and agree to it. Typing my name and clicking Accept is my electronic signature.</span>
        </div>
        <div className="grid h-12 place-items-center rounded-full bg-brand text-[15px] font-semibold text-white">Accept proposal</div>
      </div>
    </div>
  );
}

// ---- Feature grid: two or three cards, edited in place -------------------------------------
type GridItem = { title: string; text: string };
function parseItems(v: unknown): GridItem[] {
  try {
    const p = JSON.parse(String(v ?? "[]"));
    return Array.isArray(p) ? p.map((i) => ({ title: String(i?.title ?? ""), text: String(i?.text ?? "") })) : [];
  } catch {
    return [];
  }
}

function FeatureGridEditor({ block, editor }: { block: any; editor: any }) {
  const items = parseItems(block.props.items);
  const cols = Number(block.props.cols) === 2 ? 2 : 3;
  const save = (next: GridItem[], nextCols = cols) => editor.updateBlock(block, { props: { items: JSON.stringify(next), cols: String(nextCols) } });
  const set = (i: number, patch: Partial<GridItem>) => save(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  return (
    <div className="my-4 w-full" contentEditable={false}>
      <div className={"grid grid-cols-1 gap-3 " + (cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {items.map((it, i) => (
          <div key={i} className="group relative rounded-2xl border border-stone-900/[.08] bg-white p-3 dark:border-white/10 dark:bg-stone-900">
            <textarea rows={1} className={fieldCls + " resize-none text-[15px] font-semibold leading-snug [field-sizing:content]"} value={it.title} placeholder="Title" onKeyDown={stop} onChange={(e) => set(i, { title: e.target.value })} />
            <textarea className={fieldCls + " mt-1 min-h-[64px] resize-none text-[13.5px] [field-sizing:content] text-stone-600 dark:text-stone-300"} value={it.text} placeholder="One or two sentences" onKeyDown={stop} onChange={(e) => set(i, { text: e.target.value })} />
            {items.length > 1 && (
              <button type="button" aria-label="Remove card" onClick={() => save(items.filter((_, k) => k !== i))} className="absolute right-2 top-2 hidden h-6 w-6 place-items-center rounded-full bg-stone-900/[.06] text-[12px] text-stone-500 group-hover:grid dark:bg-white/10">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[12px] text-stone-500">
        {items.length < 6 && (
          <button type="button" className="font-medium text-brand dark:text-indigo-300" onClick={() => save([...items, { title: "", text: "" }])}>
            + Add card
          </button>
        )}
        <span>Columns:</span>
        {[2, 3].map((n) => (
          <button key={n} type="button" aria-pressed={cols === n} onClick={() => save(items, n)} className={"rounded-md px-1.5 py-0.5 " + (cols === n ? "bg-stone-900/[.08] text-ink dark:bg-white/10 dark:text-stone-50" : "")}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Testimonial ----------------------------------------------------------------------------------
function TestimonialEditor({ block, editor }: { block: any; editor: any }) {
  const p = block.props as { quote: string; name: string; role: string; photo: string };
  const set = (patch: Partial<typeof p>) => editor.updateBlock(block, { props: patch });
  const [showPhoto, setShowPhoto] = useState(Boolean(p.photo));
  return (
    <figure className="my-4 w-full rounded-2xl border border-stone-900/[.08] bg-white p-5 dark:border-white/10 dark:bg-stone-900" contentEditable={false}>
      <textarea className={fieldCls + " min-h-[72px] resize-none text-[19px] [field-sizing:content] font-medium leading-snug tracking-[-0.01em]"} value={p.quote} placeholder="What the client said, in their words" onKeyDown={stop} onChange={(e) => set({ quote: e.target.value })} />
      <div className="mt-3 flex items-center gap-3">
        {p.photo ? (
          <img src={p.photo} alt="" className="h-11 w-11 flex-none rounded-full object-cover" />
        ) : (
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-brand/12 text-[17px] font-bold text-brand">{(p.name || "“").trim().slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <input className={fieldCls + " text-[14px] font-semibold"} value={p.name} placeholder="Name" onKeyDown={stop} onChange={(e) => set({ name: e.target.value })} />
          <input className={fieldCls + " text-[13px] text-stone-500"} value={p.role} placeholder="Role, company" onKeyDown={stop} onChange={(e) => set({ role: e.target.value })} />
        </div>
      </div>
      <div className="mt-2 text-[12px] text-stone-500">
        {showPhoto ? (
          <input className={fieldCls + " text-[12px]"} value={p.photo} placeholder="https://… photo URL (optional)" onKeyDown={stop} onChange={(e) => set({ photo: e.target.value })} />
        ) : (
          <button type="button" className="font-medium text-brand dark:text-indigo-300" onClick={() => setShowPhoto(true)}>
            + Add a photo
          </button>
        )}
      </div>
    </figure>
  );
}

// ---- Video by link: YouTube, Vimeo or Loom. No uploads; video files have no place in a proposal. --
function VideoLinkEditor({ block, editor }: { block: any; editor: any }) {
  const p = block.props as { url: string; caption: string };
  const [draft, setDraft] = useState(p.url);
  const set = (patch: Partial<typeof p>) => editor.updateBlock(block, { props: patch });
  const embed = videoEmbed(p.url);
  return (
    <figure className="my-4 w-full" contentEditable={false}>
      {embed ? (
        <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "16 / 9" }}>
          <iframe src={embed.src} title={p.caption || "Video"} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : (
        <div className="grid place-items-center rounded-2xl bg-stone-900/[.04] px-4 py-8 text-center text-[13.5px] text-stone-500 dark:bg-white/[.06]">
          {p.url ? "That link is not a YouTube, Vimeo or Loom video." : "Paste a YouTube, Vimeo or Loom link below."}
        </div>
      )}
      <div className="mt-2 grid gap-1">
        <input className={fieldCls + " text-[13px]"} value={draft} placeholder="https://www.youtube.com/watch?v=…" onKeyDown={stop} onChange={(e) => setDraft(e.target.value)} onBlur={() => set({ url: draft.trim() })} />
        <input className={fieldCls + " text-[13px]"} value={p.caption} placeholder="Caption (optional)" onKeyDown={stop} onChange={(e) => set({ caption: e.target.value })} />
      </div>
    </figure>
  );
}
export const VideoLinkBlock = createReactBlockSpec(
  { type: "video", propSchema: { url: { default: "" }, caption: { default: "" } }, content: "none" },
  { render: (props) => <VideoLinkEditor block={props.block} editor={props.editor} /> },
);

// ---- Image row: two to four pictures side by side, each uploaded and shrunk like any image. -----
type RowImage = { url: string; caption: string };
function parseImages(v: unknown): RowImage[] {
  try {
    const list = JSON.parse(String(v ?? "[]"));
    return Array.isArray(list) ? list.map((it) => ({ url: String(it?.url ?? ""), caption: String(it?.caption ?? "") })) : [];
  } catch {
    return [];
  }
}
function ImageRowEditor({ block, editor }: { block: any; editor: any }) {
  const images = parseImages(block.props.images);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pickers = useRef<(HTMLInputElement | null)[]>([]);
  const pick = (e: MouseEvent, i: number) => { e.preventDefault(); e.stopPropagation(); pickers.current[i]?.click(); };
  const save = (next: RowImage[]) => editor.updateBlock(block, { props: { images: JSON.stringify(next) } });
  const upload = async (i: number, file: File) => {
    setBusy(i);
    setError(null);
    try {
      const small = await shrinkImage(file, 1400);
      const url = await editor.uploadFile(small);
      save(images.map((it, k) => (k === i ? { ...it, url: typeof url === "string" ? url : String(url?.props?.url ?? "") } : it)));
    } catch (e) {
      setError((e as Error).message || "Could not upload that image.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="my-4 w-full" contentEditable={false}>
      <div className={"grid gap-3 " + (images.length <= 2 ? "grid-cols-2" : images.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
        {images.map((it, i) => (
          <figure key={i} className="group relative m-0">
            <input ref={(el) => { pickers.current[i] = el; }} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i, f); e.target.value = ""; }} />
            {it.url ? (
              <img src={it.url} alt={it.caption} className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : (
              <button type="button" onMouseDown={(e) => pick(e, i)} disabled={busy === i} className="grid aspect-[4/3] w-full cursor-pointer place-items-center rounded-xl border border-dashed border-stone-900/[.15] bg-stone-900/[.03] text-[13px] text-stone-500 hover:bg-stone-900/[.06] dark:border-white/15 dark:bg-white/[.04]">
                {busy === i ? "Uploading…" : "+ Upload image"}
              </button>
            )}
            <input className={fieldCls + " mt-1 text-[12.5px]"} value={it.caption} placeholder="Caption (optional)" onKeyDown={stop} onChange={(e) => save(images.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))} />
            {images.length > 2 && (
              <button type="button" aria-label="Remove image" onClick={() => save(images.filter((_, k) => k !== i))} className="absolute right-2 top-2 hidden h-6 w-6 place-items-center rounded-full bg-white/90 text-[12px] text-stone-700 shadow group-hover:grid">×</button>
            )}
            {it.url && (
              <button type="button" onMouseDown={(e) => pick(e, i)} className="absolute left-2 top-2 hidden cursor-pointer rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-stone-700 shadow group-hover:block">
                Replace
              </button>
            )}
          </figure>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[12px] text-stone-500">
        {images.length < 4 && (
          <button type="button" className="font-medium text-brand dark:text-indigo-300" onClick={() => save([...images, { url: "", caption: "" }])}>
            + Add image
          </button>
        )}
        <span>Side by side on desktop, stacked in pairs on a phone.</span>
        {error && <span className="text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
export const ImageRowBlock = createReactBlockSpec(
  { type: "imageRow", propSchema: { images: { default: JSON.stringify([{ url: "", caption: "" }, { url: "", caption: "" }]) } }, content: "none" },
  { render: (props) => <ImageRowEditor block={props.block} editor={props.editor} /> },
);

export const PricingTableBlock = createReactBlockSpec({ type: "pricingTable", propSchema: {}, content: "none" }, { render: () => <PricingPreview /> });
export const AcceptBlock = createReactBlockSpec({ type: "acceptBlock", propSchema: {}, content: "none" }, { render: () => <AcceptPreview /> });
export const StatementBlock = createReactBlockSpec(
  { type: "statement", propSchema: { textColor: { default: "default" }, backgroundColor: { default: "default" } }, content: "inline" },
  {
    render: (props) => {
      const bg = String(props.block.props.backgroundColor ?? "default");
      return (
        <p
          className="my-3 max-w-[24ch] text-[clamp(22px,2.6vw,30px)] font-semibold leading-[1.25] tracking-[-0.025em]"
          style={bg !== "default" ? { background: `var(--bn-colors-highlights-${bg}-background)`, padding: "0.35em 0.5em", borderRadius: 8, boxDecorationBreak: "clone" } : undefined}
          ref={props.contentRef}
        />
      );
    },
  },
);
export const FeatureGridBlock = createReactBlockSpec(
  { type: "featureGrid", propSchema: { cols: { default: "3" }, items: { default: JSON.stringify([{ title: "", text: "" }, { title: "", text: "" }, { title: "", text: "" }]) } }, content: "none" },
  { render: (props) => <FeatureGridEditor block={props.block} editor={props.editor} /> },
);
export const TestimonialBlock = createReactBlockSpec(
  { type: "testimonial", propSchema: { quote: { default: "" }, name: { default: "" }, role: { default: "" }, photo: { default: "" } }, content: "none" },
  { render: (props) => <TestimonialEditor block={props.block} editor={props.editor} /> },
);

// BlockNote's own video, audio and file blocks upload files; only images belong in a proposal.
// Code and toggle blocks do not survive the trip to the client page, so they are out too, and
// headings stop at three levels, which is what the page and the section nav understand.
const { video: _video, audio: _audio, file: _file, codeBlock: _code, toggleListItem: _toggle, heading: _heading, ...keptDefaults } = defaultBlockSpecs;
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...keptDefaults,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }),
    video: VideoLinkBlock(),
    imageRow: ImageRowBlock(),
    pricingTable: PricingTableBlock(),
    acceptBlock: AcceptBlock(),
    statement: StatementBlock(),
    featureGrid: FeatureGridBlock(),
    testimonial: TestimonialBlock(),
  },
});

export type Editor = Parameters<typeof getDefaultReactSlashMenuItems>[0];

// Insert after the current block, or replace it when it is an empty paragraph (the usual
// state right after typing "/").
function insertBlock(editor: Editor, block: Record<string, unknown>) {
  const current = editor.getTextCursorPosition().block as any;
  const isEmptyParagraph = current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
  if (isEmptyParagraph) editor.updateBlock(current, block as any);
  else editor.insertBlocks([block as any], current, "after");
}

export function slashItems(editor: Editor, query: string): DefaultReactSuggestionItem[] {
  const custom: DefaultReactSuggestionItem[] = [
    { title: "Pricing table", subtext: "Line items your client can toggle", group: "Proposal", aliases: ["price", "quote", "pricing"], icon: <Table size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "pricingTable" }) },
    { title: "Accept button", subtext: "Where your client signs", group: "Proposal", aliases: ["sign", "accept", "signature"], icon: <CheckCircle size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "acceptBlock" }) },
    { title: "Big statement", subtext: "One big line that sets the tone", group: "Proposal", aliases: ["big", "callout", "statement"], icon: <TextAa size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "statement" }) },
    { title: "Feature grid", subtext: "Two or three cards side by side", group: "Proposal", aliases: ["cards", "columns", "grid", "features"], icon: <SquaresFour size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "featureGrid" }) },
    { title: "Testimonial", subtext: "A client quote with name and photo", group: "Proposal", aliases: ["quote", "review", "testimonial"], icon: <ChatCircleText size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "testimonial" }) },
    { title: "Image row", subtext: "Two to four pictures side by side", group: "Lists and more", aliases: ["images", "gallery", "photos", "row"], icon: <Images size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "imageRow" }) },
    { title: "Video", subtext: "A YouTube, Vimeo or Loom link", group: "Lists and more", aliases: ["youtube", "vimeo", "loom", "video"], icon: <FilmSlate size={18} weight="light" />, onItemClick: () => insertBlock(editor, { type: "video" }) },
  ];
  // Keep only blocks that belong in a proposal. Code, toggles, audio and file uploads are noise here.
  const keep = new Set(["Heading 1", "Heading 2", "Heading 3", "Paragraph", "Quote", "Bullet List", "Numbered List", "Check List", "Table", "Image", "Divider"]);
  const defaults = getDefaultReactSlashMenuItems(editor)
    .filter((i) => keep.has(i.title))
    .map((i) => ({ ...i, title: i.title.replace(" List", " list"), group: i.title.startsWith("Heading") || i.title === "Paragraph" || i.title === "Quote" ? "Text" : "Lists and more" }));
  return filterSuggestionItems([...custom, ...defaults], query);
}
