# NEXUS ONE — Verified repair status (3 November 2026)

**Scope:** `repair/server-first-truth-2026-11-03` is a review-only repair branch. It has NOT been merged to `main`, deployed to a VPS, built on an iPhone or validated by running tests in this repair session.

## Truths from repository inspection

- `main` already contains merged PR #7, #8 and #9. PR #5 (`nexus/parallel-foundation`) remains unmerged and MUST NOT be merged wholesale to resolve the separate task ledgers.
- `tasks` is the active canonical ledger for the current legacy message route. `mission_runs` is a separate Hermes demo/session-lease projection, NOT a unified replacement. `nexus_missions` is only in PR #5. No table was dropped or migrated.
- A normal production Hermes run is still hard-blocked; no n8n workflow execution, authenticated callback, or external broker isolation has been demonstrated.
- Signed iPhone approval receipts remain DEMO / NO EFFECT. The silent device key does not enforce fresh biometric/user presence. A real high-risk approval scheme requires a separate enrolled policy-bound key and independent broker verification.
- Production can be configured for `CORE_PRODUCTION_TIER=COGNITIVE_READ_ONLY` only if local credential inventory passes, Core binds to loopback, no Hermes bridge is configured and sensitive tools are disallowed by the strict runtime flag. External-action tier is unconditionally denied. This is an eligibility check, NOT deployment/network/provider attestation.
- In the strict cognitive tier, the model can only request reads of uploaded attachments belonging to the same conversation up to that task; arbitrary workspace reads and write tools are denied. User-provided text and allowed attachment contents can still leave the host for Anthropic.
- The iPhone now obtains an authenticated capability declaration, refreshes it while active, and no longer offers a blocked Hermes run button. A successful capability response is NOT proof of model execution or external effects.
- Core environment template escaped newline literals were repaired on this branch.

## Remaining P0/P1 gaps: NOT fixed by the branch

1. **Unified mission authority:** no lossless migration between `tasks`, Hermes `mission_runs`, and PR #5 `nexus_missions`. An event/API mapping and conflict/recovery rules are required before any deletion. The current `audit_log` has append-only SQLite triggers, not externally protected tamper evidence.
2. **Broker isolation and effect reconciliation:** no separate OS identity, validated tool capabilities, remote n8n registry, authenticated callbacks or definitive outcome resolution.
3. **Hermes trust:** static proposal bearer is not host/run attestation. Startup and continuation into actual Hermes remain blocked.
4. **iPhone verification:** no physical device/biometric confirmation; the existing silent signing mode is not suitable as sole high-risk authorization.
5. **Deployable security controls:** private TLS/reverse proxy, secrets handling, file data classification/consent, backup+restore and least privilege are not verified.
6. **Reliability:** `STARTING` Hermes leases can require manual reconciliation after an uncertain launch; app runs and credential states are not proven end-to-end.
7. **No tests in this repair session:** all findings about patches are static inspection only; syntax/build/runtime regressions may remain.

## Superseded status snapshot, preserved for history

The following October notes are archival and must not be treated as current configuration or approval to merge/deploy.

---

# الحالة الحالية — 21 أكتوبر 2026

الخطة الحاكمة: [NEXUS_SCENE_FIRST_PLAN.md](NEXUS_SCENE_FIRST_PLAN.md).

أحمد صحح الاتجاه: شراء مشهد سينمائي جاهز كأساس للعالم، وأذن ببناء الوكيل الرئيسي والتكاملات والوكلاء بالتوازي الآن. لا ينتظر شغل الخلفية إتمام الشراء؛ الربط البصري النهائي ينتظر تشغيل المشهد. لا بناء للعالم من الصفر ولا استبداله بلوحة تحكم.

22 أكتوبر: كانت اختبارات main حمراء (كومت آلي يوم 21 حذف 30 من 32 اختبار تكامل وأضاف اختبارًا غير صالح). أُعيد ملف الاختبارات من دمج PR #3 مع اختبار الرابط الوهمي الصالح: `npm test` = 54/54، وفحص الأنواع ينجح، وأُضيف CI يشغّلهما على كل push وPR. الفروع المدمجة أو غير القابلة للدمج أُزيلت وحُفظت كوسوم `archive/*`.

تم إرسال توجيه التصحيح ثم إذن التنفيذ إلى مهمة Codex القائمة؛ قبول التوجيه ليس إثبات اكتمال التنفيذ. الخطوة الحالية: تنفيذ المسارات المتوازية بعقود مشتركة وتوثيق الأدلة والفجوات. لم يُثبت شراء أصل أو تشغيل Unreal في هذه المراجعة. تبقى الأتمتات المجدولة السابقة متوقفة.

## سجل تاريخي — لا يمثل الحالة الحالية

تنبيه: عبارة «فما فيه خطر» أدناه غير صحيحة كأساس أمني؛ أدوات قراءة الشبكة قد تسبب SSRF. تُحفظ الفقرة كسجل تاريخي فقط.

# وين وقفنا
آخر تحديث: 2026-10-13

## الحالة الحين
- main على GitHub: v0.1 (الكور وتطبيق Expo، والتجربة الكاملة من الآيفون نجحت 2 أكتوبر)، ومعها سكلات Claude Code.
- فرع جديد `feature/llm-memory-tools` (آخره ce52cf0): كتبه GitHub Copilot على موقع GitHub يوم 13 أكتوبر. يضيف للكور: تخطيط المهمة قبل التنفيذ (`POST /v1/llm/plan`)، ذاكرة جلسات في قاعدة بيانات منفصلة (`*.memory.db`)، وسجل أدوات مع تنفيذ مباشر (`GET /v1/tools`، `POST /v1/tools/execute`). الفرع كامل، يتبنى، و40 اختبار ناجحة. ما اندمج في main.
- أرشيف الكور على GitHub: `archive/core-v0.1` (d5e9ab9) و`archive/core-v0.2` (acc3f9b، لوحة سير المهام الحية، بدون صوت).
- الصوت انشال: طلب الدمج #1 انقفل بدون دمج، وفرعه `feat/iphone-voice-core-2026-10-09` باقي كمرجع بس.

## آخر شي صار
- 13 أكتوبر: Copilot رفع الفرع ناقص ملفات، ثم كمّلها. Claude جرّب المداخل الجديدة بنموذج تجريبي، ولقى إن `/v1/tools/execute` ما يمرر مجلد العمل لأداة read_file فكانت تطيح دايماً؛ صلّحه (ce52cf0) وتأكد إن القراءة تشتغل وترفض المسارات خارج مجلد العمل.

## الخطوة الجاية
لم تتحدد. الفرع جاهز للتشغيل من اللابتوب لو أحمد يبي يجربه.

## انتبه
- `/v1/tools/execute` ينفّذ الأدوات مباشرة بدون نظام الموافقة. حالياً الأدوات قراءة فقط (read_file، http_get لأي رابط، وweb_search مكان محجوز ما يشتغل)، فما فيه خطر. لو انضافت أداة كتابة أو حذف لهالسجل، لازم تمر بالموافقة.
- المداخل الجديدة ما لها اختبارات.
- الفرع فيه `scripts/run_core_local.sh` (bash) ما يشتغل في PowerShell، وفيه `npm ci` اللي يفشل على لابتوب أحمد بسبب better-sqlite3. التشغيل بأوامر CLAUDE.md، مع `npm install --ignore-scripts` إذا فشل التثبيت.
- ملفات `AGENTS.md` و`.agents/skills/` على اللابتوب ما انحفظت في git.
- ملفات `.env` مو على GitHub. لازم تتعبى قبل التشغيل (CLAUDE.md).
- الكور يشتغل بس واللابتوب شغال ومتصل.
