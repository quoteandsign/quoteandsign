# Changelog

All notable changes to Quote and Sign. Dates are the day the change went live at quoteandsign.com.

## 1.1.0 — unreleased

### Editor
- Every block shows a faint dashed frame and its name on hover, so it is obvious what can be edited; the
  cover fields and the text inside cards and testimonials look like fields before you touch them.
- Block handles sit in a small white pill instead of loose grey glyphs.
- A one-time three-line hint for first-time editors.
- On phones the settings column becomes a bottom bar (add block, pricing with the live total, options,
  preview) that opens a sheet, instead of sitting below the whole document.

### Templates and pages
- A new Studio page style: a full-screen opening with a slow colour mesh from your accent, huge type, sections
  that rise into view as the reader scrolls, and a reading-progress line in the nav. Night gets the same
  treatment in the dark.
- Studio and Night open on a pinned stage: the first picture in the proposal becomes the hero art, tilted and
  settling as you scroll while the page slides over the cover. Statements and section headings reveal word by
  word; images move gently with the scroll; the pricing and accept cards rise into place.
- Every page style reveals sections on scroll and shows reading progress. Printing, thumbnails and readers who
  prefer reduced motion get the finished page at once.
- The block you click in the editor keeps a solid frame while you are in it.
- The section nav is a floating glass island with pill links, a hairline progress inside it and per-style
  colours; the active section follows scroll position so it never flickers.
- An Opening image switch per proposal on Studio and Night, with a centred typographic opening when off.
- The editor mirrors the page on Studio and Night: the promoted picture shows as the tilted panel with Change
  picture and Remove right on the cover, an Add a cover picture panel when there is none, the source picture
  marked "On the cover", and the body set with the page's cards, quotes, pictures and pricing treatment.
- Phones: the section nav is a single-row island, the stage starts under it, and the by-line is omitted
  when no business name is set.
- The cover picture lives in one place in the editor, as on the page: the row that supplied it shows the
  rest, and the picture's caption is edited on the cover.
- Undo and redo buttons in the editor header, greyed out when there is nothing to undo or redo.
- Newsreader, a real serif with true italics, is self-hosted for the Editorial style and for signatures.
- As the client types their name it appears beneath the field as a signature; the accepted page draws a check
  and keeps the signature. Totals count up to their new value when an option changes; the switches spring.
- Selection colour, caret, focus rings and scrollbars follow each page's accent, on the page and in the editor.
- The homepage is rebuilt as the showpiece: a floating island nav, a mesh stage with the live phone and three
  "moments" (opened, options changed, signed) rising around it and settling as you scroll, a pinned
  how-it-works that follows the scroll, a strip of the seven templates as live pages, a closing signature
  moment, bigger calmer type and button-in-button calls to action.
- Homepage round two: the stage mesh runs edge to edge, how-it-works is a card stack that turns as the steps
  pass, the template strip is centred and its cards fly in and scroll on hover, the record section plays
  four state cards through its timeline.
- Homepage round three, scripted motion: GSAP with ScrollTrigger (no-charge licence) and Lenis (MIT) are
  vendored under /vendor, served with a week-long cache and never through the Worker. Smooth scrolling on fine
  pointers; a composed hero entrance with the phone arriving in 3D and the moments settling in parallax;
  headings arrive word by word; how-it-works is pinned and the scrollbar turns the cards and the copy with clear
  holds between beats; the template gallery is pinned and slides sideways with the scroll, leaning with your
  speed, with soft edges and a light that follows the pointer over each thumbnail; prices count up; the closing
  signature draws with the scroll; the nav steps aside on the way down and returns on the way up. The hero
  phone signs itself: after the option flips, it scrolls to the signature and types the name in the serif
  preview (touching the phone stops it; focusing the field clears it). The demo client is Sophie Bennett of
  Bramble & Co. Reduced motion gets the finished page at once.
- Fixes from the design review: the phone no longer keeps a leftover offset after its entrance (the currency row
  had overlapped it), the phone sits at the edge of its column so the moment cards cover only the bezel, the
  closing stroke matches the width of the words, the dark record section gets ambient light and readable
  inactive steps, and wide screens get a wider column.
- Big-screen pass: the hero stops growing at 940px tall, the column widens again above 2200px, how-it-works
  needs less scroll per step, template thumbnails hold three screens of the page and scroll on hover exactly
  to the end of each page, and the record section is pinned so the timeline, the four state cards and the
  receipt play once when the section is properly in view (its top in the upper third of the screen), so it
  no longer finishes before you arrive. Pinned scenes start at the top of the screen instead of centring, so
  tall monitors see no empty band above their headings.
- Big-screen round two: pinned scenes are as tall as their content and lock to the middle of the screen while
  pinned; template cards grow with the screen height and the column widens again on very wide, tall screens;
  the gallery is already sliding as the section comes into view and keeps going through the pin; a hovered
  template pops out and its preview scrolls to the real end of the page (short pages no longer run into
  blank space); the record timeline steps are clickable and show that moment, and the automatic cycle is a
  touch slower.
- The record timeline has a fifth step, The record, so every card has a step to click; the card column is capped
  so the card sits beside the bullets and level with them; more room around the template gallery and a
  gentler arrival for its heading and cards.
- The how-it-works stage actually sticks now: sideways overflow is clipped at the viewport and the hero, not on
  the body, which had turned the body into a scroll container and silently broken sticky positioning.
- A seventh template, Brand identity, built as a showcase for design studios. Website project moves to
  Studio; every template gains image rows with bundled abstract artwork to replace with your own.
- Section bands are quieter, covers lose the blurred colour blob, and the public header no longer wraps on
  phones.


### Homepage on phones
- A mobile layer for the homepage, scoped to screens under 980px so the desktop page is unchanged: a proper
  side gutter everywhere (the hero and the dark record section had none), a full-width Start free button,
  the demo phone shown in full so the pricing, the name field and the Accept button are all visible, the
  currency chips hidden, how-it-works as three plain rows, the template gallery as a swipe strip that snaps
  to the centre where the middle card pops out and its preview reads itself while the neighbours recede,
  the record timeline as one column with the card straight and two bullets instead of four, the comparison
  table replaced by four one-line contrasts and a link to the full comparison, the long webhook trust point
  hidden, the fair-use footnote hidden, the closing signature flourish hidden, and section spacing halved.
  The page is about a quarter shorter on a phone.
- Second and third phone passes: more room under the nav; the demo phone has a fixed height and scrolls
  inside, ending just under the Total; the template strip advances by itself while on screen and stops the
  moment you touch it, and the preview no longer scrolls inside the card on phones; the record section shows
  the record card straight away (labels stacked, hash on one line) with two bullets, about one screen tall;
  no stray line between the dark section and pricing; the secondary hero link is underlined.

### Homepage hero
- The hero drops the patterns readers associate with machine-made pages: the oversized headline with a
  coloured phrase and a drawn underline, the colour mesh behind everything, the frosted floating cards, the
  icon-in-a-circle button and the tilted 3D phone. In their place: a plain kicker, a shorter headline that no
  longer implies a phone is required ("Send a proposal as a link. Get it signed."), a specific lede, a plain
  button, and a four-line list of what is included. The demo phone stays, square, with one card beside the
  total showing the price change.

### Security
- A path beginning with two slashes no longer produces a protocol-relative redirect (the trailing-slash
  redirect now collapses leading slashes), with a regression test.
- Block ids sent by the editor are kept only when they look like ids; the editor never places an unchecked
  id into a CSS selector.
- GSAP and Lenis are pinned to exact versions, and their vendored files are byte-identical to the npm builds.

### Public pages
- Every server-rendered page (templates, comparisons, legal, contact) now carries one real description, a
  canonical link and share-preview tags, plus breadcrumb structured data on the template and comparison pages.
- Unknown addresses answer with a real 404 instead of the app shell; a trailing slash redirects to the page.
- The homepage has a single h1; the sign-in page is no longer listed in the sitemap.
- llms.txt lists the pages as Markdown links, in sections, as the convention asks.
- Static files are cached at the edge: hashed build output and fonts for a year, brand and screenshots for a day.
- Template and comparison cards use h2 headings, thumbnail links carry a name, and header and footer links
  are tall enough to tap on a phone.

## 1.0.0 — 2026-09-07

First public release. Everything below is live on the hosted service and in this repository.

### Proposals
- Write in a block editor: headings, lists, tables, images and image rows, statements, feature grids,
  testimonials, embedded video (YouTube, Vimeo, Loom by link), and the pricing table.
- Six starting templates and six page styles; your logo, color and sender name on paid plans.
- Live pricing: required and optional lines, quantity ranges the client can change, recurring lines,
  one tax rate for the proposal with a per-line exemption, 16 currencies.
- Send by email with a personal note, or publish the link and share it yourself. Passwords, expiry
  dates and a reminder three days before expiry on paid plans.

### Accepting
- The client toggles options on their phone, types their name and taps Accept. The record stores the
  name, email, time, IP, consent text, the chosen options, and a SHA-256 fingerprint of the exact
  content shown, verifiable from the record file.
- Both parties get the signed PDF by email; a readable record page and a JSON record stay at the link.
  Business accounts can countersign.
- Questions and declines go to the sender with the client's message quoted; the client's email is
  only ever the reply-to.

### Accounts and plans
- Passwordless sign-in by one-time link. Free (three live proposals), Pro, Business (ten seats, shared
  templates, countersigning, webhooks). Fourteen-day Pro trial, no card. Billing through Polar as
  merchant of record.
- Export everything as one JSON file; delete the account with an emailed code, with signed records
  kept readable for the other party.
- Signed outbound webhooks on Business: sent, first opened, accepted, declined, countersigned.

### Security and privacy
- Every read and write scoped to the signed-in workspace; public pages reachable only by unguessable
  links; per-request nonce Content Security Policy on every page; same-origin checks on every write.
- Two independent security passes before release with every finding fixed and pinned by a test.
- Uploads limited to images, checked by content, served sandboxed. Recipients' IPs stored as keyed
  hashes except in the acceptance record itself. Google Analytics only on public pages and only after
  consent. Nightly encrypted backups kept 60 days; deleted data leaves backups within that window.
- Terms, privacy policy, acceptable use policy and data processing addendum reviewed against what the
  code actually does.

### For self-hosters
- One Cloudflare Worker, one D1 database, Resend for email, Polar for billing, Turnstile for the bot
  check. Runs on the free Cloudflare plan. See the README.
