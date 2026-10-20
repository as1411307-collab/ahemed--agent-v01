# مصادر سكلز التصميم — ما أرسله أحمد يوم 2026-10-20

مرجع فقط: وش قالت البوستات والفيديوهات، وبأي شي تُرجمت في المشروع (`docs/SKILLS.md`).

## 1. بوست TikTok @mabuzant — "خمس skills لـ Claude Code تخلي اللي تبنيه يتحرك"

| # | السكل | ادعاء البوست | في المشروع |
|---|---|---|---|
| 1 | Three.js — `CloudAI-X/threejs-skills` | يحوّل الصفحة المسطّحة لمشهد 3D يتحرك داخله (3D scenes, Camera, GLTF, Lighting, Particles) | `threejs-*` |
| 2 | GSAP — `greensock/gsap-skills` (رسمي) | "ليش مواقع فيها نعومة؟ هذا السبب" (Timelines, ScrollTrigger, Text reveals, React) | `gsap-*` |
| 3 | Design DNA — `zanwei/design-dna` | "شفت موقع وعجبك؟" يطلع تصميمه كامل: ألوان، خطوط، مسافات، حركة → `design-dna.json`. **ابدأ فيها** | `design-dna` |
| 4 | Motion Design — `LottieFiles/motion-design-skill` | يعلّم Claude التوقيت والـeasing وترتيب الحركة، مب بس "حرّك العنصر" (Timing, Easing, Choreography, Micro-interactions) | `motion-design` |
| 5 | Genjutsu — `AThevon/genjutsu` | `/genjutsu:cast` يحرّك واجهة، `paint` يعطي منتجك هوية، `bunshin` يبني موقع كامل بفريق agents | `genjutsu` (بدون bunshin) |

الترتيب في البوست: الاتجاه (Design DNA) → الحركة (GSAP + Motion Design) → العمق (Three.js) → اللمسة الأخيرة (Genjutsu). "مب عارف من وين تبدأ؟ نزّل Design DNA أول."

## 2. بوست Instagram @modmohna — "لسّا بتعامل Claude كأنه مونتير مبتدئ؟" (10 أدوات)

فكرته: Claude يكتب كود، بس بدون مرجع للشكل وبدون محرك يرندر، تطلع حركات عشوائية وتوقيت مش مضبوط وشكل مسطح وفيديو صامت. الحل: "استوديو بأربع خطوات": Opus يكتب الكود، السكيلز توجّه الشكل، المحركات ترندر.

| # | الأداة | ادعاء البوست | في المشروع |
|---|---|---|---|
| 01 | `/anatomy-reveal` | يفكّك المنتج لقطع ويطلّع فيديو كشف | `anatomy-reveal` |
| 02 | `/anatomy` | أي نظام → رسمة أيزومترية تفاعلية | `anatomy` |
| 03 | `/hairline` | رسومات خطّية من فكرة أو SVG | `hairline-create`, `hairline-adopt` |
| 04 | `/motion-design-skill` | التوقيت + مبادئ ديزني الـ12 | `motion-design` |
| 05 | `/ai-kit` | حركات CSS + فحص للأنيميشن (spring, easing, 60fps, timing, a11y, score) | `motion` (الجزء المجاني من Motion AI Kit) |
| 06 | `/blender-agents` | فريق 3D كامل جوّا Blender | ما فيه سكل بهالاسم؛ الأقرب `blender-image-to-3d` |
| 07 | `/react-three-rapier` | فيزياء حقيقية: جاذبية وتصادم | مكتبة pmndrs؛ مغطاة في `r3f-best-practices` |
| 08 | `/react-postprocessing` | توهّج وعمق ميدان بكم سطر (`<Bloom/>`, `<DepthOfField/>`) | مكتبة pmndrs؛ مغطاة في `r3f-best-practices` و`threejs-postprocessing` |
| 09 | GSAP | تايملاين للأنيميشن، وصار مجاني | `gsap-*` |
| 10 | Openverse | +5 مليون مؤثر صوتي مجاني | `openverse-sounds` |

## 3. فيديو @ebrahem_bin_essa — Cloud Atlas

"كل هذا سويته بـ Claude بثلاث skills": نظام خاص مرفوع على منصته، فيه الفريق والعملاء والسجلات، WhatsApp agent، مذكرات وcanvas؛ المذكرة تصير مهمة، الوكيل ياخذها ويشتغل عليها ويرد بالـupdate، والفريق يلقى الشغل مرفوع على السيرفر. السكلز الثلاث ما نُشرت (تُطلب بالتعليق "OS"). الفكرة مرجع لـ"النظام الواحد" في `agent-vehicle-world`؛ شكل الكرة والمدارات مرفوض.

## 4. فيديو @janm_ux — prompt-motion.com

طريقة تصميم حركة بـ Opus: افتح prompt-motion.com → اختر حركة تعجبك → انسخ البرومبت → الصقه في Claude مع رابط موقعك وألوان البراند → ارفع الجهد إلى Max → يطلع عرض 15 ثانية للبراند. تنفع لصفحة الانتقال أو فيديو تعريفي؛ مب للعالم الحي.

## 5. فيديو @alekseitalksai — "Claude cooked"

سكل حركة (SKILL.md) يُسقط في Claude Code ببرومبت واحد ويطلّع فيديوهات سينمائية: بحر غيوم وضوء دافي ("Nocturne, a film in one night")، إعلان منتج، "No After Effects"، 2571 إطار بـ 60fps، "Claude يخطط اللقطات". السكل ما سُمّي؛ الأقرب علناً `remotion-*`. **جو الغيوم والضوء الدافي قريب جداً من شكلنا** — مرجع إحساس للمشهد الأول.

## ملاحظات

- كلها مجانية ومفتوحة المصدر (MIT) ما عدا: Motion+ (مدفوع، ما انضاف) وRemotion (مجاني للأفراد والشركات الصغيرة).
- أسماء المستودعات تم التحقق منها يوم 2026-10-20؛ `anatomy-reveal` و`hairline` عند مؤلفين غير مؤلف `anatomy`.
