# Architecture: renderer, worker, scenes, quality

How the app is structured so one canvas can host an entire choreographed world
at 60fps. Pattern verified against production award-sites (hashgraphvc.com
runs exactly this shape: WebGPU renderer + TSL, rendered inside a Web Worker
via OffscreenCanvas, section-scene system, quality tiers).

## 1. Layout shell

One fixed canvas behind everything; a tall scroll container provides the
scroll distance; UI is a fixed overlay.

```html
<body>
  <canvas id="gl" aria-hidden="true"></canvas>   <!-- position:fixed; inset:0 -->
  <main id="scroll">
    <!-- one full-viewport (or taller) section per story beat -->
    <section data-section="intro"     style="height:150vh"></section>
    <section data-section="about"     style="height:200vh"></section>
    <section data-section="portfolio" style="height:250vh"></section>
    <section data-section="outro"     style="height:150vh"></section>
  </main>
  <div id="ui"><!-- fixed overlay: logo, sound toggle, headlines --></div>
</body>
```

Real text content lives inside the `<section>`s (SEO + accessibility), styled
to sit visually "in" the world. The canvas gets `pointer-events:none` except
where 3D interaction is wanted.

## 2. Renderer: WebGPU with automatic WebGL2 fallback

Three.js's `WebGPURenderer` transparently falls back to WebGL2, and TSL node
materials compile to WGSL *or* GLSL. Write everything once.

```js
import * as THREE from 'three/webgpu';

const renderer = new THREE.WebGPURenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
await renderer.init();                      // async — resolves backend
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.maxDPR));
```

Check `renderer.backend.isWebGPUBackend` if a feature (e.g. compute-heavy
particles) needs a cheaper WebGL path.

## 3. Optional but powerful: render in a Web Worker (OffscreenCanvas)

Moves all GPU + scene work off the main thread, so heavy DOM/text animation
never stutters the 3D and vice versa. This is what the smoothest sites do.

```js
// main thread
const canvas = document.querySelector('#gl');
const supportsOffscreen = 'transferControlToOffscreen' in HTMLCanvasElement.prototype
  && !isOldSafari();                       // Safari < 17 lacks WebGL in workers
if (supportsOffscreen) {
  const worker = new Worker(new URL('./gl.worker.js', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'init', canvas: offscreen,
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, [offscreen]);
  // forward everything the worker can't read itself:
  addEventListener('resize', () => worker.postMessage({ type: 'resize', width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  lenis.on('scroll', ({ progress, velocity }) => worker.postMessage({ type: 'scroll', progress, velocity }));
  addEventListener('pointermove', e => worker.postMessage({ type: 'pointer', x: e.clientX / innerWidth, y: e.clientY / innerHeight }));
} else {
  initSceneOnMainThread(canvas);           // identical code path, no worker
}
```

Rules of worker life:
- The worker has no `window`/DOM: pass sizes, DPR, scroll, pointer, and
  visibility as messages. Structure your scene code so it never touches DOM.
- Libraries with DOM assumptions need care. Theatre.js `onValuesChange`
  callbacks are unreliable in workers — instead **read sequence values
  imperatively every frame** (set `sheet.sequence.position`, then read
  `obj.value`) rather than depending on change events.
- Keep a single `init(canvasLike, size)` entry so the main-thread fallback and
  the worker share 100% of scene code.

Skip the worker for v1 if timeline is tight; add it when DOM work starts
fighting the render loop.

## 4. Section-scene system

One world, but logic is organized per story beat. Each section owns: its
models/particles, its Theatre sheet (or timeline segment), its sound loop, and
its post-processing overrides.

```js
class Section {
  constructor({ key, range }) { this.key = key; this.range = range; } // range = [0..1] scroll span
  async load(assets) {}        // fetch GLBs, build materials (called by preloader)
  activate() {}                // add to scene, start loop sound fade-in
  deactivate() {}              // remove/hide, fade out sound
  update(dt, localProgress) {} // localProgress 0..1 within this.range
}

class SceneManager {
  update(scrollProgress, dt) {
    for (const s of this.sections) {
      const inside = scrollProgress >= s.range[0] - PAD && scrollProgress <= s.range[1] + PAD;
      if (inside && !s.active) { s.activate(); s.active = true; }
      if (!inside && s.active) { s.deactivate(); s.active = false; }
      if (inside) s.update(dt, (scrollProgress - s.range[0]) / (s.range[1] - s.range[0]));
    }
  }
}
```

`PAD` (~0.05) pre-activates neighbors so nothing pops in at the boundary.
Per-section post-processing: give each section a settings object
(`overlayColor`, `overlayOpacity`, `bloomStrength`, `fogColor`…) and lerp the
global uniforms toward the active section's values every frame — smooth grade
transitions for free.

## 5. Quality tiers

Decide once at startup, use everywhere. Detect: `navigator.hardwareConcurrency`,
`devicePixelRatio`, WebGPU availability, and a 1-second fps probe on a warmup
scene; also re-drop tier at runtime if fps averages < 45 for 3s.

```js
const QUALITY = {
  low:  { maxDPR: 1.5, particleCount: 20_000,  godrays: false, grainAnimated: false, shadowMap: false },
  med:  { maxDPR: 2,   particleCount: 60_000,  godrays: true,  grainAnimated: true,  shadowMap: false },
  high: { maxDPR: 2,   particleCount: 150_000, godrays: true,  grainAnimated: true,  shadowMap: true  },
};
```

Everything that costs reads from this object — never sprinkle
`if (isMobile)` around the codebase.

## 6. The frame loop

```js
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 30);  // clamp: tab-back spikes
  last = now;

  scroll.update(dt);            // smooth scroll value + velocity decay
  choreo.update(scroll.value);  // scrub Theatre sequence / master timeline
  sceneManager.update(scroll.value, dt);
  post.update(dt);              // grain time, overlay lerps
  post.render();                // render via post chain, not renderer.render
});
document.addEventListener('visibilitychange', () =>
  document.hidden ? renderer.setAnimationLoop(null) : startLoop());
```

## 7. Resize + DPR policy

- Debounce resize ~150ms; update renderer size, camera aspect, and any
  resolution-dependent uniforms (grain scale, godray buffer size).
- Cap DPR by quality tier; consider dropping DPR to 1 *during* fast scroll
  transitions and restoring after (measurable win, invisible in motion).
- Post-processing buffers (bloom/godrays) can run at half resolution always.

## 8. File layout that scales

```
src/
  main.js            # boots UI + scroll on main thread, spawns worker
  gl.worker.js       # worker entry → app/init.js
  app/
    init.js          # renderer, loop, wiring (shared by worker & fallback)
    quality.js
    scroll-state.js  # receives scroll messages, smooths, exposes value/velocity
    choreography.js  # Theatre project + sheets, state JSON import
    sections/
      intro.js  about.js  portfolio.js  outro.js
    gl/
      particles/     # compute + material (see gpu-particles.md)
      environment/   # debris field, fog, lights
      post/          # bloom, godrays, grain, overlays (see postprocessing-look.md)
    audio/           # main-thread only (see sound-design.md)
  ui/                # DOM: loader, headlines, toggle (see ui-layer.md)
public/
  models/  textures/  sounds/  fonts/  draco/  basis/
theatre-state.json   # exported choreography, imported at build
```
