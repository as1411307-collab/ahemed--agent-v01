# سكلز التصميم والحركة والـ3D — الفهرس

آخر تحديث: 2026-10-20

هذا الملف يقول لأي جلسة Claude Code: وش السكلز الموجودة، من وين جات، ومتى تُستخدم في عالم مركبة الوكيل. التفاصيل الكاملة لكل سكل في `SKILL.md` حقه داخل `.claude/skills/`.

## التثبيت (مرة وحدة على اللابتوب)

من جذر المشروع في PowerShell:

```powershell
.\scripts\install-design-skills.ps1
```

السكربت يثبّت كل مصدر بـ `npx skills add` على مستوى المشروع (مب عام)، وينسخ الملفات بدل الروابط الرمزية عشان تشتغل على Windows، ويسجّل النسخ في `skills-lock.json`. بعدها تُراجع المجلدات الجديدة وتُحفظ في git: `.claude/skills/`، `.agents/skills/`، `skills-lock.json`. التحديث لاحقاً: `npx skills update -p -y`.

ليش ما انحطت الملفات في الريبو مباشرة؟ بيئة Claude السحابية ما تسمح بنسخ كود من مستودعات خارجية داخل ريبو أحمد، فالتثبيت يصير على اللابتوب بالسكربت.

## الترتيب: ركّبهم فوق بعض

نفس ترتيب البوست، مربوط بعالم المركبة:

1. **الاتجاه** — `design-dna` يثبّت شكل كل شي قبل أي كود. المدخل: الصور المرجعية (مقصورة الطائرة الزجاجية، مشاهد الغروب والليل، صور المفهوم في `docs/references/`). المخرج: `design-dna.json` واحد يقرأه كل مشهد. الذوق النهائي دايماً لسكل `ahmed-design-taste`؛ لو تعارضا، أحمد يفوز.
2. **الحركة** — `motion-design` (التوقيت والـeasing وترتيب الحركة) + `gsap-*` (التنفيذ) + `motion` (منحنيات spring بالـCSS). كل حركة في المقصورة تمر من هنا: فتح لوحة الإعدادات، نبضة المهمة على الخط، ظهور مركبة جديدة.
3. **العمق** — `threejs-*` + `r3f-best-practices` + `three-best-practices`. المشهد نفسه: المقصورة، الزجاج، بحر الغيوم، السما والشمس بساعة الواقع، الأسطول، الـpost-processing (bloom، ضباب، عمق ميدان) والفيزياء (Rapier) للمركبات الصغيرة.
4. **اللمسة الأخيرة** — `genjutsu` (cast للحركة الدقيقة، paint للهوية البصرية). يُستخدم بعد ما يشتغل المشهد، مب قبل.
5. **الرسومات والأصول والصوت** — `anatomy` / `hairline-*` للبطاقات الهولوغرامية والأيقونات والشروحات، `blender-image-to-3d` لتحويل صور المفهوم إلى مجسمات GLB، `openverse-sounds` للأصوات، `remotion-*` لمقاطع الانتقال والفيديو التعريفي.

مب عارف من وين تبدأ؟ `design-dna` أول، على الصور المرجعية.

## الجدول

| السكل (المجلد) | المصدر / الرخصة | وش يسوي | متى يُستخدم هنا |
|---|---|---|---|
| `design-dna` | [zanwei/design-dna](https://github.com/zanwei/design-dna) · MIT | يحلّل صور أو روابط مرجعية إلى JSON بثلاث طبقات: tokens (ألوان، خطوط، مسافات، حركة)، أسلوب (المزاج، التكوين)، مؤثرات (WebGL، جزيئات، زجاج). ويولّد تصميم من الـJSON. | أول خطوة. مرة وحدة على مراجع أحمد، والناتج يُحفظ في `docs/design-dna.json` ويُقرأ في كل مشهد. |
| `motion-design` | [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) · MIT | مبادئ الحركة: توقيت، easing، choreography، مبادئ ديزني الـ12 للواجهات. يشتغل مع CSS أو GSAP أو أي نظام. | قبل كتابة أي حركة. يحدد الأرقام (المدة، التأخير، المنحنى) قبل الكود. |
| `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-performance`, `gsap-frameworks` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (رسمي) · MIT | تنفيذ الحركة بـ GSAP: timelines، stagger، ScrollTrigger، React (`useGSAP`)، الأداء. GSAP صار مجاني بالكامل. | الحركات المتسلسلة: نبضة المهمة على الخط، تسلسل ظهور المركبة، صفحة الانتقال، تكبير الشاشة الرئيسية. `gsap-react` لو المشهد بـ R3F. |
| `motion` | [motiondivision/ai-kit](https://github.com/motiondivision/ai-kit) (الجزء المجاني) | سكل `/motion`: منحنيات spring بـ CSS `linear()`، easing، أفضل الممارسات، فحص الأداء. | حركات الواجهة الخفيفة (اللوحات، البطاقات، الأزرار) بدون مكتبة. ملاحظة: الـMCP وMotion+ ما انضافوا (قاعدة المشروع: لا MCP). |
| `threejs-fundamentals`, `threejs-lighting`, `threejs-materials`, `threejs-textures`, `threejs-geometry`, `threejs-loaders`, `threejs-asset-pipeline`, `threejs-animation`, `threejs-interaction`, `threejs-postprocessing`, `threejs-shaders`, `threejs-performance`, `threejs-react-three-fiber` | [cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills) · MIT | Three.js كامل: المشهد والكاميرا والضباب، الإضاءة الفيزيائية والـHDR، الخامات PBR، تحميل GLB (Draco/KTX2)، الحركة، الاختيار بالماوس، post-processing (bloom، عمق ميدان)، shaders، الأداء، وR3F. | قلب العالم. المشهد الأول: `fundamentals` + `lighting` + `loaders` + `postprocessing` + `react-three-fiber`. السما بساعة الواقع: `lighting` + `shaders`. الأسطول: `animation` + `interaction`. |
| `r3f-best-practices`, `three-best-practices` | [emalorenzo/three-agent-skills](https://github.com/emalorenzo/three-agent-skills) · MIT | قواعد React Three Fiber وبيئة pmndrs: drei، `useFrame` بدون setState، Suspense، zustand، الأداء، وفيها **react-three-rapier** (فيزياء: جاذبية وتصادم) و**react-postprocessing** (`<Bloom/>`, `<DepthOfField/>`). | كل كود R3F يُراجع عليها. الفيزياء للمركبات الصغيرة وهي تطير جنب الأم، والـpostprocessing للتوهج والعمق. |
| `genjutsu` (cast / paint / bunshin) | [AThevon/genjutsu](https://github.com/AThevon/genjutsu) · MIT | إبداع بصري بدون "شكل الذكاء الاصطناعي": `cast` يحرّك واجهة موجودة (micro-interactions)، `paint` يرسم هوية بصرية كاملة، `bunshin` يبني موقع كامل بفريق وكلاء. | `cast` بعد ما يشتغل المشهد الأول. `paint` فقط لو احتجنا هوية من الصفر. **`bunshin` ممنوع** في هالمشروع (سكل `agent-spawn-guard`: لا أسراب وكلاء). |
| `anatomy` | [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) · MIT | رسومات أيزومترية تفاعلية بـ SVG/WebGL من أجزاء كثيرة دقيقة، تشرح نظام أو فكرة. يحتاج Node 20+. | بطاقة الوكيل الهولوغرامية (الدور، الأدوات، المسار)، شرح هيكل الوكيل في `docs/`، وصفحة "كيف يشتغل" داخل الإعدادات. |
| `anatomy-reveal` | [annnguyentt/anatomy-reveal-skill](https://github.com/annnguyentt/anatomy-reveal-skill) · MIT | يبني جسم مادي كرسمة أيزومترية من أجزاء، ويطلّع فيديو تفكيك/كشف. يحتاج Node 20+، Chrome، ffmpeg، ImageMagick. | فيديو كشف المركبة الأم جزء جزء (للتعريف أو لصفحة الانتقال). اختياري. |
| `hairline-create`, `hairline-adopt` | [lucasmarkes/hairline](https://github.com/lucasmarkes/hairline) · MIT | رسومات خطية رفيعة تتفاعل مع المؤشر، من فكرة (`create`) أو من SVG موجود (`adopt`). React أو DOM. | أيقونات الكونسول والشعار الهندسي المحايد وهو "يتنفس" في صفحة الانتقال، ورسومات الروابط في وضع الأسطول. |
| `blender-image-to-3d` | [majidmanzarpour/blender-game-skills](https://github.com/majidmanzarpour/blender-game-skills) · MIT | من صور مرجعية (صور مفهوم، لقطات) إلى مجسم جاهز للعبة في Blender، بمراحل تُفحص بالرندر مقارنةً بالمرجع. يحتاج Blender 4.2+. | خط الأصول: المقصورة، المركبة الأم، المركبة الصغيرة، الكونسول — من صور المفهوم إلى GLB يدخل المشهد. البديل الأسرع: TRELLIS / Hunyuan3D على Hugging Face ثم تنظيف بهالسكل. |
| `openverse-sounds` | سكل المشروع (Openverse API) | بحث وتنزيل أصوات مجانية مرخصة (CC0 / CC-BY) مع تسجيل الرخصة. | همس المحرك، نقرات الكونسول، صوت ظهور مركبة، تنبيه الموافقة. |
| `remotion-best-practices` (+ 11 سكل `remotion-*`) | [remotion-dev/skills](https://github.com/remotion-dev/skills) · رخصة Remotion (مجاني للأفراد) | فيديو سينمائي بالكود (React)، تصدير MP4، captions، Three.js داخل الفيديو. | مقاطع الانتقال بين المشاهد، فيديو تعريفي قصير للمشروع، أو عرض "اللقطات" قبل بناء المشهد. مب للعالم الحي نفسه. |
| `agent-vehicle-world` | سكل أحمد (claude.ai) منسوخ للريبو | مواصفات العالم كاملة: المشاهد، الممنوعات، الأسئلة الأربعة، جدول "الحدث → شو يصير في العالم"، خط الأصول. | يُقرأ قبل أي شغل على الواجهة. ملاحظة التحديث في أوله: المحرك المتصفح، Unity مرجع فقط. |

السكلز الأقدم في المشروع تبقى وتُستخدم معها: `ahmed-design-taste` (الذوق، يفوز على الكل)، `frontend-design`، `arabic-rtl-ui` (العربي سليم قبل أي شاشة فيها نص)، `show-me-screenshot` (كل تغيير بصري يُعرض صورة)، `decisions-log`، `where-we-stopped`، `agent-spawn-guard`، `session-budget`.

## ما انضاف، وليش

- **إضافة Unity الرسمية** (`unity:*` على اللابتوب): تبقى مثبّتة كخيار احتياطي، ما تُستخدم في المشاهد.
- **Motion+ MCP** (`npx motion-ai --plus`): يحتاج MCP وحساب مدفوع؛ قاعدة المشروع لا MCP.
- **سكلز Cloud Atlas الثلاث** (فيديو @ebrahem_bin_essa): ما نُشرت علناً. الفكرة (مذكرة تصير مهمة والوكيل يرجع بالنتيجة) موجودة كمرجع في `agent-vehicle-world`.
- **سكل الفيديو السينمائي** (فيديو "Claude cooked"): ما سُمّي في الفيديو؛ أقرب شي علني هو `remotion-*`، وانضاف.
- **prompt-motion.com**: مب سكل، مكتبة برومبتات حركة جاهزة. طريقتها في `docs/references/design-skill-sources-2026-10-20.md`.

## ضوابط عامة

- كل تغيير بصري يُعرض لأحمد صورة (`show-me-screenshot`) ويوقف لرأيه. مشهد واحد في كل مرة.
- لا أسراب وكلاء ولا `bunshin` ولا أي fan-out (`agent-spawn-guard`).
- أي أداة تحتاج تثبيت على الجهاز (Blender، ffmpeg، ImageMagick، Chrome) تُطلب من أحمد قبل التثبيت ولا تُثبّت عالمياً (CLAUDE.md).
- السكلز كود طرف ثالث: اقرأ `SKILL.md` والسكربتات قبل تشغيل أي سكربت منها أول مرة، وما تُشغّل أي شي يرسل بيانات للخارج.
