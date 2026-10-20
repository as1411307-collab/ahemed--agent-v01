# ثلاثة اقتراحات لعالم NEXUS (21 أكتوبر 2026، 2:46 بالليل) — بدون ترشيح

أحمد طلب: راجعي كل النقاش والحلول وأعطيني ثلاثة اقتراحات مختلفة بالتفاصيل على شكل أكواد، بدون ترشيح أحدها. هذا الملف هو الثلاثة، بنفس العمق لكل واحد. القرار لأحمد. (مرحلة أفكار: ما ندخل قواعد المشروع ولا "هل يُقاد من Claude Code".)

## المشترك بين الثلاثة (الأعصاب لا تتغير مهما كان الجسد)

```yaml
nervous_system:                      # من وثيقة Settings & Control Center + حصيلة NEXUS + Hermes
  config: NEXUS CONFIG (json)        # world, agents[], tools[], integrations[], models[], rag[], permissions, scenes[], sounds, camera, events, rules[], presets[]
  bus: one event stream              # agent.started | tool.called | tool.failed | approval.requested | approval.resolved | cost.updated | mission.completed | config.changed | connection.lost
  brain: external (Core / Hermes / n8n agent)   # the world never owns keys or tools
  approval_card: [APPROVE, DENY, EDIT, CHANGE_ROUTE]   # world pauses partially, core state = WAITING
  kill_switch: always visible        # process.kill for any running task
  cost_meter: per task + session total + daily cap
  modes: COMMANDER (world only) / ARCHITECT (world becomes editable)
  presets: config snapshots          # Research / Investor / Personal / Developer / Creative / Deep Work
  core_states: [listening, thinking, delegating, waiting, success, warning, speaking]
  rules: IF event/condition THEN visual/camera/scene   # editable, no code
  secrets: never in the world; status only (CONNECTED / DISCONNECTED / ERROR)
  look: deep night blue + one warm gold light, cinematic calm, depth; reduce-motion switch
```

---

## الاقتراح A — عالم ويب سينمائي (WebGPU / Three.js)

العالم يُرسم بتقنيات الويب الحديثة داخل غلاف سطح مكتب، ونفس البناء يشتغل في أي متصفح: اللابتوب، التلفزيون، Steam Machine، الجوال.

```yaml
proposal: A — Cinematic Web World
world:
  renderer: Three.js (WebGPU, WebGL2 fallback) + React Three Fiber
  scene_day1: cabin / room walkthrough on a spline camera, curved glass, sea of clouds outside,
              real-time sun position (UAE clock), volumetric fog, godrays, bloom, film grain
  assets: concept images -> TRELLIS.2 / Hunyuan3D -> Blender cleanup -> GLB (Draco/KTX2); HDRI lighting
  particles: GPU particles (dust, embers) that react to events
  live_graph: React Flow (@xyflow/react) nodes anchored in 3D (drei <Html>) or in-scene meshes;
              dashed pulse on edges (stroke-dashoffset), reverse for rollback, paused while waiting
  core: orb shader with the 7 states + personality presets (speed, glow, camera behaviour)
  fleet_view: zoom-out shows core + agents on a circle, lines carry each agent's colour (currentColor)
shell: Tauri on Windows (laptop on TV + Xbox controller) ; same build in any browser
brain_link: WebSocket to Core / Hermes (events_poll bridge) ; AG-UI style event JSON
voice: LiveKit Agents UI (Aura visualizer) later ; mic from laptop or phone
audio: Web Audio tones (click/success/fail) + Openverse/Kenney ambient layers via Howler
settings: side panels (RTL) editing NEXUS CONFIG ; live preview = hot-swap on config.changed
hardware: integrated GPU is enough ; 3 quality tiers ; 60 fps target on a mid laptop
cost: 0 at runtime
ceiling: stylised-realistic ; photoreal like Unreal needs heavy shader work
```

```ts
// world/rules.ts — the world is config-driven; events arrive over WebSocket
type Rule = { on: string; do: string[] };            // e.g. { on: "approval.requested", do: ["core.state=waiting", "tint=#F0C75E", "camera.freeze"] }
const rules: Rule[] = config.rules;                   // editable from Architect mode
const ws = new WebSocket(config.brain.url);
ws.onmessage = ({ data }) => {
  const ev = JSON.parse(data);                        // { type, agent, task, cost, ts }
  rules.filter(r => r.on === ev.type).forEach(r => r.do.forEach(a => apply(a, ev)));
};
```

---

## الاقتراح B — عالم محرك ألعاب على جهازك (Unreal 5 + Fab؛ نفس المخطط يصلح لـUnity أو Godot)

العالم بأعلى واقعية ممكنة محلياً: إضاءة عالمية، أصول Megascans، كاميرا سينمائية من محرك أفلام، وصفحة التحكم من برا تغيّر العالم الحي.

```yaml
proposal: B — Engine World on your machine
world:
  engine: Unreal Engine 5 (Lumen GI, Nanite, Niagara, Sequencer, MetaSounds)   # or Unity HDRP / Godot 4 with the same structure
  scene_day1: photoreal cabin + outside (clouds, far mountains, city lights), sun from real clock
  assets: Fab (Megascans, free + paid) + generated GLB from concept images
  live_graph: in-world holograms (Niagara ribbons as edges, pulses as particles) + UMG panels for text
  core: Niagara / material orb with 7 states ; personality = parameter sets
control_from_outside:
  remote_control_api: HTTP + WebSocket (port 30010) — Architect Control web page sets properties live
  blueprints: event -> visual rules as a DataTable (editable, no code)
brain_link: WebSocket plugin to Core / Hermes ; or inbound via Remote Control
voice: LiveKit (web overlay) later ; controller + mic
audio: MetaSounds layers (ambient / UI / agent voice), each with its own volume
packaging: Windows build -> laptop on TV ; later Xbox "Project Helix" (Windows console, 2027+) ; Steam Machine via Proton
hardware: dedicated GPU (RTX 3060 class or better) ; 3 quality tiers ; big project (tens of GB)
cost: engine free for this use ; some Fab assets paid
ceiling: highest realism ; heaviest build and hardware
```

```json
// EventRules.json  (DataTable imported into Unreal; same file drives Unity/Godot variant)
{
  "approval.requested": [
    { "set": "NexusCore.State", "to": "Waiting" },
    { "set": "PostProcess.ColorTint", "to": "#F0C75E" },
    { "camera": "freeze" }
  ],
  "tool.failed":   [ { "pulse": "edge", "color": "#FF5A5A", "direction": "reverse" } ],
  "agent.started": [ { "glow": "agent" }, { "camera": "focus", "target": "agent" } ]
}
```

```bash
# Architect Control page -> live world (Remote Control API)
curl -X PUT http://localhost:30010/remote/object/property \
  -H "Content-Type: application/json" \
  -d '{"objectPath":"/Game/Nexus/Maps/Cabin.Cabin:PersistentLevel.Sun_1","propertyName":"Intensity","propertyValue":{"Intensity":2.0}}'
```

---

## الاقتراح C — عالم في السحابة يُبث لأي شاشة (Pixel Streaming)

نفس عالم المحرك، لكن يُرسم على كرت شاشة مستأجر في السحابة ويوصلك كفيديو تفاعلي لأي جهاز: اللابتوب، الجوال، التلفزيون، Steam Machine، Ally. العقل والعالم في نفس المكان، فما فيه تأخير بينهما.

```yaml
proposal: C — Cloud World, streamed everywhere
world: Unreal 5 world (as in B) rendered on a cloud GPU VM ; Pixel Streaming (WebRTC) -> any browser
brain: Core + Hermes + n8n on the same VM (or a small always-on VM) ; local event bus (no network hop)
files: stay on the laptop ; reached through a private tunnel (Tailscale) or synced folder
voice: LiveKit Cloud ; mic from whatever device is open
settings: Architect Control web page -> VM (Remote Control + config service)
devices: laptop, phone (status + approvals), TV, Steam Machine, Ally X — all just screens
hardware: nothing local
cost: GPU VM only while the world is open (~$0.5–2 / hour, auto-stop when idle) + small VM for the brain
latency: 30–80 ms on good internet (UAE fine) ; video compression softens fine detail
start_time: ~1 minute to boot the world (or keep a warm snapshot)
privacy: brain and world in the cloud ; keys in the VM's secret store, never in the stream
ceiling: same realism as B without owning a GPU ; monthly bill instead
```

```yaml
# stack.yaml — one VM, four services
services:
  brain:      { image: nexus-core, env_file: .env, ports: ["8787"] }        # Core API + permissions + audit
  agent:      { image: hermes-agent, command: "hermes mcp serve" }           # events_poll / permissions_respond
  world:      { image: ue5-pixelstreaming, gpu: true, ports: ["80", "8888"] }# renders + streams
  signaling:  { image: pixelstreaming-signalling }                          # WebRTC handshake
  voice:      { provider: livekit-cloud }
policy:
  auto_stop_after_idle: 15m
  warm_snapshot: true
```

---

## كيف تختلف الثلاثة (بدون تفضيل)

| | A ويب | B محرك على جهازك | C سحابة مبثوثة |
|---|---|---|---|
| الواقعية | متوسطة إلى عالية | الأعلى | الأعلى |
| الجهاز المطلوب | أي لابتوب | كرت شاشة قوي | ولا شي |
| التكلفة الشهرية | 0 | 0 | ساعات GPU |
| يشتغل على الجوال/التلفزيون/الكونسول | نعم (متصفح) | ويندوز فقط (وXbox 2027) | نعم (أي متصفح) |
| التحكم الحي من برا | WebSocket + كونفق | Remote Control API | Remote Control عبر السحابة |
| الوقت للمشهد الأول | الأقصر | الأطول | متوسط (+ إعداد السحابة) |
| المخاطر | سقف الواقعية | ثقل المشروع والجهاز | التأخير والفاتورة والخصوصية |
