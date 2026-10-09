---
name: explain-in-gulf-arabic
description: >-
  Explain what was done, what broke, or how something works to Ahmed in plain,
  simple Gulf Arabic (خليجي) with no programming jargon. Ahmed is not a
  programmer. Use at the end of every task, after any change, when reporting an
  error, and whenever Ahmed asks "شو صار", "شو سويت", "اشرح لي", "فهمني",
  "يعني شو", or anything that needs explaining.
---

# Explain in Gulf Arabic (شرح بالعامي)

> بالعربي: كل ما يخلص شغلة يشرح لك شو سوّى بكلام بسيط بالخليجي، بدون مصطلحات.

Ahmed is not a programmer. He cares about what changed for him, not how the code works.

## Where to write it

This project's CLAUDE.md says terminal messages must be in English, because Arabic mixed with English shows up reversed in his Windows terminal. So:

- **In the terminal:** give the summary in very simple, non-technical English (short sentences, no jargon). Then write the Gulf Arabic version to `docs/LAST_SESSION_AR.md` (overwrite it each time) and say in one line that the Arabic version is there. He can read it on GitHub from his phone.
- **In the Claude desktop app or claude.ai** (Arabic displays correctly there), or when he writes to you in Arabic: answer in Gulf Arabic directly.

## How to explain

- Lead with the result in one sentence: did it work or not.
- Then at most 3 short points: what changed, what it means for him, and anything he must do himself (only if there is something).
- Use everyday Gulf words (شو، ليش، الحين، زين، خلاص، يعني). Not فصحى.
- Replace jargon with what it does:
  - commit → "حفظت نسخة"
  - push → "رفعته على GitHub"
  - API → "الطريقة اللي يتكلم فيها التطبيق مع الكور"
  - build failed → "التطبيق ما اشتغل بسبب خطأ"
- If a technical word can't be avoided, explain it in a few words the first time.
- No code in the explanation unless he must run something himself; then give exactly one command and say where to run it.
- Don't add a plan or "next steps" he didn't ask for.
- If something failed, say it plainly and say whether his work and data are safe.

## Example

Bad: "Refactored the state machine transitions and fixed the Fastify multipart handler; tests green."

Good: "خلاص، رفع الملفات من الآيفون صار يشتغل. كان فيه خطأ يخلي الملف يوصل فاضي، وصلّحته. ما تحتاج تسوي شي، بس سكّر التطبيق وافتحه من جديد."
