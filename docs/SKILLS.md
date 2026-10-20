# سكلز التصميم والحركة والـ3D والرسم الحي والصوت — الفهرس

آخر تحديث: 2026-10-20 (الليل)

هذا الملف يقول لأي جلسة Claude Code: وش السكلز الموجودة، من وين جات، ومتى تُستخدم. التفاصيل الكاملة لكل سكل في `SKILL.md` حقه داخل `.claude/skills/`. هذا فهرس أدوات فقط؛ القرارات في `docs/DECISIONS.md` وما تغيّرت.

## التثبيت (مرة وحدة على اللابتوب)

`design-dna` موجود في الريبو. الباقي بأمر واحد من جذر المشروع في PowerShell:

```powershell
.\scripts\install-design-skills.ps1
```

السكربت يثبّت كل مصدر بـ `npx skills add` على مستوى المشروع (مب عام)، ينسخ الملفات بدل الروابط الرمزية عشان Windows، ويسجّل النسخ في `skills-lock.json`. بعدها تُراجع المجلدات الجديدة وتُحفظ: `git add .claude skills-lock.json` ثم commit. التحديث لاحقاً: `npx skills update -p -y`.

ليش ما انحطت الملفات كلها في الريبو من هنا؟ بيئة Claude السحابية سمحت بتثبيت واحد (design-dna) ومنعت الباقي (حماية من نسخ كود خارجي داخل ريبو أحمد)، فالتثبيت يكمل على اللابتوب.

## الترتيب: ركّبهم فوق بعض

نفس ترتيب البوست:

1. **الاتجاه** — `design-dna` يثبّت شكل كل شي قبل أي كود: المدخل صور أحمد المرجعية، المخرج `docs/design-dna.json` واحد يقرأه كل شي بعده. معه `ui-ux-pro-max` (نظام تصميم: ألوان، خطوط، أسلوب) و`impeccable` (يفحص ويصلّح شكل "الذكاء الاصطناعي"). الذوق النهائي دايماً لسكل `ahmed-design-taste`؛ لو تعارضوا، أحمد يفوز.
2. **الحركة** — `motion-design` (التوقيت والـeasing وترتيب الحركة) + `gsap-*` (التنفيذ) + `motion` (منحنيات spring بالـCSS). كل حركة تمر من هنا: فتح لوحة، نبضة على خط، ظهور عنصر.
3. **العمق** — `threejs-*` + `r3f-best-practices` + `three-best-practices`: المشاهد ثلاثية الأبعاد، الإضاءة، الضباب، post-processing (bloom، عمق ميدان)، الفيزياء (Rapier).
4. **الرسم الحي** — `react-flow`: رسم العقد والروابط والمسارات اللي تضيء وهي تشتغل، مربوط ببيانات حقيقية.
5. **اللمسة الأخيرة** — `genjutsu` (cast للحركة الدقيقة، paint للهوية). بعد ما يشتغل الشي، مب قبل.
6. **الرسومات والأصول والصوت والفيديو** — `anatomy` / `anatomy-reveal` / `hairline-*` للرسومات والأيقونات والشروحات، `blender-image-to-3d` لتحويل صور المفهوم إلى مجسمات GLB، `openverse-sounds` للمؤثرات الصوتية، `remotion-*` لمقاطع الانتقال والفيديو التعريفي، وسكلز `livekit` لوضع الصوت لما يجي وقته.

مب عارف من وين تبدأ؟ `design-dna` أول، على الصور المرجعية.

## الجدول

| السكل (المجلد) | المصدر / الرخصة | وش يسوي | متى يُستخدم هنا |
|---|---|---|---|
| `design-dna` ✅ في الريبو | [zanwei/design-dna](https://github.com/zanwei/design-dna) · MIT | يحلّل صور أو روابط مرجعية إلى JSON بثلاث طبقات: tokens (ألوان، خطوط، مسافات، حركة)، أسلوب (المزاج، التكوين)، مؤثرات (WebGL، جزيئات، زجاج). ويولّد تصميم من الـJSON. | أول خطوة. مرة وحدة على مراجع أحمد، الناتج `docs/design-dna.json` يُقرأ قبل كل شاشة. |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) · MIT | يولّد نظام تصميم كامل من وصف المشروع: الأسلوب، الألوان (192 لوحة)، الخطوط (74 زوج)، المؤثرات، الأخطاء الممنوعة، وقائمة فحص قبل التسليم. يحفظ النظام في ملف لإعادة الاستخدام. | مع design-dna في البداية لاختيار الأسلوب والخطوط، ثم كمرجع ثابت. لو خالف ذوق أحمد، ذوق أحمد يفوز. |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) · Apache-2.0 | `/impeccable craft / critique / audit / polish / animate`: يبني ويراجع الواجهة ضد 61 قاعدة تكشف شكل "الذكاء الاصطناعي" (مستطيلات وأزرار متشابهة، ألوان جاهزة)، مع معاينة حية في المتصفح. | بعد كل شاشة: `audit` ثم `polish`. `animate` للحركات الدقيقة. |
| `motion-design` | [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) · MIT | مبادئ الحركة: توقيت، easing، choreography، مبادئ ديزني الـ12 للواجهات. مع CSS أو GSAP أو أي نظام. | قبل كتابة أي حركة. يحدد الأرقام (المدة، التأخير، المنحنى) قبل الكود. |
| `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-performance`, `gsap-frameworks` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (رسمي) · MIT | تنفيذ الحركة بـ GSAP: timelines، stagger، ScrollTrigger، React (`useGSAP`)، الأداء. GSAP مجاني بالكامل. | الحركات المتسلسلة: نبضة المهمة على الخط، تسلسل ظهور العناصر، صفحة الانتقال، فتح اللوحات الجانبية. |
| `motion` | [motiondivision/ai-kit](https://github.com/motiondivision/ai-kit) (الجزء المجاني) | سكل `/motion`: منحنيات spring بـ CSS `linear()`، easing، أفضل الممارسات، فحص أداء الحركة. | حركات الواجهة الخفيفة (اللوحات، البطاقات، الأزرار) بدون مكتبة. الـMCP وMotion+ ما انضافوا (قاعدة المشروع: لا MCP). |
| `threejs-fundamentals`, `threejs-lighting`, `threejs-materials`, `threejs-textures`, `threejs-geometry`, `threejs-loaders`, `threejs-asset-pipeline`, `threejs-animation`, `threejs-interaction`, `threejs-postprocessing`, `threejs-shaders`, `threejs-performance`, `threejs-react-three-fiber` | [cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills) · MIT | Three.js كامل: المشهد والكاميرا والضباب، الإضاءة الفيزيائية والـHDR، الخامات PBR، تحميل GLB، الحركة، الاختيار بالماوس، post-processing (bloom، عمق ميدان)، shaders، الأداء، وR3F. | أي شاشة فيها عمق أو مشهد ثلاثي الأبعاد أو خلفية حية: `fundamentals` + `lighting` + `postprocessing` + `react-three-fiber` أولاً. |
| `r3f-best-practices`, `three-best-practices` | [emalorenzo/three-agent-skills](https://github.com/emalorenzo/three-agent-skills) · MIT | قواعد React Three Fiber وبيئة pmndrs: drei، `useFrame` بدون setState، Suspense، zustand، الأداء، وفيها **react-three-rapier** (فيزياء: جاذبية وتصادم) و**react-postprocessing** (`<Bloom/>`, `<DepthOfField/>`). | كل كود R3F يُراجع عليها. الفيزياء للعناصر الطايرة/المتحركة، والـpostprocessing للتوهج والعمق. |
| `react-flow` | [framara/react-flow-skill](https://github.com/framara/react-flow-skill) · MIT | React Flow (`@xyflow/react`): رسوم عقد وروابط تفاعلية، عقد وحواف مخصصة، handles، إدارة الحالة، التخطيط التلقائي، TypeScript، الأداء. | لوحة الأتمتة الحية بأسلوب n8n: العقد تضيء وهي تشتغل، النبضة تمشي على الخط، الفشل بلون تحذيري، التراجع نبضة للخلف، إضافة/حذف مسار يدوياً. الحركة فوقها بـ GSAP. |
| `genjutsu` (cast / paint / bunshin) | [AThevon/genjutsu](https://github.com/AThevon/genjutsu) · MIT | إبداع بصري بدون شكل "الذكاء الاصطناعي": `cast` يحرّك واجهة موجودة، `paint` يرسم هوية بصرية كاملة، `bunshin` يبني موقع كامل بفريق وكلاء. | `cast` بعد ما تشتغل الشاشة. `paint` فقط لو احتجنا هوية من الصفر. **`bunshin` ممنوع** (سكل `agent-spawn-guard`: لا أسراب وكلاء). |
| `anatomy` | [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) · MIT | رسومات أيزومترية تفاعلية بـ SVG/WebGL من أجزاء كثيرة دقيقة، تشرح نظام أو فكرة. يحتاج Node 20+. | بطاقة تفاصيل الوكيل (الدور، الأدوات، المسار)، شرح هيكل الوكيل، صفحة "كيف يشتغل" في الإعدادات. |
| `anatomy-reveal` | [annnguyentt/anatomy-reveal-skill](https://github.com/annnguyentt/anatomy-reveal-skill) · MIT | يبني جسم مادي كرسمة أيزومترية من أجزاء، ويطلّع فيديو تفكيك/كشف. يحتاج Node 20+، Chrome، ffmpeg، ImageMagick. | فيديو كشف أو تعريف. اختياري. |
| `hairline-create`, `hairline-adopt` | [lucasmarkes/hairline](https://github.com/lucasmarkes/hairline) · MIT | رسومات خطية رفيعة تتفاعل مع المؤشر، من فكرة (`create`) أو من SVG موجود (`adopt`). React أو DOM. | الأيقونات، الشعار الهندسي المحايد وهو "يتنفس" في صفحة الانتقال، رسومات الروابط. |
| `blender-image-to-3d` | [majidmanzarpour/blender-game-skills](https://github.com/majidmanzarpour/blender-game-skills) · MIT | من صور مرجعية إلى مجسم GLB جاهز للعبة في Blender، بمراحل تُفحص بالرندر مقارنةً بالمرجع. يحتاج Blender 4.2+. | لما نحتاج مجسم حقيقي من صورة مفهوم (مب مرسوم بالكود). البديل الأسرع: TRELLIS / Hunyuan3D على Hugging Face ثم تنظيف بهالسكل. |
| `openverse-sounds` ✅ في الريبو | سكل المشروع (Openverse API) | بحث وتنزيل مؤثرات صوتية مجانية مرخصة (CC0 / CC-BY) مع تسجيل الرخصة. | أي صوت في الواجهة: الجو، النقرات، التنبيهات، الموافقة، الفشل. |
| `remotion-best-practices` (+ 11 سكل `remotion-*`) | [remotion-dev/skills](https://github.com/remotion-dev/skills) · رخصة Remotion (مجاني للأفراد) | فيديو سينمائي بالكود (React)، تصدير MP4، captions، Three.js داخل الفيديو. | مقاطع الانتقال، فيديو تعريفي قصير، أو عرض اللقطات قبل بناء شاشة. مب للواجهة الحية نفسها. |
| `building-livekit-agents`, `reading-livekit-docs`, `testing-livekit-agents`, `debugging-livekit-agents`, `writing-livekit-scenarios`, `running-livekit-simulations`, `operating-livekit-agents` | [livekit/agent-skills](https://github.com/livekit/agent-skills) (رسمي) · MIT | بناء واختبار وتشغيل وكلاء صوت LiveKit: المعمارية، زمن الاستجابة، الاختبارات، المحاكاة، النشر. (السكلز بس؛ الـMCP ما انضاف.) | وضع الصوت لما يجي وقته: زر صوت مثل تطبيق Claude، عربي عامي. النسخة الأولى نص. |

السكلز الأقدم في المشروع تبقى وتُستخدم معها: `ahmed-design-taste` (الذوق، يفوز على الكل)، `frontend-design`، `arabic-rtl-ui` (العربي سليم قبل أي شاشة فيها نص)، `show-me-screenshot` (كل تغيير بصري يُعرض صورة)، `decisions-log`، `where-we-stopped`، `agent-spawn-guard`، `session-budget`.

## المكتبات اللي تقابل هالسكلز (لما تنبنى واجهة ويب)

للمرجع، تُضاف في `package.json` حق أي تطبيق ويب يستخدم هالسكلز:

- 3D: `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`, `@react-three/rapier`
- الحركة: `gsap`, `@gsap/react`, `motion`
- الرسم الحي: `@xyflow/react`, `@dagrejs/dagre` أو `elkjs` للتخطيط التلقائي
- الحالة والبيانات الحية: `zustand`, بث أحداث (SSE أو WebSocket) من مصدر الوكيل
- الصوت: `howler` للمؤثرات، و`livekit-client` + `@livekit/components-react` لوضع الصوت لاحقاً
- العربي: خط عربي متصل واضح (مثل IBM Plex Sans Arabic أو Noto Naskh Arabic) و`dir="rtl"` مع تبديل (سكل `arabic-rtl-ui`)

## ما انضاف، وليش

- **إضافة Unity الرسمية** (`unity:*` على اللابتوب): موجودة أصلاً، ما تحتاج تثبيت من هنا.
- **Motion+ MCP** و**LiveKit Docs MCP** و**Blender MCP**: قاعدة المشروع لا MCP؛ السكلز نفسها تكفي، والوثائق عبر `find-docs`.
- **سكلز Cloud Atlas الثلاث** (فيديو @ebrahem_bin_essa): ما نُشرت علناً. الفكرة (مذكرة تصير مهمة والوكيل يرجع بالنتيجة) محفوظة في `docs/references/`.
- **سكل الفيديو السينمائي** (فيديو "Claude cooked"): ما سُمّي في الفيديو؛ أقرب شي علني `remotion-*`، وانضاف.
- **prompt-motion.com**: مب سكل، مكتبة برومبتات حركة جاهزة. طريقتها في `docs/references/design-skill-sources-2026-10-20.md`.

## ضوابط عامة

- كل تغيير بصري يُعرض لأحمد صورة (`show-me-screenshot`) ويوقف لرأيه. شاشة وحدة في كل مرة.
- لا أسراب وكلاء ولا `bunshin` ولا أي fan-out (`agent-spawn-guard`).
- أي أداة تحتاج تثبيت على الجهاز (Blender، ffmpeg، ImageMagick، Chrome) تُطلب من أحمد قبل التثبيت ولا تُثبّت عالمياً (CLAUDE.md).
- السكلز كود طرف ثالث: اقرأ `SKILL.md` والسكربتات قبل تشغيل أي سكربت منها أول مرة، ولا تُشغّل أي شي يرسل بيانات للخارج.
