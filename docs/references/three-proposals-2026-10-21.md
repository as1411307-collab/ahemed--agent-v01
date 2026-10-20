# ثلاثة اقتراحات لعالم NEXUS (21 أكتوبر 2026) — النسخة المفصّلة، بدون ترشيح

أحمد طلب ثلاثة اقتراحات مختلفة بالتفاصيل على شكل أكواد، بدون ترشيح أحدها، وبدون خيار الكونسولات (كان مجرد سؤال). ثم طلب التفاصيل كاملة. هذا الملف هو النسخة المفصّلة: لكل اقتراح وش تشوف أول ما تفتح، كيف يبيّن الوكيل وأحداثه، الإعدادات ووضع المهندس، الصوت، الأصول، الربط بالعقل، الجهاز والتكلفة، المخاطر، ثم الكود. القرار لأحمد. (مرحلة أفكار: ما ندخل قواعد المشروع ولا "هل يُقاد من Claude Code".)

---

## المشترك بين الثلاثة: الأعصاب (لا تتغير مهما كان الجسد)

- **ملف كونفق واحد `nexus.config.json`** هو مصدر الحقيقة: الوكلاء، الأدوات، التكاملات، الموديلات، المشاهد، القواعد، الصلاحيات، الأصوات، الكاميرا، الـPresets. العالم يقرأه ويرسم، والإعدادات تعدّله، وما فيه قيمة مكتوبة داخل الكود.
- **بث أحداث واحد** من العقل للعالم: `agent.started`، `agent.thinking`، `tool.called`، `tool.result`، `tool.failed`، `approval.requested`، `approval.resolved`، `cost.updated`، `mission.completed`، `connection.lost`، `config.changed`. كل حدث فيه `agent`، `task`، `cost`، `ts`. ومن العالم للعقل: رسالة شات، قرار موافقة، إيقاف، تغيير كونفق.
- **العقل برا العالم** (Core أو Hermes أو وكيل n8n): المفاتيح والأدوات والذاكرة عنده؛ العالم يعرض ويرسل القرارات فقط، ويعرض حالة الاتصال بس (CONNECTED / DISCONNECTED / ERROR).
- **بطاقة الموافقة بأربع أزرار**: موافق / أرفض / عدّل / غيّر المسار. وقت الطلب يبهت العالم شوي، النواة تدخل حالة الانتظار (كهرماني)، والكاميرا تتجمد، وما ينفّذ شي قبل قرارك.
- **زر الإيقاف الفوري** دايماً ظاهر على الكونسول: يرسل `kill` للعملية الحالية أو لكل شي.
- **عداد التكلفة**: المهمة الحالية + مجموع الجلسة + سقف يومي يطلع تحذيراً.
- **وضعان**: Commander (العالم والتفاعل بس) وArchitect (نفس العالم يصير قابلاً للتعديل: تسحب وكيلاً، توصل، تغيّر قاعدة، تفتح لوحات الكونفق).
- **Presets** = لقطات كاملة من الكونفق باسم (Research، Investor، Personal، Developer، Creative، Deep Work)، ونفس الآلية تعطي Undo/Redo وتاريخ النسخ.
- **سبع حالات للنواة**: يستمع، يفكر، يفوّض، ينتظر، نجح، تحذير، يتكلم. و**شخصية النواة** (هادي/تحليلي/تنفيذي/استكشافي/إبداعي) = مجموعة قيم للسرعة والتوهج وسلوك الكاميرا.
- **قواعد**: IF حدث أو حالة THEN شكل/كاميرا/مشهد، تتعدل من الإعدادات بدون كود (مثلاً: أكثر من 3 وكلاء نشطين → الكاميرا ترجع لورا؛ مهمة بحث → مشهد البحث).
- **الإحساس**: ليل أزرق عميق بطبقات وضباب، مصدر ضوء دافي واحد (ذهبي/كهرماني)، هدوء سينمائي، وخيار تقليل الحركة من أول يوم.

---

## الاقتراح A — عالم ويب سينمائي (WebGPU / Three.js في غلاف سطح مكتب)

**الفكرة بجملة:** العالم كله مبني بتقنيات الويب ثلاثية الأبعاد الحديثة داخل تطبيق سطح مكتب صغير، ونفس البناء يفتح في أي متصفح (الجوال للحالة والموافقات، والتلفزيون لو وصّلت اللابتوب).

**وش تشوف أول ما تفتح:** سواد عميق، شعار هندسي محايد يتنفس، خط تقدم ذهبي رفيع، ثم تلاشي ثانيتين وتصحى داخل المقصورة: زجاج منحني كبير، برا بحر غيوم وجبال بعيدة وأضواء مدينة، والشمس في مكانها الحقيقي حسب ساعة الجهاز وإحداثيات الإمارات (بالليل تدفأ إضاءة المقصورة وتطلع النجوم). ضباب حجمي خفيف، أشعة ضوء، bloom ناعم، حبيبات فيلم خفيفة، وغبار دافي يطفو ببطء. الكاميرا من عين الجالس في الكرسي مع ميلان خفيف يتبع الماوس، وبعجلة الماوس تطلع على مسار منحني لمنظر الأسطول من برا وترجع.

**كيف يبيّن الوكيل وأحداثه:**
- الشاشة الرئيسية قدام الكرسي هي الشات (HTML حقيقي مثبّت على سطح ثلاثي الأبعاد، فالعربي والـRTL سليمان)، وأول شي تقدر تكتب فيه.
- النواة كرة شيدر بسبع حالات: نبض بطيء وهي تستمع، أسرع وأكبر وهي تفكر، كهرماني وهي تنتظر، أخضر وقت النجاح، أحمر هادي وقت التحذير، وتتنفس مع الصوت وهي تتكلم.
- كل وكيل مربوط كيان صغير حول النواة بلونه، والخط بينهم متقطع يتحرك باستمرار؛ لما تمر مهمة يصير الخط أعرض ويتوهج بلون الوكيل، والنبضة تمشي عليه وترجع بالنتيجة، تنعكس للتراجع، وتتوقف وقت الانتظار.
- جدار هولوغرامي جانبي = ملخص المهام الحي (سجل التفكير: سطر لكل خطوة بالوقت)، وطرفية صغيرة مصنّفة بالألوان (نداء، رموز، رسالة بين وكيلين، نظام) تصغر لشريط بضغطة.
- في منظر الأسطول، الرسم الحي بأسلوب n8n: العقد والحواف من React Flow مثبّتة داخل المشهد، تقدر تعيد تشغيل مهمة قديمة خطوة خطوة.
- بطاقة الموافقة تفتح جنب الوكيل المعني بأربعة أزرار؛ زر الإيقاف وعداد التكلفة على الكونسول الجانبي.

**الإعدادات ووضع المهندس:** لوحة تنسحب من اليمين فوق المشهد (مب صفحة)، فيها أقسام الكونفق: عام، العالم والمشهد، النواة، الوكلاء، التكاملات، الأدوات، الموديلات، الذاكرة، الصلاحيات، القواعد، الأصوات. أي تعديل يُطبّق على المشهد فوراً (معاينة حية) ولا يُعتمد إلا بزر Apply؛ Undo/Redo وPresets من لقطات الكونفق. في وضع المهندس تسحب الوكلاء وتوصلهم بالماوس داخل المشهد نفسه.

**الصوت:** نقرات وتأكيدات مولّدة بـWeb Audio بدون ملفات (نغمات ناعمة دافية)، وطبقات جو (همس محرك، جو المقصورة) من Openverse/Kenney عبر Howler، لكل طبقة مستوى في الإعدادات.

**الأصول (من وين الواقعية):** صور مفهوم للمقصورة والكونسول والكيانات → مجسمات بـTRELLIS.2 أو Hunyuan3D → تنظيف في Blender → GLB مضغوط (Draco/KTX2)، وخامات PBR، وإضاءة من HDRI حقيقي. السما والغيوم إجرائية بشيدر.

**الربط بالعقل:** WebSocket واحد للكور (أو جسر يقرأ `events_poll` من Hermes ويبثّها). أول بناء يشتغل على مشغّل أحداث وهمي يعيد تشغيل جلسات JSON مسجلة بنفس الصيغة، ثم ينبدل المصدر بالحقيقي بدون لمس المشاهد.

**الجهاز والتكلفة:** كرت مدمج يكفي، ثلاث درجات جودة (عدد الجسيمات، المؤثرات)، هدف 60 إطار. تكلفة التشغيل صفر.

**المخاطر:** سقف الواقعية أقل من محرك ألعاب كامل (واقعي مُنمّط مب فوتوريالي)، والإبهار يحتاج شغل شيدرات، وتوافق WebGPU يختلف بين المتصفحات (فيه تراجع لـWebGL2).

```jsonc
// nexus.config.json (excerpt) — the whole world reads from here
{
  "world": {
    "scene": "cabin-clouds",
    "clock": { "mode": "real", "lat": 25.2, "lon": 55.3 },
    "fog": 0.35, "bloom": 0.6, "grain": 0.15, "particles": "dust-warm", "reduceMotion": false
  },
  "theme": { "bg": "#0A0A0B", "accent": "#D4AF37", "accent2": "#F0C75E", "warn": "#FF5A5A" },
  "core": { "state": "listening", "personality": "calm" },
  "agents": [
    { "id": "research", "name": "Research", "color": "#5AC8FF", "model": "claude", "tools": ["web_search", "files"], "position": [2.2, 0.4, -1.6] },
    { "id": "automation", "name": "n8n", "color": "#F0C75E", "kind": "gateway", "position": [-2.0, 0.2, -1.8] }
  ],
  "rules": [
    { "on": "approval.requested", "do": ["core.state=waiting", "world.tint=#F0C75E", "camera.freeze", "card.open"] },
    { "on": "tool.failed",        "do": ["edge.pulse(reverse,#FF5A5A)", "core.state=warning"] },
    { "on": "agent.started",      "do": ["agent.glow", "camera.focus(agent)"] },
    { "when": "activeAgents>3",   "do": ["camera.pullback"] }
  ],
  "presets": { "research": { "world.scene": "cabin-clouds", "agents.enabled": ["research", "files"] } }
}
```

```tsx
// World.tsx — scene skeleton (React Three Fiber)
<Canvas gl={{ powerPreference: "high-performance" }}>
  <Sky clock={config.world.clock} />                 {/* sun position from real time */}
  <Cabin glb="/assets/cabin.glb" />
  <CoreOrb state={core.state} personality={core.personality} />
  {agents.map(a => <AgentNode key={a.id} {...a} active={active.has(a.id)} />)}
  <Edges from="core" to={agents} pulses={pulses} />  {/* dashed lines, offset animated */}
  <Html transform position={[0, 1.1, -1.4]}><ChatScreen dir="rtl" /></Html>
  <Html position={[1.6, 0.9, -1.0]}><ThinkingLog entries={log} /></Html>
  <PostFX fog={config.world.fog} bloom={config.world.bloom} grain={config.world.grain} />
</Canvas>
```

```ts
// useAgentEvents.ts — events in, decisions out
const ws = new WebSocket(config.brain.url);           // ws://laptop:8787/events  (or the Hermes bridge)
ws.onmessage = ({ data }) => {
  const ev = JSON.parse(data);                        // { type, agent, task, cost, ts }
  for (const r of config.rules) if (r.on === ev.type) r.do.forEach(action => apply(action, ev));
};
export const decide = (taskId: string, choice: "approve" | "deny" | "edit" | "reroute", edit?: string) =>
  ws.send(JSON.stringify({ type: "approval.decision", taskId, choice, edit }));
export const kill = (taskId?: string) => ws.send(JSON.stringify({ type: "kill", taskId }));
```

---

## الاقتراح B — عالم محرك ألعاب على جهازك (Unreal Engine 5 + Fab؛ نفس المخطط يصلح لـUnity أو Godot)

**الفكرة بجملة:** أعلى واقعية ممكنة محلياً: إضاءة عالمية حقيقية، أصول Megascans، كاميرا من محرك أفلام، والعالم يتعدل حياً من صفحة تحكم برا المحرك.

**وش تشوف أول ما تفتح:** لقطة افتتاحية من Sequencer (4 ثواني): الكاميرا تنزلق من برا الزجاج إلى الكرسي، مع الشعار وخط التقدم فوقها. المقصورة فوتوريالية: جلد داكن ومعدن مطفي وخطوط ذهب من Megascans، زجاج بانكسار حقيقي، برا غيوم حجمية (Volumetric Cloud + Sky Atmosphere) وجبال بعيدة ومدينة أضواء، والشمس من ساعة الجهاز (Sun Position). Lumen للإضاءة غير المباشرة، Nanite للتفاصيل، ومجلد معالجة لاحقة: bloom، تعريض تلقائي، تدرج ألوان دافي/بارد، vignette، عمق ميدان خفيف.

**كيف يبيّن الوكيل وأحداثه:**
- النواة نظام Niagara + مادة مضيئة، حالاتها السبع قيم في Material Parameter Collection، فتغيير الحالة سطر واحد.
- الوكلاء كيانات صغيرة بمواد مضيئة بلونها، والحواف شرائط Niagara، والنبضات جسيمات تمشي على spline بين النواة والوكيل (اتجاه معكوس للتراجع، تتوقف وقت الانتظار).
- الشات على شاشة داخل المشهد (Widget Component)، والسجل والطرفية لوحات UMG خفيفة على الأطراف. النص العربي يُفحص أول شي (تشكيل الحروف والاتجاه).
- بطاقة الموافقة Widget يطلع جنب الوكيل بأربعة أزرار، وزر الإيقاف والعداد على الكونسول.
- قواعد الحدث → الشكل في DataTable تُستورد من JSON، وBlueprint واحد يقرأ الصف ويطبّق الإجراءات؛ ما فيه قاعدة مكتوبة داخل الكود.

**الإعدادات ووضع المهندس:** داخل اللعبة وضع المهندس يخلي الوكلاء قابلين للسحب والتوصيل. ومن برا، صفحة ويب "Architect Control" تكلم المحرك عبر **Remote Control API** (HTTP لتغيير الخصائص، WebSocket للبث الحي): شدة الشمس، كثافة الضباب، ألوان الوكلاء، المشهد الحالي… كل خاصية مكشوفة في Remote Control Preset. التعديل يُحفظ في الكونفق عند العقل ويُعاد بثه كـ`config.changed` عشان يبقى مصدر الحقيقة واحداً.

**الصوت:** MetaSounds بثلاث طبقات (جو، واجهة، صوت الوكيل) ومزج لكل طبقة مستوى في الإعدادات.

**الأصول:** Fab (Megascans فيها كمية كبيرة مجانية + مدفوع)، والمجسمات المولّدة (TRELLIS/Hunyuan3D) بعد تنظيف Blender تُستورد كـGLB/FBX.

**الربط بالعقل:** إضافة WebSocket داخل المحرك (الوحدة المدمجة) تتصل بالكور أو Hermes؛ كل حدث JSON يتحول لـEvent Dispatcher في Blueprint. نفس المشغّل الوهمي للجلسات المسجلة أول.

**التعبئة والجهاز:** بناء ويندوز يشتغل على اللابتوب (أو على التلفزيون بيد تحكم عبر Enhanced Input). يحتاج كرت شاشة منفصلاً (فئة RTX 3060 أو أعلى) ومساحة عشرات الجيجا، مع ثلاث درجات Scalability (Lumen يطفي في الأدنى).

**التكلفة:** المحرك مجاني لهذا الاستخدام، وبعض أصول Fab مدفوعة.

**المخاطر:** أثقل مشروع (ترجمة، أحجام، دورة تعديل أطول)، يحتاج جهازاً قوياً، منحنى تعلم للمحرك، والعربي داخل UMG يحتاج فحصاً مبكراً.

```json
// EventRules.json — imported as a DataTable; one Blueprint reads the row for ev.type
{
  "approval.requested": [
    { "set": "MPC.Nexus.CoreState", "to": 3 },
    { "set": "PostProcess.ColorTint", "to": "#F0C75E" },
    { "camera": "freeze" },
    { "widget": "ApprovalCard", "anchor": "agent" }
  ],
  "tool.failed":   [ { "niagara": "EdgePulse", "param": "Direction", "to": -1 }, { "set": "MPC.Nexus.CoreState", "to": 5 } ],
  "agent.started": [ { "material": "Agent.Emissive", "to": 3.0 }, { "camera": "focus", "target": "agent", "blend": 0.8 } ],
  "cost.updated":  [ { "widget": "CostMeter", "text": "{task} / {session}" } ]
}
```

```text
Blueprint (BP_NexusDirector):
  OnWebSocketMessage(json)
    -> ev = ParseJson(json)
    -> row = DataTable.FindRow(EventRules, ev.type)
    -> ForEach action in row: ExecuteAction(action, ev)   // SetMPC / SetPostProcess / CameraFreeze / SpawnWidget / NiagaraParam
  ApprovalCard.OnButton(choice) -> WebSocket.Send({ type: "approval.decision", taskId, choice })
  KillButton.OnClick           -> WebSocket.Send({ type: "kill" })
```

```bash
# Architect Control page -> live world (Remote Control API, port 30010)
curl -X PUT http://localhost:30010/remote/object/property \
  -H "Content-Type: application/json" \
  -d '{"objectPath":"/Game/Nexus/Maps/Cabin.Cabin:PersistentLevel.Sun_1.LightComponent0",
       "propertyName":"Intensity","propertyValue":{"Intensity":2.0}}'
```

---

## الاقتراح C — عالم في السحابة يُبث لأي شاشة (Pixel Streaming)

**الفكرة بجملة:** نفس عالم المحرك من B، لكن يُرسم على كرت شاشة مستأجر في السحابة ويوصلك كفيديو تفاعلي عبر المتصفح: اللابتوب، الجوال، التلفزيون. العقل والعالم في نفس المكان، فما فيه تأخير بينهما، وجهازك ما يشتغل عليه شي.

**وش تشوف أول ما تفتح:** تفتح رابطاً. أول مرة في اليوم ينتظر العالم دقيقة تقريباً يصحى (أو لقطة دافية جاهزة فينفتح فوراً)، وبعدها نفس المشهد الفوتوريالي من B يوصل كفيديو 1080p أو 4K حسب الإنترنت، والماوس واللمس ويد التحكم ترجع للسحابة في نفس القناة. على الجوال إما نفس العالم أو صفحة خفيفة فيها الحالة والموافقات والإيقاف.

**كيف يبيّن الوكيل وأحداثه:** نفس B بالضبط (النواة، الوكلاء، النبضات، السجل، بطاقة الموافقة، الإيقاف، العداد)، لأن العالم هو نفسه، بس مكانه السحابة.

**الإعدادات ووضع المهندس:** صفحة Architect Control الويب تكلم خدمات السحابة: Remote Control للمحرك + خدمة كونفق صغيرة تحفظ `nexus.config.json` وتبث `config.changed`.

**العقل والملفات:** الكور وHermes وn8n على نفس الجهاز السحابي (أو جهاز صغير دائم التشغيل للعقل، والـGPU يشتغل عند الطلب فقط). ملفاتك تبقى على اللابتوب وتوصلها عبر نفق خاص (Tailscale) أو مجلد متزامن، أو تخلي الكور نفسه على اللابتوب ونفق الأحداث للسحابة.

**الصوت والصوت الحي:** الصوت داخل البث، والصوت الحي عبر LiveKit Cloud من أي جهاز فيه مايك.

**الجهاز والتكلفة:** ولا شي محلي. جهاز GPU سحابي بالساعة (تقريباً $0.5–2/ساعة حسب الكرت والمزود) يتوقف لحاله بعد 15 دقيقة خمول، وجهاز صغير للعقل بشهرية بسيطة. مناطق سحابية قريبة من الإمارات موجودة عند المزودين الكبار، فالتأخير 30–80 ملي ثانية على إنترنت جيد.

**الخصوصية:** المفاتيح في مخزن أسرار السحابة، البث مشفّر، والملفات محلية افتراضياً.

**المخاطر:** الضغط يلطّف التفاصيل الدقيقة، يحتاج إنترنت مستقراً، وقت إقلاع، فاتورة شهرية، وصيانة (تحديثات الجهاز السحابي).

```yaml
# stack.yaml — one GPU VM (or brain VM + on-demand GPU VM)
services:
  brain:      { image: nexus-core,              env_file: .env, ports: ["8787"] }   # Core API + permissions + audit log
  agent:      { image: hermes-agent,            command: "hermes mcp serve" }        # events_poll / permissions_respond
  config:     { image: nexus-config-service,    volumes: ["./nexus.config.json:/data/config.json"] }
  world:      { image: ue5-nexus-pixelstreaming, gpu: true, ports: ["8888"] }        # renders + encodes
  signaling:  { image: pixelstreaming-signalling, ports: ["80", "443"] }             # WebRTC handshake
  turn:       { image: coturn }                                                      # NAT traversal
  voice:      { provider: livekit-cloud }
policy:
  auto_stop_after_idle: 15m
  warm_snapshot: true
  regions_preferred: ["me-central", "me-south"]
```

```html
<!-- any screen: laptop, phone, TV browser -->
<iframe src="https://nexus.example.ae/world?quality=auto" allow="microphone; gamepad; fullscreen"></iframe>
<script>
  // light client for the phone: status + approvals only
  const es = new EventSource("https://nexus.example.ae/events");
  es.onmessage = e => render(JSON.parse(e.data));          // approval.requested -> show 4 buttons
</script>
```

---

## كيف تختلف الثلاثة (بدون تفضيل)

| | A ويب | B محرك على جهازك | C سحابة مبثوثة |
|---|---|---|---|
| الواقعية | متوسطة إلى عالية (مُنمّطة) | الأعلى (فوتوريالي) | الأعلى (فوتوريالي) |
| الجهاز المطلوب | أي لابتوب | كرت شاشة قوي | ولا شي |
| التكلفة الشهرية | 0 | 0 (بعض الأصول مدفوعة) | ساعات GPU + جهاز صغير |
| الجوال/التلفزيون | نعم (متصفح) | ويندوز (اللابتوب أو على التلفزيون) | نعم (أي متصفح) |
| التحكم الحي من برا | WebSocket + كونفق | Remote Control API | Remote Control عبر السحابة |
| الوقت للمشهد الأول | الأقصر | الأطول | متوسط (+ إعداد السحابة) |
| المخاطر | سقف الواقعية | الثقل والجهاز | التأخير والفاتورة والخصوصية |
