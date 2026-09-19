import type { Mail } from "./email";
import { businessName } from "../../shared/names";

/**
 * The emails a proposal produces, built in one place so the real flows and the admin's
 * "send me a test" button always produce the same message.
 */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

type Sender = { email: string; brandName: string | null; name: string | null; brandColor: string | null };
type Prop = { id: string; publicId: string; title: string; clientName: string | null; senderName: string | null; accentColor: string | null; paymentLabel: string | null };
type Attachment = { filename: string; content: Uint8Array };

/** To the client: the proposal itself, with the sender's note. */
export function proposalSentMail(o: { to: string[]; sender: Sender; proposal: Prop; link: string; message: string }): Mail {
  const from = oneLine(o.proposal.senderName || businessName(o.sender.brandName, o.sender.name, o.sender.email));
  const title = oneLine(o.proposal.title);
  return {
    to: o.to,
    replyTo: o.sender.email,
    subject: `Proposal: ${title}`,
    brand: from,
    accent: o.proposal.accentColor ?? o.sender.brandColor,
    heading: title,
    buttons: [{ label: "Open the proposal", url: o.link }],
    text: `${from} sent you a proposal: ${title}.
${o.message ? `\n${o.message}\n` : ""}
Open it here:
${o.link}

You can review the pricing, choose options and accept online. Reply to this email if you have a question.`,
  };
}

/** To the sender: the first open. */
export function proposalOpenedMail(o: { to: string; proposal: Prop; appUrl: string }): Mail {
  return {
    to: o.to,
    subject: `${oneLine(o.proposal.clientName || "Your client")} opened "${oneLine(o.proposal.title)}"`,
    heading: `${o.proposal.clientName || "Your client"} just opened it`,
    buttons: [{ label: "See how it is going", url: `${o.appUrl}/app/p/${o.proposal.id}` }],
    text: `Your proposal "${o.proposal.title}" was just opened for the first time.\n\n${o.appUrl}/app/p/${o.proposal.id}`,
  };
}

/** To the sender: a question typed on the page. */
export function questionMail(o: { to: string[]; proposal: Prop; name: string; email: string | null; body: string; appUrl: string }): Mail {
  return {
    to: o.to,
    replyTo: o.email || undefined,
    subject: `Question about "${oneLine(o.proposal.title)}" from ${oneLine(o.name)}`,
    quote: o.body,
    text: `${oneLine(o.name)}${o.email ? ` (${o.email})` : ""} asked a question on your proposal "${oneLine(o.proposal.title)}":

${o.body}

${o.email ? "Reply to this email to answer them directly." : "They did not leave an email address."}

Open the proposal:
${o.appUrl}/app/p/${o.proposal.id}`,
  };
}

/** To the sender: it was signed. */
export function acceptedSenderMail(o: { to: string[]; proposal: Prop; signerName: string; total: string; when: Date; link: string; contentHash: string; attachments: Attachment[] }): Mail {
  return {
    to: o.to,
    subject: `Accepted: ${oneLine(o.proposal.title)} (${o.total})`,
    heading: `${o.signerName} signed ${o.proposal.title}`,
    buttons: [{ label: "Open the signed copy", url: o.link }, { label: "Signing record", url: `${o.link}/record` }],
    text: `${o.signerName} accepted "${o.proposal.title}" for ${o.total} on ${o.when.toUTCString()}.${o.attachments.length ? "\n\nThe signed PDF is attached." : ""}\n\nSigned copy: ${o.link}\nSigning record: ${o.link}/record\nContent hash: ${o.contentHash}`,
    attachments: o.attachments,
  };
}

/** To the client: their signed copy. */
export function acceptedSignerMail(o: { to: string; sender: Sender; proposal: Prop; total: string; when: Date; link: string; contentHash: string; payUrl: string | null; invite?: string; attachments: Attachment[] }): Mail {
  const label = o.proposal.paymentLabel || "Pay the deposit";
  return {
    to: o.to,
    subject: `Your accepted copy: ${oneLine(o.proposal.title)}`,
    brand: o.proposal.senderName || businessName(o.sender.brandName, o.sender.name) || null,
    accent: o.proposal.accentColor ?? o.sender.brandColor,
    heading: "Thank you, it is signed",
    invite: o.invite,
    buttons: [...(o.payUrl ? [{ label, url: o.payUrl }] : []), { label: "Open your signed copy", url: o.link }],
    text: `Thank you. You accepted "${o.proposal.title}" for ${o.total} on ${o.when.toUTCString()}.${o.attachments.length ? "\n\nYour signed copy is attached as a PDF." : ""}\n\n${o.payUrl ? `${label}: ${o.payUrl}\n\n` : ""}Open it any time: ${o.link}\nSigning record: ${o.link}/record\nContent hash: ${o.contentHash}`,
    attachments: o.attachments,
  };
}

/** To the client: the expiry reminder. */
export function reminderMail(o: { to: string[]; sender: Sender; proposal: Prop; expiresAt: Date; appUrl: string }): Mail {
  const from = oneLine(o.proposal.senderName || businessName(o.sender.brandName, o.sender.name, o.sender.email));
  const title = oneLine(o.proposal.title);
  const when = o.expiresAt.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  return {
    to: o.to,
    replyTo: o.sender.email,
    subject: `Reminder: "${title}" is valid until ${when}`,
    text: `A quick reminder from ${from}.\n\nThe proposal "${title}" can be accepted until ${when}. After that the pricing is no longer held.\n\nOpen it here:\n${o.appUrl}/p/${o.proposal.publicId}\n\nReply to this email if you have a question.`,
  };
}
