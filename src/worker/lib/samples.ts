import { and, eq } from "drizzle-orm";
import type { Bindings } from "../env";
import { getDb, schema, type Db } from "./db";
import { uuid, sha256Hex, canonicalJson } from "./crypto";
import { sendEmail } from "./email";
import { proposalPdf } from "./pdf";
import { getTemplate } from "../../shared/templates";
import { computeTotals, describeTotals } from "../../shared/pricing";
import { acceptedSenderMail, acceptedSignerMail, proposalOpenedMail, proposalSentMail, questionMail, reminderMail } from "./mailkit";

/**
 * "Send me a test": the admin sees every email a proposal produces, as the client and as the
 * sender, built from a real sample proposal in their own account so the links work.
 */
export const SAMPLE_KINDS = ["sent", "opened", "question", "accepted-sender", "accepted-client", "reminder"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];
const SAMPLE_TITLE = "Sample: website for Harbor Coffee";

type User = typeof schema.users.$inferSelect;

/** The admin's sample proposal, created once from the website template and addressed to the admin. */
export async function ensureSampleProposal(db: Db, admin: User): Promise<{ proposal: typeof schema.proposals.$inferSelect; items: (typeof schema.pricingItems.$inferSelect)[] }> {
  let proposal = await db.select().from(schema.proposals).where(and(eq(schema.proposals.userId, admin.id), eq(schema.proposals.title, SAMPLE_TITLE))).get();
  if (!proposal) {
    const t = getTemplate("web-project");
    const now = new Date();
    const id = uuid();
    await db.insert(schema.proposals).values({
      id, publicId: uuid(), userId: admin.id, title: SAMPLE_TITLE, clientName: "Harbor Coffee", clientEmail: admin.email, currency: "USD",
      content: t.content.map((b) => ({ ...(b as Record<string, unknown>), id: uuid() })), style: t.style, status: "sent", sentAt: now, createdAt: now, updatedAt: now,
    });
    if (t.items.length) {
      await db.insert(schema.pricingItems).values(t.items.map((it, i) => ({
        id: uuid(), proposalId: id, position: i, name: it.name, description: it.description ?? null, unitAmount: it.unitAmount, quantity: it.quantity,
        minQuantity: it.minQuantity ?? null, maxQuantity: it.maxQuantity ?? null, optional: it.optional, selectedByDefault: it.selectedByDefault, taxRateBps: it.taxRateBps ?? null, billing: it.billing ?? "once", unit: it.unit ?? null,
      })));
    }
    proposal = (await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).get())!;
  }
  const items = await db.select().from(schema.pricingItems).where(eq(schema.pricingItems.proposalId, proposal.id)).orderBy(schema.pricingItems.position).all();
  return { proposal, items };
}

export async function sendSampleEmail(env: Bindings, admin: User, kind: SampleKind): Promise<{ proposalId: string }> {
  const db = getDb(env.DB);
  const { proposal, items } = await ensureSampleProposal(db, admin);
  const appUrl = env.APP_URL;
  const link = `${appUrl}/p/${proposal.publicId}`;
  const to = admin.email;
  const tag = <M extends { subject: string }>(m: M): M => ({ ...m, subject: `[Test] ${m.subject}` });
  const sender = { email: admin.email, brandName: admin.brandName, name: admin.name, brandColor: admin.brandColor };
  const now = new Date();

  if (kind === "sent") {
    await sendEmail(env, tag(proposalSentMail({ to: [to], sender, proposal, link, message: "Hi, here is the proposal we talked about. Switch the options on or off and the total updates; accept at the bottom when you are happy." })));
  } else if (kind === "opened") {
    await sendEmail(env, tag(proposalOpenedMail({ to, proposal, appUrl })));
  } else if (kind === "question") {
    await sendEmail(env, tag(questionMail({ to: [to], proposal, name: "Sam at Harbor Coffee", email: to, body: "Could the copywriting line cover the About page as well, or is that extra?", appUrl })));
  } else if (kind === "reminder") {
    await sendEmail(env, tag(reminderMail({ to: [to], sender, proposal, expiresAt: new Date(now.getTime() + 3 * 86_400_000), appUrl })));
  } else {
    // A signed copy needs an acceptance. This one is built in memory and never stored.
    const totals = computeTotals(items, {}, proposal.taxRateBps);
    const contentHash = await sha256Hex(canonicalJson({ sample: proposal.id, at: now.getTime() }));
    const acceptance: typeof schema.acceptances.$inferSelect = {
      id: uuid(), proposalId: proposal.id, signerName: "Sam Okafor", signerEmail: to, signedText: "Sam Okafor",
      selectedItemIds: items.filter((i) => !i.optional || i.selectedByDefault).map((i) => i.id), totalAmount: totals.total, currency: proposal.currency,
      contentHash, snapshot: null, recurring: totals.recurring, countersignedAt: null, countersignerName: null, method: "online",
      ip: "203.0.113.7", userAgent: "Sample", acceptedAt: now, consentText: "I agree to this proposal and its terms. My typed name is my signature.",
      senderName: admin.brandName ?? admin.name ?? null, senderEmail: admin.email, clientName: proposal.clientName,
    };
    let attachments: { filename: string; content: Uint8Array }[] = [];
    try {
      const bytes = await proposalPdf({ proposal: { ...proposal, status: "accepted" }, owner: admin, items, acceptance, appUrl });
      attachments = [{ filename: "sample-signed.pdf", content: bytes }];
    } catch (e) {
      console.error("sample pdf", e);
    }
    const total = describeTotals(totals, proposal.currency);
    if (kind === "accepted-sender") {
      await sendEmail(env, tag(acceptedSenderMail({ to: [to], proposal, signerName: acceptance.signerName, total, when: now, link, contentHash, attachments })));
    } else {
      await sendEmail(env, tag(acceptedSignerMail({ to, sender, proposal, total, when: now, link, contentHash, payUrl: "https://example.com/pay", invite: `${appUrl}/?ref=email`, attachments })));
    }
  }
  return { proposalId: proposal.id };
}
