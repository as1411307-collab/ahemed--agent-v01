---
name: procedural-3d-realism
description: >-
  Build photorealistic, real-time 3D graphics for the web with Three.js + WebGL
  and GLSL shaders. Use this skill WHENEVER the user wants a realistic 3D scene,
  a procedural planet/world/terrain/ocean/sky, a "living" animated background, a
  scroll-driven 3D experience, cinematic lighting and post-processing (bloom,
  grain, vignette, tone mapping), or wants to make an imported 3D model
  (GLTF/GLB/FBX) look photoreal with good lighting and smooth animation. Trigger
  even if the user just says things like "make this 3D and realistic," "a cool
  Earth/planet/space hero," "realistic water/clouds/fog," "make my model look
  real," "a Three.js scene that reacts to scrolling," or "good lighting and
  animations like that one site." Prefer this skill over hand-rolling raw WebGL
  or reaching for heavy game engines — it produces small, dependency-light,
  no-build sites that run reliably across machines.
---

# Procedural 3D Realism (Three.js + GLSL)

This skill captures a reliable recipe for **real-time, photoreal 3D on the web**:
the look of a hand-painted living planet, realistic water, volumetric-feeling
skies, cinematic lighting, and silky scroll/animation — all running at ~60fps in
a plain browser with **no build step and no heavy dependencies.**

The realism does **not** come from big texture downloads or pre-rendered video.
It comes from four things, and this skill is organized around them:

1. **Procedural surfaces** — color, terrain, clouds and water are computed per
   pixel on the GPU from noise, so they're infinitely detailed and never repeat.
2. **Physically-plausible lighting** — a real key/fill/rim light rig (or image-
   based lighting) plus filmic tone mapping, so surfaces respond to light the way
   real ones do.
3. **Cinematic post-processing** — bloom, film grain, and a vignette turn a
   "clean render" into something that looks shot on a camera.
4. **Frame-rate-independent motion** — exponential damping (not fixed lerps) on
   everything that moves, which is the secret to that "expensive," buttery feel.

There are **two routes to realism**, and the best scenes combine them:

- **Procedural route** — the object IS code: a sphere + a custom shader becomes a
  planet; a plane + a shader becomes an ocean. Best for worlds, terrain, water,
  sky, nebulae, abstract/branded hero scenes. This is what made the "Earth" look
  good. Start at `references/procedural-shaders.md`.
- **Asset route** — import a real model (GLB/GLTF) and make it look photoreal with
  PBR materials, image-based lighting, shadows, and animation. Best for products,
  characters, creatures, logos. Start at `references/lighting-and-materials.md`.

## When you start, do this first

1. **Confirm the target & route.** Ask (only if unclear) whether they want a
   procedural world, a lit imported model, or both, and whether it should react
   to scroll/mouse. Pick a clear visual direction (time of day, mood, palette)
   before writing shaders — realism is a coherence game.
2. **Scaffold with the no-build setup.** This is the reliability secret: vendor
   Three.js locally and load it with an ES-module **import map**. No npm, no
   bundler, no version drift — it runs the same on any machine. See
   `references/setup-and-renderer.md` and copy from `assets/starter/`.
3. **Build the scene in layers**, lowest to highest payoff:
   renderer + tone mapping → the hero object (procedural or PBR) → lighting →
   atmosphere/secondary layers → post-processing → motion. Each layer below.
4. **Verify in a real browser** and tune. Realism lives in the tuning pass: push
   contrast into the lighting, add a rim light, dial bloom until bright things
   *bleed* slightly, add a faint vignette. See the verification note below.

## The reference library (read the ones you need)

Keep `SKILL.md` in context; open a reference when you reach that layer.

| File | Read it when you're… |
|------|----------------------|
| `references/setup-and-renderer.md` | Scaffolding the project; configuring the renderer, tone mapping, color space, camera. **Always read first.** |
| `references/procedural-shaders.md` | Building anything procedural — planets, terrain, water, clouds, sky, fog, nebula. Contains the noise/fbm/domain-warp toolkit and a fully-explained planet shader. |
| `references/lighting-and-materials.md` | Making *any* surface look real — PBR materials, image-based / environment lighting, the 3-light rig, soft shadows, loading GLB/GLTF models. |
| `references/postprocessing.md` | Adding the cinematic finish — EffectComposer, bloom, custom grain + vignette + color grade pass. |
| `references/animation-and-scroll.md` | Anything that moves — the damping technique, keyframe camera journeys, scroll mapping, GLTF skeletal animation, **and the clock bug that silently freezes scroll**. |
| `references/performance-and-gotchas.md` | Anytime — keeping it at 60fps without cooking the laptop, plus the GLSL/loader traps that waste hours. Skim this early. |

## Inline cheat-sheet (the highest-value rules)

These are pulled forward because they matter on *every* project. Details live in
the references.

**Realism is lighting + tone mapping, not polygon count.** Always set:
```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // filmic highlight rolloff
renderer.toneMappingExposure = 1.05;                 // tune per scene
```
Without ACES tone mapping, bright scenes blow out to flat white and look fake.
A single environment map (image-based lighting) does more for realism than any
amount of geometry — see `lighting-and-materials.md`.

**Buttery motion = exponential damping, never fixed lerp.** Every smoothed value
(camera, look target, scroll progress, rotation) should chase its target with a
frame-rate-independent damp, so it feels identical on a 60Hz and a 144Hz screen:
```js
const damp = THREE.MathUtils.damp;            // lerp(a,b,1-exp(-λ·dt))
x = damp(x, target, 7, dt);                   // λ≈7 is a good default
```
This is the single biggest "why does that site feel so expensive" trick.

**The clock bug that looks like "scroll is broken."** In your render loop, read
the delta FIRST. `THREE.Clock.getElapsedTime()` internally calls `getDelta()`, so
calling `getDelta()` *after* it returns ≈0 forever — every damped value freezes
and the scene stops responding to scroll while still idle-spinning. Always:
```js
const dt = Math.min(clock.getDelta(), 0.05);  // delta first; cap to survive tab-outs
const t  = clock.elapsedTime;                 // getDelta already advanced this
```

**Drive everything from one scroll/progress value.** Map scroll to a single
`p` in `0..1`, smooth it with damp, and interpolate camera + light keyframes from
it. One number drives the whole journey. See `animation-and-scroll.md`.

**Procedural detail comes from layered noise.** `fbm` (sum noise at rising
frequencies) builds natural shapes; **domain warping** (feed noise into the input
of more noise) bends them into organic, non-repeating forms — coastlines, cloud
fronts, marble, rock. The ready-to-use GLSL is in `assets/noise.glsl`.

**Performance caps that prevent overheating** (laptops throttle hard otherwise):
cap `setPixelRatio(Math.min(devicePixelRatio, 1.0))`, keep fullscreen noise to
~4 fbm octaves, pause the loop when `document.hidden`, and cap to ~60fps. Full
list in `performance-and-gotchas.md`.

## Verifying your work

3D bugs are visual — you must *look*. Serve the folder (e.g.
`python3 -m http.server`) and open it. In a preview/automation context, note that
a backgrounded tab pauses `requestAnimationFrame`, so animation appears frozen;
expose a tiny debug hook that snaps the scene to a given progress value for
correct stills, e.g. `if (typeof window.__p === 'number') progress = window.__p;`
near the top of the loop, then set `window.__p = 0.5` before screenshotting.
Check the console for shader-compile errors (they print the offending GLSL).

## Starter template

`assets/starter/` is a complete, runnable no-build scene: an `index.html` with the
import map and a `main.js` with a procedurally-shaded sphere, a 3-light-ish setup,
bloom, and damped scroll/mouse motion. Copy it as the skeleton for a new project
and replace the hero object's shader or swap in a GLB. It is intentionally small
and heavily commented so it's easy to grow.

## Philosophy

Match effort to the scene. A branded hero planet wants lavish shaders and post;
a single lit product model wants restraint — great environment lighting, soft
shadows, and *nothing else*. In both cases the goal is **coherence**: one light
direction, one color story, one consistent level of grain and contrast. That
coherence, not detail, is what reads as "real."
