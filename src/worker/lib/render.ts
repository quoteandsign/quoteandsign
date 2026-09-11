// Renders BlockNote document JSON to static HTML for the public proposal page.
// Everything is escaped. Only known block types render; unknown types render as paragraphs.

import { videoEmbed } from "../../shared/video";

export const PRICING_MARKER = "<!--op:pricing-->";
export const ACCEPT_MARKER = "<!--op:accept-->";

type Styles = Partial<Record<"bold" | "italic" | "underline" | "strike" | "code", boolean>> & {
  textColor?: string;
  backgroundColor?: string;
};
type Inline =
  | { type: "text"; text: string; styles?: Styles }
  | { type: "link"; href: string; content: Inline[] | string };
type TableContent = { type: "tableContent"; rows: { cells: (Inline[] | string)[] }[] };
export type Block = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | string | TableContent;
  children?: Block[];
};

export const COLOUR_NAMES = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(href: string): string {
  const h = String(href ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  if (/^\/files\/(logos|images)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(h)) return h;
  // Abstract artwork bundled with the app, used by the starter templates.
  if (/^\/img\/art\/[a-z0-9-]{1,40}\.svg$/i.test(h)) return h;
  return "#";
}

function colourClass(props: Record<string, unknown> | undefined, kind: "bg" | "fg"): string {
  const v = String(props?.[kind === "bg" ? "backgroundColor" : "textColor"] ?? "default");
  return (COLOUR_NAMES as readonly string[]).includes(v) ? ` ${kind}-${v}` : "";
}

/**
 * Plain text split into word spans for a staggered reveal, with the unsplit text kept for
 * assistive technology. Anything with links or styles is left whole.
 */
export function wordSpans(content: Inline[] | string | undefined): string | null {
  const plain = typeof content === "string" ? content : Array.isArray(content) && content.every((n) => n && n.type === "text" && !Object.values(n.styles ?? {}).some(Boolean)) ? content.map((n) => (n as { text: string }).text).join("") : null;
  if (plain == null) return null;
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 40) return null;
  return `<span class="sr">${esc(plain)}</span><span class="ws" aria-hidden="true">${words.map((w) => `<span class="w">${esc(w)}</span>`).join(" ")}</span>`;
}

function renderInline(content: Inline[] | string | undefined): string {
  if (content == null) return "";
  if (typeof content === "string") return esc(content);
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "link") {
        return `<a href="${esc(safeHref(node.href))}" rel="noopener nofollow" target="_blank">${renderInline(node.content)}</a>`;
      }
      let t = esc(node.text);
      const s = node.styles ?? {};
      if (s.code) t = `<code>${t}</code>`;
      if (s.bold) t = `<strong>${t}</strong>`;
      if (s.italic) t = `<em>${t}</em>`;
      if (s.underline) t = `<u>${t}</u>`;
      if (s.strike) t = `<s>${t}</s>`;
      if (s.textColor && (COLOUR_NAMES as readonly string[]).includes(String(s.textColor))) t = `<span class="fg-${esc(s.textColor)}">${t}</span>`;
      if (s.backgroundColor && (COLOUR_NAMES as readonly string[]).includes(String(s.backgroundColor))) t = `<span class="bg-${esc(s.backgroundColor)}">${t}</span>`;
      return t;
    })
    .join("");
}

export function inlineToText(content: Block["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((n) => (n.type === "text" ? n.text : inlineToText(n.content as Inline[]))).join("");
  return "";
}

function isEmptyText(content: Block["content"]): boolean {
  if (content == null) return true;
  if (typeof content === "string") return content.trim() === "";
  if (Array.isArray(content)) return content.every((n) => n.type === "text" && n.text.trim() === "");
  return false;
}

/** Only these hosts may be embedded as video. The CSP frame-src list must match. */
export { videoEmbed };

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return fallback;
  try {
    const p = JSON.parse(v);
    return (p ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const MAX_DEPTH = 12;

/** The editor stores a pixel width; the page gets the nearest of a few fractions of the column. */
function imageSize(props: Record<string, unknown>): string {
  const px = Number(props.previewWidth);
  if (!Number.isFinite(px) || px <= 0) return " wide";
  const share = px / 740;
  if (share >= 0.9) return " wide";
  const buckets: [number, string][] = [[0.29, "w-25"], [0.41, "w-33"], [0.58, "w-50"], [0.7, "w-66"], [0.9, "w-75"]];
  return " " + (buckets.find(([max]) => share <= max)?.[1] ?? "w-75");
}
function imageAlign(props: Record<string, unknown>): string {
  const a = String(props.textAlignment ?? "left");
  return a === "center" || a === "right" ? ` al-${a}` : "";
}

export function renderBlocks(blocks: Block[], depth = 0): string {
  if (!Array.isArray(blocks) || depth > MAX_DEPTH) return "";
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    const listTag =
      b.type === "bulletListItem" ? "ul" : b.type === "numberedListItem" ? "ol" : b.type === "checkListItem" ? "ul" : null;
    if (listTag) {
      const items: string[] = [];
      const kind = b.type;
      while (i < blocks.length && blocks[i]!.type === kind) {
        const item = blocks[i]!;
        const checked = kind === "checkListItem" ? Boolean(item.props?.checked) : null;
        const prefix = checked === null ? "" : `<span class="check${checked ? " on" : ""}" aria-hidden="true"></span>`;
        items.push(`<li class="${colourClass(item.props, "bg").trim()}${colourClass(item.props, "fg")}${alignClass(item.props)}">${prefix}${renderInline(item.content as Inline[] | string)}${renderChildren(item, depth)}</li>`);
        i++;
      }
      // A numbered list may continue from an earlier one: the editor stores where it starts.
      const start = kind === "numberedListItem" && Number(b.props?.start) > 1 ? ` start="${Number(b.props!.start)}"` : "";
      out.push(`<${listTag}${start}${kind === "checkListItem" ? ' class="checklist"' : ""}>${items.join("")}</${listTag}>`);
      continue;
    }
    out.push(renderBlock(b, depth));
    i++;
  }
  return out.join("\n");
}

function renderChildren(b: Block, depth: number): string {
  return Array.isArray(b.children) && b.children.length ? renderBlocks(b.children, depth + 1) : "";
}

/** The alignment button in the editor. */
function alignClass(props: Record<string, unknown> | undefined): string {
  const a = String(props?.textAlignment ?? "left");
  return a === "center" || a === "right" || a === "justify" ? ` ta-${a}` : "";
}

function blockClass(b: Block): string {
  const c = `${colourClass(b.props, "bg")}${colourClass(b.props, "fg")}${alignClass(b.props)}`.trim();
  return c ? ` class="${c}"` : "";
}

function renderBlock(b: Block, depth: number): string {
  if (!b || typeof b !== "object") return "";
  const props = b.props && typeof b.props === "object" ? b.props : {};
  switch (b.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(props.level) || 2));
      const split = level === 2 ? wordSpans(b.content as Inline[] | string) : null;
      return `<h${level}${blockClass(b)}>${split ?? renderInline(b.content as Inline[] | string)}</h${level}>${renderChildren(b, depth)}`;
    }
    case "paragraph":
      return isEmptyText(b.content) && !b.children?.length
        ? `<p class="blank"></p>`
        : `<p${blockClass(b)}>${renderInline(b.content as Inline[] | string)}</p>${renderChildren(b, depth)}`;
    case "quote":
      return `<blockquote${blockClass(b)}>${renderInline(b.content as Inline[] | string)}</blockquote>${renderChildren(b, depth)}`;
    case "divider":
      return `<hr>`;
    case "codeBlock":
      return `<pre><code>${renderInline(b.content as Inline[] | string)}</code></pre>`;
    case "image": {
      const url = safeHref(String(props.url ?? ""));
      if (url === "#") return "";
      const caption = props.caption ? `<figcaption>${esc(props.caption)}</figcaption>` : "";
      return `<figure class="img${imageSize(props)}${imageAlign(props)}"><div class="ph"><img src="${esc(url)}" alt="${esc(props.caption ?? "")}" loading="lazy"></div>${caption}</figure>`;
    }
    case "imageRow": {
      const list = parseJson<{ url?: string; caption?: string }[]>(props.images, []);
      const shown = (Array.isArray(list) ? list : []).map((it) => ({ url: safeHref(String(it?.url ?? "")), caption: String(it?.caption ?? "") })).filter((it) => it.url !== "#").slice(0, 4);
      if (!shown.length) return "";
      if (shown.length === 1) return `<figure class="img wide"><div class="ph"><img src="${esc(shown[0]!.url)}" alt="${esc(shown[0]!.caption)}" loading="lazy"></div>${shown[0]!.caption ? `<figcaption>${esc(shown[0]!.caption)}</figcaption>` : ""}</figure>`;
      return `<div class="imgrow cols-${shown.length}">${shown.map((it) => `<figure class="img"><div class="ph"><img src="${esc(it.url)}" alt="${esc(it.caption)}" loading="lazy"></div>${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`;
    }
    case "video": {
      const url = String(props.url ?? "");
      const embed = videoEmbed(url);
      const caption = props.caption ? `<figcaption>${esc(props.caption)}</figcaption>` : "";
      if (embed) {
        return `<figure class="video"><div class="frame"><iframe src="${esc(embed.src)}" title="${esc(props.caption || "Video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${caption}</figure>`;
      }
      return "";
    }
    case "table": {
      const tc = b.content as TableContent | undefined;
      if (!tc || tc.type !== "tableContent" || !Array.isArray(tc.rows)) return "";
      // Cells are plain inline content in templates and {type:"tableCell", content} once the editor has saved them.
      const cellContent = (c: unknown): Inline[] | string =>
        c && typeof c === "object" && !Array.isArray(c) && (c as { type?: string }).type === "tableCell" ? ((c as { content?: Inline[] | string }).content ?? "") : (c as Inline[] | string);
      const cellsOf = (r: TableContent["rows"][number]) => (r && Array.isArray(r.cells) ? r.cells : []);
      const cellAlign = (c: unknown) => alignClass(c && typeof c === "object" && !Array.isArray(c) ? ((c as { props?: Record<string, unknown> }).props ?? {}) : {});
      const cls = (c: unknown) => { const a = cellAlign(c).trim(); return a ? ` class="${a}"` : ""; };
      const hasHeader = (tc as { headerRows?: number }).headerRows === undefined || Number((tc as { headerRows?: number }).headerRows) > 0;
      const headings = hasHeader ? cellsOf(tc.rows[0]!).map((c) => inlineToText(cellContent(c) as Block["content"])) : [];
      const head = hasHeader ? `<thead><tr>${cellsOf(tc.rows[0]!).map((c) => `<th${cls(c)}>${renderInline(cellContent(c))}</th>`).join("")}</tr></thead>` : "";
      const body = tc.rows
        .slice(hasHeader ? 1 : 0)
        .map((r) => `<tr>${cellsOf(r).map((c, i) => `<td data-th="${esc(headings[i] ?? "")}"${cls(c)}>${renderInline(cellContent(c))}</td>`).join("")}</tr>`)
        .join("");
      return `<div class="tablewrap"><table>${head}<tbody>${body}</tbody></table></div>`;
    }
    case "statement":
      return `<p class="statement${colourClass(b.props, "fg")}${colourClass(b.props, "bg")}">${wordSpans(b.content as Inline[] | string) ?? renderInline(b.content as Inline[] | string)}</p>`;
    case "featureGrid": {
      const items = parseJson<{ title?: string; text?: string }[]>(props.items, []);
      const cols = Number(props.cols) === 2 ? 2 : 3;
      if (!Array.isArray(items) || !items.length) return "";
      return `<div class="grid cols-${cols}">${items
        .slice(0, 6)
        .map((it) => `<div class="card"><h3>${esc(it?.title ?? "")}</h3><p>${esc(it?.text ?? "")}</p></div>`)
        .join("")}</div>`;
    }
    case "testimonial": {
      const quote = String(props.quote ?? "").trim();
      if (!quote) return "";
      const photo = safeHref(String(props.photo ?? ""));
      const avatar =
        photo !== "#" ? `<img class="avatar" src="${esc(photo)}" alt="" loading="lazy">` : `<span class="avatar initials" aria-hidden="true">${esc(String(props.name ?? "").trim().slice(0, 1).toUpperCase() || "“")}</span>`;
      return `<figure class="testimonial"><blockquote>${esc(quote)}</blockquote><figcaption>${avatar}<span><b>${esc(props.name ?? "")}</b>${props.role ? `<br>${esc(props.role)}` : ""}</span></figcaption></figure>`;
    }
    case "pricingTable":
      return PRICING_MARKER;
    case "acceptBlock":
      return ACCEPT_MARKER;
    default:
      return typeof b.content === "string" || Array.isArray(b.content)
        ? `<p>${renderInline(b.content)}</p>${renderChildren(b, depth)}`
        : renderChildren(b, depth);
  }
}

/**
 * Splits a document into sections at level-1 and level-2 headings. A heading's highlight color
 * becomes the band color of its whole section, which is how a plain document turns into a page.
 */
export type Section = { id: string; blockId: string | null; title: string | null; level: number; color: string | null; blocks: Block[] };

export function splitSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { id: "intro", blockId: null, title: null, level: 0, color: null, blocks: [] };
  let n = 0;
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const level = b?.type === "heading" ? Number(b.props?.level) || 2 : 0;
    if (level === 1 || level === 2) {
      if (current.blocks.length || current.title) sections.push(current);
      n++;
      const bg = String(b.props?.backgroundColor ?? "default");
      const blockId = typeof b.id === "string" && /^[\w-]{1,64}$/.test(b.id) ? b.id : null;
      current = {
        id: blockId ?? `s${n}`,
        blockId,
        title: inlineToText(b.content).trim() || null,
        level,
        color: (COLOUR_NAMES as readonly string[]).includes(bg) ? bg : null,
        blocks: [{ ...b, props: { ...(b.props ?? {}), backgroundColor: "default" } }],
      };
      continue;
    }
    current.blocks.push(b);
  }
  if (current.blocks.length || current.title) sections.push(current);
  return sections;
}

/** Plain-text flattening for email previews and search. */
export function blocksToText(blocks: Block[], depth = 0): string {
  const parts: string[] = [];
  if (!Array.isArray(blocks) || depth > MAX_DEPTH) return "";
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "featureGrid") {
      for (const it of parseJson<{ title?: unknown; text?: unknown }[]>(b.props?.items, [])) {
        if (it && typeof it === "object") parts.push([it.title, it.text].filter((x) => typeof x === "string").join(": "));
      }
    } else if (b.type === "testimonial") {
      parts.push([b.props?.quote, b.props?.name, b.props?.role].filter((x) => typeof x === "string" && x).join(" — "));
    }
    if (typeof b.content === "string") parts.push(b.content);
    else if (Array.isArray(b.content)) {
      parts.push(
        b.content
          .map((n) => (n.type === "text" ? n.text : typeof n.content === "string" ? n.content : ""))
          .join(""),
      );
    }
    if (Array.isArray(b.children) && b.children.length) parts.push(blocksToText(b.children, depth + 1));
  }
  return parts.filter(Boolean).join("\n");
}
