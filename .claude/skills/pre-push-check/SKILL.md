---
name: pre-push-check
description: >-
  Before pushing to GitHub, or before calling any work finished, run this
  project's tests and type checks and report the result to Ahmed in one plain
  line. Use before every git push, before saying a task is done, and when
  Ahmed asks "شغال؟", "تأكد", "جربته؟" or "is it working".
---

# Pre-push check (مراجعة قبل الرفع)

> بالعربي: قبل أي رفع يشيك إن الكود يشتغل والاختبارات ناجحة، ويقول لك النتيجة بسطر واحد.

CLAUDE.md: never push unless Ahmed explicitly asks. This check runs before a push he asked for, and before declaring any work done.

## Steps (repo root, PowerShell)

1. `npm test` — the Vitest suite with FakeModelClient (no API key or network needed).
2. `npm run typecheck` — contract + core.
3. `npm run typecheck -w @ahmed/mobile` — the app.
4. Run the `secrets-guard` check on what is about to be pushed.
5. If the change touched how the Core starts, also start it briefly with `npm run core`, confirm it listens on port 8787 without errors, then stop it.

Run only what exists. If a script is missing or renamed, read `package.json` instead of guessing.

## Report

One line, in the language CLAUDE.md allows in the terminal (see `explain-in-gulf-arabic`):

- All good: `PASS: tests and type checks all passed. Safe to push.`
- Something failed: `FAIL: <which check> — <one plain sentence why>.` Then don't push unless Ahmed says to push anyway.

Never say something works if you didn't run the check. If you couldn't run it (no Node, no network), say that instead.
