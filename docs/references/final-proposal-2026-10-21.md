# الاقتراح النهائي المدمج — NEXUS = Hermes (العقل) + عالم سينمائي (الجسد) + Architect Control (اليد)
*(21 أكتوبر 2026، 3:15 بالليل — بطلب أحمد: دمج الاقتراحات الثلاثة في اقتراح واحد بعد تحديثات Hermes v0.22. مرحلة أفكار؛ ما تغيّر أي قرار في الريبو.)*

## وش تغيّر بعد Hermes v0.22 (ليش الاقتراحات القديمة ناقصة)

الاقتراحات الثلاثة كانت تفترض إننا نبني "الأعصاب" بأنفسنا: محرك موافقات، زر إيقاف، سجل أدوات، تكاملات، ذاكرة، صوت، ربط جوال. Hermes v0.22 يعطي أغلب هذا جاهزاً ومجرّباً عند ناس كثير:

| كنا بنبنيه | صار جاهزاً في Hermes v0.22 |
|---|---|
| محرك موافقات + بطاقة | موافقات مدمجة؛ **خادم API يبث التفكير ويسمح بالرد على الموافقات من داخل البث**؛ و`permissions_respond` عبر `hermes mcp serve` |
| زر إيقاف وتوجيه | **Steer / Stop** لكل وكيل فرعي وهو شغّال، و`/stop` يرجّع الشغل الجزئي |
| سجل أدوات وتكاملات وMCP | Connectors (تطبيقات مستضافة + خوادم MCP في صفحة واحدة)، كتالوج ~600 إضافة، `tools.include/exclude` |
| مدير وكلاء وموديلات | ملفات شخصية (profiles)، `hermes model` لكل ملف، `delegate_task`، موديلات محلية مقيّمة حسب كرت الشاشة |
| ذاكرة وتحكم فيها | MEMORY.md / USER.md قابلة للتحرير، مزودو ذاكرة كإضافات (Honcho، Mem0…)، بحث الجلسات |
| تطبيق جوال للموافقات | **بوابة Telegram / WhatsApp / Signal** جاهزة: الشات والموافقات من الجوال وأنت برا |
| صوت | STT متدفق (الكلمات وأنت تتكلم)، TTS يبدأ من أول جملة، Push-to-talk |
| "استلم أنت" وقت الدخول أو 2FA | **Bot Screen**: شاشة البوت تُبث لك وتستلمها وترجّعها |
| متصفح آمن | وكيل متصفح بخزنة (1Password/Bitwarden/خزنة Hermes)، الموديل ما يشوف كلمة السر |
| تتبع ورسم التنفيذ | إضافة Langfuse (رسم التتبع) + بحث الجلسات |
| جدولة | `cronjob_manage` مع توصيل لأي منصة |

النتيجة: **نبني ثلاثة أشياء فقط**: العالم، الجسر، وصفحة Architect Control. كل الباقي يجي من Hermes ويتحدث لحاله.

---

## الصورة الكاملة

```text
┌──────────────────────────────────────────────────────────────────────┐
│  NEXUS WORLD  (الجسد)  — Three.js/WebGPU في Tauri على اللابتوب        │
│  المقصورة · النواة بسبع حالات · الوكلاء والنبضات · الشاشة الرئيسية    │
│  سجل التفكير · الطرفية · بطاقة الموافقة · إيقاف · عداد التكلفة        │
│  Bot Screen داخل الشاشة الرئيسية وقت الاستلام · وضع Architect           │
└───────────────▲──────────────────────────────┬───────────────────────┘
                │ أحداث (WebSocket)              │ قرارات: شات / موافقة / إيقاف / كونفق
┌───────────────┴──────────────────────────────▼───────────────────────┐
│  NEXUS BRIDGE (الجسر، خدمة صغيرة بـNode)                             │
│  يقرأ: Hermes API stream (تفكير + موافقات) + `hermes mcp serve`        │
│        (events_wait / permissions_list_open) + Langfuse (traces)       │
│  يكتب: messages_send · permissions_respond · /stop · hermes config     │
│  يحفظ: nexus.config.json (العالم) ويبث config.changed                 │
└───────────────▲──────────────────────────────┬───────────────────────┘
                │                               │
┌───────────────┴───────────────┐   ┌──────────▼───────────────────────┐
│  HERMES AGENT v0.22 (العقل)   │   │  ARCHITECT CONTROL (اليد)         │
│  بوابة واحدة: Telegram/WhatsApp│   │  صفحة ويب RTL: المشاهد، النواة،    │
│  أدوات · MCP · Connectors ·    │   │  القواعد، الأصوات، الكاميرا،       │
│  ذاكرة · مهارات · cron · صوت   │   │  الـPresets؛ وأزرار تفتح Hermes     │
│  تفويض Steer/Stop · Bot Screen │   │  Desktop لصفحاته (Connectors…)     │
│  موديلات سحابية أو محلية       │   └───────────────────────────────────┘
└────────────────────────────────┘
الملفات والمفاتيح: عند Hermes على اللابتوب فقط. العالم ما يحمل سراً.
```

**الأدوار:**
- **Hermes** يشتغل كخدمة في الخلفية على اللابتوب (بوابة + خادم API). تطبيقه المكتبي يبقى كـ"لوحة متقدمة" لما تبي صفحات الكونكترات والإضافات والمزودين، ما نعيد بناءها.
- **العالم** هو الواجهة اليومية: مكان تجلس فيه، مب لوحات. يقرأ الأحداث ويرسم، ويرسل القرارات.
- **الجسر** هو الوحيد اللي يعرف Hermes؛ لو تغيّر العقل يوماً (n8n agent، كورنا الحالي)، العالم ما يتأثر.
- **Architect Control** صفحة واحدة تعدّل ملف العالم `nexus.config.json`، وللأمور اللي عند Hermes (تكامل، موديل، ذاكرة) تنادي أوامره أو تفتح صفحته.

---

## المشهد الأول (وش تشوف أول ما تفتح)

سواد عميق، شعار هندسي يتنفس، خط ذهبي رفيع يتقدم بينما الجسر يتصل بـHermes. تلاشي ثانيتين. تصحى في المقصورة: زجاج منحني، بحر غيوم، جبال بعيدة، أضواء مدينة تحت، والشمس في مكانها الحقيقي من ساعة الجهاز وإحداثيات الإمارات. ضباب حجمي، أشعة ضوء، bloom ناعم، حبيبات فيلم خفيفة، غبار دافي يطفو. الكاميرا من كرسيك مع ميلان خفيف مع الماوس.

الشاشة الرئيسية قدامك هي الشات مع Hermes (عربي، RTL، نص مريح). أول ما تكتب: النواة تنتقل من "يستمع" إلى "يفكر" (نبض أسرع وتوهج)، وفي الجدار الجانبي يطلع سجل التفكير سطراً سطراً (من بث التفكير في API)، وفي الطرفية الصغيرة الأسطر المصنّفة (نداء موديل، أداة، رموز، نظام). لما يفوّض Hermes وكيلاً فرعياً، يظهر كيان صغير جنب النواة بلونه، وتمشي نبضة على الخط. لما يحتاج موافقة: العالم يبهت، النواة كهرمانية "تنتظر"، وبطاقة بأربعة أزرار جنب الوكيل: موافق / أرفض / عدّل / غيّر المسار. لما يحتاج تسجيل دخول أو 2FA: الشاشة الرئيسية تصير شاشة البوت (Bot Screen) وتستلم أنت، ثم ترجّعها. زر الإيقاف وعداد التكلفة ثابتان على الكونسول الجانبي. وأنت برا البيت، نفس الموافقات تجيك على Telegram أو WhatsApp من نفس البوابة.

---

## وش نبني (ثلاثة أشياء) ووش يجي جاهزاً

| نبنيه | يجي جاهزاً من Hermes |
|---|---|
| العالم (المقصورة، النواة، الوكلاء، النبضات، اللوحات، بطاقة الموافقة، وضع Architect) | الوكيل كله: أدوات، MCP، Connectors، ذاكرة، مهارات، cron، تفويض، موافقات، إيقاف، صوت، متصفح بخزنة، Bot Screen، بوابة الجوال، موديلات محلية |
| الجسر (قراءة البث والأحداث، إرسال القرارات، حفظ كونفق العالم) | خادم API + `hermes mcp serve` + Langfuse |
| Architect Control (صفحة RTL لكونفق العالم + أزرار تفتح صفحات Hermes) | صفحات Connectors / Plugins / Providers / Memory في Hermes Desktop |

---

## الملفات والكود

```jsonc
// nexus.config.json — ملف العالم (مصدر الحقيقة لكل ما يُرى ويُسمع)
{
  "brain": { "kind": "hermes", "api": "http://127.0.0.1:8642/v1", "mcp_serve": true, "profile": "nexus" },
  "world": { "scene": "cabin-clouds", "clock": { "mode": "real", "lat": 25.2, "lon": 55.3 },
             "fog": 0.35, "bloom": 0.6, "grain": 0.15, "particles": "dust-warm", "reduceMotion": false },
  "theme": { "bg": "#0A0A0B", "accent": "#D4AF37", "accent2": "#F0C75E", "warn": "#FF5A5A", "font": "IBM Plex Sans Arabic" },
  "core":  { "personality": "calm", "states": ["listening","thinking","delegating","waiting","success","warning","speaking"] },
  "agents": "from-hermes",                       // الوكلاء الفرعيون والكونكترات تُقرأ من Hermes، ما تُكتب هنا
  "agent_style": { "research": { "color": "#5AC8FF" }, "browser": { "color": "#F0C75E" }, "n8n": { "color": "#9BE28A", "kind": "gateway" } },
  "rules": [
    { "on": "approval.requested", "do": ["core.state=waiting", "world.tint=#F0C75E", "camera.freeze", "card.open"] },
    { "on": "approval.resolved",  "do": ["card.close", "world.tint=reset", "camera.release"] },
    { "on": "agent.delegated",    "do": ["agent.spawn", "edge.pulse(out)"] },
    { "on": "tool.called",        "do": ["agent.glow", "terminal.line(api-call)"] },
    { "on": "tool.failed",        "do": ["edge.pulse(reverse,#FF5A5A)", "core.state=warning"] },
    { "on": "screen.takeover",    "do": ["mainscreen.show(botscreen)", "core.state=waiting"] },
    { "on": "tts.started",        "do": ["core.state=speaking"] },
    { "when": "activeAgents>3",   "do": ["camera.pullback"] },
    { "when": "mission.type=research", "do": ["scene=cabin-night"] }
  ],
  "presets": {
    "research": { "hermes_profile": "research", "world.scene": "cabin-night", "sound.ambient": "rain-glass" },
    "investor": { "hermes_profile": "investor", "world.scene": "cabin-dawn" }
  },
  "sound": { "ui": "webaudio-soft", "ambient": "cabin-hum", "levels": { "ambient": 0.4, "ui": 0.6, "voice": 1.0 } }
}
```

```ts
// bridge/index.ts — الجسر: Hermes ↔ العالم (Node, ~150 سطراً في الحقيقة)
import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import { McpClient } from "./mcp-stdio";          // عميل MCP بسيط فوق stdio

const wss = new WebSocketServer({ port: 8787 });
const send = (ev: object) => wss.clients.forEach(c => c.send(JSON.stringify(ev)));

// 1) أحداث الخلفية: hermes mcp serve  → events_wait / permissions_list_open
const hermes = new McpClient(spawn("hermes", ["mcp", "serve"]));
(async () => { for (;;) {
  const { events } = await hermes.call("events_wait", { timeout_ms: 25000 });
  for (const e of events) send(mapHermesEvent(e));     // message | approval_requested | approval_resolved → أحداث العالم
}})();

// 2) الشات مع بث التفكير: Hermes API server (OpenAI-compatible, SSE)
export async function chat(text: string) {
  const res = await fetch(`${cfg.brain.api}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "hermes", stream: true, messages: [{ role: "user", content: text }] }) });
  for await (const chunk of sse(res)) {
    if (chunk.reasoning) send({ type: "agent.thinking", text: chunk.reasoning });
    if (chunk.tool_call) send({ type: "tool.called", tool: chunk.tool_call.name, agent: "core" });
    if (chunk.approval)  send({ type: "approval.requested", taskId: chunk.approval.id, summary: chunk.approval.summary });
    if (chunk.content)   send({ type: "message", role: "assistant", text: chunk.content });
  }
}

// 3) القرارات من العالم
wss.on("connection", ws => ws.on("message", async raw => {
  const m = JSON.parse(String(raw));
  if (m.type === "approval.decision") await hermes.call("permissions_respond", { id: m.taskId, decision: m.choice, note: m.edit });
  if (m.type === "kill")              await hermes.call("messages_send", { text: "/stop" });
  if (m.type === "chat")              chat(m.text);
  if (m.type === "config.set")        { saveWorldConfig(m.patch); send({ type: "config.changed", patch: m.patch }); }
}));
```

```yaml
# architect-control/actions.yaml — كل زر في صفحة Architect يروح لمكانه الصحيح
world:        { target: nexus.config.json, via: bridge }            # مشاهد، نواة، قواعد، أصوات، كاميرا، presets
integrations: { target: hermes, via: "hermes mcp add | hermes connectors", open: "hermes-desktop://connectors" }
models:       { target: hermes, via: "hermes model", open: "hermes-desktop://providers" }
memory:       { target: hermes, via: "MEMORY.md / USER.md", open: "hermes-desktop://memory" }
plugins:      { target: hermes, via: "hermes plugins install", open: "hermes-desktop://plugins" }
permissions:  { target: hermes, via: "tools.include/exclude + approval settings per profile" }
presets:      { target: both, via: "hermes -p <profile> + world preset" }
```

```yaml
# deploy.yaml — نفس الحزمة بوضعين
local:                          # الوضع الأساسي: كل شي على اللابتوب
  hermes:  { gateway: true, api_server: true, profile: nexus, models: cloud-or-local }
  bridge:  { port: 8787 }
  world:   { shell: tauri, window: fullscreen, controller: optional }
  phone:   { via: hermes-gateway (Telegram / WhatsApp) }          # بدون تطبيق جوال في النسخة الأولى
cloud:                          # اختياري لاحقاً: نفس الحزمة على جهاز سحابي، والعالم يفتح من أي متصفح
  vm:      { brain: hermes, bridge: true, world: static-web, region: me-central }
  files:   { laptop-via-tailscale }
  auto_stop_after_idle: 15m
engine_body:                    # اختياري لاحقاً: جسد Unreal/Unity/Godot يقرأ نفس rules والأحداث من نفس الجسر
  reads: [nexus.config.json, bridge ws://]
```

---

## الصوت
- الإدخال: STT المتدفق في Hermes (الكلمات تظهر وأنت تتكلم على الشاشة الرئيسية)، Push-to-talk من يد التحكم أو زر على الكونسول.
- الإخراج: TTS من Hermes يبدأ من أول جملة؛ حدث `tts.started/ended` يحرّك حالة "يتكلم" وتنفّس إضاءة المقصورة.
- الجو: طبقات من Openverse/Kenney عبر Howler، ونقرات مولّدة بـWeb Audio بدون ملفات. لكل طبقة مستوى في Architect.
- LiveKit يبقى خياراً لاحقاً لو احتجنا غرفة صوت ثنائية الاتجاه بجودة أعلى.

## الأصول (من وين الواقعية)
صور مفهوم → TRELLIS.2 / Hunyuan3D → تنظيف Blender → GLB مضغوط (Draco/KTX2) بخامات PBR، إضاءة HDRI، سما وغيوم إجرائية. لو احتجنا واقعية أعلى بعدين، الجسد الثاني (محرك ألعاب) يقرأ نفس الملفات ونفس القواعد.

## الجهاز والتكلفة
- اللابتوب الحالي يكفي للعالم (كرت مدمج، ثلاث درجات جودة). Hermes يقيّم كرت الشاشة لحاله لو تبي موديلاً محلياً.
- التكلفة: 0 للعالم والجسر؛ الموديلات حسب مزودك (نفس اللي تدفعه اليوم)؛ Nous Portal اختياري.
- الجوال مجاناً عبر بوابة Hermes.

## المخاطر وكيف نلفّها
- **تغيّر Hermes بسرعة** (إصدار كل أيام): الجسر هو الوحيد اللي يلمسه، ونثبّت إصداراً (`stable`) ونرفع بوعي.
- **واقعية الويب أقل من محرك ألعاب**: مقبولة لمكان تجلس فيه يومياً، والمسار للجسد الأقوى مفتوح بنفس القواعد.
- **Bot Screen على بوابة لينكس فقط حالياً**: على ويندوز نبدأ بدونه أو عبر Docker backend.
- **اللغة**: العربي والـRTL في العالم عبر HTML على أسطح 3D (مضمون)، وردود Hermes بالعامية عبر USER.md.
- **ما تغيّر أي قرار في الريبو**؛ لو أحمد اعتمد هذا الاقتراح، يُسجَّل في DECISIONS.md يومها.

## ليش هذا أفضل من الاقتراحات الثلاثة
- يأخذ من **A** الجسد الخفيف اللي يشتغل على أي شاشة ومن أول يوم بتكلفة صفر.
- يأخذ من **B** و**C** مسار الواقعية الأعلى والسحابة كأوضاع لاحقة لنفس الحزمة، مب كمشاريع منفصلة.
- ويحذف أكبر جزء من الشغل: العقل ما ننبنيه، Hermes v0.22 جاهز بموافقات وإيقاف وجوال وصوت ومتصفح آمن واستلام شاشة، يعني الأسئلة الأربعة (يشوف؟ يوقف؟ يستأذن؟ يعرف التكلفة؟) مجابة من المصدر، والعالم يرسمها بس.

---

## ملحق (3:19 بالليل): وين Ollama وn8n وأنظمة RAG في الاقتراح النهائي

الثلاثة ما يغيّرون الهيكل؛ كل واحد له مكان واضح حول العقل (Hermes)، والعالم يعرضهم ككيانات.

### Ollama = الموديلات المحلية (الخصوصية والمهام الرخيصة)
- Hermes v0.22 عنده موديلات محلية بنقرة (llama.cpp) **و**يقبل أي نقطة نهاية متوافقة مع OpenAI؛ Ollama يعرض واحدة على `http://127.0.0.1:11434/v1`، فيصير مزوداً عادياً بجانب السحابة.
- الدور: وضع "بدون إنترنت"، المهام البسيطة والتلخيص والتصنيف محلياً (التكلفة صفر)، و**التضمينات (embeddings)** لأنظمة RAG (مثل `nomic-embed-text` أو `bge-m3` اللي تدعم العربي).
- التوجيه (من وثيقة أحمد §14): بسيط → محلي، بحث عميق → سحابي قوي. في Hermes هذا = ملف شخصي لكل نوع مهمة أو موديل لكل وكيل فرعي.
- في العالم: الموديل المحلي كيان بلونه وعداد تكلفته صفر؛ وقت ما يشتغل بدون إنترنت، الخطوط للسحابة تبهت والعالم يبيّن "محلي".
- الحد: كرت الشاشة والرام يحددان حجم الموديل (Hermes يقيّمها لحاله).

### n8n = طبقة الأتمتة الاختيارية (NEXUS ما يعتمد عليه، §8 عند أحمد)
- الربط الأنظف: عقدة **MCP Server Trigger** في n8n تعرض أي ورك فلو كأداة MCP، فينضاف في Hermes كخادم `n8n` وتظهر الورك فلوز كأدوات `mcp_n8n_<workflow>`، ونتحكم فيها بـ`tools.include` لكل ملف شخصي. (بديل أبسط: webhooks لكل ورك فلو كأدوات.)
- الاتجاه المعاكس: n8n يقدر ينادي Hermes (خادم API متوافق مع OpenAI) كخطوة ذكاء داخل ورك فلو.
- الحالة الحية: n8n يرسل حالة التنفيذ (started / running / waiting / completed / failed) عبر webhook للجسر، والعالم يعرضها كنبضة على خط "بوابة الأتمتة" وبطاقة حالة. n8n نفسه يظهر ككيان "بوابة" بلونه.
- تعطيله من Architect = `enabled: false` للخادم، فيختفي الكيان أو يصير Offline.

### أنظمة RAG = مكتبات معرفة متعددة بصلاحيات لكل وكيل (§10–11 عند أحمد)
- **البنية**: قاعدة متجهات محلية (Qdrant أو LanceDB أو sqlite-vec) + تضمينات من Ollama + خدمة صغيرة تعرض لكل مكتبة أدوات `kb_search` و`kb_add` و`kb_list` كخادم MCP. كل وكيل يشوف فقط المكتبات المسموحة له عبر `tools.include` (Research يشوف `investment` و`documents`، وما يشوف `personal`).
- **الإدخال**: إسقاط ملف في المقصورة → الجسر يرسله لورك فلو n8n للتقطيع والتضمين (n8n عنده عقد Qdrant/Pinecone/Supabase جاهزة) → يرجع حدث `kb.indexed` → الوكيل يقول "استلمت وفهرست". أو بدون n8n: الخدمة نفسها تفهرس.
- **الذاكرة مقابل المعرفة**: ذاكرة Hermes (MEMORY.md/USER.md والمزودون كـHoncho/Mem0) لمن أنت ووش تفضّل؛ مكتبات RAG للملفات والمستندات. ما نخلطهما.
- **Simple / Advanced**: البسيط مكتبة واحدة "Personal" بإعدادات افتراضية؛ المتقدم في Architect: مصدر البيانات، نموذج التضمين، حجم القطع، Top-K، بحث هجين، إعادة ترتيب، فلاتر.
- في العالم: كل مكتبة "رف" أو كيان معرفة، وحدث `rag.search` يبيّن خيوط معرفة تنسحب من الرف للوكيل (من جدول أحمد للأحداث).
- وضع "كله محلي": Ollama + Qdrant + n8n ذاتي الاستضافة + Hermes بموديل محلي = لا شي يطلع من اللابتوب.

```yaml
# ~/.hermes/config.yaml (مقتطف)
providers:
  ollama: { base_url: "http://127.0.0.1:11434/v1", api_key: "ollama" }      # custom endpoint
mcp_servers:
  n8n:   { url: "http://127.0.0.1:5678/mcp/nexus", headers: { Authorization: "Bearer ${N8N_MCP_TOKEN}" }, tools: { include: ["email_processing", "research_workflow", "document_analysis"] } }
  kb:    { command: "node", args: ["kb-mcp/server.js"], env: { QDRANT_URL: "http://127.0.0.1:6333", EMBED_MODEL: "ollama/bge-m3" },
           tools: { include: ["kb_search", "kb_list"] } }
```

```jsonc
// nexus.config.json (إضافات)
"knowledge": [
  { "id": "personal",   "label": "شخصي",   "agents": ["core"] },
  { "id": "investment", "label": "استثمار", "agents": ["core", "research"] },
  { "id": "documents",  "label": "مستندات", "agents": ["core", "research", "browser"] }
],
"rules+": [
  { "on": "rag.search",  "do": ["knowledge.stream(kb→agent)"] },
  { "on": "kb.indexed",  "do": ["shelf.glow(kb)", "terminal.line(system)"] },
  { "on": "n8n.status",  "do": ["gateway.pulse(n8n,{status})"] },
  { "on": "model.local", "do": ["cost=0", "edge.fade(cloud)"] }
]
```
