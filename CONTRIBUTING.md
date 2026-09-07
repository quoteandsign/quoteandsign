# Contributing

Thanks for looking. Quote and Sign is a small codebase maintained by one person, so the rules
are few and firm.

## Before you open a pull request

- Open an issue first for anything bigger than a typo, so we agree on the change before you
  spend time on it.
- Run `npm run check` and `npm test`. Changes to the accept flow, the content hash, sending, or
  the emails need a test in `test/`.
- Keep the change small and on one topic.

## Sign your commits

Every commit must carry a Developer Certificate of Origin sign-off, which says you wrote the
change or have the right to submit it under this project's licence:

```
git commit -s
```

That adds a `Signed-off-by: Your Name <you@example.com>` line. Pull requests with unsigned
commits are not merged. The text of the certificate is at https://developercertificate.org.

## Licence agreement

Every contribution also needs your agreement to the short [Contributor Licence Agreement](./CLA.md).
You keep your copyright; the project gets the right to relicense your contribution, which is what lets
the codebase stay under one licence, change licence if it ever has to, or be acquired as a whole. Tick
the box in the pull request template; the sign-off is the record. Your contribution is released to
everyone under the AGPL-3.0 like the rest of the project.

## What issues are for

Bugs in the software and clear, small feature requests. Help with running your own copy is not
offered here; the README describes the supported setup and that is the extent of it.

## Security

Do not open a public issue for a security problem. See [SECURITY.md](./SECURITY.md).
