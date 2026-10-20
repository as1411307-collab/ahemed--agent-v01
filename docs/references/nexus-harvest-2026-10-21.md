# حصيلة NEXUS — 21 أكتوبر 2026 (ما نأخذه من الملفات الثلاثة اللي أرسلها أحمد)

أحمد أرسل جدول ميزات (`nexus-feature-table-2026-10-21.csv`) وملفَي HTML كاملين من نفس العائلة: **NEXUS v1 "Ultimate Command Interface"** (`nexus-v1-ultimate-command-2026-10-21.html`) و**NEXUS v2 "Cinematic Command Center"** (`nexus-v2-cinematic-command-2026-10-21.html`). الملفات الأصلية محفوظة كما هي جنب هذا الملف. التعليمة: نأخذ الأفضل ونجمع كل ما يفيد، وأحمد يقرر في الآخر. هذا الملف هو الحصيلة، مب حكم.

الطريقة اللي تخلي كل شي تحت قابل للاستخدام عندنا: الهيكل والميكانيكا ننقلها كما هي، و**الجلد** (الألوان والخط) يتبدل من مكان واحد. في v2 كل الألوان متغيرات في `:root` (11 متغير)، فتبديلها للوحة أحمد (`#0A0A0B` + ذهبي `#D4AF37→#F0C75E`) يغيّر الإحساس كله بدون لمس البنية.

## 1) النبضة اللي تمشي على الخط (أهم شي في الملفين)

خط SVG متقطع يتحرك باستمرار، ولما يكون نشطاً يصير أعرض وأوضح ويتوهج بلون الوكيل نفسه. هذي "نبضة تمشي على الخط وترجع بالنتيجة" بثلاث قواعد CSS:

```css
.connector-line { stroke-width: 2; fill: none; stroke-dasharray: 8 4; opacity: .6;
                  animation: dashFlow 1.5s linear infinite; }
.connector-line.active { opacity: 1; stroke-width: 3; filter: drop-shadow(0 0 10px currentColor); }
@keyframes dashFlow { to { stroke-dashoffset: -24; } }   /* -24 = 2 × (8+4) فتبقى الحركة سلسة */
```

- اتجاه الرجوع (تراجع/rollback): نفس الحركة بـ `stroke-dashoffset: 24` بدل `-24`.
- السرعة = حالة: `1.5s` عادي، أسرع وقت التنفيذ، وتوقف الحركة مع `animation-play-state: paused` وقت الانتظار/الموافقة.
- اللون يأتي من `stroke` = لون الوكيل، فكل خط يحمل هوية صاحبه.

## 2) لون واحد يمشي في كل شي (`currentColor`)

في v2 يحطون لون الوكيل مرة واحدة على العنصر (`el.style.color = agent.color`) ثم كل التوهجات تستخدم `currentColor`:

```css
.sub-agent.active { animation: agentActive 1s ease-in-out infinite; box-shadow: 0 0 40px currentColor; }
.sub-agent-icon   { filter: drop-shadow(0 0 10px currentColor); }
```

فالحدود والأيقونة والتوهج والخط كلها بلون واحد بدون تكرار. يناسب الثيمات: تغيّر لون الوكيل من مكان واحد.

## 3) الكور له حالة "يفكر" ظاهرة

نفس الكرة، صنف إضافي وقت ما يكون طلب شغّال: نبض أسرع (0.5s بدل 3s) وتوهج أكبر، وينشال لما يرجع الرد.

```css
.core-orb          { animation: corePulse 3s ease-in-out infinite; transition: all .5s ease; }
.core-orb.thinking { animation: coreThinking .5s ease-in-out infinite; /* + box-shadow أقوى */ }
```

هذا جواب السؤال الأول من أسئلتنا الأربعة (يشوف أحمد شو يسوي الوكيل الحين؟) بأبسط صورة. عندنا الشكل نفسه ممكن يكون القلب/بطاقة الحالة بدل الكرة.

## 4) إضاءة النشاط: حدث → عقدتان تضيئان + الخط يضيء + سطر في السجل → تنطفئ

v2 يسوي "محاكاة" كل 8 ثواني برسالة عشوائية من وكيل إلى وكيل. الميكانيكا هي اللي نأخذها، والبيانات تنبدل بمصدر الأحداث الحقيقي أو تسجيل JSON (نفس توقيع الدالة):

```js
function showActivity(ev) {                      // ev = { from, to, text }
  const a = document.getElementById(`agent-${ev.from}`);
  const b = document.getElementById(`agent-${ev.to}`);
  const line = document.getElementById(`connector-${ev.from}`);
  [a, b, line].forEach(el => el.classList.add('active'));
  addTerminalLine('agent', `${ev.from} → ${ev.to}: ${ev.text}`);
  addThinkingEntry(`${ev.from} communicating with ${ev.to}`);
  setTimeout(() => [a, b, line].forEach(el => el.classList.remove('active')), 3000);
}
```

- في النسخة الحقيقية: `showActivity` تستدعى من بث الأحداث (مهمة بدأت / خطوة أداة / نجاح / فشل)، والمدة 3 ثواني تصير "حتى يجي حدث الانتهاء".
- الخريطة في `agent-vehicle-world` (الحدث → شو يصير في العالم) تنطبق هنا حرفياً.

## 5) سجل التفكير الحي + طرفية الأحداث (لوحتان صغيرتان على الأطراف)

- **Live Thinking Log** (فوق يسار): سطر لكل خطوة مع الوقت، الأحدث فوق، بحد 10 أسطر، وحركة دخول خفيفة. = "سطر قصير على الشاشة الرئيسية لكل خطوة تفكير أو نداء أداة".
- **Neural Terminal** (تحت يسار): أسطر مصنّفة، كل نوع له لون، بحد 50 سطر، ورأس يصغّر اللوحة لشريط 40px بضغطة:

| النوع | اللون في v2 | عندنا |
|---|---|---|
| `api-call` | أزرق | نداء موديل/أداة |
| `token` | كهرماني | عداد التكلفة (بذرة سؤال "كم كلّف؟") |
| `agent` | وردي | رسالة بين وكيلين |
| `system` | أخضر | حالة النظام |
| `scene` | وردي عريض | تغيّر المشهد/الثيم |

النمط: `addTerminalLine(type, text)` تحط الوقت وتدرج السطر وتحذف الزائد. بسيط وكافٍ لنسخة أولى من "المعلومات المحيطة على الأطراف، خفيفة".

## 6) نظام المشاهد (chapters) كمحرك خلفية

```js
const scenes = [{ name, colors: [...5 gradient stops], draw(ctx, w, h, time) {...} }, ...];
function animateBackground() {            // كل إطار: تدرج عمودي من ألوان المشهد ثم رسم المشهد
  paintGradient(scenes[current].colors); scenes[current].draw(ctx, W, H, time++);
  requestAnimationFrame(animateBackground);
}
function advanceChapter() { current = (current + 1) % scenes.length; /* + تحديث بطاقة المشهد والسجل */ }
```

- الثيم عندنا = مشهد: `name + colors + draw + sounds`. تبديل الثيم يبدّل الخلفية والجو كله، مب لون بس.
- بطاقة "المشهد الحالي" فوق يمين: عنصر HUD صغير يعرض اسم المشهد.
- وصفات الرسم الموجودة في v2 (تنفع كـ2D خفيف أو كمرجع لمشهد Three.js):
  - **شمس غروب** بـ`createRadialGradient` ثلاث درجات (أصفر → برتقالي شفاف → صفر).
  - **غيوم تنجرف**: `x = (time*0.02 + i*120) % (w+300) - 150` و`y = base + sin(time*0.001+i)*40`، كل غيمة دائرة بتدرج أبيض شفاف. (مشهد "SUNSET CLOUDS" هو نسخة 2D من مشهدنا الأول: بحر غيوم وغروب.)
  - **شفق قطبي**: 5 خطوط جيبية بعرض وشفافية متناقصين `lineWidth: 30 - i*5`، `alpha: .2 - i*.03`.
  - **مدينة أضواء تطفو**: مستطيلات مع نوافذ تضيء وتنطفئ `sin(time*0.002+i+j) > 0`، وتوهج تحت كل مبنى.
  - **طبقات كثبان/ضباب**: 4 طبقات جيبية بشفافية تزيد مع كل طبقة = عمق.
  - **نجوم تومض**: `0.5 + sin(time*0.005+i)*0.5`.
  - **شفافية بالهيكس**: `color + Math.floor(a*255).toString(16).padStart(2,'0')`.
  - **تغيير الوقت**: `time++` كل إطار؛ عندنا يصير مرتبط بساعة الواقع (موضع الشمس).

## 7) أصوات الواجهة بدون ملفات (Web Audio)

```js
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, duration, type = 'sine', volume = 0.1) {
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + duration);
}
const click   = () => playTone(800, .08, 'square', .05);
const success = () => { playTone(523, .1); setTimeout(() => playTone(659, .1), 100); setTimeout(() => playTone(784, .15), 200); };
```

- لنسخة أدفأ وأهدأ: `sine` بدل `square`، ترددات أقل (مثلاً 440/330)، مدة أطول (.2–.4) وصوت أخفض (.03). ثلاث نوتات C-E-G للنجاح، ونوتة نازلة للفشل.
- يكمّل `openverse-sounds` (الجو والصوتيات الطويلة من Openverse/Kenney)، وهذا للنقرات والتأكيدات الفورية.
- ملاحظة تشغيل: المتصفح يطلب تفاعل مستخدم قبل الصوت، وزر "ابدأ" في الافتتاحية يحل هذا.

## 8) توزيع الوكلاء حول الكور بدائرة

```js
const angle = (i / n) * Math.PI * 2 - Math.PI / 2;      // يبدأ من فوق ويدور مع الساعة
const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
```

كل وكيل يأخذ موضعه ولونه، والخط من المركز إليه بنفس اللون. عندنا الوكلاء يجون من قائمة الروابط الحقيقية، وهذي الحسبة تنفع للعرض الخارجي (الأسطول/الزوم أوت) حتى في 3D بإسقاطها على مستوى.

## 9) لوحة سير العمل بأسلوب n8n بدون مكتبة (v1)

- **تشريح العقدة**: رأس (أيقونة ملونة + عنوان) / محتوى / منفذان (`input` يسار، `output` يمين). حالة `active` بحد أخضر متوهج.
- **التوصيل**: ضغطة على منفذ خروج ثم منفذ دخول تنشئ وصلة؛ يرفض الربط إذا نفس العقدة أو نفس نوع المنفذ.
- **الخط**: منحنى Bezier يُعاد حسابه عند السحب من `getBoundingClientRect()`:

```js
const midX = (x1 + x2) / 2;
path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
```

- **السحب**: `onmousedown` يسجل الموضع، `onmousemove` يحرّك `top/left` ويستدعي `updateConnections()`.
- هذا كافٍ لنموذج أول بملف واحد. للنسخة الحقيقية عندنا `react-flow` (`@xyflow/react`) يسوي نفس الشي مع التكبير والتخطيط التلقائي، والعقد تجي من الأحداث مب من أزرار "+ TRIGGER".

## 10) اللوحات الجانبية تنسحب فوق المشهد (v1)

```css
.settings-panel    { position: fixed; top: 0; right: -500px; width: 500px; height: 100%;
                     backdrop-filter: blur(40px); transition: right .6s cubic-bezier(.4, 0, .2, 1); }
.settings-panel.open { right: 0; }
```

نفس النمط من اليسار للروابط. لوحة الإعدادات عندنا تطلع من الجنب وتصغر وتتسكر، فهذا الأساس. (في RTL اللوحة الرئيسية تطلع من اليمين.)

## 11) أشياء صغيرة تستاهل

- **الانتقال من الافتتاحية**: طبقتان، الأولى `opacity → 0` خلال ثانيتين ثم `pointer-events: none`، والثانية تظهر بنفس المدة. بسيط وناعم.
- **رسائل الشات**: فقاعة المستخدم تتزحلق من تحت (`messageSlide` 0.4s)، ومنسّق صغير يحوّل `**نص**` إلى عريض و`\n` إلى سطر جديد.
- **منطقة إسقاط الملفات** (v1): `dragover/dragleave/drop` تضيف صنفاً للتظليل، وبعد الاستلام الوكيل يكتب في الشات "استلمت الملف". هذي لحظة "المذكرة تصير مهمة".
- **خانة "اسم الوكيل"** في الإعدادات (v1): لمسة تخلي أحمد يسمّي وكيله.
- **كوريوغرافيا الرد** (v2): رسالة → الكور `thinking` → سطر "Processing" في السجل → `POST` + تقدير رموز في الطرفية → بعد 0.5s سطر وسطي → بعد 1.5s الرد + رموز الخرج + "Response delivered" + صوت النجاح. تنفع كجدول زمني لمشغّل الأحداث الوهمي.
- **خلفية النجوم بأثر** (v1): `fillRect` بأسود شفاف 0.1 كل إطار يترك ذيلاً خفيفاً، وارتعاش `alpha` عشوائي للوميض. بتبديل اللون لدافي والاتجاه لأعلى ببطء تصير غباراً أو شراراً يطفو في غرفة مظلمة.
- **ملف HTML واحد**: كل التجارب فوق تنفتح بضغطة وتنصوّر بلقطة شاشة قبل ما نلمس Expo أو الكور.

## 12) اللي ينتقل مكانه (مب ينحذف)

- مفتاح API واختيار الموديل والـSystem Prompt (v1): مكانها الكور، اللي يملك الاتصال بالموديل أصلاً؛ الواجهة تعرض الحالة وتبعث الرسائل.
- زر RUN ومحاكاة النشاط العشوائية وتبديل الروابط الوهمي: تنبدل بمصدر الأحداث الحقيقي أو تسجيل JSON يعاد تشغيله، بنفس الدوال (`showActivity`، `addTerminalLine`، `addThinkingEntry`).

## 13) ملاحظات تشغيلية لو انستخدم الملف كما هو

- `FileReader.readAsText` يقرأ PDF والصور كنص (يطلع خربطة)؛ للصور `readAsDataURL`.
- v1 يحمّل Chart.js وما يستخدمه. بعض الأيقونات (إيموجي) ضاعت في النسخ وطلعت نصوصاً فارغة.
- `dir="rtl"` معلن لكن التموضع كله `left/right` ثابت والنصوص إنجليزية؛ عندنا سكل `arabic-rtl-ui`.
- ما فيه `prefers-reduced-motion`؛ عندنا خيار تقليل الحركة من أول يوم.
- `setInterval` و`requestAnimationFrame` ما يتوقفان لما التبويب مخفي؛ نوقفهما مع `document.hidden`.

## جدول الميزات (CSV) — وش يقابله فوق

| الميزة في الجدول | وين نلقاها |
|---|---|
| شاشة افتتاحية سينمائية | §11 الانتقال، مع نسختنا من `ops-room-spec` (سواد، شعار يتنفس، خط ذهبي) |
| خلفية ديناميكية | §6 نظام المشاهد + §11 الجسيمات |
| نظام صوتي (UI + Ambient) | §7 + سكل `openverse-sounds` |
| ربط حقيقي بالموديل | §12 (في الكور) |
| إعدادات AI كاملة | §12 (في الكور) + §10 لوحة جانبية |
| تأثيرات Glow/Bloom/Particles | §1–§3 و§6 و§11 |
| HUD ببيانات حية | §4–§5 مع مصدر أحداث حقيقي |
| شات ذكي | §11 رسائل الشات + §3 حالة التفكير |
