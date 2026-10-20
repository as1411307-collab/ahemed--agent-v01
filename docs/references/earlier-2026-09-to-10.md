# ما أرسله أحمد قبل 20 أكتوبر — مراجع وأدوات (23 سبتمبر → 13 أكتوبر 2026)

كل بند: التاريخ، المصدر، وش فيه، ووش طلع منه. بدون حذف. المحادثات على claude.ai مذكورة بروابطها.

## 23 سبتمبر — أول نموذج HTML (محادثة "تحية")
https://claude.ai/chat/ffaccd16-bc50-4813-9889-7ac9e51eeff3
- أحمد أرسل فيديوهات مرجعية، وطلع منها نموذج بثلاث شاشات: شات مع **كرة تفكير متحركة** (حالات idle / listening / thinking / composing / error بتسميات عربية)، **رسم شبكة ذاكرة** (force-directed graph يستخرج المواضيع من المحادثة)، و**شجرة الفريق** (منسّق + وكلاء فرعيون: باحث، محلل، كاتب، منفّذ).
- RTL كامل، خط **Alexandria** العربي، وضع فاتح/داكن، حفظ محلي.

## 24 سبتمبر — تطبيق Expo بثلاث مراحل (محادثة "تصميم واجهة تطبيق عصري بتأثيرات نيون")
https://claude.ai/chat/064adb7d-cdc3-4bbc-80b8-267e9277c388
- Expo SDK 57 + React Native 0.86 + Expo Router + TypeScript. المرحلتان 1 و2 مبنيتان (ثيم وخلفية متحركة، حركة وتغذية راجعة)، والمرحلة 3 (إعدادات كاملة) مخططة.
- نظام التصميم: خلفية سوداء نقية، لوحات Glassmorphism، ألوان مميزة (neon / gold / violet / مخصص)، **ميلان 3D بحركة الجهاز**، **مؤثرات صوتية من Kenney (CC0)**، اهتزاز لمسي، تبديل عربي/إنجليزي RTL بدون إعادة تشغيل، إيقاف الحركة للوصول وتوفير البطارية.
- قرارات تقنية من البحث: `expo-sqlite/kv-store` للتخزين (يشتغل في Expo Go)؛ السحب لإعادة الترتيب ومنتقي الألوان والمنزلقات تُبنى بـ gesture-handler + Reanimated + Skia الموجودة؛ تجنّب `react-native-mmkv` (يحتاج dev build)، `react-native-sortables` (خطأ #579 مع SDK 57)، `react-native-draggable-flatlist` (غير مصان)، `@expo/ui` ColorPicker (iOS فقط). نظام `dir` المخصص للـ RTL أفضل من `I18nManager.forceRTL` (يحتاج إعادة تشغيل) ومن Yoga `direction:'rtl'` (مكسور على Android).
- طلع ملف `CLAUDE.md` لنظام التصميم: ربط قيم Figma بالـ tokens، كتالوج المكونات، الاتجاه، الأيقونات، الأصول، وسير العمل من Figma للكود.

## 25 سبتمبر — تطبيق ويب كامل "أحمد — وكيلك الشخصي" (محادثة "Building a presence renderer")
https://claude.ai/chat/4b3bb659-fa1e-4759-b241-33cfd0cfc9b0
- تطبيق صفحة واحدة بوحدات ES مجمّعة بـ esbuild: **لوحة "حضور" حية بـ14 حالة تعبيرية**، خلفية نجوم محيطة، حلقة مهمة كاملة (فهم → خطة → تنفيذ بأدوات حقيقية → تحقق → تسليم)، بحث عربي بـ BM25، استخراج نص من PDF وWord في المتصفح، أغلفة مولّدة للمستندات، **صوت مولّد بالكود بدون ملفات**، تعرف على الكلام ونطق، IndexedDB، ذاكرة طبقية ظاهرة للمستخدم. خمس شاشات (Home, Thread, Goals, Files, Memory, Settings).

## 27 سبتمبر — أربعة فيديوهات + مواصفات غرفة العمليات (محادثة صوتية "Greeting")
https://claude.ai/chat/50bf44cb-5e0f-49af-97f7-ff40b67e3fc2
- الفيديو 1: كور متوهج بتوهج متعدد الألوان (سماوي ووردي وأخضر) — سؤال اللون وقتها: الذهبي أساس والتوهج الملون داخل الكور.
- الفيديو 2: **Graphify** — يحول أي بيانات (حتى الكود) لشبكة نقاط وخطوط ملونة على خلفية سوداء.
- الفيديو 3: مكتبة **thinking-orbs** (npm، مفتوحة المصدر، Jakubantalik/thinking-orbs): تسع حالات جاهزة لحركة "التفكير" (كرة منقطة، خطوط، كبسولة، حلقة، نجمة…) تمثل Connecting / Searching / Loading؛ Canvas مب WebGL، خفيفة، 60 إطار، تحترم تقليل الحركة. أساس جاهز لمحرك حالات الكور.
- الفيديو 4: **أربعة أنواع agent loops**: Turn-based، Goal-based، Time-based، Proactive — منطق تشغيل الوكيل، وهو المرجع اللي قال عنه أحمد "تشوفه كيف مساره يمشي، وين واقف، وين رجع".
- قرارات يومها: التطبيق هو غرفة العمليات نفسها؛ تتبع المسار حي ومربوط ببيانات حقيقية من GitHub؛ تعديل الروابط يدوياً.
- الناتج: **مواصفات شاشة غرفة العمليات (النسخة النهائية)** — محفوظة في `ops-room-spec-2026-09-27.md`.

## 29 سبتمبر — ملفات مرفوعة (محادثة "تطبيقات متابعة سير العمل والأتمتة")
https://claude.ai/chat/7ee660e7-d6fa-4a02-a0d8-f4f4b3b3f232
- **Hugging Face Spaces** (`3d-generation.md`، `3d-cuda-extensions.md`، README): بناء تطبيقات توليد مجسمات 3D على ZeroGPU؛ الأسهل نسخ Space رسمي مثل TRELLIS.2 أو Hunyuan3D؛ لا مكتبات CUDA في `requirements.txt` (wheels جاهزة)؛ الاستدعاء عبر Gradio Client.
- **Figma MCP** (`tools-and-prompts`، `create_design_system_rules_text`، `bringing-make-context-to-your-agent`، `figjam-diagram-mcp-app`): `create_new_file` → `use_figma` للشاشات → برومبت `create_design_system_rules` يطلع ملف قواعد (مثل CLAUDE.md) → Code Connect (`add_code_connect_map`) → `get_design_context` للكود (React + Tailwind افتراضياً) → `get_metadata` للفريمات الكبيرة → `download_assets` → `get_screenshot` للمقارنة.
- **Cloudflare Workers** (`workers-prompt-full_text`): برومبت جاهز يولّد TypeScript + `wrangler.jsonc`؛ D1 للبيانات المنظمة، KV للإعدادات، R2 للملفات؛ الواجهة في Workers Static Assets مع الـ API؛ مكتبة `agents` لو فيه وكيل؛ النشر `wrangler deploy`.
- **Exa** (`tools_list`): قائمة أدوات البحث مع `agent_run`.
- ترتيب البداية المستخرج: التصميم أول، ثم ملف القواعد، ثم توليد الواجهة، ثم الباك إند.

## 30 سبتمبر — Base44 (محادثة "الحديد الإيجنت")
https://claude.ai/chat/37e932d9-3fa2-41b9-b873-35072f6dcff4
- تطبيق "Chaos Control" على Base44 شبه فاضي (لا صفحات ولا n8n)؛ القراءة المباشرة للكود تحتاج خطة Builder. ملاحظة: وجود واجهتين (Base44 + ريبو) يعيد مشكلة خلط السياق؛ مفتاح n8n لازم يكون في backend function مب الواجهة.

## 4 أكتوبر — الأدوات الجاهزة والصوت (محادثة "تطبيقات في Base44")
https://claude.ai/chat/64f85d76-e157-44f7-8559-4c25334b41db
- لقطات أحمد: **n8n Cloud** فيه Gateway credits مضمّنة (4,000/شهر تتجدد).
- بدائل استضافة أخف من VPS: PikaPods، InstaPods، Elestio، Railway. (n8n Cloud يشتغل 24 ساعة بدون اللابتوب.)
- **RubenM1990/APEX-UI** (رابط أرسله أحمد): واجهة بصرية بحتة لـ"مجلس" 18 وكيل خياليين، بدون باك إند ولا LLM (حالات بحركات موقوتة)، MIT — تصلح كهيكل واجهة فقط.
- تقرير "تقييم الأدوات الجاهزة لـ AHMED Agent" (الخلاصة): أعد الاستخدام في البحث (`web_search`/`web_fetch` من Claude، أو Tavily/Exa/Brave/Firecrawl عبر MCP)، الوصول عن بُعد (**Tailscale**)، التكاملات (خوادم MCP الرسمية لـ Gmail/Calendar/GitHub + n8n للجدولة والـ webhooks عبر MCP Server Trigger)، المراقبة (**Langfuse**)، الصوت (expo-audio + STT). هجين في RAG (pgvector/Qdrant/Chroma + LlamaIndex، مب Simple Vector Store)، الذاكرة (جدول في SQLite بنمط memory tool)، المهام الطويلة، الحماية من الحقن (OWASP MCP). ابنِ أنت: الموافقات وidempotency والتدقيق والتحقق. الخيار المعماري الموصى به: الكور هو العقل، وn8n وMCP طبقة أدوات خلفه. تحذير: ثغرات n8n الحرجة 2026 (CVE-2026-21858 "Ni8mare"، CVE-2026-21877) → لا تكشف n8n للإنترنت.
- خارطة طريق مقترحة يومها: v0.3 بحث الويب، v0.4 تشغيل دائم ووصول آمن، v0.5 n8n، v0.6 RAG، v0.7 الذاكرة.
- الصوت العربي: Claude ما يدعم العربي في الصوت حالياً؛ ChatGPT (GPT-Live) الأقوى تقنياً؛ Gemini Live 10 أصوات؛ Grok 6 أصوات. اختيار صوت حر أو صوتك: ElevenLabs أو Grok Custom Voices فقط. مزودون للمقارنة: ElevenLabs Agents، OpenAI Realtime، Gemini Live API، Deepgram، Hume، Cartesia، Azure Voice Live، Vapi، Retell، LiveKit Agents، Pipecat.
- فكرة أحمد للوكيل: يسأل عدة نماذج سؤال بحث واحد ويرجّع أصح جوابين، بالاعتماد على المصادر (شبيه Perplexity "Model Council").

## 10–14 أكتوبر — الريبو والسكلز (محادثات "مشاكل الكود واللابتوب" و"تشغيل الكور على اللابتوب")
https://claude.ai/chat/961287f2-c9ef-4f99-b0e9-c1169f35b10c · https://claude.ai/chat/93d4d03a-eb67-40e0-b954-c34973cd1a22
- الريبو صار خاصاً؛ 17 سكل مخصص انضافوا (`explain-in-gulf-arabic`، `agent-spawn-guard`، `where-we-stopped`، `fresh-start`، `discuss-before-doing`، `session-budget`، `secrets-guard`، `pre-push-check`، `decisions-log`، `arabic-rtl-ui`، `ahmed-design-taste`، `show-me-screenshot`، `run-locally`، `find-docs`…) + سكلز Anthropic (frontend-design، theme-factory، skill-creator، web-artifacts-builder، mcp-builder، docx/pdf/pptx/xlsx).
- طلب دمج الصوت (Codex) انقفل بدون دمج؛ أرشيف `archive/core-v0.1` و`archive/core-v0.2`.
- الكور على اللابتوب في `C:\dev\ahmed-agent-v01` ونسخة احتياطية `C:\dev\ahmed-agent-backup-20261010-014633`.

## 13 أكتوبر — سكل agent-app-studio ومكتبة البرومبتات والاستخراج (محادثة "تطبيق جوال متعدد الوحدات")
https://claude.ai/chat/f95b8f96-e3c7-4678-931d-9447e33e057f
- سكل **agent-app-studio** (في حساب أحمد على claude.ai): 9 مراحل بوقفة بعد كل مرحلة، ومراجع بصرية، ومنصات جاهزة، وسجل قرارات، والأسئلة الأربعة (يشوف شو يسوي الوكيل؟ يوقفه؟ يستأذن؟ يعرف التكلفة؟).
- نموذج "غرفة العمليات" بإيجنت وهمي (سيناريو "أرخص رحلة لمسقط") بثلاث ثيمات (ذهبي / HUD / جمر)، أرضية WebGL تتفاعل مع حالة الوكيل، لوحة مسار بمنظور، شات زجاجي، موافقة، إيقاف، عداد تكلفة.
- أدوات الفيديو (Duncan) نُزّلت وطُبّقت على النموذج: **UI UX Pro Max** (أسلوب Modern Dark Cinema وSpatial UI)، **design-motion-principles** (kylezantos) مع قائمة "علامات تصميم الذكاء الاصطناعي"، **Taste Skill** (Leonxlnx) "قفل الشكل" وأيقونات **Lucide**.
- **ThreeUI** (MengTo/threeui، MIT): خلفيات وأبطال 3D وشيدرز؛ مكوناته المناسبة: constellation-field، connectivity-graph، signal-particles، platform-core، diagnostics-panel، thinking-button، performance-gauges، topo-field، uplink-loader.
- **مكتبة البرومبتات** (`prompt-library-2026-10-13.html`): 6 برومبتات ThreeUI، 10 من React Bits (Lightfall، Dot Grid، Grid Scan، Particles، Faulty Terminal، Prompt Bar، Star Border، Count Up، Decrypted Text، Target Cursor)، طريقة GetLayers الخمس خطوات + 3 مشاهد مكتوبة عليها، 5 أساليب من UI UX Pro Max (HUD / Sci-Fi FUI، Modern Dark Cinema Mobile، Spatial UI visionOS، Cyberpunk Mobile HUD، Glassmorphism) + أمر توليد نظام تصميم، برومبت motionsize.ai، وأوامر تثبيت السكلز.
- **الاستخراج الكامل للحزم 2–5** (`extraction-2026-10-13.md`): GetLayers، React Bits، Reznikov Command Deck، شكل كانفس n8n، ClickUp Brain²، سلّم LLM/RAG/Agent/Agentic، Termux:Tasker، Nexus (@builtbyruturaj)، سلسلة JARVIS OS 2.0 (Chase AI: Jev، Obsidian vault، Whisper + Kokoro، Cockpit + HUD)، 8 Essential AI Concepts، n8n (عقدة AI Agent، Send for Human Approval، التثبيت، Hostinger VPS)، خطوات Sama لـ Claude Code (CLAUDE.md، قاعدة الذاكرة، Grounding rules، JSON للوركفلو)، أطر الإيجنت، Bright Data، HighLevel، cmux، Hermes-Apollo / Hermes Agent (@isecreams)، Top 12 RAG Concepts، Composio (docs، Quickstart، Session)، Gabster.ai، Jev vs LLMs (@kodekloud)، Jev + Needle 3، "3 levels of AI in 2026"، @venom__code.
