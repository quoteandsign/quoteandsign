// Starter templates. Content is BlockNote partial-block JSON; items are pricing lines.
// Amounts are in minor units. Names and prices are examples the sender is expected to change.
// A heading's highlight color becomes the band color of its whole section on the client page.
// The title lives on the cover, so content does not start with an H1.

export type TemplateItem = {
  name: string;
  description?: string;
  unitAmount: number;
  quantity: number;
  optional: boolean;
  selectedByDefault: boolean;
  taxRateBps: number | null;
  minQuantity?: number;
  maxQuantity?: number;
  billing?: "once" | "month" | "quarter" | "year";
  unit?: string;
};

export type Template = {
  id: string;
  name: string;
  summary: string;
  title: string;
  style: string; // default page style (shared/styles.ts)
  content: unknown[];
  items: TemplateItem[];
};

type Band = "gray" | "brown" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";
const h = (level: 1 | 2 | 3, text: string, band?: Band) => ({ type: "heading", props: { level, ...(band ? { backgroundColor: band } : {}) }, content: text });
const p = (text: string) => ({ type: "paragraph", content: text });
const li = (text: string) => ({ type: "bulletListItem", content: text });
const num = (text: string) => ({ type: "numberedListItem", content: text });
const quote = (text: string) => ({ type: "quote", content: text });
const statement = (text: string) => ({ type: "statement", content: text });
const grid = (items: { title: string; text: string }[], cols: 2 | 3 = 3) => ({ type: "featureGrid", props: { cols: String(cols), items: JSON.stringify(items) } });
const testimonial = (q: string, name: string, role: string) => ({ type: "testimonial", props: { quote: q, name, role, photo: "" } });
const table = (rows: string[][]) => ({ type: "table", content: { type: "tableContent", headerRows: 1, rows: rows.map((cells) => ({ cells })) } });
const PRICING = { type: "pricingTable" };
const ACCEPT = { type: "acceptBlock" };

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    style: "minimal",
    name: "Blank",
    summary: "Start from nothing. Pricing table and accept button included.",
    title: "Untitled proposal",
    content: [p(""), PRICING, ACCEPT],
    items: [],
  },
  {
    id: "web-project",
    style: "bold",
    name: "Website project",
    summary: "Fixed-scope build with optional add-ons.",
    title: "Website redesign",
    content: [
      statement("A fast, mobile-first website that turns visitors into enquiries. Live in six weeks."),
      p("You told us the current site is slow, hard to update, and does not bring in the enquiries it should. This proposal sets out exactly what we will build, how long it takes, and what it costs."),
      h(2, "What you get", "blue"),
      grid([
        { title: "Five pages, designed and built", text: "Home, services, about, work, contact. Each one written to your brand and built to load fast on a phone." },
        { title: "Forms that reach you", text: "Contact and quote forms delivered to your inbox, with spam filtering and a copy to the sender." },
        { title: "Launched and measured", text: "Live on your domain with analytics in place so you can see what the site is doing for you." },
      ]),
      h(2, "How it works"),
      table([
        ["Week", "What happens", "You get"],
        ["1", "Kickoff and content plan", "A page-by-page outline to approve"],
        ["2 to 4", "Design and build, review each Friday", "A working site on a private link"],
        ["5 to 6", "Revisions, testing on real phones, launch", "Your site, live, with a short handover call"],
      ]),
      h(2, "Pricing", "gray"),
      p("Choose the options you want below. The total updates as you go."),
      PRICING,
      h(2, "What clients say", "yellow"),
      testimonial("The new site paid for itself in the first month. We get more enquiries and they are better ones.", "Jordan Reyes", "Owner, Reyes Landscaping"),
      h(2, "Terms"),
      p("Half is invoiced at kickoff and half at launch. Two rounds of revisions are included. Work starts once this proposal is accepted."),
      ACCEPT,
    ],
    items: [
      { name: "Design and build", description: "Five pages, responsive, launched on your domain", unitAmount: 450000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
      { name: "Copywriting", description: "All page copy written and edited", unitAmount: 120000, quantity: 1, optional: true, selectedByDefault: true, taxRateBps: null },
      { name: "Extra pages", description: "Beyond the five included", unitAmount: 60000, quantity: 0, minQuantity: 0, maxQuantity: 10, optional: true, selectedByDefault: false, taxRateBps: null, unit: "page" },
      { name: "Care plan", description: "Updates, backups and support", unitAmount: 15000, quantity: 1, optional: true, selectedByDefault: false, taxRateBps: null, billing: "month" },
    ],
  },
  {
    id: "consulting",
    style: "editorial",
    name: "Consulting project",
    summary: "Discovery, recommendations and an optional implementation phase.",
    title: "Operations review",
    content: [
      statement("Four weeks to find where time and money leak, and a plan to stop it."),
      h(2, "The problem as I understand it", "orange"),
      p("Orders are growing faster than the team. Handoffs between sales, fulfilment and support are manual, and nobody has a single view of where an order is."),
      h(2, "Approach"),
      num("Week 1: interviews with six people across the three teams and a walk through the current tools"),
      num("Week 2: map every handoff and measure where time and errors accumulate"),
      num("Week 3: draft recommendations and test them with the people who do the work"),
      num("Week 4: final report, a prioritised plan and a 90-minute session with leadership"),
      h(2, "What you receive", "green"),
      grid([
        { title: "The report", text: "The current-state map and the recommended changes, written for the people who will make them." },
        { title: "A 90-day plan", text: "Prioritised, with owners and the estimated saving for each item." },
        { title: "Everything we made", text: "Interview notes and process maps, yours to keep and reuse." },
      ]),
      h(2, "Investment", "gray"),
      PRICING,
      h(2, "Terms"),
      p("The review fee is invoiced on acceptance. Implementation support, if chosen, is invoiced monthly. Either side can end implementation with two weeks notice."),
      ACCEPT,
    ],
    items: [
      { name: "Operations review", description: "Four weeks, report, plan and leadership session", unitAmount: 850000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
      { name: "Implementation support", description: "Two days a week alongside your team", unitAmount: 600000, quantity: 3, minQuantity: 1, maxQuantity: 6, optional: true, selectedByDefault: false, taxRateBps: null, unit: "month" },
    ],
  },
  {
    id: "retainer",
    style: "classic",
    name: "Monthly retainer",
    summary: "Ongoing work with a choice of hours.",
    title: "Monthly retainer",
    content: [
      statement("A fixed block of hours each month. You always know what you are paying, and the work gets planned properly."),
      h(2, "What is included", "purple"),
      li("A shared task list you can add to at any time"),
      li("A short written update every Friday"),
      li("Unused hours roll over for one month"),
      h(2, "Choose your plan", "gray"),
      PRICING,
      h(2, "Terms"),
      p("Billed at the start of each month. Cancel any time with 30 days notice."),
      ACCEPT,
    ],
    items: [
      { name: "Retainer hours", description: "Choose between 10 and 40 hours a month", unitAmount: 12000, quantity: 20, minQuantity: 10, maxQuantity: 40, optional: false, selectedByDefault: true, taxRateBps: null, unit: "hour", billing: "month" },
      { name: "Priority response", description: "Same-day replies on weekdays", unitAmount: 25000, quantity: 1, optional: true, selectedByDefault: false, taxRateBps: null, billing: "month" },
    ],
  },
  {
    id: "photography",
    style: "warm",
    name: "Photography package",
    summary: "Event or brand shoot with add-ons the client can pick.",
    title: "Brand photography",
    content: [
      statement("A half-day shoot at your place, edited and delivered within ten days."),
      h(2, "What is included", "pink"),
      grid([
        { title: "Four hours on location", text: "With a planning call the week before so the shot list is agreed." },
        { title: "Forty edited photos", text: "Color-corrected and delivered in web and print sizes." },
        { title: "Full usage rights", text: "Use them for your own marketing, forever." },
      ]),
      quote("We plan the shot list together so nothing important is missed on the day."),
      h(2, "Options", "gray"),
      PRICING,
      h(2, "Booking"),
      p("A 30 percent deposit holds the date. The balance is due on delivery. Reschedule free up to seven days before."),
      ACCEPT,
    ],
    items: [
      { name: "Half-day brand shoot", description: "Four hours, forty edited photos", unitAmount: 140000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
      { name: "Extra edited photos", description: "Beyond the forty included", unitAmount: 2500, quantity: 0, minQuantity: 0, maxQuantity: 40, optional: true, selectedByDefault: false, taxRateBps: null, unit: "photo" },
      { name: "Headshots for the team", description: "Twenty minutes each", unitAmount: 9000, quantity: 5, minQuantity: 1, maxQuantity: 30, optional: true, selectedByDefault: false, taxRateBps: null, unit: "person" },
      { name: "Short social video", description: "Sixty-second behind-the-scenes cut", unitAmount: 60000, quantity: 1, optional: true, selectedByDefault: true, taxRateBps: null },
    ],
  },
  {
    id: "software",
    style: "night",
    name: "Software build",
    summary: "Milestone-based build with a clear scope and support plan.",
    title: "Customer portal, phase one",
    content: [
      statement("A secure portal where your customers see their orders, download invoices and open support requests. No more email back-and-forth."),
      h(2, "Scope", "blue"),
      grid([
        { title: "Sign-in by email link", text: "No passwords for your team to manage or your customers to forget." },
        { title: "Orders and invoices", text: "Order history with status, tracking links and invoice downloads." },
        { title: "Support requests", text: "With file attachments and email notifications, plus an admin view for your team." },
      ]),
      h(3, "Out of scope for phase one"),
      p("Online payments, a mobile app, and integrations beyond your current order system. These are natural phase-two items and are priced separately when you are ready."),
      h(2, "Milestones", "green"),
      table([
        ["Milestone", "When", "What is live"],
        ["1", "Week 3", "Sign-in and order history on a test address"],
        ["2", "Week 6", "Support requests and the admin view"],
        ["3", "Week 8", "Launch on your domain, handover and documentation"],
      ]),
      h(2, "Pricing", "gray"),
      PRICING,
      h(2, "Terms"),
      p("Invoiced per milestone on delivery. Code is yours on final payment, with a written handover. Bugs found in the first 30 days after launch are fixed at no charge."),
      ACCEPT,
    ],
    items: [
      { name: "Phase one build", description: "Three milestones over eight weeks", unitAmount: 1800000, quantity: 1, optional: false, selectedByDefault: true, taxRateBps: null },
      { name: "Support plan", description: "After launch: monitoring, updates, four hours of changes a month", unitAmount: 90000, quantity: 6, minQuantity: 3, maxQuantity: 12, optional: true, selectedByDefault: true, taxRateBps: null, unit: "month" },
      { name: "Team training session", description: "Two hours, recorded", unitAmount: 40000, quantity: 1, optional: true, selectedByDefault: false, taxRateBps: null },
    ],
  },
];

export function getTemplate(id: string | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}
