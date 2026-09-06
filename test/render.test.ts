import { describe, it, expect } from "vitest";
import { renderBlocks, splitSections, videoEmbed, blocksToText, type Block } from "../src/worker/lib/render";

const h = (level: number, text: string, backgroundColor?: string): Block => ({ type: "heading", props: { level, backgroundColor }, content: [{ type: "text", text }] } as Block);
const p = (text: string): Block => ({ type: "paragraph", content: [{ type: "text", text }] } as Block);

describe("sections", () => {
  it("splits at H1/H2 and carries the heading highlight to the section", () => {
    const s = splitSections([p("intro"), h(2, "Scope", "blue"), p("a"), h(3, "Sub"), h(2, "Terms"), p("b")]);
    expect(s.map((x) => [x.title, x.colour, x.blocks.length])).toEqual([
      [null, null, 1],
      ["Scope", "blue", 3],
      ["Terms", null, 2],
    ]);
    expect(new Set(s.map((x) => x.id)).size).toBe(3);
    // The heading itself no longer carries the highlight; the band does.
    expect(renderBlocks(s[1]!.blocks)).not.toContain("bg-blue");
  });

  it("ignores unknown colour names", () => {
    const s = splitSections([h(2, "X", "javascript:alert(1)")]);
    expect(s[0]!.colour).toBeNull();
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
