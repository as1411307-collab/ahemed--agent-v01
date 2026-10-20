# Scroll choreography: Lenis + Theatre.js + GSAP

The core trick of every cinematic site: **scroll is a scrub head on a film
timeline**, not page navigation. One smoothed scalar (0..1 through the page)
drives the camera, lights, particle morphs, fog, post-processing, and sound —
so everything moves *together*.

## 1. Smooth scroll with Lenis

Native scroll is stepped and jittery. Lenis intercepts it and exposes a lerped
value plus velocity.

```js
import Lenis from 'lenis';

const lenis = new Lenis({ lerp: 0.09, smoothWheel: true }); // 0.08–0.12 feels "weighted"
function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

lenis.on('scroll', (e) => {
  scrollState.progress = e.progress;   // 0..1 through the whole page
  scrollState.velocity = e.velocity;   // px/frame, signed
});
```

If rendering in a worker, forward `{progress, velocity}` per scroll event
(see architecture.md) — the worker keeps its own smoothed copy so it stays
fluid even if messages are sparse.

## 2. Theatre.js: keyframe like a film editor

Theatre.js gives you a real keyframe editor in the browser (`@theatre/studio`),
then you export the animation state as JSON and ship only `@theatre/core`.

```js
// dev: import studio for the editor UI. prod: only core + saved state.
import { getProject, types } from '@theatre/core';
import state from '../theatre-state.json';

const project = getProject('Site', { state });
const sheet = project.sheet('Main');            // one master sheet
// optionally: project.sheet(`scene-${key}`) per section

export const camObj = sheet.object('camera', {
  position: { x: types.number(0), y: types.number(2), z: types.number(8) },
  lookAt:   { x: 0, y: 0, z: 0 },
  fov: types.number(45, { range: [20, 90] }),
});
export const moodObj = sheet.object('mood', {
  fogDensity: types.number(0.04, { range: [0, 0.2] }),
  bloom: types.number(1.2, { range: [0, 4] }),
  overlayOpacity: types.number(0, { range: [0, 1] }),
});
```

**Workflow:** run with studio in dev → drag keyframes on the sheet's sequence
until the flythrough feels right → `studio.createContentOfSaveFile()` →
save as `theatre-state.json` → production imports the JSON, no editor shipped.

## 3. Scrub the sequence from scroll

Never `sequence.play()` — set position directly from smoothed scroll:

```js
const DURATION = 10;  // sequence length in "seconds" (arbitrary units)
function update() {
  // extra smoothing layer on top of Lenis for the 3D world (heavier = more cinematic)
  smoothed += (scrollState.progress - smoothed) * 0.08;
  sheet.sequence.position = smoothed * DURATION;

  // read values imperatively (also the reliable path inside workers,
  // where onValuesChange may not fire):
  const c = camObj.value, m = moodObj.value;
  camera.position.set(c.position.x, c.position.y, c.position.z);
  camera.lookAt(c.lookAt.x, c.lookAt.y, c.lookAt.z);
  camera.fov = c.fov; camera.updateProjectionMatrix();
  fog.density = m.fogDensity;
  post.bloomStrength.value = m.bloom;
}
```

### GSAP-only alternative (no Theatre)

For simpler sites, a paused GSAP master timeline scrubbed the same way works:

```js
const tl = gsap.timeline({ paused: true });
tl.to(camera.position, { z: -20, duration: 4, ease: 'none' })
  .to(fog, { density: 0.12, duration: 2 }, 2);
// per frame: tl.progress(smoothed);
```

Theatre wins when the choreography has >20 keyframed properties or a designer
is iterating; GSAP wins for speed of setup. Don't use both for the same
property.

## 4. Scroll velocity as a design input

The organic "alive" feel comes from letting scroll *speed* perturb the world,
with a lerped decay so it settles gracefully:

```js
class VelocityFX {
  current = 0;
  update(dt, rawVelocity) {
    this.current += (rawVelocity - this.current) * 0.15;   // lerp factor ~0.1–0.2
    const v = THREE.MathUtils.clamp(this.current / 40, -1, 1);
    camera.rotation.z = v * THREE.MathUtils.degToRad(3);    // subtle roll
    particles.turbulence.value = 1 + Math.abs(v) * 2;       // agitate on flicks
    camera.fov = baseFov + Math.abs(v) * 4;                 // speed = slight zoom-out
  }
}
```

Keep amplitudes tiny (2–5°, a few fov degrees). The effect should be felt,
not seen.

## 5. DOM in sync: GSAP ScrollTrigger

The HTML overlay animates against the same scroll. Use ScrollTrigger for
enter/leave of headlines, pinning, and progress-linked elements:

```js
gsap.registerPlugin(ScrollTrigger);
// tell ScrollTrigger about Lenis
lenis.on('scroll', ScrollTrigger.update);

document.querySelectorAll('[data-section]').forEach((el) => {
  ScrollTrigger.create({
    trigger: el, start: 'top 60%', end: 'bottom 40%',
    onEnter: () => { revealHeadline(el); audio.enterSection(el.dataset.section); },
    onLeaveBack: () => hideHeadline(el),
  });
});
```

Section boundaries for the *3D* world should come from the SceneManager
ranges (scroll progress spans), not ScrollTrigger — one source of truth for
the world, ScrollTrigger only for DOM.

## 6. Choreography design rules

- **Ease nothing on the master timeline.** The scrub *is* the ease (the user's
  finger + Lenis lerp). Keyframe with linear interpolation between poses;
  reserve eased tweens for events (section activation flourishes).
- **Camera moves: dolly > orbit > roll.** Move mostly forward/through;
  orbit ≤ 45° per section; roll only from velocity FX.
- **Overlap beats.** Start section N+1's lights/particles fading in during the
  last 10% of section N. Hard cuts read as bugs.
- **Anchor with a constant.** Keep one element persistent across the journey
  (the particle figure, a logo mark, the godray direction) so the world feels
  continuous rather than like 4 separate demos.
- **Test with a scrubber.** In dev, bind a range input to `smoothed` so you
  can park at any point (e.g. `?p=0.62`) and screenshot exact beats.
