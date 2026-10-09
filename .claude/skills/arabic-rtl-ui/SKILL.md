---
name: arabic-rtl-ui
description: >-
  Make Arabic look and work right in the app: right-to-left layout, Arabic
  fonts, mixed Arabic and English text, numbers, and switching languages. Use
  when building or changing any screen that shows Arabic, when adding a
  language option, or when Arabic text looks reversed, cut off, misaligned or
  in the wrong font.
---

# Arabic and RTL (العربي يطلع صح)

> بالعربي: يخلي العربي في التطبيق يطلع صح: الاتجاه من اليمين لليسار، الخط، الأرقام، والتبديل بين اللغات.

Ahmed wants language options in settings, and Arabic is his first language. Plan for right-to-left from the start; adding it later is painful.

## Principles

- **Layout:** use start/end instead of left/right everywhere (`marginStart`, `paddingEnd`, `start`/`end` positions, `textAlign: 'auto'`), so the layout mirrors by itself in Arabic.
- **Mirroring:** mirror things that have a direction (back arrows, chevrons, progress that moves across, the side a panel slides in from). Don't mirror things that don't (logos, the play icon, checkmarks).
- **Strings:** keep all user-facing text in one translations file per language. No Arabic or English hard-coded inside components.
- **Fonts:** pick a font with proper Arabic letters and a matching Latin style. Check the line height so Arabic marks aren't clipped.
- **Mixed text** (Arabic with English words, numbers, file names): check it in both directions, and isolate embedded English pieces so punctuation doesn't jump to the wrong side.
- **Numbers and dates:** choose Western digits (123) or Arabic-Indic digits (١٢٣) once and keep it consistent. Format dates with the locale.
- **Switching language while the app is open:** in React Native, changing the layout direction usually needs an app reload. Make that clear in settings.

## Before writing code

RTL APIs change between Expo SDK versions. Look up the current way to enable and force RTL for this project's Expo SDK (`I18nManager`, `expo-localization`, and the app-config RTL options) using the `find-docs` skill before implementing. Don't rely on memory.

## Check

- Look at every changed screen in both Arabic and English.
- Watch for text that is cut off, misaligned or reversed, and icons pointing the wrong way.

Note: Ahmed's Windows terminal shows Arabic reversed. That's the terminal, not the app.
