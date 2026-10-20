# cinematic-3d-website

A Claude skill for building **award-tier, cinematic 3D scroll-driven websites** —
sites where a real-time WebGL/WebGPU world *is* the site. Scroll scrubs a
choreographed camera through the scene, GPU particles condense into figures and
logos, godrays and bloom define the look, and a layered sound design scores the
journey. Reference for the quality bar: [hashgraphvc.com](https://hashgraphvc.com)
(techniques reverse-engineered; all code here is original).

Companion to [procedural-3d-realism](https://github.com/gkren22/procedural-3d-realism)
(shading/lighting recipes) — this skill covers the **whole experience**:
architecture, scroll choreography, particles, post-processing, assets, sound, UI.

## What it gives Claude

- **A build order** — 9 steps from empty repo to shipped experience, each with a
  deep reference file
- **Architecture** — Three.js WebGPU renderer (WebGL2 fallback) + TSL, optional
  OffscreenCanvas rendering in a Web Worker, a section-scene system, quality tiers
- **Scroll choreography** — Lenis smoothed scroll scrubbing a Theatre.js sequence
  (or GSAP master timeline), scroll-velocity as a design input
- **GPU particles** — compute-simulated particles emitted from mesh surfaces
  (MeshSurfaceSampler) that morph between shapes; curl noise, pointer forces
- **The look** — bloom, godrays, film grain, vignette, per-section color grades,
  interactive fluid/trail textures
- **Asset pipeline** — Draco + KTX2 compression budgets and commands, phased
  preloading behind a loader
- **Sound design** — Howler manager, ambient bed + per-section loop crossfades,
  UI ticks, autoplay-policy compliance
- **UI layer** — char-split typography reveals, custom scrollbar, loader/intro
  sequence, accessibility and reduced-motion fallbacks

## Install

Copy the folder into your Claude Code skills directory:

```bash
git clone https://github.com/gkren22/cinematic-3d-website.git \
  ~/.claude/skills/cinematic-3d-website
```

Claude Code picks it up automatically. Then just ask for what you want:

> "Build me an immersive 3D landing page for my coffee brand — particles that
> form the logo, underwater vibes, sound design, like hashgraphvc.com"

## Layout

```
SKILL.md                      # workflow, stack, build order, quality bar
references/
  architecture.md             # renderer, worker/offscreen, scenes, quality tiers
  scroll-choreography.md      # Lenis + Theatre.js + GSAP, velocity FX
  gpu-particles.md            # compute particles, surface sampling, morphing
  postprocessing-look.md      # bloom, godrays, grain, grades, fluid trail
  assets-pipeline.md          # Draco/KTX2/audio budgets and commands
  sound-design.md             # Howler manager, loops, crossfades, autoplay
  ui-layer.md                 # typography reveals, loader, a11y fallbacks
```

## License

MIT — see [LICENSE](LICENSE). Use it for anything. Reference sites are for
studying technique; never lift their code, models, fonts, audio, or copy.
