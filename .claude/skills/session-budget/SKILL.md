---
name: session-budget
description: >-
  Protect Ahmed's Claude usage. Before big or open-ended work (multi-file
  builds, large refactors, long debugging, reading many or huge files,
  installs, anything that may take many steps), give a plain size estimate and
  get a go-ahead for large work. Also use when Ahmed mentions "الرصيد",
  "الاستخدام", "خلص الرصيد", "usage", "limit" or "tokens".
---

# Session budget (ميزانية الجلسة)

> بالعربي: قبل أي شغلة كبيرة يقول لك تقريباً قد إيش بتاخذ، ويوقف لو كبرت أكثر من المتوقع.

Ahmed has run out of usage before in the middle of work. You can't see exact token counts, so be honest that any estimate is rough.

## Before starting

Size the work in plain words:

- **صغيرة** — a few files, a few minutes. Just do it.
- **متوسطة** — several files or steps. Say it in one line and continue.
- **كبيرة** — many files, a whole feature end to end, a big refactor, or anything you can't put a limit on. Explain in two lines what makes it big and wait for his OK. Offer a smaller first piece if there is one.

## While working

- Read only what you need: search first, then read the relevant part of a file instead of whole large files. Don't re-read files you already have.
- Don't loop: if the same fix fails twice, stop and explain instead of trying a third and fourth variation.
- If the work turns out bigger than you said, stop at a safe point, commit what works, and tell him where it stands.
- Don't install heavy tools or generate large files nobody asked for.
- Subagents are the fastest way to burn usage; the `agent-spawn-guard` skill applies.

If Ahmed wants exact numbers, point him to the usage and limits view in Claude Code or in his Claude account settings.
