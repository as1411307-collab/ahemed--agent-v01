# Hermes Agent — طريقة تعامله مع MCP والأدوات (مرجع لأقسام "MCP Center" و"Tool Registry" و"Presets" في وثيقة أحمد)

المصادر: صفحة MCP https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md وصفحة الأدوات https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/tools.md (أرسلهما أحمد 21 أكتوبر، 2:16 و2:20 بالليل). Hermes Agent هو الوكيل اللي ذكره أحمد في وثيقة الإعدادات ("Hermes أو أي نظام خارجي أضيفه لاحقاً") وفي مراجع 13 أكتوبر. هذا الملف يجمع **الأنماط** اللي تنفعنا من طريقته، بغض النظر هل نستخدم Hermes نفسه أو لا.

## 1) شكل إدخال خادم MCP في الكونفق (جاهز يُنسخ كمخطط لـ`integrations[]`)

كل خادم سطر باسم في `mcp_servers`، بنوعين:

```yaml
mcp_servers:
  github:                       # محلي (stdio): يشغّل عملية
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" }
  company_api:                  # بعيد (HTTP)
    url: "https://mcp.internal.example.com"
    headers: { Authorization: "Bearer ${COMPANY_TOKEN}" }
    auth: oauth                 # أو OAuth 2.1 كامل بدل الهيدر
```

مفاتيح مشتركة تستاهل تكون في مخططنا: `enabled` (false = ما يحاول يتصل أصلاً)، `timeout` (نداء الأداة)، `connect_timeout` (الاتصال الأول)، `idle_timeout_seconds` و`max_lifetime_seconds` (يعيد تشغيل العملية بهدوء والأدوات تبقى مسجلة)، `supports_parallel_tool_calls` (مطفي افتراضياً مع تحذير من تسابق القراءة/الكتابة)، `tools` (التصفية تحت)، `sampling` و`elicitation` (تحت).

**الأسرار:** ما تُكتب في الكونفق؛ `${VAR}` تُحل وقت الاتصال من `~/.hermes/.env`، والتوكنات تُخزن في ملفات بصلاحية 0600، والواجهة تعرض حالة الاتصال فقط. نفس قاعدتنا (§26 في وثيقة أحمد، والأسرار من env فقط في CLAUDE.md). العمليات المحلية ما ترث بيئة الشل كلها، فقط `env` الصريح وقاعدة آمنة.

## 2) تسمية الأدوات وتجميعها

- كل أداة تتسجل باسم `mcp_<server>_<tool>` (مثلاً `filesystem/read_file` → `mcp_filesystem_read_file`)، فما تتصادم الأسماء ويبيّن مصدر كل أداة. هذا عمود "Provider" في Tool Registry (§13) جاهز.
- كل خادم يصير مجموعة أدوات `mcp-<server>` أول ما يساهم بأداة واحدة.
- أدوات مساعدة تنضاف فقط لو الخادم يدعمها: `list_resources`، `read_resource`، `list_prompts`، `get_prompt`.

## 3) السماح والمنع لكل أداة (التصفية كأداة أمان)

```yaml
    tools:
      include: ["list_issues", "create_issue", "update_issue"]   # قائمة سماح: ما ينسجل غيرها
      exclude: ["delete_customer", "refund_payment", "*_radar_*"] # قائمة منع، تقبل أنماط *
      resources: false
      prompts: false
```

- لو الاثنتان موجودتان، `include` تفوز. لو كل الأدوات انفلترت وما فيه مساعدات، ما ينشأ أي شي لهذا الخادم.
- هذا بالضبط §9/§13 عند أحمد: "أوقف أي أداة بشكل منفصل، والوكيل ما يستخدم أداة غير مسموحة". الفرق عندنا: السماح يصير **لكل وكيل** (مصفوفة الصلاحيات)، مب للنظام كله فقط.

## 4) التثبيت باكتشاف الأدوات ثم اختيارها (نفس §12 حرفياً)

`hermes mcp install <name>` يتصل بالخادم، يجلب قائمة الأدوات، ويعرض **قائمة اختيار**؛ المختار فقط يُكتب في `tools.include`. لو فشل الفحص، يثبّت بدون فلتر أو بالاختيار الافتراضي من الكتالوج. `hermes mcp configure <name>` يرجّع نفس القائمة لاحقاً. هذا هو تدفق "بعد الاتصال NEXUS يكتشف الأدوات وأختار من يستخدمها".

## 5) التحديث الحي بدون إعادة تشغيل

- `enabled: false` → الخادم يُتجاهل كلياً (عندنا: التكامل يختفي أو يصير Offline، §7).
- `/reload-mcp` يعيد القراءة من الكونفق ويحدّث قائمة الأدوات، والـCLI يعيد الاتصال تلقائياً بعد تعديل الكونفق.
- الخادم يقدر يرسل `notifications/tools/list_changed` فتنجلب القائمة من جديد لحالها. هذا شكل "كونفق تغيّر → حدث → العالم يتحدث" (§27) من جهة الأدوات.

## 6) الموافقات وأسئلة الخادم في مكان واحد

- **Elicitation** (الخادم يسأل المستخدم سؤالاً): يمر عبر **سطح الموافقة** نفسه (أزرار في CLI أو Telegram/Slack)، بمهلة 300 ثانية مطابقة لمهلة الموافقات؛ أسئلة بصيغة رابط تُرفض. يعني مكان واحد لكل شي يحتاج قرار إنسان، نفس بطاقة الموافقة عندنا (§17).
- **Sampling** (الخادم يطلب من الموديل يولّد نصاً): مفعّل مع حواجز: حد رموز 4096، مهلة 30 ثانية، 10 طلبات بالدقيقة، 5 جولات أدوات كحد أقصى، قائمة موديلات مسموحة، ويمكن إطفاؤه لكل خادم. حواجز جاهزة لسؤال "كم كلّف؟".

## 7) Hermes كمصدر أحداث (يهمنا للعالم)

`hermes mcp serve` يعرض الوكيل نفسه كخادم MCP بعشر أدوات، منها: `events_poll` / `events_wait` (أنواع الأحداث: `message`، `approval_requested`، `approval_resolved`، استطلاع كل ~200ms)، `permissions_list_open` و`permissions_respond`، و`messages_send`. يعني أي واجهة (ومنها عالم 3D) تقدر **تقرأ أحداث الوكيل وتجاوب على طلبات الموافقة** عبر MCP بدون لمس الوكيل. هذا نفس شكل "العالم يقرأ أحداث الوكيل من مصدر واحد ويرسل له الشات وقرارات الموافقة" في `agent-vehicle-world`. ملاحظات: stdio فقط، الإرسال نص فقط، والقراءة تشتغل حتى بدون البوابة.

## 8) أمان الكتالوج وأخطاء شائعة

- الخوادم المعتمدة في `optional-mcps/` معطّلة افتراضياً وما تتحدث تلقائياً، والنصيحة: اقرأ الـmanifest قبل التثبيت (`source`، `install.bootstrap`، `transport.command`) لأن التثبيت يشغّل كود خارجي.
- أسباب اختفاء أداة (تنفع كرسائل صادقة في الواجهة): فشل الاتصال، فشل الاكتشاف، فلتر، قدرة غير مدعومة، أو `enabled: false`.
- OAuth: بعض المزودين يرفضون `127.0.0.1` → `redirect_host: localhost`؛ وخوادم ترفض التسجيل الديناميكي تعطي قائمة أدوات بدون توثيق ثم تنتهي مهلة النداء، فالأمر `hermes mcp login` صار يتأكد إن التوكن انحفظ.

## وش ينفعنا منه مباشرة

1. مخطط إدخال التكامل (§1) كنموذج لـ`integrations[]` في NEXUS CONFIG، مع `enabled` و`tools.include/exclude` و`${VAR}` للأسرار.
2. تسمية `mcp_<server>_<tool>` ومجموعة لكل خادم → Tool Registry بعمود المصدر.
3. تدفق "اتصل → اكتشف → اختر من قائمة → اكتب السماح" لصفحة MCP/Integrations.
4. سطح موافقة واحد لكل سؤال يحتاج إنساناً (موافقات الأدوات وأسئلة الخوادم معاً).
5. حواجز الـsampling كقالب لحدود التكلفة.
6. `events_poll` / `permissions_respond` كمرجع لشكل واجهة الأحداث بين الوكيل والعالم.

---

# صفحة الأدوات (tools.md) — وش فيها ينفعنا

## 9) تصنيف الأدوات الجاهز (يصلح كتبويب لـTool Registry)

- **ويب:** `web_search`، `web_extract`. **بحث X:** `x_search` (مطفي افتراضياً، يحتاج مفتاح xAI).
- **طرفية وملفات:** `terminal`، `process`، `read_file`، `patch`.
- **متصفح:** `browser_navigate`، `browser_snapshot`، `browser_vision` (نص + رؤية).
- **وسائط:** `vision_analyze`، `image_generate`، `text_to_speech`.
- **تنسيق الوكيل:** `todo` (خطة)، **`clarify`** (يسأل المستخدم سؤالاً توضيحياً قبل ما يكمل)، `execute_code`، `delegate_task` (وكلاء فرعيون).
- **ذاكرة واسترجاع:** `memory`، `session_search`.
- **أتمتة:** `cronjob` بإجراءات create / list / update / pause / resume / run / remove.
- **تكاملات:** `ha_*` (Home Assistant) وأدوات خوادم MCP.

`clarify` كأداة مستقلة فكرة تناسب أحمد تماماً ("افهمني أولاً"): سؤال الوكيل يطلع كبطاقة من نفس نوع بطاقة الموافقة، مب كرسالة شات عادية.

## 10) مجموعات الأدوات (Toolsets) = أساس الـPresets والصلاحيات

- مجموعات مسمّاة تُختار لكل جلسة أو منصة: `hermes chat --toolsets "web,terminal"`، و`hermes tools` يضبطها تفاعلياً لكل منصة.
- الأسماء: `web`، `search`، `terminal`، `file`، `browser`، `vision`، `image_gen`، `skills`، `tts`، `todo`، `memory`، `session_search`، `cronjob`، `code_execution`، `delegation`، `clarify`، `homeassistant`، `messaging`، `spotify`، `discord`، `discord_admin`، `debugging`، و**`safe`** (مجموعة آمنة).
- قوالب لكل منصة (`hermes-cli`، `hermes-telegram`) + مجموعات ديناميكية `mcp-<server>`.
- عندنا: الـPreset (§25) = مجموعات أدوات + موديل + صلاحيات + مشهد، تنطبق مرة واحدة. ووجود مجموعة `safe` جاهزة يعطينا "مستوى الثقة: يشتغل لحاله في الآمن" من إعدادات أحمد.

## 11) العمليات في الخلفية وزر الإيقاف

- `terminal(command=..., background=true)` يرجّع `session_id` و`pid`، وأداة `process` تديرها: `list`، `poll`، `wait`، `log`، `kill`، `write` (إرسال إدخال)، و`pty=true` للأدوات التفاعلية.
- هذا بالضبط اللي يحتاجه العالم: `list`/`poll`/`log` تغذّي "شو يسوي الوكيل الحين"، و`kill` هو زر الإيقاف الفوري لكل عملية.

## 12) وين يشتغل الوكيل (Terminal backends) وحدوده

| الخلفية | الاستخدام |
|---|---|
| `local` (افتراضي) | تطوير ومهام موثوقة |
| `docker` | أمان وإعادة إنتاج؛ حاوية واحدة طويلة العمر وكل نداءات الطرفية والملفات والكود تمر عبرها |
| `ssh` | عزل: يبعد الوكيل عن كوده (الموصى به للأمان) |
| `singularity` / `modal` / `daytona` / `vercel_sandbox` | HPC، سيرفرلس، بيئات بعيدة، microVM بلقطات |

إعداد أساسي: `backend`، `cwd`، `timeout: 180`. موارد الحاوية: `container_cpu: 1`، `container_memory: 5120`، `container_disk: 51200`، `container_persistent: true`. أمان الحاوية: جذر للقراءة فقط، إسقاط كل صلاحيات Linux، منع رفع الصلاحيات، حد 256 عملية، عزل namespaces، ومساحة العمل على volumes، مع قائمة سماح صريحة لمتغيرات البيئة (`terminal.docker_forward_env`). نفس روح `WORKSPACE_ROOT` عندنا بس على مستوى النظام كله؛ "وين يشتغل الوكيل" يستاهل يكون إعداداً في GLOBAL SYSTEM.

## 13) رسائل صادقة جاهزة (Tool result annotations)

- رموز الخروج تتحول لملاحظة مقروءة: `-9`/`137` = "قُتل بـSIGKILL، غالباً نفاد الذاكرة"، وكذا segfault وabort وSIGTERM وbroken pipe وحدود الموارد.
- `read_file` يكشف UTF-16 ويحوّله لـUTF-8 مع تنبيه، ويرفض الملفات فوق 10MB والثنائية.
- نمط ممتاز لواجهتنا: الفشل يطلع بجملة إنسانية، مب رقم.

## 14) ملاحظات تشغيلية

- نداءات الطرفية تشتغل بدون TTY؛ ملفات تهيئة الشل الثقيلة (nvm، tmux، echo) تسبب تعليق أو مهلة؛ النصيحة: `return` مبكر للجلسات غير التفاعلية.
- `sudo` يطلب كلمة سر تُحفظ للجلسة أو من `SUDO_PASSWORD` في `.env`.
- Tool Gateway (مدفوع من Nous) يعطي بحث وصور وTTS ومتصفح بدون مفاتيح منفصلة؛ ما نحتاجه.
- الصفحة ما تغطي الموافقات والصلاحيات لكل أداة (في صفحة ثانية)، ولا التفويض بالتفصيل.
