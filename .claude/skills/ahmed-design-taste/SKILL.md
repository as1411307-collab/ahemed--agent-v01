---
name: ahmed-design-taste
description: >-
  Ahmed's own design taste for any screen, app UI, theme, page or visual he
  will see. Use before designing or changing any UI, and before choosing
  colors, fonts, layouts, animations or themes. Use together with
  frontend-design and theme-factory; where they differ, this skill wins.
---

# Ahmed's design taste (ذوقك في التصميم)

> بالعربي: ذوقك محفوظ هني، عشان أي واجهة تطلع على ذوقك من أول مرة بدون ما تشرح من جديد.

These are Ahmed's own stated preferences and they override generic design defaults. Also check `docs/DECISIONS.md`; if the two ever differ, the newer entry wins.

## Look

- Pure black background, a luxury feel, gold accents.
- Modern and striking, with depth: 3D-style effects, motion, and sound effects. Some themes should feel like a movie or an advanced video game.
- Not the generic "dark app with cards and a tab bar". If it looks like every other app, it's wrong.

## Never

- No planets, solar systems, orbs with orbital rings, or a cosmic look. (Rejected twice.)
- No character, face, mascot, cartoon or persona anywhere. If a symbol is needed, use a neutral geometric emblem.

## The centerpiece

- A live automation control panel in the style of n8n: labeled nodes connected by arrows on a canvas, with execution visibly moving node by node — where it went, where it stopped, where it went back.
- It shows real data, never a mockup or a fake animation.
- Several switchable views of the same structure (tree, hierarchy, grid of boxes, and others), plus adding or deleting nodes and paths by hand.

## Layout

- One main screen. Chat with the agent is front and center: opening the app means he can talk to it right away.
- Extra lists and tools open as side panels from the edge, not as full-screen pages. A panel can be closed or shrunk to about a quarter of the screen. Examples: errors and execution details; integrations with other AI models (ChatGPT, Claude, Gemini, Kimi).

## Settings

- Full control: language options, rearranging where elements sit, colors, fonts, background music and sounds, choice of voices.
- Ready-made preset themes, plus importing a theme file from the device.
- Changing the theme changes the whole experience — colors, sounds, fonts, and where things are placed — not just a color swap.
- A Reduce Motion option, because the design is motion-heavy.
- Arabic must look right (see `arabic-rtl-ui`).
