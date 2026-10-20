# Animation & Scroll — the "expensive" feel

What separates a premium 3D site from a stiff one is almost never the models —
it's **how things move**. The core principle: never snap or move at a fixed
per-frame rate. Everything that moves should *chase* a target with frame-rate-
independent exponential smoothing. This is the whole secret behind "buttery,
high-end" motion.

## The damping technique (use it everywhere)

A fixed `x = lerp(x, target, 0.1)` moves faster on a 144Hz screen than a 60Hz one
and feels different per machine. Frame-rate-independent **damp** fixes that:

```js
const damp = THREE.MathUtils.damp;   // = lerp(a, b, 1 - exp(-λ·dt))
x = damp(x, target, lambda, dt);     // lambda ≈ 7 is a great default
```
Higher `λ` = snappier; lower = more floaty/laggy. Use it for camera position,
look target, object rotation, scroll progress, light intensity — anything. A tiny
helper for vectors:
```js
const dampV = (v, tx, ty, tz, l, dt) => {
  v.x = damp(v.x, tx, l, dt); v.y = damp(v.y, ty, l, dt); v.z = damp(v.z, tz, l, dt);
};
```

## The render loop (and the clock bug that freezes scroll)

```js
const clock = new THREE.Clock();
let _last = 0;
function frame(time){
  requestAnimationFrame(frame);
  if (document.hidden) return;            // don't cook the GPU on a hidden tab
  if (time - _last < 15) return;          // cap ~60fps even on 120/144Hz panels
  _last = time;
  tick();
}
requestAnimationFrame(frame);

function tick(){
  // ── CRITICAL ORDER ──────────────────────────────────────────────────────
  // THREE.Clock.getElapsedTime() internally calls getDelta(). If you read
  // elapsed time FIRST and getDelta() SECOND, the second call returns ~0 every
  // frame -> every damp() gets dt≈0 -> nothing eases -> the scene freezes at its
  // start state and stops responding to scroll (while idle spins driven by `t`
  // keep going, which is a very confusing "scroll is broken" bug).
  const dt = Math.min(clock.getDelta(), 0.05);  // delta FIRST; cap for tab-outs
  const t  = clock.elapsedTime;                 // getDelta already advanced this
  // ─────────────────────────────────────────────────────────────────────────

  // ... read scroll, ease values, update uniforms, move camera ...
  composer.render();   // or renderer.render(scene, camera)
}
```
If a scrolling 3D scene "isn't animating" but the object still slowly spins, this
clock ordering is the first thing to check.

## Scroll-driven journeys: one number drives everything

Map scroll to a single progress value `p` in `0..1`, smooth it, and interpolate
camera + light **keyframes** from it. One value choreographs the whole experience.

```js
let scrollProg = 0, sp = 0;
function readScroll(){
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollProg = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
addEventListener('scroll', readScroll, { passive:true }); readScroll();
// in tick():  sp = damp(sp, scrollProg, 9, dt);   // smoothed scroll progress
```

> **Use NATIVE scroll as the source of truth.** It works on every browser and
> device. Smooth-scroll libraries (Lenis, etc.) can intercept the wheel and
> stall the journey on some machines — if you add one, confirm it actually
> scrolls on the target machine, and keep native scroll as the fallback. The
> silky feel should come from `damp()` on the 3D, not from the scroll library.

Keyframes = an array of `{ p, pos, look, sun }`; find the segment `p` falls in,
smoothstep between the two:
```js
const KF = [
  { p:0.00, pos:new THREE.Vector3(0,0.12,3.85), look:new THREE.Vector3(0,0,0),   sun:new THREE.Vector3(-0.7,0.32,0.62) },
  { p:0.50, pos:new THREE.Vector3(-0.5,0.05,2.7),look:new THREE.Vector3(0,0,0),   sun:new THREE.Vector3(-0.1,0.16,-0.98) },
  { p:1.00, pos:new THREE.Vector3(0.1,-0.2,1.5), look:new THREE.Vector3(0.06,0.3,0),sun:new THREE.Vector3(0.18,0.34,0.78) },
];
function sampleKF(p, outPos, outLook, outSun){
  let a=KF[0], b=KF[KF.length-1];
  for (let i=0;i<KF.length-1;i++){ if (p>=KF[i].p && p<=KF[i+1].p){ a=KF[i]; b=KF[i+1]; break; } }
  const u = a.p===b.p ? 0 : (p-a.p)/(b.p-a.p); const e = u*u*(3-2*u);  // smoothstep
  outPos.lerpVectors(a.pos,b.pos,e); outLook.lerpVectors(a.look,b.look,e);
  outSun.lerpVectors(a.sun,b.sun,e).normalize();
}
```
Then in `tick()` sample at `sp`, and **damp the camera toward the sampled pose**
(don't set it directly) for that gliding feel:
```js
sampleKF(sp, _pos, _look, _sun);
dampV(camera.position, _pos.x + ptrX*0.28, _pos.y - ptrY*0.20, _pos.z, 7, dt);
dampV(_ct, _look.x, _look.y, _look.z, 7, dt); camera.lookAt(_ct);
```
Add a little **pointer parallax** (`ptrX/ptrY` from `pointermove`, also damped) so
the scene feels alive even when not scrolling.

Tie scroll ranges to scene effects too: ramp night lights / aurora / fog with
`smoothstep(sp, a, b)` so the world changes as the user scrolls.

## Skeletal animation (GLTF models)

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
let mixer, actions = {}, current = null;
new GLTFLoader().load('assets/model.glb', (gltf) => {
  scene.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);
  gltf.animations.forEach(c => { const a = mixer.clipAction(c); a.play(); a.weight=0; actions[c.name]=a; });
});
function setAnim(name){                       // crossfade, never hard-cut
  if (name===current || !actions[name]) return;
  actions[name].reset().play(); actions[name].weight=1;
  if (current) actions[current].crossFadeTo(actions[name], 0.3, false);
  current = name;
}
// in tick(): if (mixer) mixer.update(dt);
```
Pick the clip from progress (e.g. walk → run → climb across `sp`), crossfade
between them, and **neutralize root-motion drift** so your path/curve controls
position. Use `CatmullRomCurve3.getPoint(u)` (uniform per-segment) — not
`getPointAt` (arc-length) — when you want each leg of a path to get a fair share
of the scroll, otherwise a long segment eats all the scroll.

## Reveal animations for the DOM

For text/section fade-ins over the 3D, use a plain `IntersectionObserver` adding
an `.in-view` class + CSS transitions. It's bulletproof and never leaves content
stuck hidden if a scroll library misbehaves.
