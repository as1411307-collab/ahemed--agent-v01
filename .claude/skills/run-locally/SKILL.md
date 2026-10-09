---
name: run-locally
description: >-
  Get the Core and the Expo app running on Ahmed's Windows laptop and talking
  to his iPhone, and fix the usual connection problems. Use when Ahmed says
  "شغّل", "شغله", "ما يشتغل", "التطبيق ما يتصل", "run it", "start the app",
  or when things need starting again after a long break.
---

# Run locally (تشغيل محلي سهل)

> بالعربي: يشغّل لك الكور والتطبيق على اللابتوب ويوصلهم بالآيفون، ويحل المشاكل المعروفة.

The exact commands live in CLAUDE.md under "التشغيل والاختبار". Follow them; this skill adds the order and the fixes. All commands are PowerShell, from the repo root.

## Start

1. First time only: `npm install`. If `apps/core/.env` or `apps/mobile/.env` is missing, create it from its `.env.example` as CLAUDE.md describes. Ahmed types the secret values himself; never put a real key into a file or the chat for him.
2. Core: `npm run core`. It should listen on `0.0.0.0:8787`. Leave that window running.
3. Find the laptop's Wi-Fi address with `ipconfig` (the IPv4 address under the Wi-Fi adapter). `EXPO_PUBLIC_CORE_URL` in `apps/mobile/.env` must be `http://<that address>:8787`, never `localhost`.
4. App, in a second window: `npm run mobile`. Ahmed scans the QR code with Expo Go on the iPhone.

## When the phone can't reach the Core

Check in this order:

1. **Same Wi-Fi:** the iPhone and the laptop must be on the same network, and the phone not on mobile data.
2. **Address changed:** the laptop's IP often changes after a restart or on another network. Run `ipconfig` again and update `EXPO_PUBLIC_CORE_URL`.
3. **Restart Expo after any `.env` change:** stop it and run `npm run mobile` again.
4. **Windows Firewall:** Node must be allowed on Private networks. If Windows marks the Wi-Fi as a Public network, that permission doesn't apply; switch the network to Private.
5. **Token:** an "unauthorized" / 401 error means `EXPO_PUBLIC_APP_TOKEN` doesn't match `APP_TOKEN`.
6. **Core stopped:** look at the Core's window for the error message.

Explain progress and problems to Ahmed in plain words (see `explain-in-gulf-arabic`). Don't change code to "fix" a setup problem.

Note: the Core only works while the laptop is on and connected to the internet.
