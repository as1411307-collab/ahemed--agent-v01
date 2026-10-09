---
name: show-me-screenshot
description: >-
  Show Ahmed the result as a picture instead of describing it in words. Use
  after any change to a screen, page, layout, theme or visual, and when Ahmed
  asks "وريني", "صوّرها", "شكلها شلون", "show me" or "screenshot".
---

# Show me (صوّرها لي)

> بالعربي: لما يخلص شاشة أو تعديل، يوريك صورة النتيجة بدل ما يوصفها بالكلام.

## Web pages and anything that runs in a browser

Use the `playwright-cli` skill in this repo: open the page, take a screenshot, and show it. Save screenshots inside `.playwright-cli/` (for example `playwright-cli screenshot --filename=.playwright-cli/home.png`), which is git-ignored, so they never get committed.

## The Expo phone app

The app runs through Expo Go and has no web build set up, so it can't be screenshotted from the laptop.

- Don't add web packages (react-dom, react-native-web) just to take screenshots unless Ahmed agrees.
- Tell Ahmed in 2–3 plain lines exactly what to open on his iPhone and what he should see, and ask him to send a screenshot if he wants you to check it.
- When he sends one, compare it with what was intended and with `ahmed-design-taste`, and say plainly what matches and what doesn't.

Keep the words short; the picture does the talking.
