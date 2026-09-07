// A PDF of a proposal, built with pdf-lib. The page is the product; this is the paper copy.
// It is deliberately plain and dependable: standard fonts, A4, real page numbers, and the
// acceptance record on the last page when there is one.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Proposal, User, PricingItem, Acceptance } from "./db";
import { splitSections, inlineToText, type Block } from "./render";
import { computeTotals, formatMoney, lineSummary, priceLabel, periodRow } from "../../shared/pricing";
import { businessName } from "../../shared/names";

const A4 = { w: 595.28, h: 841.89 };
const M = 56;
const CONTENT_W = A4.w - M * 2;

function hexToRgb(hex: string | null | undefined) {
  const h = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "2b3f8c";
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

// pdf-lib's standard fonts only know WinAnsi; anything outside is replaced so drawing never throws.
function safe(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[–—]/g, "-").replace(/ /g, " ").replace(/[^\x20-\x7E\xA0-\xFF\u2022\u20AC]/g, "?");
}

class Writer {
  doc!: PDFDocument;
  page!: PDFPage;
  y = 0;
  font!: PDFFont;
  bold!: PDFFont;
  pages = 0;
  constructor(private accent: ReturnType<typeof rgb>, private footer: string) {}

  async init() {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages++;
    this.y = A4.h - M;
    this.page.drawText(safe(this.footer), { x: M, y: 28, size: 8, font: this.font, color: rgb(0.45, 0.43, 0.4) });
    const pn = `Page ${this.pages}`;
    this.page.drawText(pn, { x: A4.w - M - this.font.widthOfTextAtSize(pn, 8), y: 28, size: 8, font: this.font, color: rgb(0.45, 0.43, 0.4) });
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    // A line break in the text is a line break on paper; only spaces are wrapping points.
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      const words = safe(para).split(/\s+/).filter(Boolean);
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      lines.push(line);
    }
    while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines.length ? lines : [""];
  }
  text(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; indent?: number; width?: number; lineHeight?: number } = {}) {
    const size = o.size ?? 10.5;
    const font = o.bold ? this.bold : this.font;
    const lh = size * (o.lineHeight ?? 1.45);
    const lines = this.wrap(text, font, size, (o.width ?? CONTENT_W) - (o.indent ?? 0));
    for (const l of lines) {
      this.ensure(lh);
      this.page.drawText(l, { x: M + (o.indent ?? 0), y: this.y - size, size, font, color: o.color ?? rgb(0.1, 0.09, 0.09) });
      this.y -= lh;
    }
    this.y -= o.gap ?? 6;
  }
  space(h: number) {
    this.y -= h;
  }
  rule(color = rgb(0.9, 0.89, 0.85)) {
    this.ensure(10);
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.8, color });
    this.y -= 10;
  }
  accentRule() {
    this.ensure(14);
    this.page.drawRectangle({ x: M, y: this.y - 3, width: 28, height: 3, color: this.accent });
    this.y -= 14;
  }
  row(cells: string[], widths: number[], o: { bold?: boolean; size?: number; muted?: boolean; align?: ("l" | "r")[] } = {}) {
    const size = o.size ?? 9.5;
    const font = o.bold ? this.bold : this.font;
    const wrapped = cells.map((c, i) => this.wrap(c, font, size, widths[i]! - 8));
    const lines = Math.max(...wrapped.map((w) => w.length));
    const h = lines * size * 1.4 + 8;
    this.ensure(h);
    let x = M;
    wrapped.forEach((ls, i) => {
      ls.forEach((l, k) => {
        const tw = font.widthOfTextAtSize(l, size);
        const ax = o.align?.[i] === "r" ? x + widths[i]! - 4 - tw : x + 4;
        this.page.drawText(l, { x: ax, y: this.y - 4 - size - k * size * 1.4, size, font, color: o.muted ? rgb(0.45, 0.43, 0.4) : rgb(0.1, 0.09, 0.09) });
      });
      x += widths[i]!;
    });
    this.y -= h;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.5, color: rgb(0.9, 0.89, 0.85) });
  }
}

export type PdfInput = {
  proposal: Proposal;
  owner: User;
  items: PricingItem[];
  acceptance: Acceptance | null;
  appUrl: string;
  /** False for the copy anyone with the link can download: the signer's address is the sender's to see. */
  showSignerEmail?: boolean;
};

export async function proposalPdf(inp: PdfInput): Promise<Uint8Array> {
  const { proposal, owner, items, acceptance } = inp;
  const brand = proposal.senderName || businessName(owner.brandName, owner.name);
  const accent = hexToRgb(proposal.accentColor ?? owner.brandColor);
  const w = new Writer(accent, brand ? `${brand}  ·  ${proposal.title}` : proposal.title);
  await w.init();

  // Cover band.
  const titleLines = w.wrap(proposal.title, w.bold, 26, CONTENT_W).slice(0, 3);
  const bandH = 190 + Math.max(0, titleLines.length - 2) * 32 + (proposal.clientName ? 0 : -10);
  w.page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: accent });
  let cy = A4.h - 58;
  if (proposal.clientName) {
    w.page.drawText(safe(`Prepared for ${proposal.clientName}`), { x: M, y: cy, size: 10, font: w.font, color: rgb(1, 1, 1), opacity: 0.85 });
    cy -= 26;
  }
  for (const l of titleLines) {
    w.page.drawText(l, { x: M, y: cy - 20, size: 26, font: w.bold, color: rgb(1, 1, 1) });
    cy -= 32;
  }
  const meta = brand ? [`By ${brand}`] : [];
  if (proposal.sentAt) meta.push(proposal.sentAt.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }));
  if (proposal.expiresAt && !acceptance) meta.push(`Valid until ${proposal.expiresAt.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}`);
  if (meta.length) w.page.drawText(safe(meta.join("    ")), { x: M, y: Math.max(A4.h - bandH + 22, cy - 18), size: 10, font: w.font, color: rgb(1, 1, 1), opacity: 0.9 });
  w.y = A4.h - bandH - 34;

  // Body: the same sections the page shows, minus the leading title.
  const blocks = ((proposal.content as Block[]) ?? []).filter((b, i) => !(i === 0 && b.type === "heading" && Number(b.props?.level) === 1 && inlineToText(b.content).trim() === proposal.title.trim()));
  let pricingDrawn = false;
  const drawPricing = () => {
    if (pricingDrawn || !items.length) return;
    pricingDrawn = true;
    const selection: Record<string, { selected: boolean; quantity?: number }> = {};
    if (acceptance) {
      for (const it of items) selection[it.id] = { selected: false };
      for (const s of acceptance.selectedItemIds as { id: string; quantity: number }[]) selection[s.id] = { selected: true, quantity: s.quantity };
    }
    const totals = computeTotals(items, selection, proposal.taxRateBps);
    w.space(4);
    const widths = [CONTENT_W - 200, 100, 100];
    w.row(["Item", "Price", "Amount"], widths, { bold: true, muted: true, size: 8.5, align: ["l", "r", "r"] });
    for (const l of totals.lines) {
      const it = items.find((i) => i.id === l.id)!;
      const name = it.name + (it.optional ? (l.selected ? "  (optional, included)" : "  (optional, not included)") : "") + (it.description ? `\n${it.description}` : "");
      const price = lineSummary(l, proposal.currency).replace(" × ", " x ") || priceLabel(it.unitAmount, proposal.currency, it.unit, it.billing);
      w.row([name, price, l.selected ? (l.quantity === 0 ? "-" : formatMoney(l.lineSubtotal, proposal.currency)) : "-"], widths, { align: ["l", "r", "r"], muted: !l.selected });
    }
    if (totals.hasOnce && totals.hasTax) {
      w.row(["", "Subtotal", formatMoney(totals.subtotal, proposal.currency)], widths, { align: ["l", "r", "r"], muted: true });
      w.row(["", proposal.taxLabel || "Tax", formatMoney(totals.tax, proposal.currency)], widths, { align: ["l", "r", "r"], muted: true });
    }
    if (totals.hasOnce) w.row(["", totals.recurring.length ? "One-time total" : "Total", formatMoney(totals.total, proposal.currency)], widths, { bold: true, size: 11, align: ["l", "r", "r"] });
    for (const r of totals.recurring) w.row(["", periodRow(r.period) + (totals.hasTax ? " (incl. tax)" : ""), formatMoney(r.total, proposal.currency)], widths, { bold: true, size: 11, align: ["l", "r", "r"] });
    w.space(14);
  };

  // Blocks nest (indented lists, notes under a heading); the PDF walks the tree with an indent.
  let numbered = 0;
  const draw = (b: Block, depth: number) => {
      const props = b.props ?? {};
      const indent = depth * 14;
      if (b.type !== "numberedListItem") numbered = 0;
      switch (b.type) {
        case "heading": {
          const level = Number(props.level) || 2;
          w.space(level === 3 ? 6 : 12);
          if (level <= 2) w.accentRule();
          w.text(inlineToText(b.content), { size: level === 1 ? 20 : level === 2 ? 16 : 12.5, bold: true, gap: level === 3 ? 4 : 8, lineHeight: 1.25 });
          break;
        }
        case "statement":
          w.text(inlineToText(b.content), { size: 15, bold: true, gap: 10, lineHeight: 1.3 });
          break;
        case "paragraph": {
          const t = inlineToText(b.content).trim();
          if (t) w.text(t, { indent });
          else w.space(4);
          break;
        }
        case "quote":
          w.text(`"${inlineToText(b.content)}"`, { indent: 12, color: rgb(0.35, 0.33, 0.3), gap: 8 });
          break;
        case "bulletListItem":
          w.text(`•  ${inlineToText(b.content)}`, { indent: 8 + indent, gap: 2 });
          break;
        case "checkListItem":
          w.text(`${props.checked ? "[x]" : "[ ]"}  ${inlineToText(b.content)}`, { indent: 8 + indent, gap: 2 });
          break;
        case "numberedListItem":
          numbered = numbered ? numbered + 1 : Math.max(1, Number(props.start) || 1);
          w.text(`${numbered}.  ${inlineToText(b.content)}`, { indent: 8 + indent, gap: 2 });
          break;
        case "codeBlock":
          w.text(inlineToText(b.content), { size: 9, indent: 8 + indent, color: rgb(0.25, 0.24, 0.22), gap: 6 });
          break;
        case "divider":
          w.rule();
          break;
        case "featureGrid": {
          let list: { title?: string; text?: string }[] = [];
          try { list = JSON.parse(String(props.items ?? "[]")); } catch { list = []; }
          for (const it of Array.isArray(list) ? list : []) {
            if (it?.title) w.text(String(it.title), { bold: true, gap: 1 });
            if (it?.text) w.text(String(it.text), { color: rgb(0.35, 0.33, 0.3), gap: 8 });
          }
          break;
        }
        case "testimonial": {
          if (props.quote) w.text(`"${String(props.quote)}"`, { indent: 12, size: 11.5, gap: 2 });
          const who = [props.name, props.role].filter(Boolean).join(", ");
          if (who) w.text(String(who), { indent: 12, size: 9.5, color: rgb(0.35, 0.33, 0.3), gap: 10 });
          break;
        }
        case "table": {
          const tc = b.content as { type: string; rows?: { cells: unknown[] }[] } | undefined;
          const rows = tc && Array.isArray(tc.rows) ? tc.rows : [];
          if (!rows.length) break;
          const cols = Math.max(...rows.map((r) => (Array.isArray(r.cells) ? r.cells.length : 0)));
          const widths = Array.from({ length: cols }, () => CONTENT_W / cols);
          rows.forEach((r, i) => {
            const cells = (Array.isArray(r.cells) ? r.cells : []).map((c: any) => inlineToText(c && typeof c === "object" && !Array.isArray(c) && c.type === "tableCell" ? c.content : c));
            while (cells.length < cols) cells.push("");
            w.row(cells, widths, { bold: i === 0, muted: i === 0, size: 9 });
          });
          w.space(10);
          break;
        }
        case "pricingTable":
          drawPricing();
          break;
        case "image":
        case "video":
          if (props.url) w.text(`[${b.type === "image" ? "Image" : "Video"}: ${String(props.url)}]`, { size: 9, color: rgb(0.45, 0.43, 0.4) });
          break;
        case "imageRow": {
          let list: { url?: string }[] = [];
          try { list = JSON.parse(String(props.images ?? "[]")); } catch { list = []; }
          for (const it of Array.isArray(list) ? list : []) if (it?.url) w.text(`[Image: ${String(it.url)}]`, { size: 9, color: rgb(0.45, 0.43, 0.4) });
          break;
        }
        default:
          break;
      }
      for (const child of Array.isArray(b.children) ? b.children : []) draw(child, depth + 1);
  };
  for (const sec of splitSections(blocks)) for (const b of sec.blocks) draw(b, 0);
  drawPricing();

  // The acceptance record, or the note that it is not accepted yet. Kept on one page.
  w.space(10);
  w.ensure(acceptance ? 150 : 60);
  w.rule();
  if (acceptance) {
    w.text("Accepted", { size: 14, bold: true, gap: 4 });
    w.text(`Accepted by ${acceptance.signerName}${inp.showSignerEmail !== false && acceptance.signerEmail ? ` (${acceptance.signerEmail})` : ""} on ${acceptance.acceptedAt.toUTCString()} for ${formatMoney(acceptance.totalAmount, acceptance.currency)}.`);
    w.text(`Typed signature: ${acceptance.signedText}`, { size: 9.5, color: rgb(0.35, 0.33, 0.3), gap: 2 });
    if (acceptance.countersignerName && acceptance.countersignedAt) w.text(`Countersigned by ${acceptance.countersignerName}${brand ? ` for ${brand}` : ""} on ${acceptance.countersignedAt.toUTCString()}.`, { gap: 2 });
    w.text(`Consent: ${acceptance.consentText}`, { size: 9, color: rgb(0.35, 0.33, 0.3), gap: 2 });
    w.text(`Content hash (SHA-256): ${acceptance.contentHash}`, { size: 8.5, color: rgb(0.35, 0.33, 0.3), gap: 2 });
    w.text(`Signing record: ${inp.appUrl}/p/${proposal.publicId}/record`, { size: 8.5, color: rgb(0.35, 0.33, 0.3) });
  } else {
    w.text("Not yet accepted. The live version, with the accept button, is at:", { size: 9.5, color: rgb(0.35, 0.33, 0.3), gap: 2 });
    w.text(`${inp.appUrl}/p/${proposal.publicId}`, { size: 9.5, color: accent });
  }

  w.doc.setTitle(proposal.title);
  w.doc.setAuthor(brand || "Quote and Sign");
  w.doc.setProducer("Quote and Sign");
  w.doc.setCreationDate(new Date());
  return w.doc.save();
}
