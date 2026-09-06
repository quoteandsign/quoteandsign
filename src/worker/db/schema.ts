import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

// ---- Accounts (passwordless) -------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // uuid v4
    email: text("email").notNull(),
    name: text("name"),
    brandName: text("brand_name"),
    brandLogoKey: text("brand_logo_key"), // R2 object key
    brandColor: text("brand_color"), // hex
    defaultStyle: text("default_style"), // page style for new proposals; null = the template's own
    notifyEmails: text("notify_emails", { mode: "json" }).$type<string[]>(), // team addresses told when a client signs or asks
    paymentUrl: text("payment_url"), // default "pay the deposit" link shown once a client signs
    hideMadeWith: integer("hide_made_with", { mode: "boolean" }).notNull().default(false), // paid plans may hide the footer
    billingInterval: text("billing_interval"), // month | year, from the Polar product that was bought
    trialWarned: integer("trial_warned").notNull().default(0),
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" }).notNull().default(false), // express consent to product emails (CASL/GDPR)
    marketingOptInAt: integer("marketing_opt_in_at", { mode: "timestamp_ms" }),
    marketingOptInIpHash: text("marketing_opt_in_ip_hash"), // proof of consent, never the raw IP // 0 none, 1 three-day notice, 2 last-day notice, 3 ended notice
    plan: text("plan").notNull().default("free"), // free | pro | business
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }), // Pro features until this date on a free account
    polarCustomerId: text("polar_customer_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

// One-time magic-link tokens. Stored hashed; the raw token only ever lives in the email.
export const magicTokens = sqliteTable(
  "magic_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    marketing: integer("marketing", { mode: "boolean" }).notNull().default(false), // the box ticked on the sign-in form
    ipHash: text("ip_hash"),
  },
  (t) => [index("magic_tokens_email_idx").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random id; cookie carries an HMAC-signed copy
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---- Proposals ---------------------------------------------------------------
export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(), // internal uuid
    publicId: text("public_id").notNull(), // uuid v4 in the share URL (~122 bits of entropy)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    clientName: text("client_name"),
    clientEmail: text("client_email"),
    currency: text("currency").notNull().default("USD"),
    content: text("content", { mode: "json" }).notNull(), // BlockNote document JSON
    taxRateBps: integer("tax_rate_bps").notNull().default(0), // default tax for every line, basis points
    taxLabel: text("tax_label"), // e.g. "HST", "VAT", "GST"
    senderName: text("sender_name"), // per-proposal override of the profile brand name
    accentColor: text("accent_color"), // per-proposal override of the profile brand colour (hex)
    ccEmails: text("cc_emails", { mode: "json" }).$type<string[]>(), // extra recipients
    remind: integer("remind", { mode: "boolean" }).notNull().default(true), // reminder before expiry
    navHidden: text("nav_hidden", { mode: "json" }).$type<string[]>(), // heading block ids kept out of the section nav
    notifyEmails: text("notify_emails", { mode: "json" }).$type<string[]>(), // extra addresses told when this one is signed
    style: text("style"), // page style id (shared/styles.ts); null = classic
    reminderSentAt: integer("reminder_sent_at", { mode: "timestamp_ms" }),
    paymentUrl: text("payment_url"), // per-proposal payment link; null = the brand default
    paymentLabel: text("payment_label"), // button text, default "Pay the deposit"
    sendCount: integer("send_count").notNull().default(0), // emails sent to the client, including resends
    lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }),
    countersign: integer("countersign", { mode: "boolean" }).notNull().default(false), // the sender signs after the client
    declinedAt: integer("declined_at", { mode: "timestamp_ms" }),
    declineReason: text("decline_reason"), // what the client said, if anything
    status: text("status").notNull().default("draft"), // draft | sent | viewed | accepted | declined | archived (expired is derived)
    passwordHash: text("password_hash"), // optional link password (PBKDF2)
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("proposals_public_id_uq").on(t.publicId), index("proposals_user_idx").on(t.userId)],
);

// Line items live in their own table so totals are computed server-side, never trusted from the client.
export const pricingItems = sqliteTable(
  "pricing_items",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    unitAmount: integer("unit_amount").notNull(), // minor units (cents)
    quantity: integer("quantity").notNull().default(1),
    minQuantity: integer("min_quantity"),
    maxQuantity: integer("max_quantity"),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
    selectedByDefault: integer("selected_by_default", { mode: "boolean" }).notNull().default(true),
    taxRateBps: integer("tax_rate_bps"), // null = use the proposal default; basis points, 1300 = 13%
    billing: text("billing").notNull().default("once"), // once | month | quarter | year
    unit: text("unit"), // "hour", "page", "seat"; null = no unit word
  },
  (t) => [index("pricing_items_proposal_idx").on(t.proposalId)],
);

// Every open of the public page. Powers the "they opened it" notification.
export const views = sqliteTable(
  "views",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    viewedAt: integer("viewed_at", { mode: "timestamp_ms" }).notNull(),
    ipHash: text("ip_hash"), // HMAC with SESSION_SECRET; never the raw IP
    userAgent: text("user_agent"),
    country: text("country"), // from request.cf
  },
  (t) => [index("views_proposal_idx").on(t.proposalId)],
);

// The acceptance record. This is the legal artefact: write once, never update.
export const acceptances = sqliteTable(
  "acceptances",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "restrict" }),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    signedText: text("signed_text").notNull(), // the typed signature exactly as entered
    selectedItemIds: text("selected_item_ids", { mode: "json" }).notNull(), // optional items that were on
    totalAmount: integer("total_amount").notNull(), // server-computed at acceptance, minor units
    currency: text("currency").notNull(),
    contentHash: text("content_hash").notNull(), // SHA-256 of canonical proposal JSON at acceptance
    snapshot: text("snapshot"), // the exact canonical JSON that was hashed, so the record survives later edits
    recurring: text("recurring", { mode: "json" }).$type<{ period: string; total: number }[]>(), // per-period totals at acceptance, incl. tax
    countersignedAt: integer("countersigned_at", { mode: "timestamp_ms" }),
    countersignerName: text("countersigner_name"),
    method: text("method").notNull().default("online"), // online = signed on the page; manual = marked accepted by the sender
    ip: text("ip").notNull(), // raw here on purpose: part of the evidentiary record
    userAgent: text("user_agent"),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }).notNull(),
    consentText: text("consent_text").notNull(), // the exact consent sentence shown to the signer
    senderName: text("sender_name"), // who the signer was agreeing with, as shown at the time
    senderEmail: text("sender_email"),
    clientName: text("client_name"),
  },
  (t) => [uniqueIndex("acceptances_proposal_uq").on(t.proposalId)],
);

// Business plan: people who work inside an owner's workspace. Invited by email, joined on sign-in.
export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    memberId: text("member_id").references(() => users.id, { onDelete: "cascade" }),
    invitedAt: integer("invited_at", { mode: "timestamp_ms" }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("team_members_owner_email_uq").on(t.ownerId, t.email), index("team_members_member_idx").on(t.memberId)],
);

// A proposal saved by its owner as a reusable starting point.
export const userTemplates = sqliteTable(
  "user_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    style: text("style"),
    accentColor: text("accent_color"),
    content: text("content", { mode: "json" }).notNull(),
    items: text("items", { mode: "json" }).notNull().$type<unknown[]>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("user_templates_user_idx").on(t.userId)],
);

// Seconds clients spent with each section on screen, summed. Powers "time per section".
export const sectionTime = sqliteTable(
  "section_time",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(), // heading block id, or "intro" / "s-pricing" / "s-accept"
    title: text("title").notNull(),
    seconds: integer("seconds").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.sectionId] })],
);

// Questions a client asks from the proposal page. Emailed to the sender and kept here.
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("messages_proposal_idx").on(t.proposalId)],
);

// Uploaded images (logos, proposal images). Served from a separate cookieless origin.
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // R2 key
    mime: text("mime").notNull(), // validated by magic bytes, not by the client header
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("files_key_uq").on(t.key), index("files_user_idx").on(t.userId)],
);

// Messages from the contact form and in-app help. The admin area answers them by email.
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("question"), // question | billing | bug | abuse | other
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    userId: text("user_id"), // set when the sender was signed in
    status: text("status").notNull().default("open"), // open | closed
    ipHash: text("ip_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("tickets_status_idx").on(t.status, t.updatedAt)],
);

export const ticketMessages = sqliteTable(
  "ticket_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    from: text("from").notNull(), // customer | admin
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId)],
);

// Append-only audit trail for security-relevant events (login, send, accept, export, delete).
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    proposalId: text("proposal_id"),
    event: text("event").notNull(),
    meta: text("meta", { mode: "json" }),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("audit_user_idx").on(t.userId), index("audit_created_idx").on(t.createdAt)],
);

// Polar webhook ids already applied, so a replay within the signature window changes nothing.
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull(),
});

// Fixed-window rate limiting in D1 (the free-tier WAF allows only one rule).
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), // e.g. "login:<ipHash>" or "accept:<publicId>"
  count: integer("count").notNull(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});
