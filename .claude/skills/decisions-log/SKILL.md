---
name: decisions-log
description: >-
  Record Ahmed's decisions with their reason in docs/DECISIONS.md, and check
  that file before proposing designs, features, architecture or tools, so
  rejected ideas are never suggested again. Use when Ahmed decides, rejects or
  changes something ("قررت", "ما أبي", "خلاص نمشي على", "لا تسوي", "شيل",
  "غيّرت رايي"), and before any design or direction proposal.
---

# Decisions log (سجل القرارات)

> بالعربي: كل قرار كبير ينكتب مع السبب، عشان ما يرجع يقترح عليك شي رفضته قبل.

File: `docs/DECISIONS.md`. Newest entries at the top.

## Before proposing anything

Read `docs/DECISIONS.md`. Don't suggest anything it rejects. If you think a past decision is worth revisiting, say so openly and explain why; never quietly work around it.

## When Ahmed decides something

Add an entry right away, in Arabic, using his own words where possible:

```markdown
## YYYY-MM-DD — <short title>
- القرار: ...
- السبب: ... (only what Ahmed said; write "ما ذكر سبب" if he gave none)
- يلغي: <older entry, if any>
```

- Record only decisions Ahmed actually made, not suggestions of yours he hasn't confirmed.
- When a new decision replaces an old one, keep the old entry and mark it `(ملغي — انظر YYYY-MM-DD)`.
- Small technical choices you make yourself go in `docs/REPORT.md`, as CLAUDE.md says. This file is for Ahmed's decisions.
- Commit the file with the session's work.
