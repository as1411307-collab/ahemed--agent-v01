---
name: cinematic-3d-website
description: Build award-tier, cinematic 3D scroll-driven websites — the kind seen on Awwwards/FWA (reference site hashgraphvc.com). Full-viewport WebGL/WebGPU scene as the site itself, GPU particle systems that morph into figures and logos, scroll-choreographed camera and animation via Theatre.js/GSAP, godrays + bloom post-processing, Draco/KTX2-compressed 3D assets, layered sound design with Howler, and an HTML typography overlay. USE THIS SKILL whenever the user wants a website that feels like a film — "a site like hashgraphvc", "an immersive 3D landing page", "particles forming a shape/logo", "underwater/space/atmospheric scroll experience", "make my brand site feel cinematic/premium/alive", "3D site with sound design", or any marketing/brand/product site where the 3D scene IS the design rather than a decoration. Prefer this over generic page builders or flat hero sections when visual impact is the goal.
---

# Cinematic 3D Website

Build websites where a real-time 3D scene *is* the site: the user scrolls, and a
camera moves through a choreographed world — particles condense into a human
figure, rocks drift past, light shafts sweep the scene, a bass loop swells.
Text floats above it as a thin HTML layer. This is the architecture used by
top-tier agency sites (reference for the bar: **hashgraphvc.com** — study it,
never copy its code or assets).

This skill complements `procedural-3d-realism` (shading/lighting recipes).
This one is about the **whole experience**: app architecture, scroll
choreography, GPU particles, post-processing identity, asset pipeline, sound,
and the UI layer — and how they connect.

## What separates "cinematic" from "a spinning cube"

1. **One continuous world, not widgets.** A single fullscreen canvas hosts
   section-scenes (intro → about → portfolio → outro). Scroll doesn't move a
   page; it scrubs a timeline through the world.
2. **Choreography, not tweens.** Every camera move, light change, and particle
   morph is keyframed on a shared timeline (Theatre.js or a GSAP master
   timeline), scrubbed by smoothed scroll. Nothing is "on click, animate".
3. **A post-processing identity.** Bloom + godrays + film grain + vignette +
   a color grade define the *look* more than the models do.
4. **Density through instancing and particles**, not heavy meshes. 100k GPU
   particles + a dozen Draco-compressed rocks read as an infinite world.
5. **Sound as a layer of the design.** Ambient bed + per-section loops +
   UI ticks, crossfaded by scroll position, behind an explicit SOUND ON/OFF.
6. **The HTML stays HTML.** Headlines, nav, buttons are real DOM on top of the
   canvas — selectable, accessible, SEO-visible — animated in sync with the 3D.

## Stack (default choices)

| Concern | Choice | Why |
|---|---|---|
| Renderer | Three.js `WebGPURenderer` (auto-falls back to WebGL2) + TSL node materials | One material/compute codebase for both backends |
| App shell | Vanilla Vite (simple) or Nuxt 3 SSG (need CMS/routes) | SSG keeps text crawlable under the canvas |
| Choreography | Theatre.js `@theatre/core` (+ `@theatre/studio` in dev) | Visual keyframe editor; export JSON state, ship it |
| DOM animation | GSAP + ScrollTrigger | Split-text reveals, pinning, DOM↔scene sync |
| Smooth scroll | Lenis | Gives the lerped scroll value everything scrubs from |
| Sound | Howler | Dual-format (webm+mp3), sprite-free loops, fades |
| 3D assets | glTF + Draco (meshes) + KTX2/Basis (textures) via `gltf-transform` | 10–20× smaller payloads |
| CMS (optional) | Sanity/Contentful | Portfolio/team content without redeploys |

## Build order (follow this sequence)

Work in vertical slices — get an ugly version of the *whole* pipeline running
before polishing any one part. Each step has a reference file; read it when
you reach that step.

1. **Shell + render loop + scroll** → `references/architecture.md`
   Canvas, renderer (worker-offscreen if you're ambitious), resize/DPR policy,
   quality tiers, Lenis, a scroll→timeline scrub. Prove: a cube that moves as
   you scroll through 4 full-viewport sections.
2. **Section-scene system** → `references/architecture.md`
   SceneManager with per-section enter/exit ranges on the timeline,
   per-section post-processing overrides. Prove: background color and camera
   change per section as you scroll.
3. **Choreography** → `references/scroll-choreography.md`
   Theatre.js project/sheet, keyframe camera + fog + key uniforms in Studio,
   export state JSON, scrub sheet.sequence.position from smoothed scroll.
   Add scroll-velocity influence for organic motion.
4. **Hero content: GPU particles** → `references/gpu-particles.md`
   TSL compute particles; emit from a mesh surface (MeshSurfaceSampler) so
   they *form* a figure/logo; curl-noise drift; morph between shapes per
   section; additive glow.
5. **Environment + assets** → `references/assets-pipeline.md`
   Draco-compress models, KTX2 textures, instanced debris field, fog.
6. **The look** → `references/postprocessing-look.md`
   Bloom, godrays, grain, vignette, per-section color overlays, optional
   pointer-fluid interaction texture. This is where "realistic" happens.
7. **Sound** → `references/sound-design.md`
   Howler manager, ambient + section loops, UI sfx, sound toggle, autoplay
   compliance.
8. **UI layer + loader** → `references/ui-layer.md`
   Typography overlay, char-split reveals synced to sections, progress
   scrollbar, intro/loading sequence, reduced-motion and mobile fallbacks.
9. **Performance pass** — see checklist below.

## Non-negotiable quality bar

Before calling it done, verify every one of these (screenshot/measure, don't
assume):

- 60fps on an M-series laptop at DPR 2; ≥30fps on a mid-range phone with the
  quality tier dropped (fewer particles, no godrays, DPR 1.5 max).
- No visible pop-in: assets preload behind a loader; the intro animation
  starts only when everything critical is ready.
- Scroll feels weighted: Lenis lerp ~0.08–0.12; timeline scrub uses the
  *smoothed* value; fast flicks add velocity-based tilt/stretch that decays.
- The page works with JS disabled to the extent that headline text and links
  exist in the HTML (SSG/SSR or static markup under the canvas).
- Sound never autoplays audibly without a user gesture; toggle state persists.
- `prefers-reduced-motion`: kill camera drift + particle turbulence, jump-cut
  between sections, keep content readable.
- Total transfer budget: ≤ 3–4 MB JS+models+textures for the first-paint
  experience; sounds lazy-loaded after interaction.
- Tab-away pauses the render loop (`visibilitychange`) and audio.

## Content/design direction (do this before coding)

Cinematic sites die from incoherence, not weak tech. Lock these first:

- **One metaphor.** Underwater, deep space, desert dunes, inside a machine…
  pick one and let it drive palette, physics (drag/buoyancy), sound (muffled
  low-pass underwater), and particle behavior. hashgraphvc = deep ocean:
  blue-black palette, floating rock debris, bubbles, godrays from above,
  muffled ambient bed.
- **A 4–6 beat storyboard.** One sentence + one visual event per scroll
  section, e.g. "Beat 2 — INVESTORS: particles condense into a swimming human
  figure; camera orbits 30°; bass loop enters."
- **Palette of ~3 colors** + one accent used only for glow/bloom-catching
  elements. Near-black background is what makes bloom read as light.
- **Type system:** one display face for huge numerals/headlines, one clean
  sans for body — loaded as `woff2`, `font-display: swap`.

## IP guardrail

Reference sites are for *reverse-engineering technique*, never for lifting
code, shaders, models, fonts, audio, or copy. Everything you ship must be
original or properly licensed (models: user-supplied / CC0 sources like
polyhaven; audio: licensed or generated; fonts: licensed webfonts).

## Reference files

| File | Read when |
|---|---|
| `references/architecture.md` | Setting up renderer, worker/offscreen, scene manager, quality tiers, resize/DPR |
| `references/scroll-choreography.md` | Wiring Lenis + Theatre.js/GSAP, scroll scrubbing, velocity effects |
| `references/gpu-particles.md` | Building the particle hero: compute, surface sampling, morphing, sorting |
| `references/postprocessing-look.md` | Bloom/godrays/grain/vignette, per-section grading, fluid interaction |
| `references/assets-pipeline.md` | Compressing models/textures/audio, loaders, preloading strategy |
| `references/sound-design.md` | Howler manager, loops/crossfades, toggle, autoplay rules |
| `references/ui-layer.md` | HTML overlay, text reveals, loader, scrollbar, accessibility fallbacks |

Read them lazily — only the one for the step you're on.
