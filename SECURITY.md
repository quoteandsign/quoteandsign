# Security

Quote and Sign holds signed agreements and client details, so reports are taken seriously and
answered quickly.

## Reporting a problem

Please report privately, not in a public issue:

- Through the contact form, choosing "Report a proposal or email":
  https://quoteandsign.com/contact?kind=abuse
- Or through GitHub's private vulnerability reporting on this repository, once it is enabled.

You will get an acknowledgement within two business days and a fix or a clear answer as fast
as the problem warrants. Please give us a reasonable time to fix before publishing anything.

## What is in scope

The hosted service at quoteandsign.com and the code in this repository: sign-in, proposal
access, the accept and signing record, billing webhooks, file uploads, the admin area, and the
emails the service sends.

## What is out of scope

- Findings that need a stolen, unlocked device or a compromised email account.
- Rate-limit findings that require more than the limits published in the code to matter.
- Reports produced by scanners with no working reproduction.

## How the service is built to be safe

- Sign-in is passwordless. There are no password hashes to lose.
- Every database read and write is scoped to the signed-in workspace. Public proposal pages are
  reachable only by an unguessable 122-bit id and may carry a password and an expiry.
- Acceptances store a snapshot of exactly what was signed and its SHA-256 hash; the signing
  record page recomputes the hash so anyone can verify the content was not changed afterwards.
- Strict Content Security Policy on every server-rendered page, HSTS, cross-site write
  refusal before any handler runs, and no cookies on file responses.
- Uploads are checked by their bytes, images only, and stored inside the database.
- Encrypted nightly backups kept off the hosting provider.

Thank you for helping keep it that way.
