# CLAUDE.md — AHMED Agent

يُقرأ هذا الملف في بداية كل جلسة. التزم به دائمًا.

## المشروع
- AHMED Agent: وكيل شخصي لأحمد. النسخة الحالية v0.1 هدفها Vertical Slice واحد فقط يعمل من تطبيق الجوال حتى التنفيذ والتحقق والنتيجة.
- المعمارية: Ahmed App → Core API → Agent Core + State Machine → Model / Tools
- التطبيق (apps/mobile) واجهة إدخال وعرض فقط: لا منطق وكيل ولا مفاتيح نماذج. اتصالات المهام والقرارات بالـCore فقط. استثناء الصوت: WebRTC يحمل الميكروفون والصوت مباشرة إلى مزود الصوت بعد إعداد الجلسة من الـCore، دون أي مفتاح في التطبيق.
- الـCore (apps/core) يملك الحالة والقرار والصلاحيات والتدقيق.
- n8n غير مربوط في v0.1.

## المراجع
- docs/BUILD_PROMPT.md: أمر البناء الحاكم لنطاق v0.1.
- V0_CONTRACT.md: العقد بين التطبيق والـCore، وpackages/contract يطابقه حرفيًا.
- docs/VISION.md: للسياق فقط.
- docs/VOICE.md: امتداد الصوت المطلوب صراحة من أحمد في 9 أكتوبر 2026، وإجراءات تشغيله واختباره. هذا الطلب يوسّع نطاق الأمر الأصلي الذي أجّل الصوت؛ لا يغيّر عقل الوكيل أو صلاحياته.
- عند أي تعارض: docs/BUILD_PROMPT.md هو الحاكم.

## الستاك (محسوم)
- Monorepo بـ npm workspaces: apps/core (Node + TypeScript + Fastify)، apps/mobile (Expo SDK 57 + TypeScript؛ Expo Go للنص وDevelopment Build للصوت)، packages/contract.
- SQLite عبر better-sqlite3. الاختبارات Vitest مع FakeModelClient.
- نموذج الوكيل: Anthropic. ANTHROPIC_API_KEY وMODEL_NAME من env فقط. OpenAI Realtime طبقة صوت اختيارية للتفريغ ونطق نتيجة الـCore؛ الرد التلقائي والأدوات فيها معطّلان. OPENAI_API_KEY من env في الـCore فقط.

## البيئة
- Windows وPowerShell. أي سكربت في package.json لازم يعمل على Windows، بدون الاعتماد على bash أو أوامر Unix.
- الـCore يعمل على كمبيوتر أحمد ويستمع على 0.0.0.0، والجوال على نفس شبكة الواي فاي.

## قواعد العمل
- نفّذ بالتسلسل. لا subagents ولا مهام متوازية.
- اعمل داخل مجلد المشروع فقط. لا تقرأ ولا تعدّل ملفات خارجه، ولا تفتح أو تستورد أي مشروع سابق.
- لا كونكترات ولا MCP في هذا المشروع.
- لا تثبيت عام (npm -g)، ولا أدوات نظام تحتاج صلاحيات مدير. إذا احتاجت حزمة ذلك، اختر بديلًا لا يحتاجه وسجّل القرار.
- لا تغيّر إعدادات git العامة. إذا لم تكن هوية git مضبوطة، اضبطها لهذا المستودع فقط.
- لا push ولا رفع إلى GitHub إلا بطلب صريح من أحمد.
- git commit بعد كل مرحلة.
- قبل أي إضافة اسأل: هل هي لازمة لنجاح الـSlice؟ إذا لا، لا تضفها.
- اتخذ القرارات التقنية الصغيرة بنفسك ولا تتوقف لتسأل. سجّل القرارات المهمة في التقرير.
- لا تعتبر العمل منتهيًا إلا إذا نجحت كل الاختبارات. عند الانتهاء: حدّث قسم "التشغيل والاختبار" أدناه، ثم توقف وقدّم التقرير.

## ثوابت الأمان
- كل ملفات الوكيل داخل WORKSPACE_ROOT (افتراضيًا ./workspace في الـCore). كل مسار يُحل بـ realpath ويجب أن يبقى داخله. ارفض .. والمسارات الخارجية والـsymlinks التي تخرج منه.
- الحاجة للموافقة يحددها Tool Registry في الكود، وليس حكم النموذج.
- أي Write Action لا تُنفذ إلا بموافقة صالحة غير منتهية، مطابقة لـ task_id وaction_id وidempotency_key. صلاحية الموافقة 15 دقيقة.
- لا حذف بأي شكل في v0.1، وmove_file بدون overwrite.
- الحالة محفوظة في SQLite. بعد إعادة تشغيل الـCore، أي مهمة عالقة في EXECUTING تنتقل إلى VERIFYING ويُفحص الواقع على القرص، ولا يُعاد التنفيذ أبدًا.
- Audit Log جدول append-only.
- الأسرار من env فقط. ملفات .env ومجلد workspace وملف قاعدة البيانات لا تدخل git، ويُرفع .env.example فقط.
- كل طلب للـCore يحتاج Authorization: Bearer بقيمة APP_TOKEN. التطبيق لا يحمل إلا EXPO_PUBLIC_APP_TOKEN.

## اللغة
- اكتب رسائلك في الترمنال بالإنجليزية، لأن العربي المخلوط بالإنجليزي يظهر مقلوبًا في هذا الترمنال.
- الكود والتعليقات ورسائل commit بالإنجليزية.
- التقرير النهائي: اكتبه بالعربية في docs/REPORT.md، واعرض ملخصًا قصيرًا بالإنجليزية في الترمنال.

## التشغيل والاختبار
كل الأوامر من جذر المشروع في PowerShell.

- التثبيت (مرة واحدة): `npm install`
- إعداد الـCore: `Copy-Item apps/core/.env.example apps/core/.env` ثم عبّئ:
  - `APP_TOKEN`: سر طويل عشوائي (مثال لتوليده: `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`)
  - `ANTHROPIC_API_KEY`، `MODEL_NAME` (افتراضيًا `claude-opus-5-5`)
  - اختياري: `HOST` (0.0.0.0)، `PORT` (8787)، `WORKSPACE_ROOT` (./workspace)، `DB_FILE` (./ahmed-core.db) — المسارات نسبية إلى apps/core
- تشغيل الـCore: `npm run core` (يستمع على 0.0.0.0:8787، ويُنشئ apps/core/workspace/inbox وقاعدة البيانات تلقائيًا)
- إعداد التطبيق: `Copy-Item apps/mobile/.env.example apps/mobile/.env` ثم عبّئ:
  - `EXPO_PUBLIC_CORE_URL=http://<IP الكمبيوتر على الواي فاي>:8787` (من `ipconfig`، وليس localhost)
  - `EXPO_PUBLIC_APP_TOKEN` = نفس قيمة `APP_TOKEN`
- تشغيل النص على Expo Go: `npm run start:text -w @ahmed/mobile` (يجب أن يدعم SDK 57). بعد تعديل .env أعد تشغيل Expo.
- تشغيل الصوت: اتّبع `docs/VOICE.md` لبناء وتثبيت Development Build على iPhone، ثم `npm run mobile:voice`. البناء من Windows عبر EAS يحتاج حساب Apple Developer وتسجيل الجهاز؛ البناء المحلي يحتاج Mac وXcode. لا يُدّعى اختبار الجهاز دون دليل.
- إعداد الصوت في الـCore: `VOICE_ENABLED=true` ومفتاح `OPENAI_API_KEY` معتمد في بيئة الخادم؛ لا تضعه في أي `EXPO_PUBLIC_*`. الوضع الافتراضي `false` يبقي تشغيل النص السابق ممكنًا.
- الاختبارات: `npm test` (Vitest مع FakeModelClient، بدون مفتاح أو شبكة)
- فحص الأنواع: `npm run typecheck` (contract + core)، و`npm run typecheck -w @ahmed/mobile`
- أول تشغيل للـCore قد يُظهر نافذة Windows Firewall: اسمح لـNode على الشبكات الخاصة (Private) حتى يصل الجوال.

### تحقق امتداد الصوت — 9 أكتوبر 2026
- 73 اختبارًا برمجيًا نجحت: 40 سابقًا و33 للصوت والموارد. مزود الصوت والوسائط الأصلية مُحاكَيان في الاختبارات.
- فحص الأنواع: contract / core / mobile ناجح.
- توليد iOS عبر `expo prebuild --platform ios --no-install` وتجميع JavaScript/Hermes عبر `expo export --platform ios` ناجحان. أُفحص Info.plist: وصف الميكروفون موجود، الكاميرا غير مطلوبة، ودعم المشاهد لـiOS 27 مفعّل.
- لم تُنفّذ CocoaPods أو Xcode أو التوقيع أو تثبيت نسخة iPhone، ولم يُجر اتصال صوتي مدفوع. الاختبار الفعلي وخطة القبول موثّقان في `docs/VOICE.md`.

### GitHub Actions CI — 9 أكتوبر 2026
- الإعداد: `.github/workflows/ci.yml`؛ يعمل عند إنشاء طلب الدمج أو تحديثه أو إعادة فتحه، بما فيه Draft، وعند الدفع إلى `main`، ويدعم التشغيل اليدوي بعد وصول الملف إلى الفرع الافتراضي.
- ثلاث حالات منفصلة: `npm test` (يشمل اختبارات Core والصوت وMobile voiceClient)، و`npm run typecheck` (Contract + Core)، و`npm run typecheck -w @ahmed/mobile`.
- البيئة: Node.js 24، وتثبيت مطابق لـ`package-lock.json` عبر `npm ci`. فشل إحدى الحالات لا يُخفي نتائج الحالات الأخرى؛ الفشل يبقى ظاهرًا في Checks وتُصدر Vitest تنبيهات للأخطاء.
- لا يحتاج CI أسرارًا أو مفاتيح API حقيقية. المحاكاة البرمجية للصوت لا تثبت نجاح بناء iOS أو المحادثة على جهاز؛ اختبار القبول في `docs/VOICE.md` مستقل.
