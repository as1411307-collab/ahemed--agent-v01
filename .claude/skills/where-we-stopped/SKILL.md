---
name: where-we-stopped
description: >-
  Keep a short "where we stopped" file (docs/STATUS.md) so Ahmed can come back
  after days or weeks without getting lost. Read it at the start of any session
  that continues earlier work, and when Ahmed asks "وين وقفنا", "وين وصلنا",
  "كمل", "نكمل", "where were we" or "continue". Update it at the end of every
  session and after any milestone, decision, or change of direction.
---

# Where we stopped (وين وقفنا)

> بالعربي: ملف صغير يتحدّث في آخر كل جلسة، فيه وين وصلنا وشو الخطوة الجاية، عشان ما تضيع لما ترجع.

The file is `docs/STATUS.md`. It is a pointer, not a diary: short enough to read in one minute on a phone.

## At the start of a session

- Read `docs/STATUS.md` (and `docs/DECISIONS.md` if the work touches design or direction) before touching anything else.
- Check that the laptop matches GitHub: compare the last commit in the file with `git log -1 --oneline`, and run `git status` for unsaved changes. Mention any difference.
- Tell Ahmed in two or three plain lines where things stand, then wait for what he wants. Don't start working on the "next step" line by yourself.

## At the end of a session (or after a milestone)

Rewrite the whole file (don't just append), in Arabic, under 40 lines, in this shape:

```markdown
# وين وقفنا
آخر تحديث: YYYY-MM-DD

## الحالة الحين
(2–4 lines: what works, what doesn't)

## آخر شي صار
(1–3 lines, with the last commit's short hash)

## الخطوة الجاية
(one line, or "لم تتحدد" if Ahmed hasn't decided)

## انتبه
(things that will bite the next session: broken parts, pending decisions, setup steps)
```

- Write only facts: what Ahmed said or what you checked. Don't invent a next step he didn't choose.
- Long history belongs in git and `docs/REPORT.md`, not here.
- Commit the file with the rest of the session's work.
