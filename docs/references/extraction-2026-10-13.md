# استخراج المراجع — 13 أكتوبر 2026 (محادثة "تطبيق جوال متعدد الوحدات")

مصدر: https://claude.ai/chat/f95b8f96-e3c7-4678-931d-9447e33e057f — أحمد أرسل خمس حزم من الصور والفيديوهات وطلب: "لا تنفذ ولا تخترع وتستبعد مواد، اجمع جميع المعلومات واستخرج منها العملي"، وفصلها في ثلاث فئات: تعليمات لبناء التطبيق، تعليمات لبناء الإيجنت، تعليمات أخرى. هذا الملف ينقل الاستخراج كما خرج يومها، بدون حذف.

> الحزمة 1 (فيديوهات 5 AI projects / design skills / ThreeUI) انتهت في مكتبة البرومبتات: `prompt-library-2026-10-13.html`.

---

## الحزمة 2 — 3 فيديوهات + 13 صورة (فيديو ThreeUI مكرر)

**1. GetLayers (getlayers.ai)**
مكتبة صفحات هبوط جاهزة (Three.js + Next.js) مع زر "Copy the Prompt" وفيها MCP.
- التعليمة: ما تصمم من الصفر، تختار قالب قريب وتنسخ البرومبت وتعدّل عليه.
- ما يهمنا: أسلوب "مكتبة → نسخ برومبت → تعديل" ينطبق على شاشات التطبيق.

**2. React Bits – خلفية Lightfall**
خلفية "مطر ضوء" بإعدادات حية: لونين، لون خلفية، ضوء يتبع المؤشر، سرعة، عدد الخطوط، عرضها، طولها، كثافة، وميض، توهج، تكبير، قوة المؤشر. وزر "Copy Prompt" و"BG Studio".
- التعليمة: الخلفية تكون **مكوّن له مقابض** (parameters)، مو صورة ثابتة. كل ثيم عندك = مجموعة قيم لهالمقابض.

**3. kevin.snippet – "6 حركات ترفع مستوى الموقع"**
شفت منها "Micro Interaction" (رد فعل الكروت عند المرور عليها).
- التعليمة: الحركة الصغيرة اللي ترد على المستخدم (hover/press) أهم من الحركة الكبيرة اللي تشتغل لحالها.

**4. motionsize.ai – موقع 3D بـ GPT-6 Astra**
البرومبت المستخدم كان: "موقع من 4–5 أقسام، خلفية فيديو تتحرك مع السكرول، شكل 3D، حرّك الصورة، ولّد 3 فيديوهات بـ Kling 3.0 كل واحد 4 ثواني، لكل قسم فيديو".
- التعليمة: الإحساس بالـ 3D ممكن يجي من **فيديوهات قصيرة مولّدة** كخلفيات بدل WebGL. (تحذير من الفيديو نفسه: خطة Ultra تحرق الرصيد بسرعة.)

**5. ThreeUI – مكونات Three.js**
خلفيات، أبطال 3D، شيدرز، أزرار، نصوص متحركة، 3D assets. مفتوح المصدر، وفيه MCP.
- التعليمة: 3D حقيقي بالنسخ من مكتبة جاهزة، مو من الصفر. المكونات اللي تناسب غرفة عمليات: constellation-field، connectivity-graph، signal-particles، platform-core، diagnostics-panel، thinking-button، performance-gauges.

**6. Reznikov Engineering – "Command Deck"**
شاشة قيادة شخصية: **قلب حي** في النص (حلقة برتقالية ونواة جسيمات سماوية) يتحول لأشرطة طاقة بنفسجية لما يتكلم. فوق: "LIVE · TAP TO STOP". يسار: الطقس والمدينة، آخر خبر، وضع "Voice"، اسم الشاشة "Command Deck". يمين: Chat / Voice Theme / Modes.
- التعليمات: (أ) القلب يعبّر عن حالة الإيجنت بالشكل مو بالنص. (ب) زر الإيقاف دايماً ظاهر فوق. (ج) معلومات محيطة خفيفة على الأطراف (طقس، وقت، آخر حدث) بدون ما تزاحم النص.
- ملاحظة: هذا يرجّع فكرة "القلب الحي" اللي كنا استبعدناها لصالح لوحة المسار. قرار لأحمد.

**7. n8n – شكل الكانفس**
- خلفية نقاط منتظمة (dot grid) على كحلي غامق.
- العقدة: مربع بزوايا مدورة، أيقونة ملونة بالنص، الاسم تحتها، وسطر صغير رمادي للتفصيل (مثل `append`، `sendAndWait: message`).
- منافذ دائرية صغيرة على الجوانب، خطوط بيزييه ناعمة، و"+" في نهاية كل مسار.
- التفرعات لها تسميات على الخط: true/false، done/loop، Input 1/2.
- **عقدة الإيجنت** لها أبناء تحتها بخطوط متقطعة: Model، Memory، Tool، Output Parser، كل واحد دائرة بشعار المزود.
- عقدة "Send for Human Approval" كخطوة واضحة في المسار.
- "Re-run at the click of a button": تثبيت بيانات سابقة للاختبار، وتشغيل خطوة واحدة لحالها.
- التعليمة: الإيجنت في لوحتك يكون عقدة لها أبناء (النموذج، الذاكرة، الأدوات) مو مربع واحد، وكل مسار قابل لإعادة التشغيل من أي خطوة.

**8. ClickUp Brain²**
- الهيرو: رسم شعاعي حول قلب: Self-improving / Self-organizing / Memory / Orchestration، وتحت Orchestration شعارات OpenAI وClaude وGemini، وحوله "شرائح" حية (chat: standup، status: in-prog، #423).
- "Ambient Intelligence": بطاقة حالة "Gathering Data" مع دوّار، وتحتها اقتراحات تطلع لحالها.
- "Deep Search": شريط تقدم مع نص "Reports build in progress".
- التعليمة: اعرض **اللي يصير الحين** كبطاقة حالة واحدة صغيرة (يجمع بيانات / يبني تقرير) بدل سجل طويل، والاقتراحات تطلع قبل ما تسأل.

**9. hackproduct9 – LLM vs RAG vs Agent vs Agentic**
"كل واحد = اللي قبله + قدرة": نموذج → + استرجاع (مستنداتك) → + أدوات في حلقة (يشتغل لين تخلص المهمة) → + تنسيق (منسّق يوزع على: بحث، بناء، اختبار).
- التعليمة: الرسم نفسه فكرة جاهزة لشاشة "كيف يفكر إيجنتك": مهمة → منسّق → إيجنتات فرعية → تم. اللوحة الحالية تعرض المستوى الثالث؛ لو انضافت إيجنتات فرعية صارت الرابع.

**10. Termux:Tasker**
تثبيت Termux وإعطاؤه كل الصلاحيات (أندرويد). مو عن التصميم؛ له علاقة بتشغيل شي على تلفون الأندرويد.

**الخلاصة اللي تتكرر في كل المراجع**
1. انسخ من مكتبة، لا تبنِ من الصفر (GetLayers، ThreeUI، React Bits).
2. الخلفية مكوّن له إعدادات، والثيم = قيم.
3. الحالة تنعرض بالشكل: قلب أو بطاقة واحدة حية، وزر إيقاف ثابت.
4. الإيجنت = عقدة لها أبناء (نموذج، ذاكرة، أدوات)، وكل خطوة تنعاد لحالها.
5. المعلومات المحيطة على الأطراف، خفيفة.

---

## الحزمة 3 — 16 لقطة + فيديوهان

**1. insiderforce** — أسماء أدوات/مهارات لكلود كود: FindSkills، claude-mem، VibeSec-Skill.

**2. ClickUp Brain²** — الهيرو يحط أربع خصائص: self-improving / self-organizing / memory / orchestration.

**3. n8n AI nodes** — عقدة Agent وتحتها أربع عقد فرعية: Model / Memory / Tool / Output Parser. وفيه عقدة اسمها **"Send for Human Approval"**.

**4. ClickUp Ambient Intelligence** — حالة ظاهرة اسمها "Gathering Data"، وميزة Deep Search.

**5. إنفوجرافيك "Top 50 AI Tools"** — قائمة أدوات (محفوظة كبند قائمة).

**6. "Top AI Agent Frameworks"** — LangChain، AutoGen، CrewAI، LlamaIndex، Semantic Kernel.

**7. n8n Sec Ops + Dev Ops (لقطتان)** — وركفلو VirusTotal، ووركفلو Dev Ops AI Agent فيه: Gemini، وثائق Proxmox، عقدة Switch، auto-fixing output parser، Groq.

**8. n8n IT Ops onboarding** — Anthropic chat model + Postgres memory + Entra ID + Jira + Slack.

**9. Sama — Step 6 (البرومبت حرفي):**
> Build me Short Video Automation that generate videos from Veo 3 on my niche House building scratch generate whole house project video 60 Second Reference same like the above and make this upload on Youtube, FB Tiktok or Instagram

النتيجة: كلود يرجّع JSON وركفلو جاهز لـ n8n.

**10. Sama — Step 4 (قواعد التثبيت حرفي):**
> // Grounding rules
> Always reference the "n8n-io/n8n" GitHub repo before building anything.
> Never invent nodes or features that don't exist.

**11. Sama — Step 5** — ترفع 2–3 ملفات JSON لوركفلوهات n8n جاهزة (Gmail labelling، Telegram voice/text assistant، RAG starter) عشان كلود يتعلّم الصيغة، وتبدّل إلى Sonnet 4.5.

**12. Sama — Step 3 (قاعدة الذاكرة حرفي):**
> From now on, whenever I correct you, save it as its own .md file at ~/.claude/projects/{project}/memory/. Index everything in MEMORY.md.

أمثلة الملفات: MEMORY.md، voice.md، preferences.md.

**13. Sama — Step 2 (~/CLAUDE.md)** — الأقسام: Role، Voice، Banned words، Defaults، Push back، Who it is for، Output format، Never do، Tools I use، Projects، How to ask me. والبرومبت حرفي:
> Help me build my CLAUDE.md from scratch. Ask me about my business, my voice, my banned words, my output defaults, and how I want you to work. Save it to ~/CLAUDE.md.

**14. rengatechnologies (لقطتان)** — A.I. Voice Call Agent (سيناريو على Make، 10 مكالمات بنفس الوقت) + Lead Generation AI (research → scraping → qualifying → emailing → follow-ups).

**15. "Best Automation Websites"** — أربعة مواقع بشعاراتها:
- n8n: "AI agents and workflows you can see and control… every step of your agents' reasoning, traceable on the canvas"
- Zapier: "Your tools. Your rules. Any AI." — MCP/SDK/CLI لـ Claude، Claude Code، ChatGPT، Cursor، OpenClaw؛ "450K+ agents built"
- tray.ai: "Enterprise orchestration for data and AI" — اللقطة فيها طرفية Claude Code تنشئ أداة MCP agent تسحب Salesforce objects
- Make: "The visual AI automation platform"

**16. فيديو fc2f0b20** — نسخة مطابقة لفيديو hackproduct9 "LLM vs RAG vs Agent vs Agentic" (الحزمة 2).

**17. فيديو 3744afa8 — @builtbyruturaj "Nexus"** (59 ثانية). النص: "This AI agent took me DAYS to build. Now you can build it in 60 minutes." + "Comment "Nexus" and I'll send you the complete guide". الفيديو ما يذكر أدوات ولا خطوات — الدليل خلف التعليق. اللي يُستخرج منه هو شكل الواجهة:
- مشهد 3D "مكاني" على شاشة منحنية عريضة، ولوحات زجاجية شفافة واقفة على قوس.
- اللوحات: M-01 SOCIAL (ONLINE / PHASE 2 — "10K reach · 1.7K interactions · 3.4% engagement · +63% growth in 30d" — FOLLOWERS 9.9K / +3.9K — المصدر INSTAGRAM GRAPH API)، M-02 MARKETS (MARKET CLOSED — $46K / +15.61%)، M-03 PROJECTS (ONLINE / PHASE 2 — "The React Framework" — 08 / 6186)، M-07 COGNITION (SYNC / PHASE 3 — "reserved for Phase 3 activation")، INTEL (24 / 3)، AUDIO (spatial audio … library synthesis)، وكمان WEATHER وSYSTEM.
- تركيبة كل لوحة ثابتة: كود M-xx + شارة حالة (ONLINE / SYNC / MARKET CLOSED) + شارة PHASE + أيقونة + عنوان + سطر وصف + خط TELEMETRY صغير + رقمين KPI + سطر مصدر تحت.
- شريط جانبي يسار بعنوان NEXUS فيه قائمة حالات (STATUS: OPERATIONAL … STANDBY … OFFLINE)، لوج نصي أسفل اليسار، ساعة وودجات صغيرة أعلى اليمين، شريط إدخال أسفل الوسط.
- تدفق التفاعل: سؤال → رسالة "Understood. Give me a moment." → اللوحات تتحلل إلى جزيئات → الجزيئات تتجمع برأس أفاتار أزرق ثلاثي الأبعاد يتكلم (حركة شفاه + ترجمة سفلية تقرأ أرقام SOCIAL) ويلوّح بيده → "Returning to spatial mode." → الأفاتار يتحلل جزيئات → اللوحات ترجع.
- (ملاحظة لاحقة من DECISIONS.md: لا شخصيات ولا وجوه؛ الأفاتار هنا مرجع للحركة فقط.)

---

## الحزمة 4 — 19 لقطة (مقسمة: تطبيق / إيجنت / أخرى)

### أ) تعليمات تخص بناء التطبيق (الواجهة / غرفة العمليات)

**المصدر: سلسلة "The JARVIS OS 2.0 — ROUTED BY JEV" (Chase AI)**

**1. الغلاف — "Build Your JARVIS OS 2.0 / THE V2 BUILD"**
- الشعار: "one prompt installs it. it runs your whole day →" و"NOW ROUTED BY JEV"
- الترمنل: `> speak  > route  > remember  > RUNS YOUR WHOLE DAY_`
- لقطة الواجهة (JARVIS /V2 — YOUR COMMAND CENTER, REIMAGINED):
  - أعلى: مفتاح Claude Code / Codex، ساعة 17:33:52، سطر حالة "CORE · IDLE · CONNECTED VAULT · TERMINALS · CONNECTED"
  - يسار: SYSTEM VITALS · VAULT DATA (YT SUBSCRIBERS 173K / INSTAGRAM 233K / LATEST VIDEO 53K) · CLAUDE · WEEKLY USAGE 3% used · DIRECTIVES · TOP 3 · DOCUMENTS (Plan Today · Claude / Metrics Pull · Claude) · TRANSCRIPT
  - وسط: كرة جزيئات واسمها CLAUDE — "Original Jarvis core · Claude Code mode" — حالات Idle | Listening | Working | Speaking | Error | Auto — "Ready · Idle" — "Pause motion"
  - يمين: SKILLS QUICK ACCESS · VOICE TAP TO TALK · Schedule · AI WIRE · MORNING INTEL
  - أسفل: Terminals 0 open · Shared with Obsidian · Tap to talk · + New terminal

**2. Step 4: Install the Face** — "ONE PROMPT. TWO DASHBOARDS."
- لقطة "AGENTIC OS V2" (الكوكبت داخل Obsidian): شارة CONNECTED VAULT · مفتاح Codex / Claude Code · TERMINALS: TERMINAL / GLASS · تبويبات OVERVIEW / AUDIENCE / RESEARCH · شريط CLAUDE · WEEKLY USAGE 32% · 4 كروت KPI (YOUTUBE SUBS 18.4K ▲2.7% / YT VIEWS · 28D 126.3K ▲7.6% / INSTAGRAM 8.2K ▲3.7% / TIKTOK 12.6K ▲4.1%) · كرت LATEST UPLOAD · زرّين Customize dashboard / More workflows… · صف أزرار وركفلو PLAN TODAY | INBOX BRIEF | INTEL BRIEF | DEEP RESEARCH | WEEKLY REVIEW · TODAY (09:00 Focus block · launch brief / 11:00 Product review / 14:00 Record the next tutorial / 16:00 Plan tomorrow) · TASKS 2/4
- التعليق: "The Obsidian cockpit: usage, metrics, one-click workflows and today's plan, all read from your vault."

**3. Step 3: Add the Voice — جزء الواجهة** — "The orb shows every state: listening, working, speaking." — شاشة الـ orb: CLAUDE — Original Jarvis core · Claude Code mode — Idle / Listening / Working / Speaking / Error / Auto — Ready · idle — Pause motion

**4. Step 1: Wire the Brain — جزء الواجهة** — "PICK UP TO TEN. BOTH APPS UPDATE." · لوحة SKILLS · QUICK ACCESS (Plan Today → / Inbox Brief → / Deep Research → / Content Cascade → · "Browse all skills 21 ↗" · "RUNS IN THE BACKGROUND · REPORTS APPEAR HERE") · لوحة VOICE · TAP TO TALK (زر [Tap to talk] · "WHISPER / KOKORO · LOCAL SPEECH" · "Tap to talk, then pause to send. Escape cancels." · حقل [Ask or continue…] + [Send] · "Open terminals" · "Speech stays local. Transcripts go to the selected provider.") · "Your buttons live in both apps. Pick them in Customize dashboard."

**5. How It Works — جزء الواجهة** — "two front doors, one brain, one shared memory": Obsidian plugin (lives inside the vault — orb + dashboard + terminal tabs) + Jarvis HUD (web app in the browser — same buttons, same voice); "answers come back on screen + out loud"; THE ADVANTAGE: ☑ Same buttons in both apps ☑ Same voice in both apps ☑ No database ☑ Just markdown; "Show up with answers. Not open tabs."

**6. The 5 Parts** — "Cockpit + HUD — The face. Two views of the same system."

### ب) تعليمات تخص بناء الإيجنت

**7. كيف يشتغل (JARVIS OS 2.0)**
1. You: talk or click, in Obsidian or the HUD. 2. Jev: classifies the request and routes it to the right tier. 3. Your agent: Claude Code or Codex does the work and saves it to the vault.
- المخطط: Speech service (Whisper = ears, Kokoro = voice) ↔ THE BRIDGE ("one brain for both apps") → JEV ("sorts each request into the right tier") → Tier 1: rules + saved data — no AI · instant ("what are my priorities?") / Tier 2: quick answer — small fast model (Haiku / Luna) ("summarize today's AI news") / Tier 3: real work — opens a Claude Code or Codex terminal, or runs a skill in the background → Connectors: Gmail · Calendar · Drive · YouTube — "Claude ⇄ Codex — switch anytime" — THE VAULT: shared memory — plain markdown files · daily notes · reports + research · conversations · receipts of every request.

**8. الأجزاء الخمسة** — Claude Code / Codex: The engine. Does the real work. Switch anytime. | Obsidian vault: The memory. Every report lands as markdown. | Whisper + Kokoro: The ears + mouth. Your audio stays on your machine. | Jev (NEW): The classifier. Sorts each request into the right tier. | Cockpit + HUD: The face. Two views of the same system. — "Focus on wiring. Not busywork." → "DO THIS NOW. IT COMPOUNDS."

**9. What Jev Actually Does** — "IT DOESN'T TALK. IT DECIDES." — A new "System One" model from TypeSafe. It doesn't write text. It picks one answer from a fixed list. Routing drops from ~5 seconds to under one. $0.042 per million input tokens. Output is free. "TypeSafe's numbers: up to ~200x faster and ~400x cheaper than an LLM at classification."

**10. Step 1: Wire the Brain** — "SKILLS ARE THE BRAIN CELLS." — Claude Code or Codex + a folder of skills · each skill = one SKILL.md · every dashboard button runs one — starter buttons: Plan Today / Inbox Brief / Intel Brief / Deep Research / Weekly Review — The rule: "every button points to a real, reviewed SKILL.md"

**11. Step 2: Build the Memory** — "If it's not in the vault, it didn't happen." — `vault/` → `inbox/` everything captured · `projects/` work in progress · `content/` what you shipped · `wiki/` what you learned — 1) Every report lands as markdown. No database. 2) Daily notes hold your plan, schedule and top 3. 3) `/harvest` turns a finished project into a wiki article. 4) Both dashboards read the same files.

**12. Step 3: Add the Voice** — "Your audio never leaves the machine." — TIER 1 / 2 / 3 — Press Ctrl+Alt+J from any app → Speak, then pause. Local Whisper transcribes. → Kokoro answers out loud.

**13. Step 4: برومبت التثبيت** — "Open Claude Code or Codex. Paste this:" > Clone the Agentic OS V2 repo into ~/agentic-os and set it up for me. — It installs what's missing / Pick your buttons / Something breaks? "Run the doctor." — "MINDSET: SPEAK. ROUTE. REMEMBER. REPEAT."

**14. "8 Essential AI Concepts" (ai.data.tech)** — 1. AGENTIC LOOPS (Plan → Act → Observe → Reflect — until done) 2. MCP (Agent → MCP → Gmail / GitHub / Database / Browser) 3. SUBAGENTS & MULTI-AGENT SYSTEMS (Orchestrator → Subagent A / B / C → Merged Result) 4. AI GATEWAY (App A / B / C → gateway auth · rate limit · logs → OpenAI / Anthropic / Open Source) 5. INFERENCE ECONOMICS (Cache HIT ~10% cost / MISS full cost) 6. EVALS (Test Cases → Model Output → Judge LLM → PASS / FAIL → Metrics) 7. GUARDRAILS (Input Filter block PII → Model → Output Filter block jailbreak → Safe Output) 8. OBSERVABILITY (Agent Workflow → Traces / Logs / Metrics → Dashboard)

**15–16. rengatechnologies — كاروسيل n8n** — عقدة AI Agent في n8n: Source for Prompt (Define below)، Prompt (User Message) "Create a 2000 character or less daily digest, format to simple text, no bolding, no headings…"، Require Specific Output Format (مطفأ)، Enable Fallback Model (مطفأ)، Options: System Message؛ موصلات Chat Model* / Memory / Tool. وركفلو: Schedule Trigger → AI Agent (Google Gemini Chat Model؛ أدوات: Tech Crunch RSS، Get many database pages in Notion، Linus Tech Tips RSS) → Create a database page (Notion).

**17. AUTOMATION BASICS** — "What happens next?" → Search nodes… → فئة "AI — Build autonomous agents, summarize or search documents, etc."

**18. Bright Data** — "Works with: n8n | Agno | CrewAI | Make.com"

### ج) تعليمات أخرى (أتمتة، استضافة، أدوات)

**19–21. n8n Handwritten Notes (1/4–3/4)** — HOW TO START n8n: TRIGGER → n8n → ACTION. طرق التثبيت: A. Local Installation / B. Docker Installation (Recommended for most users) / C. n8n Cloud / D. VPS / Self-Hosted. Installation Flow: Choose Method → Install n8n → Start Service → Open Browser → Create First Workflow. مثال: Laptop → Docker → `http://localhost:5678`. ★ Local setup is best for beginners ★ Docker is the most popular ★ VPS for 24/7 ★ n8n Cloud requires no server setup. الوركفلو: Trigger Node (Start) → n8n (Process) → Action Node (End). أنواع العقد: Trigger / Action / Function–Logic / Set, IF, Merge, HTTP Request, Wait, Code. مكونات العقدة: Parameters / Credentials / Input / Output. مثال: Gmail Trigger → n8n → Send Telegram Message.

**22. SIMPLE SELF-HOST — Hostinger VPS** — "n8n — Built on Ubuntu 24.04" — Docker manager — KVM 2 — روابط How to update n8n / Changing the domain / Resetting user password — أقسام SSH key · Firewall rules · Snapshot & backups · Malware scan.

**23. HighLevel** — All-in-one CRM, funnel builder, marketing automation. Works with: Meta | Make | Slack | Twilio.

**24. Bright Data** — Enterprise-grade proxy network and web scraping platform. Works with: n8n | Agno | CrewAI | Make.com.

**25. Chase AI** — "AI workflows • agents • Claude Code" — Comment "JARVIS" to get the repo + install prompt.

---

## الحزمة 5 — 10 لقطات + 6 فيديوهات (مفرّغة صوتياً كلمة كلمة)

قرأت الـ10 لقطات، وفرّغت الـ6 فيديوهات صوتيًا كلمة كلمة (تفريغ كامل بالنص) وقرأت شاشاتها إطار إطار. هذي الحزمة الخامسة مضافة على السابقات، ومقسومة على نفس الفئات الثلاث. كل اللي تحت منقول من المواد نفسها — بدون زيادة ولا استبعاد ولا اقتراحات.

---

# أ) تعليمات تخص التطبيق (الواجهة)

**1. cmux — لقطة من فيديو @imjonathanacuna "5 Steps To Build ANY App" (شريحة TOOL)**
- "cmux — The terminal built for programmability" — "Free and open source native macOS terminal bui… rings when agents need attention, split panes, an…" — أزرار: Download for Mac / View on GitHub
- Features: Vertical tabs (sidebar shows git branch, working di…) · Notification rings (panes light up when agents nee…) · In-app browser (split a browser alongside your term…) · Split panes (horizontal and vertical splits within eac…) · Programmable (CLI and socket API for automation a…) · GPU-accelerated (powered by libghostty for smooth…) · Lightweight (native Swift + AppKit, no Electron) · Keyboard shortcuts (extensive shortcuts for…) · iOS companion (your terminals sync to iPhone and iPad…)
- الكابشن: "5 steps to build any app with AI in under 60 seconds …" — الخطوات الخمس نفسها ما تظهر في اللقطة، بس الأداة.

**2. Hermes-Apollo / JARVIS — لقطة من تيك توك "Julian The AI Expert" (مع LFM 2.5)**
- أعلى: "…ous Research agent. Sessions, skills, kanban — and a chat line." · "LOCAL · STUDIO"
- تبويبات: Chat | Apollo | Hermes Oracle | Hermes Astros | Studio
- "Hermes-Apollo — NEURAL LINK · ONLINE · 17:23:34" · زر "Wall mode"
- شاشة إقلاع: J A R V I S — NEURAL LINK … ✓ / VOICE CORE … ✓ / AGENT MESH … ✓ — "Realtime voice is live below — just talk"
- أزرار: Realtime ON | Live OFF | Wake word OFF | ⚡ Auto | Briefing — قائمة "Ash (Apollo · butler)" — "REALTIME · CONNECTING" — History / End
- الكابشن العربي: "يمكنك الآن التوقف عن حرق التوكِنز على مهامّ الوكلاء المملّة مع LFM 2.5." / "وكلاء الذكاء الاصطناعي لديك لم يعودوا بحاجة إلى استدعاءات مكلفة لواجهات برمجة الت… المزيد"

**3. فيديو @chase.h.ai (65 ث) — الجزء المرئي للواجهة**
- orb اسمه ASTRA ("GPT-6 Astra · Codex mode"، شكل مجرة حلزونية) وorb اسمه CLAUDE ("Original Jarvis core · Claude Code mode"، كرة بنفسجية) — نفس شريط الحالات Idle/Listening/Working/Speaking/Error/Auto
- JARVIS /V2 شغّال محليًا على `127.0.0.1:3217` — "CODEX · WEEKLY USAGE 24% used"
- لوحة "Your skills — Find a workflow when you need it." — بحث "Research, planning, content…" — "21 skills": Summarize Vault · Plan Today · Plan Tomorrow · Refresh Schedule · Intel Brief · Inbox Brief · Deep Research (Provide a topic) · Content Cascade (Provide a source URL) · YT Pipeline (Provide a topic) · Weekly Review · Vault Cleanup · Pull Metrics · GitHub Trending · YouTube Review — "Uses the provider selected in your dashboard."
- ترمنل Claude Code داخل الواجهة: "Fable 5.1 with high effort · Claude Max — ~\The Vault" — "⚠ 8 MCP servers need authentication · run /mcp" — "Get to finished work sooner with Opus 5.5. Switch anytime with /model" — سطر الحالة "The Vault | Fable 5.1 | ctx: --"

**4. واجهة Hermes Agent — من فيديو @isecreams (11 دقيقة)**
- شريط جانبي: SESSIONS · New session · Capabilities · Messaging · Artifacts · Scheduled jobs
- نص الترحيب: "Describe the task in your own words. I'll pick the right tools, explain my plan, and check in before risky steps."
- تبويبات أدوات: files · terminal · browser · notes · docs · images · tasks · schedule · design · links · forms · logs · charts
- "YOUR WORKFLOW": Add the section → Match the styles → Check it on mobile
- الإعدادات: Model · Chat · Appearance · Workspace · Safety · Memory & Context · Voice · Advanced · Notifications · Billing · Providers · Gateways · Keyboard Shortcuts · Tools & Keys · Plugins · Archived Chats · About
- Plugins: "Kanban — Multi-agent task board — board page, sidebar entry, and a live in-flight count in the status bar." · "Agent plugins — Plugins you installed into the Hermes backend — tools, skills, MCP servers, hooks, and slash commands. Portable ones are Agent Plugins packages (skills + MCP bundles that work in other agents too). Toggles apply to new sessions."
- شاشة تنبيهات: "Hermes — security review · no issues" (متكررة بأوقات)
- شاشة مهام مجدولة: "security review — every day, 9:00 am"؛ بطاقات Skills: Reply to new leads · Daily summary · Calendar sync · Unpaid invoices · Team standup · Sort the inbox

---

# ب) تعليمات تخص بناء الإيجنت

**5. "Top 12 RAG Concepts for Retrieval-Augmented Generation" (@hackproduct9 · webalgos)**
01 Vector Embeddings — Turns text into meaning-rich numbers · 02 Vector Database — Indexes vectors for fast search · 03 Semantic Search — Finds by meaning, not keywords · 04 Chunking — Splits docs into right-sized pieces · 05 Re-ranking — Reorders hits by true relevance · 06 Hybrid Search — Blends keyword + vector search · 07 Metadata Filtering — Narrows results with tags · 08 Context Window — How much text the LLM holds · 09 Hallucination Guard — Cuts down invented facts · 10 Grounding — Ties answers to real sources · 11 Data Drift — Sources change; index goes stale · 12 Knowledge Graph — Linked entities add richer context

**6. docs.composio.dev — فهرس التوثيق (لقطتان)**
- Get started: Agent setup · Quickstart · SDKs and frameworks
- Build: Sessions · Toolkits & Tools · Authentication · Skills · Triggers
- Customize: Extend sessions · Sandboxes · Guides & Examples
- Ship: Move from prototype to production · White-labeling authentication · Production readiness
- Reference and Migration: API reference · Migration and legacy
- Shared resources: Build with the Composio skill · Security and data

**7. Composio Quickstart (لقطتان)**
- اختيار المزوّد: OpenAI Agents (محدد) | Claude Agent SDK | Vercel AI SDK | Other providers
- ① Install (Python / TypeScript): "The Composio Python SDK requires Python 3.10 or newer." — `uv add python-dotenv composio composio-openai-agents` (مقطوع بالصورة بعد composio-)
- تحذير: "Do not install composio-core — The current Python package is composio. The package composio-core is the legacy v1 SDK — it calls deprecated APIs and does not work with sessions. If an older tutorial or an AI coding assistant suggests it, install composio instead. See the migration guide."
- ② Configure API Keys: "Get your COMPOSIO_API_KEY from Settings and OPENAI_API_KEY from OpenAI." — ملف `.env`:
```
COMPOSIO_API_KEY=your_composio_api_key
OPENAI_API_KEY=your_openai_api_key
```
- ③ Create session and run agent (Python):
```python
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, SQLiteSessio…
from composio_openai_agents import OpenAIAgent…
load_dotenv()
# Initialize Composio with OpenAI Agents provi…
composio = Composio(provider=OpenAIAgentsProvi…
```

**8. Composio — مفهوم الـ Session (لقطتان متطابقتان)**
- "…sandbox through session configuration. Later we'll discuss configuring sessions for specialized use cases. But for now you can think of the Composio session as the basic building block for your agent."
- مخطط "Composio Session": Tool Search — Toolkits — Tools · User Context — Authentication · Sandbox
- "Below we're going to explain each of the concepts that come with a session." → قسم Users

**9. فيديو gabster.ai (47 ث، عربي) — بناء وكيل خدمة عملاء بكلود + Gabster**
- النصوص: "الله يعافي الي علمني ان Claude Fable 5 يقدر يسوي كذا" · "ارسلي كلمه "prompt" في ال DM وبرسلك رابط بكل التفاصيل" · "خذ البرومبت ذا وحط اسم البزنس، رابط الموقع، روابط خارجيه، معلومات إضافية" · "نفس كذا وبعدين أضغط إرسال" · "وانتظر لين يخلص" · "هذا هو جهز أبيك تاخذ كل المعلومات اللي طلعت" · "تختار أكتب يدويا" · "تضيف كل اللي أنت نسخته" · "أختار كل القنوات اللي تبيها، أيا كان واتساب، انستقرام، تليجرام، تيك توك" · "دقيقة لأنه الحين قاعد يسوي لك موظف ذكاء إصطناعي مجاني" · "هذا اللي تعلّمه وكيلك" · "أختبره وتأكد إنه قاعد يجاوب كل شيء بشكل صحيح، وإذا في أي معلومة غير صحيحة تقدر تعدلها" · "وإذا عجبك الأداء أضغط على فعل وكيلي ويتفاعل معك" · "وهذا اسم الموقع هذا الرابط: Gabster.ai/ar/free"
- شاشة كلود (تبويب Cowork، موديل "Fable 5.1 Medium"، تنبيه "You've used 75% of your weekly limit") — البرومبت حرفي:
```
EDIT ONLY THIS SECTION
• Business name: Bokup
• Website: https://bokup.ai
• Additional sources: NONE
• Confirmed business facts or corrections: NONE
• Output language: Arabic

Research the business using the sources above and produce a clean, factual
knowledge base ready to upload to a customer-facing AI agent.
Include
Only established business information relevant to customer questions:
• Business overview, customers served, and locations.
• Products/services, features, specifications, and confirmed limitations.
• Prices, billing units, fees, offers, and payment options.
• How to purchase, book, register, or use the service.
• Delivery, setup, and ongoing support.
• Approved cancellation, refund, warranty, and other policies.
```
(باقي البرومبت تحت "Show more" ما ظهر) — بعدها "Loaded tools … Working on it… 8s" — الناتج بعنوان "قاعدة معرفة bokup" (يذكر "The FAQ answers are collapsed; let me expand them and fetch the subpages")
- شاشات Gabster: "خلّي وكيلك يعرف منتجاتك — حط رابط صفحة وحدة ونقرأها تلقائياً، أو ارفع ملف، أو اكتب بنفسك" (خيارات: ارفع ملف CSV أو Excel / اكتب يدوياً) → "وين بتنشر وكيلك؟ — اختر القنوات اللي بتستخدمها عملاؤك": واجهة الموقع · واتساب · إنستقرام · ماسنجر · تليجرام · تيك توك · الإيميل · الهاتف → "GABSTER يبني وكيلك" → "Ibrahim's Business Assistant" (اختبار: "أخبرني عن نشاطكم") → زر "إعادة البناء من البداية"

**10. فيديو @chase.h.ai — التفريغ الصوتي (الجزء الخاص بالإيجنت)**
- "So this is my new Claude OS that works both with Codex and Claude code. On top of that, it runs Jev in the background and has a fully local voice system. It also works inside of Obsidian. … I can swap between Claude code and Codex with a button and it has a built-in terminal as well."
- "When you give the system a command, what happens is all of the requests get run through Jev because Jev is an amazing classifier. It's very fast, it's very cheap and all your requests that hit Jev then get sent to the appropriate model. I divvy it up into tier 1, tier 2, tier 3 to make sure that each request gets the appropriate model so it's fast and it's cheap."
- "The real sell with these AI OS systems … is the fact that you can kind of give this to team members or even clients to sell and we have the whole skill library that it's built on top of."
- صفحة TypeSafe اللي ظهرت: LLM (pre-trained) → RLHF (chat models: chat gpt, claude, instruct…) → RLCD "reinforcement learning for calibrated decisions" (TypeSafe) → RLVR (reasoning models: o1, o3)
- جدول السرعة: Jev [TypeSafe] 193.6x · Claude Haiku 4.5 6.2x · Claude Opus 5 2.1x · Claude Sonnet 5 1.0x · Gpt-5.6-Luna 6.0x (وأرقام دولارات جنبها بخط صغير ما قدرت أقرأها بثقة)

**11. فيديو @kodekloud (92 ث) — "Why so fast? Jev vs LLMs — 100× faster" (تفريغ كامل)**
- المثال: تذكرة #4821 — John · Pro plan: "I was charged twice for my subscription, and I want my money back." — السؤال "Which team should resolve this?" (BILLING / TECHNICAL)
- "If you send this task to an LLM like Claude, even if the answer is just one word or a short answer, the model may still need to write around 40 tokens to reach the answer." — الناتج المعروض: "The customer was charged twice for a subscription and wants a refund. Duplicate charges and refunds are handled by the billing team, not technical support. So the right team for this ticket is: billing." (40 TOKENS)
- "The LLM actually writes one token at a time. First, the model runs and gives us the first token. Then that first token is fed back into the model. Then the model runs again and we get the second token. … This way, the LLM has to run 40 times to give us a 40 token answer. Since the next token depends on the previous tokens, by design, you have to generate a token sequentially."
- "We really don't need the model to write anything for us. We just need it to pick one of two valid options. And that is the whole idea behind Jev. Jev just takes your simple question, runs the model just once, and gives back a probability for each option." — المعروض: ×1 → BILLING 0.94 / TECHNICAL 0.06
- "Even if you ask multiple questions from Jev, it will do in just single pass." — المعروض: Which team? / Is the customer angry? / Is it urgent? → BILLING 0.94 / YES 0.71 / NO 0.82
- "So an LLM has to run in a loop due to how it is built. Jev simply chooses an answer in one go."

**12. فيديو @jgoldieseo (35 ث) — "Jev + Needle 3" (تفريغ + شاشات)**
- التفريغ: "Jev plus Needle 3 — AI started something new: a tiny new AI model just beat models 10 times its size and it runs with zero internet on your phone, laptop, even a smartwatch. 35 megabytes, free, open source. It answers in 66 milliseconds on a normal CPU and it beats models 10 times its size at real tool-calling tasks. Say something messy like 'I'm hot, turn on the fan and drop the temp' — it turns that into exact actions instantly in the right order. Pair it with Jev, a new model built on the same idea, and you get AI that acts instead of just chatting. Small local AI agents just got very real."
- الشاشات: "Automation Foundation Model For Tiny Devices" · "Sixty-six milliseconds. On a CPU." — "How long one answer takes": Cloud AI reply ~2,000 ms · A human blink 100 ms · Cactus: 2 calls, no GPU under 97 ms · My Mac: 3 actions 68 ms · My Mac: 2 actions 51 ms — "68 and 51 ms measured on my Mac · 97 ms is Cactus's CPU figure" — شارات: No graphics card · No internet · No server farm · Just a normal CPU
- "THE SIZE — Smaller than the apps on your phone": 7B model at 4-bit ~4 GB · Needle 3 + engine 35 MB · Needle 3, largest file 29 MB · Needle 3, smallest file 8 MB
- "THE LIVE TEST — One messy sentence in. Three exact actions out." — ترمنل: `needle3 — one messy sentence, three actions` · "offline · no internet" · "needle3.cact · 35 MB" · `needle> I'm feeling re…`
- "THE BIGGER STORY — Needle 3 isn't alone. Meet Jev." — "Two cousins, one idea": **Jev · TypeSafe AI ~70 ms** (only outputs structure · bigger model, runs in the cloud · trained hard on classification · plays Doom, ~10 moves a second) | **Needle 3 · Cactus 68 ms** (only outputs structure · 8–35 MB, runs on the device · open source, Apache 2.0 · free to run, works offline)
- "THE SHIFT — Models that don't talk. They act." — "No paragraph. No preamble. Straight to the action.": A request (plain words) → Structured output (no chatty preamble) → An action (nothing to strip out) — عنوان القسم التالي: "The 2am JSON Problem"

**13. فيديو ReStructure AI (67 ث) — "3 LEVELS OF AI IN 2026" (تفريغ + المخطط)**
- التفريغ: "There are three stages to artificial intelligence, and most people only know of Level 1. The large language model. These are your GPT-5, Claude, and Gemini. AI systems trained on basically the entire internet's worth of text data, and their whole job is to process language and spit out human-like responses. They're insanely good at text tasks: answering questions, writing essays, coding, translating languages. Now we're talking AI agents. This is where things get real. These aren't just text processors. These are systems that can actually perceive what's happening around them, make decisions, and take actions to hit specific goals. Think Devin, Replit Agent, Manus. They see your entire project, understand context, and execute multi-step workflows. So while you're asking ChatGPT for help, these agents are shipping features. And then, agentic AI. This is the endgame. They plan multi-step tasks, reflect on their own performance, and completely change strategies when something's not working. It's like having a senior engineer who never sleeps. AI agents follow your workflow, but agentic AI creates its own workflow. And this is exactly what we're building at Restructure AI."
- الهرم: The Large Language Model (أخضر) → AI Agents (أزرق) → Agentic AI (برتقالي)
- مخطط LLM: مصادر (Website, Book, Document, Social, and More) → تدريب → LLM (GPT-5, Claude, Gemini) → Prompt/Response → Q&A, Writing, Coding, Translation
- مخطط AI Agent: Your Goal → Task → AI Agent (Devin, Replit Agent, Manus) → Understands → Plans → Takes Action → Verifies → لوج (understanding your goal… making a plan… using your tools… checking the result… done.) → أدوات Gmail, Calendar, Docs, Sheets → Business Result / "A finished result"
- مثال Agentic: QuickBooks (Invoice #1042 · Meridian Design Co. · $2,450.00 · "Invoice sent") ↔ Stripe (Card •••• 4242 · Processing fee −$71.35 · Net to account $2,378.65 · "Charged") — "Job marked complete"؛ Fathom "Cash balance, next 6 weeks ($K)" مع تنبيه "TIGHT · −$2K" و"3 WEEKS OUT — Still time to move a payment or send a nudge, before it's tight"
- محور Claude Code: Owner ↔ Claude Code ↔ HubSpot · QuickBooks · Stripe · Plaid · Dext · Bill.com · Gusto · Avalara · Fathom — بطاقة "NEEDS APPROVAL — Wire transfer, $12,400 — [Approve]"
- **المخطط الكبير (معمارية كاملة):**
  - 01 · SIGNALS — "where every market & brand signal comes from": Site behavior · Competitor ranks · Search interest · Audience intel · Channel analytics · Mentions
  - 02 · SYSTEM OF RECORD — "the brand spine, one unified profile": CRM & contacts (HubSpot) · Content calendar · Asset drive (Google Drive) · Playbook wiki (Notion) · Segment CDP · Unified store · Audience list (Kit)
  - OWNER INPUT — "what the one human sets" — "HUMAN-LED · NOT COUNTED": Brand voice · Budget cap · Approval bar · Positioning & offer
  - 03 · THE BRAIN — "the labour": Claude reasoning · Agent runner (LangGraph) · Memory store (Postgres) · Midjourney visuals · Voiceover (ElevenLabs) · Live research — "Claude reasons and writes, LangGraph runs multi-step agents, pgvector remembers every topic and post, Midjourney + ElevenLabs produce visuals and voice."
  - 03 · Orchestrator — "every event enters here first · nothing publishes on its own": Collects → Scores → Briefs → Drafts → Schedules → Approves — "Routine content ships end to end. Only budget changes and edge cases reach the owner." — Claude AI + LangGraph — "reasons against the playbook, remembers with pgvector"
  - Storage Layer + Access — "one shared workspace" — "OS file system" (ملفات .md: …bank.md, …tracking.md, …calendar.md, …templates.md, …playbooks.md, …schedule.md, …rules.md, …model.md) — "(CONTROL PLANE)": Approval queue · Permissions · Kill switch
  - 05 · Departments — "six departments an owner recognizes · reused tools marked once": RESEARCH & INTELLIGENCE (Audience research · Competitor ranks · Trend detection · Backlinks & KD · Synthesizes signal–Claude) → CONTENT ENGINE (Drafts copy–Claude · On-page score · Content briefs · Editing–Grammarly · Variations–ChatGPT) → CREATIVE STUDIO (Graphics–Canva · AI images–Midjourney · Coded video · Layouts–Figma · Voiceover–ElevenLabs) → DISTRIBUTION & PUBLISHING (Scheduler · Queue · Bulk posting · X automation · DM replies) → AUDIENCE & EMAIL (Email creator–Kit · Newsletter · Automation · Landing pages · Lead capture) → ANALYTICS & OPTIMIZATION (Traffic & conv. · Dashboards · Privacy analytics–Fathom · Ad-hoc queries · Insight + feedback–Claude)
  - DATA & OBSERVABILITY — "…behind every card on the report": dbt transform · Data warehouse (BigQuery) · …
  - 06 · ENGAGE — "approved content goes back out from one…": Social posts · Email out (Kit) · Cross-post · DM replies → Audience
  - "What Int…(ervenes?) — eight things that used to need a marketer at a…": Search Demand Spikes (SEO flags spike · Drafts content–Claude) · Content Calendar Thin… (Fills calendar–Claude · Schedules posts–Kit) · A Post Goes Viral (Repurposes it–Claude · Boost amplifies–Meta) · Comment / DM Flood (Auto-replies · Wakes you if real)

**14. فيديو @isecreams "AI Labs" (11 دقيقة) — مهارات Hermes Agent (تفريغ كامل + الشاشات)**
- المقدمة: "Ever since Hermes agent was released, people have been setting up all kinds of workflows on it … people have also built a lot of skills for it. Some of them have even become some of the most trending projects on github." — "Hermes already comes with a lot of them and it can even create new ones from your workflows. But the skills Hermes creates only come from the processes it learns from you. These other skills are built by people who have already solved problems Hermes can't handle on its own." — "even though we're using these skills with Hermes most of them can be used with any AI coding agent."
- المشكلة الأساسية: "If you're having a long conversation your agent can forget the details you mentioned earlier … this happens more often when you're using opus models with Hermes because they tend to forget things more quickly. This happens because there are too many messages in your context window and the model has to pay attention to all of them."

- **(14-أ) planning-with-files** — "It keeps the plan where the agent can't ignore it. Instead of keeping the plan in the chat … this skill converts the plan into three files in your project folder: task_plan.md which basically splits your main task into smaller tasks so the agent can do them one at a time; findings.md which holds every problem the agent faced and how it solved it; progress.md which records how far the agent has gotten." — "What sets this skill apart is that the agent can't ignore the plan. That's because it uses a hook which forcefully inserts the three files into the context window … most agents don't support hooks but Hermes is one of the few that does."
  - صفحة الريبو: "Planning with Files — The planning skill your agent cannot ignore. Not a prompt it might follow. A hook that fires every turn, a plan on disk that survives /clear, and 3 out of 3 blind A/B wins to show it works. Your agent's context window dies. The plan does not." — "Persistent file-based planning for AI coding agents and long-running agent tasks: the skill keeps task_plan.md, findings.md, and progress.md on disk and re-injects them every turn, so the plan survives context loss, /clear, crashes, and compaction. Manus-style working memory on disk, with an opt-in completion gate. Installs across 60+ agents via the Agent Skills standard." (stars 26k · release v3.11.2 · 721 installs · downloads 24.2k)
  - جدول الدعم: Enhanced (hooks + lifecycle automation): Claude Code, Cursor, GitHub Copilot, Mastra Code, Gemini CLI, Kiro, Codex, Hermes, CodeBuddy, Factory Droid, OpenCode → "Plan injection every turn, progress reminders, completion check" | Standard Agent Skills: Continue, Pi, OpenClaw, Autohand Code, Antigravity, Kilocode, AdaL CLI → "SKILL.md discovery via npx skills add; the pattern without lifecycle hooks" | Agent Skills standard path: `.agents/skills/planning-with-files/` discovered from a plain .md
  - جدول البنشمارك: Pass rate (30 assertions) 96.7% (29/30) مع المهارة vs 6.7% (2/30) بدونها · 3-file pattern followed 5/5 vs 0/5 · Blind A/B wins 3/3 (100%) vs 0/3 · Avg rubric score 10.0/10 vs 6.8/10 — "Recovery after a context wipe" — "Internal benchmark, v1 (2026-07-06). Author-run against v3.4.0, harness-authored tasks, deterministic grading, no LLM grades anything. Treat it as the project's own measurement, not an independent comparison."
  - من SKILL.md — Quick Start: "Before ANY complex task: 1. Create task_plan.md — Use templates/task_plan.md as reference 2. Create findings.md — Use templates/findings.md as reference 3. Create progress.md — Use templates/progress.md as reference 4. Re-read plan before decisions — Refreshes goals in attention window 5. Update after each phase — Mark complete, log errors. Note: Planning files go in your project root, not the skill installation folder." — The Core Pattern: "Context Window = RAM (volatile, limited) / Filesystem = Disk (persistent, unlimited)"
  - جدول الملفات: task_plan.md | Phases, progress, decisions | After each phase · findings.md | Research, discoveries | After ANY discovery · progress.md | Session log, test results | Throughout session
  - Critical Rules: "1. Create Plan First — Never start a complex task without task_plan.md. Non-negotiable. 2. The 2-Action Rule — 'After every 2 view/browser/search operations, IMMEDIATELY save key findings to text files.' This prevents visual/multimodal information from being lost. 3. Read Before Decide — Before major decisions, read the plan file. This keeps goals in your attention window. 4. Update After Act — After completing any phase: …"
  - مثال الاستخدام: `/planning-with-files i want to plan out the new project that i wanna build and it is related to a HR system` → الإيجنت أنشأ task_plan.md (+74): "# Task Plan: HR System Project — ## Goal: Create a validated product and technical plan for a new HR system, including scope, users, workflows, MVP, architecture… — ## Current Phase: Phase 1 — ## Phases — ### Phase 1: Vision, Users & Requirements — [ ] Define the business problem and desired outcomes — [ ] Identify organization type, size, countries, and compliance context…" وبعدها سأل أسئلة وأجابوا، وطلع بالملفات الثلاثة.

- **(14-ب) delegate-skills** — "Hermes already has a claude code skill that sends tasks directly to it and it has the same kind of skill for codex as well but the problem with these skills is that Hermes won't use them unless you ask it to. You also have to say which tasks should go to each agent in your prompt" (مثال: "build my landing page and a checkout page — use claude code for the landing page — use codex for the…") — "there is another skill that sends a task to any agent that is already installed on your system and this skill acts as an orchestrator between all of them. It also figures out which of your installed coding tools is best for which task and gives the work to that tool. This is actually a set of skills. The main one is called delegate-setup which coordinates the other agents. It also comes with dedicated delegation skills for different coding agents including claude code, codex and cursor. These agents run in a mode where they don't ask permission before running any command so the coding agent doesn't stop and wait for you to approve every change."
  - التثبيت: `npx skills add amElnagdy/delegate-skills` — "It asks you to choose from 18 skills so you can select the tools installed on your system": agy-delegate · aider-delegate · claude-delegate · cline-delegate · codex-delegate · commandcode-delegate · copilot-delegate · cursor-delegate · delegate-setup · grok-delegate · kimi-delegate · omp-delegate · opencode-delegate (+5 more)
  - وصف الريبو: "Delegate a coding task to a separate Claude Code CLI process or another Claude session as an implementer, review the diff, land the commit yourself — one per implementer."
  - جدول الأوضاع: agy-delegate — Google Antigravity (agy) — "Antigravity's own permissions; bypass opt-in" | claude-delegate — Claude Code (claude) — "acceptEdits + explicit tool surface" | cline-delegate — Cline — "--auto-approve true in act mode; upstream sandbox not configured by the relay" | codex-delegate — OpenAI Codex — "--sandbox workspace-write" | commandcode-delegate — Command Code (cmdc) — "--yolo — the only headless write state; no…"
  - الاستخدام: "run the skill with the slash command, type in the prompt … First it identifies which coding tools are installed then it gives you a complete map of what area each agent will handle along with the exact model name and effort level. Once you approve the plan it starts running the skills. It then sends each task to the agent picked for it. After every agent reports its findings Hermes gives you one collective report and marks the task as complete." — الشاشة: Discovery (Claude Code 2.1.246 installed, authenticated, supports model and effort — aliases fable, opus, sonnet, haiku; Codex CLI 0.149.1 installed…) — lanes: Backend/security (Auth, RBAC, sessions, connectors, injection, data leakage, auditing) · Frontend (Correctness, accessibility, state, API integration, auth flows) · Tests/operations (Tests, dependencies, configuration, persistence, deployment readiness) — "All use the approved review lane: Implementer: Codex · Model: codex-auto-review · Effort: high · Sandbox: read-only · Repository changes: prohibited"

- **(14-ج) rtk** — "Each terminal command … returns an output that the agent has to read. 90% of the time you don't even need all of the output … The rest just bloats the context for no reason." — "RTK cuts the output of the terminal commands the agent runs and keeps only the parts the agent needs so the output gets filtered before it ever reaches the context window. It has a database of the terminal commands agents use most often … if you run tests the agent only needs to see the failed test results and not the passing ones. RTK does that by default." — "it's not actually a skill. It's a separate tool you install on your device and run from the terminal." — "since agents tend to forget what we ask we actually created a skill that tells the agent to route commands through this tool instead of running them the usual way. This skill also contains the details the agent needs along with a reference for each command."
  - الريبو: "High-performance CLI proxy that cuts up to 90% of the bash output your agent reads" — "rtk filters and compresses command outputs before they reach your LLM context … 100+ supported commands, <10ms overhead." — التثبيت: `brew install rtk`
  - SKILL.md: name: rtk · description: "Route shell commands through rtk to cut output tokens." · version 0.1.0 · author: autometa, Hermes Agent · license MIT · platforms [linux, macos, windows] · tags [rtk, cli, shell, tokens, output-filtering] · "rtk is a CLI proxy that filters and compresses command output before it reaches the model. `rtk cargo test` runs the same suite but returns…" — مرجع الأوامر: `rtk ls .` (compact, -80%) · `rtk tree src/` · `rtk find "*.rs" .` (-75%) · `rtk grep "pattern" .` (grouped by file, long lines truncated -70%) · `rtk rg "pattern" src/` · rtk git status/log/diff/add/commit · rtk rewrite — "mapping for ~36 command shapes"

- **(14-د) الراعي Plural** (إعلان داخل الفيديو): "Running production infrastructure usually comes down to one thing: the 3 a.m. alert and digging through Kubernetes logs to find what broke. Plural fixes that with workbenches — their AI agents that actually operate your infrastructure for you and they run inside your existing access controls so nothing happens that you haven't already allowed. … when an alert fired the agent didn't just ping us, it investigated on its own, dug through the logs and metrics and came back with a real diagnosis and clear next steps. Workbench hooks into the tools you already run like Datadog and Slack so it can kick off on its own the moment an alert fires or on a schedule you set, and instead of writing prompts from scratch you hand them ready-made skills from Plural's library. It's basically an on-call engineer that never sleeps."

- **(14-هـ) Mantis (Google)** — "a set of security review skills that your agents can run. It contains a variety of skills each focusing on a different area of security review. This setup works no matter what app you're building, be it a mobile app or a web app." — التثبيت: `npx skills add google/mantis` — "you will be asked to choose between the many specialized skills it has. It's better to install all of them because they are separate pieces of the whole review process." — القائمة (0/19): mantis-advise · mantis-architecture · mantis-calibrate · mantis-chain · mantis-critic · mantis-dedupe · mantis-history · mantis-meta-agent · mantis-patch · mantis-pipeline-adapter · mantis-plan · mantis-reflect · mantis-report (+6 more)
  - mantis-plan: "Formulates a targeted defensive security reviewing plan based on the active threat model and historical learnings. Use when starting a security review campaign to map the codebase boundaries and generate a roadmap (workspace/plan.json). Don't use for executing code reviews, writing test scripts, or patching code."
  - mantis-meta-agent: "Acts as the persistent supervisor, launching and monitoring the automated review campaign. Use when running a long-running, continuous security review campaign that needs autonomous coordination. Don't use for executing individual review stages directly." (# Meta-Agent Orchestrator (/mantis-meta-agent) — ## System Goal…)
  - "mantis-reflect goes back over all the findings and make sure the failures are documented properly"
  - ليش في Hermes: "once your app is hosted it needs security reviews again and again and that isn't something you want to remember to do yourself … Hermes has cron jobs which are basically tasks that run on their own on a schedule. You can set one up that runs this review set against the app you've hosted and because Hermes is running all the time it can alert you on Slack or any other connected platform if it finds a problem." — البرومبت المستخدم: "i want you to create a cron job that runs every friday at pm and runs mantis skill on this repo: github.com/…/finance-manager.git and give a report" — أسئلة الإيجنت: "What time every Friday should it run? Please include the timezone if it is not this Mac's local timezone." → "6:00 PM local time" / "Which Mantis workflow should the scheduled job run?" → "One complete security-review pass, ending with a report" — "it keeps finding issues and applying fixes which keeps the app healthy"

- **(14-و) Agent-Reach** — "your agent is denied access to certain content … a lot of sites like Reddit don't want models using their content but those sites are really valuable since they have real users talking about problems and their opinions and experiences." — "a skill called agent reach … gives Hermes access to the sites that are usually restricted including reddit, github and many others. It uses free methods so it doesn't cost you anything. It was also the number one trending project on github recently … more than 15 platforms. It can search instagram, facebook, twitter and reddit … it runs its own scripts, finds the relevant information and then gives you the answers."
  - الريبو: Panniantong / Agent-Reach (Fork 6.4k) — "Give your AI agent eyes to see the entire internet. Read & search Twitter, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu — one CLI, zero API fees." — وصف المهارة: "MUST USE when user wants to research/search/look up/find anything on the internet — e.g. 'research this topic', 'do a deep dive on X', 'search the web for X', 'see what people say about X', 'look this up'. Also MUST USE when user mentions any platform or shares any URL/link: Twitter/X, Reddit, Facebook, Instagram, YouTube, GitHub, Bilibili, XiaoHongShu, Xiaoyuzhou Podcast, LinkedIn (jobs/recruiting), RSS. 15 platforms, multi-backend routing (OpenCLI / per-platform CLIs / APIs). Zero config for 6 channels. Run `agent-reach doctor --json` to see which backend serves each platform right now. NOT for: writing reports/analysis/translation (this skill only FETCHES internet content); posting/commenting/liking (write operations); platforms that already have a dedicated skill installed (prefer that skill)."
  - مثال: "i want you to research on x about what are people saying about opus 5" → ملخص "What people on X are saying about Claude Opus 5 … Strong agentic performance … 1720 Elo at max effort, 146 points above Fable 5 … $17.79 per task"

- **(14-ز) skill-retrieval (plugin)** — "Hermes comes with more than 90 skills built in and … when Hermes sees a workflow in your chat that could be useful in the future it actually creates a skill out of it … but there is a problem with this: the only part of a skill that actually goes into the context window is its name and description. They get sent with each of your messages so that the agent knows these skills exist … if you have over 100 skills … all those names and descriptions start consuming a huge portion of the context window." — مثال SKILL.md: name: weekly-report · description: Summarize the week
  - "the skill retriever skill replaces the full list of skill prompts with only the most relevant skill descriptions … it runs another step before Hermes calls the model: it splits your message into small chunks that a model can understand, does the same to every skill you have, and then matches your message to the skills list. The skills that score highest are the ones it sends."
  - جدول Token savings (agent-skills/plugins/skill-retrieval/SKILL.md): Before (full skill list in system prompt) ~11.5K · After — names-only system prompt ~2.0K · After — per-turn top-K descriptions ~0.3K · Net per turn ~2.3K (~9K saved) — "Measured on a Hermes install with ~300 skills; savings scale with skill count." — وصف الإضافة: "BM25-based skill retrieval — injects top-K relevant skill descriptions per turn via pre_llm_call hook, replacing the full skill list in the system prompt." — "Installation: Copy or symlink this directory into the Hermes plugins folder" ثم تفعيلها من Plugins
  - ريبو المهارات: "A collection of AI agent skills for Hermes Agent — research, creative, productivity, devops, and more. Each skill is self-contained and tested."

---

# ج) تعليمات أخرى

**15. لقطة @venom__code** — "Gabster.ai/ar/free" — "هذا هو الرابط" — الكابشن: "gabster.ai اول مره ادي ان claude fable 5 يقدر يسوي كذا."
**16. طريقة الحصول على المواد:** gabster: "ارسلي كلمه prompt في الـ DM"؛ Chase AI: "check the description"؛ isecreams: "install commands … in the repo listed in the description"
**17. بانر داخل فيديو jgoldieseo:** "Get the full AI agent system and learn how to save time and get more customers with the AI Profit Boardroom — Join"
**18. ملاحظة Chase AI (تجارية):** "you can kind of give this to team members or even clients to sell"

---

ملاحظات أمانة: فيديو كلود/Gabster فيه باقي البرومبت تحت "Show more" ما ظهر؛ أرقام الدولارات في جدول TypeSafe وبعض نصوص المخطط الكبير الصغيرة جدًا ما نقلتها لأني ما أقدر أقرأها بثقة.

جاهز للحزمة الجاية — وكل الحزم الخمس الحين محفوظة بنفس التقسيم الثلاثي.</chat>
