// Page styles. A style changes how a proposal reads: cover treatment, display type, corners,
// section bands, navigation. The accent colour is chosen separately and works with every style.
export type Style = { id: string; name: string; blurb: string; paperCover: boolean; dark: boolean };

export const STYLES: Style[] = [
  { id: "classic", name: "Classic", blurb: "Gradient cover, soft corners, colour bands.", paperCover: false, dark: false },
  { id: "editorial", name: "Editorial", blurb: "Serif headlines, paper cover, a rule of colour.", paperCover: true, dark: false },
  { id: "bold", name: "Bold", blurb: "Huge type on a solid colour block. Loud on purpose.", paperCover: false, dark: false },
  { id: "minimal", name: "Minimal", blurb: "White space, thin type, almost no decoration.", paperCover: true, dark: false },
  { id: "night", name: "Night", blurb: "Dark page, glowing accent. For studios and software.", paperCover: false, dark: true },
  { id: "warm", name: "Warm", blurb: "Cream paper, rounded shapes, friendly.", paperCover: true, dark: false },
];

export const STYLE_IDS = STYLES.map((s) => s.id) as [string, ...string[]];
export const styleOf = (id: string | null | undefined): Style => STYLES.find((s) => s.id === id) ?? STYLES[0]!;
