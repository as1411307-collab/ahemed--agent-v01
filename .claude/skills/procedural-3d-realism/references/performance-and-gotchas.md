# Performance & Gotchas — 60fps without cooking the laptop

Realistic real-time 3D is GPU-heavy. The difference between "smooth and cool to
the touch" and "fans screaming, laptop hot" is a handful of caps. Apply these by
default — they cost almost no visual quality.

## The performance caps (apply on every scene)

```js
// 1. Pixel ratio. Retina ×2–3 means 4–9× the pixels = 4–9× the shader cost for
//    near-zero perceived gain on a procedural scene. Cap at 1.0 (up to ~1.5 if
//    crisp edges really matter).
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));

// 2. Pause when the tab is hidden — otherwise you render forever in the
//    background and heat the machine for nothing.
function frame(time){ requestAnimationFrame(frame); if (document.hidden) return; /* ... */ }

// 3. Cap the framerate (~60fps) even on 120/144Hz panels — double the frames is
//    double the heat for motion the eye barely registers here.
if (time - _last < 15) return; _last = time;

// 4. Recover gracefully if the GPU context is lost (overheating / driver reset)
//    instead of showing a black canvas.
renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault());
```

## Shader & geometry budget

- **fbm octaves**: 4 on any fullscreen / large-surface shader. Each octave is
  another noise evaluation *per pixel per frame* — 6 octaves fullscreen is a
  common cause of overheating. Reserve 5–6 for small hero close-ups.
- **Sphere/plane segments**: 128² for a hero planet is plenty; 112² for clouds;
  ~140² for displaced terrain. Doubling segments quadruples vertices for detail
  the silhouette won't show.
- **Instancing**: for grass/trees/rocks/particles use `InstancedMesh`, not
  thousands of separate meshes. Keep counts sane (a few thousand, not tens of
  thousands) and `frustumCulled = false` only when needed.
- **One heavy thing at a time**: if you have multiple big scenes (e.g. an orbit
  act and a ground act), toggle `.visible` so only the active group renders.
- **Particles/sprites**: a `Points` cloud with a small canvas dot texture is far
  cheaper than many sprite meshes.

## The traps that waste hours (learned the hard way)

- **The clock-delta bug.** `getElapsedTime()` then `getDelta()` → `dt≈0` → all
  motion freezes / scroll stops responding. Read delta first, take `t` from
  `clock.elapsedTime`. (Full explanation in `animation-and-scroll.md`.) This is
  the #1 "it's broken and I can't see why" bug.
- **Missing vendored import.** `GLTFLoader` imports
  `utils/BufferGeometryUtils.js`; postprocessing passes import shaders. A missing
  file kills the *whole* module graph silently — vendor exactly what the error
  names. (Setup doc.)
- **GLSL reserved words** (`patch`, `sample`, `input`, `output`, `filter`, …)
  cause a cryptic "shader not compiled." Rename the variable.
- **Smooth-scroll library stalls scroll.** Lenis/GSAP-ScrollTrigger can intercept
  the wheel and freeze the journey on some machines. Drive progress from native
  `window.scrollY`; only enable the library after confirming it scrolls on the
  target machine.
- **Fog/mist whiteout.** Big additive mist sprites near the camera blow the frame
  to white. Keep them small, few, off the immediate camera, and low-opacity.
- **fbx2gltf "bad CPU type"** on Apple Silicon: it's an x86_64 binary — install
  Rosetta (`softwareupdate --install-rosetta --agree-to-license`).
- **Verifying in a backgrounded/automation tab**: `requestAnimationFrame` pauses
  when the tab is hidden, so animation looks frozen and screenshots show the boot
  frame. Add a debug hook that *snaps* the scene to a progress value so a single
  rendered frame is correct:
  ```js
  // near top of tick():
  if (typeof window.__p === 'number') { sp = window.__p; /* and snap camera/yaw instantly */ }
  ```
  Set `window.__p = 0.5` before screenshotting to inspect mid-journey states.

## A quick triage when it's slow or hot

1. Is `pixelRatio` capped? (biggest single lever)
2. How many fbm octaves run fullscreen? Drop to 4.
3. Does the loop pause on `document.hidden` and cap fps?
4. Are you rendering multiple heavy groups at once? Toggle `.visible`.
5. Are thousands of objects separate meshes? Switch to `InstancedMesh`.
6. Shadow map too big or frustum too wide? 2048² and a tight frustum.
