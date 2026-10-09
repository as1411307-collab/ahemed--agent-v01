---
name: fresh-start
description: >-
  Treat a new task or a new attempt as a clean start, without dragging in
  assumptions, files or designs from earlier attempts. Use when Ahmed says
  "مهمة جديدة", "من الصفر", "ابدأ من جديد", "محاولة جديدة", "new task",
  "start over", "from scratch", or begins something that replaces older work.
---

# Fresh start (بداية نظيفة)

> بالعربي: لما تقول "مهمة جديدة"، يبدأ من الصفر وما يسحب أشياء من المحاولات القديمة.

Background: in earlier attempts, Claude mixed context from old versions into new ones (old app attempts, a Base44 app, an earlier repo), so "new" work kept inheriting old mistakes.

## Rules

- Take the scope only from what Ahmed says now. Old plans, old designs and old code are not requirements unless he points to them.
- Don't open, copy from, or import any previous project or any folder outside this repo (CLAUDE.md forbids it too).
- Inside this repo, read only the files the new task actually needs.
- His decisions still stand. `docs/DECISIONS.md` and the `ahmed-design-taste` skill stay valid until he changes them. A fresh start resets the work, not his decisions or his taste.
- If something old might be useful, ask in one line ("تبي أستخدم ... من المحاولة القديمة؟") instead of assuming.
- Never delete or overwrite old work to make room. If old files are in the way, ask whether to move them into an `archive/` folder.
- Once the fresh start begins, update `docs/STATUS.md` so it no longer describes the old attempt.
