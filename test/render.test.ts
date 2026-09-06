import { describe, it, expect } from "vitest";
import { renderBlocks, splitSections, videoEmbed, blocksToText, type Block } from "../src/worker/lib/render";

const h = (level: number, text: string, backgroundColor?: string): Block => ({ type: "heading", props: { level, backgroundColor }, content: [{ type: "text", text }] } as Block);
const p = (text: string): Block => ({ type: "paragraph", content: [{ type: "text", text }] } as Block);

describe("sections", () => {
  it("splits at H1/H2 and carries the heading highlight to the section", () => {
    const s = splitSections([p("intro"), h(2, "Scope", "blue"), p("a"), h(3, "Sub"), h(2, "Terms"), p("b")]);
    expect(s.map((x) => [x.title, x.color, x.blocks.length])).toEqual([
      [null, null, 1],
      ["Scope", "blue", 3],
      ["Terms", null, 2],
    ]);
    expect(new Set(s.map((x) => x.id)).size).toBe(3);
    // The heading itself no longer carries the highlight; the band does.
    expect(renderBlocks(s[1]!.blocks)).not.toContain("bg-blue");
  });

  it("ignores unknown color names", () => {
    const s = splitSections([h(2, "X", "javascript:alert(1)")]);
    expect(s[0]!.color).toBeNull();
  });
});

describe("new blocks", () => {
  it("renders statement, feature grid and testimonial with escaping", () => {
    const html = renderBlocks([
      { type: "statement", content: [{ type: "text", text: "Big <b>idea</b>" }] } as Block,
      { type: "featureGrid", props: { cols: "2", items: JSON.stringify([{ title: "T<1>", text: "x" }, { title: "T2", text: "y" }]) } } as Block,
      { type: "testimonial", props: { quote: "Great", name: "Sam \"S\"", role: "CEO", photo: "" } } as Block,
    ]);
    expect(html).toContain('<p class="statement">Big &lt;b&gt;idea&lt;/b&gt;</p>');
    expect(html).toContain('class="grid cols-2"');
    expect(html).toContain("T&lt;1&gt;");
    expect(html).toContain("Sam &quot;S&quot;");
    expect(html).not.toContain("<b>idea");
  });

  it("tolerates broken grid JSON", () => {
    const html = renderBlocks([{ type: "featureGrid", props: { cols: "9", items: "{not json" } } as Block]);
    expect(html).toBe("");
    expect(renderBlocks([{ type: "featureGrid", props: { cols: "9", items: JSON.stringify([{ title: "A" }]) } } as Block])).toContain("cols-3");
  });

  it("embeds only allowlisted video hosts", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=abc123XYZ_-")?.src).toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
    expect(videoEmbed("https://youtu.be/abc123XYZ_-")?.src).toContain("youtube-nocookie");
    expect(videoEmbed("https://vimeo.com/123456")?.src).toBe("https://player.vimeo.com/video/123456");
    expect(videoEmbed("https://www.loom.com/share/0123456789abcdef0123456789abcdef")?.src).toContain("loom.com/embed/");
    expect(videoEmbed("https://evil.example/embed")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
  });

  it("includes new blocks in the text used for hashing", () => {
    const t = blocksToText([
      { type: "statement", content: [{ type: "text", text: "S" }] } as Block,
      { type: "featureGrid", props: { cols: "3", items: JSON.stringify([{ title: "A", text: "B" }]) } } as Block,
      { type: "testimonial", props: { quote: "Q", name: "N", role: "R", photo: "" } } as Block,
    ]);
    for (const w of ["S", "A", "B", "Q", "N"]) expect(t).toContain(w);
  });
});

describe("uploaded images and highlighted statements", () => {
  it("shows an image stored under /files and drops anything else that is not a web address", () => {
    const ok = renderBlocks([{ type: "image", props: { url: "/files/images/0f9131f6-deb7-4c00-b2a2-7a37431a3672/1a6ff8b6-9ce9-4e93-966c-edae7a07ea92.webp" }, content: [] } as unknown as Block]);
    expect(ok).toContain('<img src="/files/images/0f9131f6-deb7-4c00-b2a2-7a37431a3672/1a6ff8b6-9ce9-4e93-966c-edae7a07ea92.webp"');
    expect(renderBlocks([{ type: "image", props: { url: "/files/../etc/passwd" }, content: [] } as unknown as Block])).toBe("");
    expect(renderBlocks([{ type: "image", props: { url: "javascript:alert(1)" }, content: [] } as unknown as Block])).toBe("");
  });
  it("a big statement carries its highlight to the client page", () => {
    const html = renderBlocks([{ type: "statement", props: { backgroundColor: "yellow" }, content: [{ type: "text", text: "Hello" }] } as unknown as Block]);
    expect(html).toContain('class="statement bg-yellow"');
  });
});

describe("image size, alignment and rows", () => {
  const img = (props: Record<string, unknown>) => renderBlocks([{ type: "image", props: { url: "https://example.com/a.png", ...props }, content: [] } as unknown as Block]);
  it("keeps the width chosen in the editor as a fraction of the column, and the alignment", () => {
    expect(img({})).toContain('class="img wide"');
    expect(img({ previewWidth: 740 })).toContain('class="img wide"');
    expect(img({ previewWidth: 370 })).toContain('class="img w-50"');
    expect(img({ previewWidth: 180 })).toContain('class="img w-25"');
    expect(img({ previewWidth: 370, textAlignment: "center" })).toContain('class="img w-50 al-center"');
  });
  it("lays out an image row and drops slots without a safe address", () => {
    const html = renderBlocks([{ type: "imageRow", props: { images: JSON.stringify([{ url: "https://example.com/a.png", caption: "A" }, { url: "javascript:alert(1)" }, { url: "/files/images/0f9131f6-deb7-4c00-b2a2-7a37431a3672/1a6ff8b6-9ce9-4e93-966c-edae7a07ea92.webp", caption: "" }]) }, content: [] } as unknown as Block]);
    expect(html).toContain('class="imgrow cols-2"');
    expect(html).toContain("<figcaption>A</figcaption>");
    expect(html).not.toContain("javascript:");
  });
});

describe("what the toolbar can do, the page shows", () => {
  it("alignment, inline highlight, numbered list start and table header flag", () => {
    const html = renderBlocks([
      { type: "paragraph", props: { textAlignment: "center" }, content: [{ type: "text", text: "Hi", styles: { backgroundColor: "yellow" } }] } as unknown as Block,
      { type: "numberedListItem", props: { start: 4 }, content: [{ type: "text", text: "four", styles: {} }] } as unknown as Block,
      { type: "table", content: { type: "tableContent", headerRows: 0, rows: [{ cells: [{ type: "tableCell", content: [{ type: "text", text: "a", styles: {} }], props: { textAlignment: "right" } }] }] } } as unknown as Block,
    ]);
    expect(html).toContain('<p class="ta-center">');
    expect(html).toContain('<span class="bg-yellow">Hi</span>');
    expect(html).toContain('<ol start="4">');
    expect(html).not.toContain("<thead>");
    expect(html).toContain('<td data-th="" class="ta-right">');
  });
  it("a bare video file address is not embedded", () => {
    expect(renderBlocks([{ type: "video", props: { url: "https://example.com/clip.mp4" }, content: [] } as unknown as Block])).toBe("");
  });
});
