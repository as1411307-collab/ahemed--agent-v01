# procedural-3d-realism

A Claude skill for building **photorealistic, real-time 3D graphics for the web**
with Three.js + WebGL and GLSL shaders — procedural planets and worlds, realistic
water/clouds/sky, cinematic lighting and post-processing, and silky scroll-driven
animation. No build step, no heavy dependencies, runs reliably across machines.

This packages the exact recipe behind a hand-painted "living Earth" scroll
experience so it can be reused on any project.

## What it gives Claude

- **The reliable no-build setup** — vendored Three.js + ES-module import maps, so a
  scene runs the same on any machine.
- **Procedural surfaces** — noise → fbm → domain warping to generate planets,
  terrain, oceans, clouds, and skies that are infinitely detailed and never repeat.
- **Real lighting** — ACES tone mapping, image-based/environment lighting, the
  key/fill/rim rig, soft shadows, and PBR materials for imported models.
- **Cinematic post** — bloom, film grain, vignette, color grade via EffectComposer.
- **"Expensive" motion** — frame-rate-independent damping, scroll→keyframe camera
  journeys, GLTF skeletal animation, and the gotchas that silently break them.
- **Performance discipline** — the caps that keep it at 60fps without overheating
  laptops.

## Layout

```
procedural-3d-realism/
├── SKILL.md                      # entry point: workflow + inline cheat-sheet
├── references/
│   ├── setup-and-renderer.md     # no-build vendoring, renderer/tone-mapping
│   ├── procedural-shaders.md     # noise toolkit + the planet shader, explained
│   ├── lighting-and-materials.md # PBR, IBL, 3-light rig, shadows, loading GLB
│   ├── postprocessing.md         # bloom + grain + vignette chain
│   ├── animation-and-scroll.md   # damping, keyframes, scroll, GLTF anim, clock bug
│   └── performance-and-gotchas.md# 60fps caps + the time-wasting traps
└── assets/
    ├── noise.glsl                # ready-to-paste simplex + fbm GLSL
    └── starter/                  # complete, runnable no-build scene (vendored three)
        ├── index.html
        ├── main.js               # procedural planet + atmosphere + bloom + damped scroll
        └── vendor/               # local Three.js (no CDN, no npm)
```

## Try the starter

```bash
cd assets/starter
python3 -m http.server
# open http://localhost:8000 and scroll
```

You'll get a procedurally generated planet — day side with oceans and sun-glint,
a night side with city lights, an atmosphere halo — that wheels around and draws
closer as you scroll. Everything is generated in real time; there are no image or
video files.

## Install as a Claude skill

Copy this folder into your Claude skills directory (e.g. `~/.claude/skills/`), or
add the repo to your skills/plugins setup. Claude will consult it automatically
when you ask for realistic 3D scenes, procedural worlds, cinematic WebGL, or
"make my 3D model look real with good lighting and animation."

## Credits

`snoise()` in `assets/noise.glsl` is Ashima Arts / Stefan Gustavson's simplex
noise (MIT). Everything else — the realism pipeline, lighting, post, and motion
patterns — is original to this skill.
