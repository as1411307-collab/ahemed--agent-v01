# NEXUS ONE — المتطلب ← التنفيذ ← دليل القبول

21 أكتوبر 2026. المرجع الحاكم: [المشهد الجاهز والتنفيذ المتوازي](NEXUS_SCENE_FIRST_PLAN.md)، مع متطلبات المستخدم v2 في تاريخ المهمة. هذه مصفوفة حالة، لا إعلان اكتمال المنتج. «اختبار عقد» يستخدم خدمات بديلة معلنة داخل الاختبارات؛ لا يثبت اتصال مزود أو Hermes حيًا.

| المتطلب | المسار / الدليل | الحالة والمتبقي |
|---|---|---|
| A / استرداد الموجود وحفظ PR3 | Core القديم لم يُستبدل؛ اختبارات slice وunit تتضمن بصمة النقل وانتهاء الموافقات | الإصلاح الموجود محفوظ؛ لم يُدمج PR2 بالجملة أو تُنسخ حلقة تخطيطه كبديل Hermes |
| SSRF | `services/publicHttpGet.ts` مع `test/security/publicHttpGet.security.mjs` من فرع الإصلاح نفسه | 86 حالة أمنية معزولة؛ HTTP العام غير مكشوف كأداة تنفيذ مفتوحة؛ لا دليل شبكة حي |
| المصادقة والهوية | `nexus/server.ts` مصادقة كل المسارات، تذاكر عرض قصيرة العمر محدودة القراءة | حساب مالك واحد؛ لا ادعاء RBAC متعدد المستخدمين أو TLS نشر |
| Gateway رفيع | `nexus/server.ts` و`main.ts`؛ entrypoint مستقل عن مفتاح مزود النموذج | يعمل محليًا مع غياب Hermes؛ لا loop بديل |
| Hermes / P2 / A03 | `nexus/hermes.ts`، عقود Runs/status/events/approval/steer/stop/capabilities | محوّل مع اختبارات عقد؛ لا runtime مثبت أو مهمة Anthropic حقيقية؛ الاعتماد ووسيط إنفاذ السياسات/الإنفاق عائقان |
| تثبيت نسخة المحرك | `docs/HERMES_COMPATIBILITY.md` مصدر v0.22.2 وSHA | مصدر رسمي فُحص؛ ليس إثبات النسخة المثبتة محليًا |
| الوكيل الرئيسي | تعريف principal في `nexus.config.json`، إرسال تعليمات للمحرك الأصلي عبر Runs | التعريف والإرسال مشروطان ببوابة الإنفاذ؛ التشغيل الحقيقي blocked بأمان |
| المتخصصون / التفويض والدمج | سبعة أدوار قابلة للإعداد؛ أحداث subagent تُطبّع عند ورودها من Hermes | التعريفات منفذة، المتخصصون معطلون افتراضيًا؛ لا تنفيذ تفويض/جمع نتائج مثبت بعد |
| صلاحيات الأدوات / A04 | Allowlist بالإعدادات؛ بحث الويب يفحص دور research والتكامل؛ approvals exact request_id/once/deny | أدوات Hermes الحساسة لم تُفعّل؛ وسيط fail-closed عند حد تنفيذ الأداة مطلوب قبل تمكين Runs |
| الموافقات المتعددة والمنتهية | مهمة/run/request محدد + native pending status + TTL محلي وأصلي | اختبارات عقد تطابق/انتهاء؛ تعارض طلبات متزامنة عبر المحرك الحقيقي ما زال يحتاج اختبارًا |
| STOP / A05 / Emergency Stop | request/stopping منفصلان عن الحالة النهائية، unknown submission يبقى غير مؤكد | اختبارات عقد ناجحة؛ لا ضمان لعكس أثر مكتمل أو إيقاف داخلي لحظي؛ PAUSE غير مدعوم |
| EDIT / CHANGE ROUTE / مراجعة الخطة | steer عند الحد التالي فقط، بطاقات واجهة ومخطط أدوار | مسارات التنفيذ القابلة للتحرير ونقاط توقف ما قبل الدمج/تعارض الأدلة لم تنفذ بعد؛ لا زر يوهم بدعمها |
| Event Bus / A06 | `nexus/state.ts` سجل append-only مع sequence لكل stream وeventId وmission/run/configRevision | حفظ/dedupe/استعادة/cursor واختبارات أكثر من 1000 حدث؛ SSE حقيقي من Gateway، upstream gaps معلنة |
| استمرارية المهمات | mapping SQLite؛ استعادة المراقبة دون إعادة إرسال أداة أو run غير معروف | اختبارات حفظ وإعادة فتح وعقود؛ إطفاء GPU غير مرتبط بعمر المهمة؛ يلزم اختبار محرك حي بعد restart |
| التكلفة / A07 | حجز integer microUSD، SQLite BEGIN IMMEDIATE، UTC liabilities، measured/estimated/unknown | سقف قبول افتراضي 5 USD/UTC و1 USD/mission؛ اختبار عمليتين متنافستين. ليس ضمان سقف Hermes/GPU؛ Runs محجوبة حتى الإنفاذ |
| nexus.config.json | ملف desired فقط + import/export + validation + إصدارات SQLite | APPLY يكتب الملف ذريًا؛ Preview لا يكتبه. عند restart يستورد الملف المعتمد، والتاريخ/الحالة/الأسرار منفصلة |
| EDIT/PREVIEW/VALIDATE/APPLY | Studio ومسارات config؛ expectedRevision و409 | منفذ محليًا؛ world pending_connection وengine next_session؛ لا ادعاء تطبيق مرئي في Unreal |
| Undo/Redo/History/Restore | مسودة واجهة + immutable versions/restore new revision | منفذ؛ Save/Duplicate Preset ومقارنة نسخ متقدمة غير مكتملة |
| Models / Prompts / Tools / Governance | JSON editor ومخطط أدوار؛ secretRef فقط، سقف لا يزيد عن التفويض | منفذ تعريفًا وتحققًا؛ مواءمة observed provider settings مع Hermes لم تثبت |
| React/TS/React Flow / P3 | `apps/studio` واجهة حقيقية تتصل بالخادم، لا اتصال مباشر بمزود | build/typecheck؛ ترتيب العقد Preview فقط وليس محرر مسارات تنفيذ بعد |
| بحث ويب حقيقي | `nexus/integrations.ts` Tavily HTTP الفعلي + مصادر URLs + budget/permissions | ليس placeholder؛ غياب TAVILY_API_KEY وتسعير موثق يمنع التشغيل. الاختبارات fixtures ولا تدعي بحثًا حيًا |
| MCP / A08 | initialize → initialized → tools/list مع session/version | discovery منفذ لـHTTP JSON loopback؛ tools/call وMCP SSE/خوادم بعيدة محجوبة حتى سياسة تنفيذ وشبكة مثبتة |
| Composio | حالة unavailable في Hub | يحتاج ربط حساب وواجهة مزود موثقة؛ لا Connected وهمي |
| n8n اختياري قابل للاستبدال | health test مستقل عن محرك المهمات | تنفيذ workflows/callbacks وتوقيعها لم يفعّل؛ لا أتمتات مجدولة مستأنفة |
| Ollama اختياري | اختبار /api/tags loopback وإظهار inventory | يحتاج خدمة على جهاز الخادم؛ ليس اتصالًا تلقائيًا بلابتوب أحمد؛ لا تنزيل نماذج أو paid fallback |
| بريد قراءة فقط | الحالة unavailable | لا اعتماد بريد أو adapter مفعّل؛ لا إرسال رسائل |
| Memory مستقلة عن RAG | إعادة استخدام MemoryService مع اتصال SQLite مستعار وحفظ metadata | اختبارات metadata/restart؛ ذاكرة Hermes الأصلية تبقى منفصلة، لا ادعاء sync ثنائي الاتجاه |
| الملفات / Knowledge Vault / الاستشهادات | workspace validator وreadFileTool الموجودان؛ `nexus/knowledge.ts` hash/chunks/source/ACL | فهرس نصي lexical فعلي، حفظ نسخ وأرشفة دون حذف؛ لا تسميته vector RAG |
| PostgreSQL / pgvector / embeddings | لم تُهاجر قاعدة سليمة بلا داعٍ | غير منفذ؛ يلزم PostgreSQL فعلي ومزود embeddings واختبارات ACL/rebuild/dimensions؛ لا شرط يسبق المشهد |
| Mission Theater | مهمات/نتائج/أحداث/موافقات وتكلفة في Studio | العرض الأساسي منفذ؛ خطة تفصيلية ومصادر تعارضات ودمج متعدد الوكلاء تحتاج مهمة حية |
| Replay / P4 | GET events قراءة فقط وseek في Studio | لا إعادة tools/approvals؛ تاريخ محدود بصفحات 1000، يلزم توسيع واجهة pagination للمهمات الطويلة |
| Camera Intelligence / Event Director | `nexus/director.ts` تحويل بصري خالص، reducedMotion/hold أثناء الموافقة | عقد أولي مختبر؛ حساسية/تركيز متقدم وتصميم صوت ومؤثرات Unreal غير منفذة |
| NEXUS CORE | `nexus/worldBridge.ts` حالات النواة وعقد المشهد | حالات صوتية لا تُعرض كحقيقية دون صوت؛ النواة الثلاثية نفسها تنتظر الأصل/Unreal |
| Unreal Bridge / A09–A10 | snapshot + events + read-only 60s viewer ticket؛ لا أداة حساسة من العالم | عقد وخادم منفذان؛ لا Unreal plugin/build. التذكرة لا تسمح بتعديل config أو تنفيذ مهمة |
| P1 / A01 / جودة العالم | أصل جاهز قابل للتحرير ثم اعتماد سعر وشراء وتشغيل | blocked: لا أصل مقتنى أو Unreal/GPU أو build/video؛ لا صور مولدة بديلة ولا ادعاء 60 FPS |
| A02 / تعديل العالم من Architect | desired config + pending world state | عقد محفوظ؛ يلزم عالم أصل حقيقي لتأكيد التطبيق المرئي |
| SKY SANCTUARY | أول مشهد، luxury/clouds/curved glass/gold/navy | معتمد تصميمًا؛ ليس مبنيًا. لا بناء البيئة أو التحكم من الصفر قبل تقييم الجاهز |
| P4 / FUTURE MEGACITY وCOSMIC OBSERVATORY | scene enum مشتركة دون إنشاء session | إعدادات فقط؛ المشهد الفضائي معتمد لاحقًا، لا ثلاث بيئات جاهزة مزعومة |
| الأداء / Pixel Streaming | مستويات جودة بالإعدادات | هدف 1080p60 على جهاز مناسب فقط؛ لا قياس GPU أو بث أو 4K في البيئة الحالية؛ لا نشر مدفوع |
| الصوت / accessibility | reducedMotion والتباين ونص الحالة وPreview | لا STT/TTS/LiveKit؛ MetaSounds تنتظر Unreal؛ HTML ليس عالم المنتج |
| حماية الأسرار والتدقيق | env خادمي، رفض حقول إعدادات مجهولة، audit/events append-only | لا API keys في frontend/Unreal؛ hash-chain/خزنة مستقلة واعتمادات متعددة الهوية متبقية |
| عدم الحذف/الدمج/الدفع | حافظنا على الموجود والأرشفة؛ فرع مستقل | لا دمج main أو شراء أو paid deployment أو استئناف أتمتات |

القبول النهائي A01–A10 غير مكتمل. الاختبارات المنفذة تثبت الشريحة المحددة أعلاه فقط؛ تبقى المهمة الحقيقية من الطلب إلى الأثر المحمي والنتيجة المتحققة، ثم التفويض الفعلي، ثم الربط بالعالم المشترى، بوابات قبول مطلوبة.
