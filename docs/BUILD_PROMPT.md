# أمر تنفيذ AHMED Agent — v0.1 (Vertical Slice)

> تحديث حاكم لاحق — 21 أكتوبر 2026: [NEXUS_SCENE_FIRST_PLAN.md](NEXUS_SCENE_FIRST_PLAN.md) هو المرجع الحالي. أحمد أذن باستئناف الخلفية والوكيل الرئيسي والتكاملات والمتخصصين **بالتوازي الآن**؛ لا ينتظر هذا العمل شراء المشهد. يبقى العالم أصل Unreal جاهزًا قابلًا للتحرير يُشترى بعد اعتماد أصل وسعر محددين، ثم تشغيله واعتماده وتخصيصه بقدر محدود. الربط البصري النهائي ينتظر تشغيل الأصل. أي نص سابق أدناه يجعل اعتماد المشهد شرطًا لبدء الخلفية أو يحصر العمل بتصحيح الوثائق تجاوزه هذا التفويض. لا بناء من الصفر، ولا محرك وكيل بديل صامت، ولا Dashboard بدل العالم، وتبقى الأتمتات المجدولة القديمة متوقفة. لا دمج تلقائي أو شراء غير معتمد أو نشر مدفوع.

> وثيقة تاريخية لشريحة v0.1، وليست أمر تنفيذ حاليًا. أحدث قرار في `docs/DECISIONS.md` والتوجيه الحالي في `CLAUDE.md` يحكمان NEXUS ONE: اختيار وشراء أصل محدد بعد الموافقة → تشغيل واعتماد المشهد → تخصيص محدود → ربط الوكيل الرئيسي بمحرك قائم → المتخصصون → التوسع. تعليمات «ابدأ من الصفر»، ومنع 3D، وترتيب البناء أدناه تخص الماضي ولا تُطبّق على NEXUS. طلب الاستئناف الحالي لتصحيح الوثائق فقط؛ لا يستأنف تنفيذ هذا الأمر القديم.

أنت تبني النسخة التنفيذية الأولى من AHMED Agent في هذا المجلد الفارغ.
المطلوب Vertical Slice واحد حقيقي يعمل من تطبيق الهاتف حتى التنفيذ والتحقق والنتيجة.
ليس Framework، وليس تصميمًا نظريًا، وليس عشرات الخصائص.

## 0. قواعد العمل (إلزامية)
- ابدأ من الصفر في هذا المجلد. لا تقرأ ولا تفتح ولا تستورد أي مشروع أو Repository سابق.
- اعمل بالتسلسل في جلسة واحدة. لا subagents، لا مهام متوازية، لا Task agents.
- اتخذ القرارات التقنية الصغيرة بنفسك ولا تتوقف لتسأل. سجّل القرارات المهمة في التقرير النهائي.
- قبل أي إضافة اسأل: هل هي لازمة لنجاح هذا الـSlice؟ إذا لا، لا تضفها.
- اعمل git commit بعد كل مرحلة.
- إذا وُجد ملف docs/VISION.md فهو للسياق فقط. عند أي تعارض، هذا الأمر هو الحاكم.

## 1. الستاك (محسوم)
- Monorepo بـ npm workspaces:
  - apps/core: Node.js + TypeScript + Fastify
  - apps/mobile: Expo + TypeScript (يُشغَّل عبر Expo Go)
  - packages/contract: أنواع TypeScript للعقد يستخدمها الطرفان
- قاعدة البيانات: SQLite (better-sqlite3).
- مزود نموذج واحد: Anthropic Claude API. المفتاح ANTHROPIC_API_KEY واسم النموذج MODEL_NAME من env فقط.
- الاختبارات: Vitest.

## 2. المعمارية
Ahmed App → Core API → Agent Core → State Machine → Model / Tools
- التطبيق واجهة إدخال وعرض فقط. لا منطق وكيل فيه، ولا يتصل بمزود النموذج.
- Agent Core صاحب القرار والحالة والصلاحيات.
- n8n غير مربوط في هذه المرحلة.

## 3. البيئة والتشغيل
- الـCore يعمل على كمبيوتر أحمد ويستمع على 0.0.0.0، والهاتف على نفس شبكة الواي فاي.
- رابط الـCore في التطبيق من EXPO_PUBLIC_CORE_URL.
- مصادقة: APP_TOKEN في env الـCore، والتطبيق يرسل Authorization: Bearer (من EXPO_PUBLIC_APP_TOKEN). أي طلب بدون token صحيح يُرفض بـ401.
- أنشئ .env.example للطرفين. لا أسرار داخل الكود.

## 4. مساحة الملفات
- كل الملفات داخل WORKSPACE_ROOT واحد (افتراضيًا ./workspace في الـCore).
- الملف المرفوع من الهاتف يُحفظ في workspace/inbox/.
- كل مسار يُحل بـrealpath ويجب أن يكون داخل WORKSPACE_ROOT. ارفض .. والمسارات الخارجية والـsymlinks التي تخرج منه.

## 5. العقد: V0_CONTRACT.md
أنشئه أولًا في جذر المشروع، وطابقه حرفيًا في packages/contract.
- الطلب: contract_version, request_id, conversation_id, input_type ("text" | "file"), message, attachments, client_context (اختياري)
- الرد: contract_version, request_id, response_type, task_id, status, message, data, error
- response_type: MESSAGE | TASK_STATUS | APPROVAL_REQUEST | RESULT | ERROR
- طلب الموافقة (داخل data): action_id, idempotency_key, operation, description, tool, affected_resource, destination, risk_level, expires_at
- قرار الموافقة: action_id, decision ("APPROVE" | "REJECT")

## 6. State Machine
الحالات فقط: RECEIVED, PROCESSING, WAITING_FOR_APPROVAL, APPROVED, REJECTED, EXECUTING, VERIFYING, COMPLETED, FAILED
- عرّف الانتقالات المسموحة صراحة في الكود، وأي انتقال غير مسموح يرمي خطأ.
- مهمة قراءة: RECEIVED → PROCESSING → COMPLETED
- مهمة كتابة: RECEIVED → PROCESSING → WAITING_FOR_APPROVAL → APPROVED → EXECUTING → VERIFYING → COMPLETED أو FAILED، أو → REJECTED
- الحالة محفوظة في SQLite، وليس في الذاكرة.
- عند تشغيل الـCore: أي مهمة عالقة في EXECUTING تنتقل إلى VERIFYING ويُفحص الواقع الفعلي على القرص. لا يُعاد التنفيذ أبدًا.

## 7. الأدوات
Tool Registry يحدد risk_level لكل أداة في الكود. النموذج يختار الأداة والمدخلات، لكن الـCore هو من يقرر الحاجة للموافقة بناءً على الـRegistry، وليس على حكم النموذج.
- read_file (risk: read): يقرأ txt و md و pdf (استخراج النص). أي نوع آخر يرجع ERROR واضح.
- move_file (risk: write): ينقل ملفًا داخل الـworkspace فقط. ينشئ مجلد الوجهة إن لم يوجد. يفشل إذا وُجد ملف بنفس الاسم في الوجهة، بدون overwrite.
- لا يوجد حذف بأي شكل في هذه النسخة.
- move_file لا تُنفذ إلا بموافقة صالحة وغير منتهية، مطابقة لنفس task_id و action_id و idempotency_key.

## 8. الموديل
واجهة صغيرة واحدة ModelClient، وتطبيق Anthropic واحد يستخدم tool use، و FakeModelClient للاختبارات.
الـCore يحفظ رسائل المحادثة ومرفقاتها لكل conversation_id، حتى يفهم "انقل الملف" بعد طلب التلخيص.

## 9. الـAPI
- POST /v1/messages: multipart، حقل payload (JSON حسب العقد) + ملف اختياري
- GET /v1/tasks/{task_id}
- POST /v1/tasks/{task_id}/actions/{action_id}/decision
- GET /v1/conversations/{conversation_id}: الرسائل والمهام، لاستعادة الحالة عند إعادة فتح التطبيق

لا WebSocket، لا Event Bus، لا Microservices. التطبيق يعمل polling كل ثانيتين للمهام غير المنتهية. لا يبقى أي اتصال HTTP مفتوح بانتظار المستخدم.

قواعد القرار:
- تكرار نفس القرار لنفس action_id يرجع الحالة الحالية بدون أي تنفيذ إضافي.
- قرار مخالف بعد تسجيل قرار سابق: 409 بدون تغيير.
- صلاحية الموافقة 15 دقيقة. بعد انتهائها تصبح المهمة REJECTED بسبب انتهاء الصلاحية، بدون أي Side Effect.
- التنفيذ يُحجز داخل transaction (APPROVED → EXECUTING) مع قيد UNIQUE على idempotency_key، بحيث لا ينفذ إلا طلب واحد حتى لو وصل طلبان معًا.

## 10. Audit Log
جدول append-only يسجل: استلام الطلب، استدعاءات الأدوات، طلب الموافقة، القرار، التنفيذ، التحقق، النتيجة، وأي خطأ، مع task_id و action_id والوقت.

## 11. التطبيق
شاشة واحدة فقط:
- محادثة + إدخال نص + زر اختيار ملف (expo-document-picker)
- شارة حالة المهمة
- Approval Card: العملية، الملف، الوجهة، الأداة، مستوى الخطورة، وقت الانتهاء، وزرّا APPROVE و REJECT
- عرض النتيجة
- حالات Loading / Error / Retry
- قائمة بسيطة بالمهام السابقة داخل نفس الشاشة
- يحفظ conversation_id محليًا، وعند إعادة الفتح يستعيد الحالة من الـCore

الشكل: نظيف واحترافي، خلفية سوداء ولمسة ذهبية. لا أنيميشن، لا 3D، لا ثيمات، لا صوت في هذه المرحلة.

## 12. ترتيب التنفيذ
1. V0_CONTRACT.md + packages/contract
2. قاعدة البيانات + State Machine + Audit Log
3. الأدوات + Path validation
4. ModelClient + Agent Core
5. الـAPI + المصادقة
6. الاختبارات
7. التطبيق

## 13. معايير النجاح
اكتب اختبارات Vitest (بـ FakeModelClient) تغطي:
1. قراءة ملف وتلخيصه.
2. طلب نقل ملف يولد APPROVAL_REQUEST.
3. REJECT يمنع التنفيذ تمامًا.
4. APPROVE ينفذ مرة واحدة.
5. تكرار نفس الموافقة لا ينفذ مرتين، بما فيه طلبان متزامنان.
6. إعادة تشغيل الـCore لا تضيع حالة المهمة، ومهمة عالقة في EXECUTING لا تُنفذ مرتين.
7. GET /v1/conversations يعيد الحالة الصحيحة.
8. Audit Log يحتوي الطلب والقرار والتنفيذ والنتيجة.
9. فشل التنفيذ ينتج FAILED واضح، وليس نجاحًا وهميًا.
10. مسار خارج الـworkspace يُرفض، وطلب بدون token يُرفض.
لا تعتبر العمل منتهيًا إلا إذا نجحت كل الاختبارات.

## 14. عند الانتهاء: توقف
لا تضف أي شيء بعد نجاح الاختبارات. أعطني تقريرًا قصيرًا فيه:
- ما تم بناؤه
- أوامر التشغيل خطوة بخطوة: الـCore على الكمبيوتر، والتطبيق على الهاتف عبر Expo Go
- نتيجة الاختبارات
- القرارات التقنية التي اتخذتها
- القيود المعروفة
- خطوات اختبار يدوي للسيناريو كاملًا من الهاتف

## 15. لاحقًا (لا تنفذه الآن)
n8n يُضاف خلف الـCore فقط: Core → authenticated webhook → workflow → Core callback، مع task_id و action_id و idempotency_key. n8n لا يغير حالة المهمة بنفسه.
