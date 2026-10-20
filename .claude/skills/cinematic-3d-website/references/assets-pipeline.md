# Asset pipeline: models, textures, audio, fonts

Award-tier sites feel instant because every asset is aggressively compressed
and loaded in a deliberate order. Budget first, then compress until you're
under it.

## Transfer budget (first experience)

| Asset class | Target |
|---|---|
| JS (app + three + libs) | ≤ 1.2 MB gzipped |
| Models (all GLBs) | ≤ 1.5 MB total |
| Textures | ≤ 800 KB total |
| Fonts | ≤ 150 KB (2–3 woff2) |
| Sounds | 0 up front — lazy after first interaction |

A whole cinematic site can ship under ~4 MB. If you're over, compress harder —
don't cut features first.

## 1. Models: glTF + Draco (+ Meshopt)

Author/export as `.glb`, then compress with `gltf-transform`:

```bash
npm i -g @gltf-transform/cli

# inspect first — know what you're shipping
gltf-transform inspect model.glb

# the standard pass: prune junk, weld verts, simplify, draco-compress
gltf-transform optimize model.glb model_out.glb \
  --compress draco --texture-compress webp --simplify 0.75
```

Rules of thumb:
- A hero rock/figure mesh: ≤ 15k triangles after `--simplify`. Particles and
  fog hide low-poly better than any normal map.
- Split exports per section (`intro.glb`, `portfolio.glb`) so sections can
  load progressively; keep shared assets (`rocks.glb`, `logo.glb`) in a
  `global.glb`.
- Meshes used ONLY as particle emission surfaces (MeshSurfaceSampler) can be
  simplified brutally (0.3) — nobody sees the mesh itself.

Loading needs the Draco decoder hosted with your site (never a third-party
CDN — it's a render-blocking dependency):

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');   // copy from three/examples/jsm/libs/draco/
const gltf = new GLTFLoader().setDRACOLoader(draco);
```

## 2. Textures: KTX2/Basis (GPU-compressed) or WebP

- **KTX2 (Basis Universal)** for anything sampled in 3D (noise, matcaps,
  surfaces): stays compressed *in GPU memory* (4–8× less VRAM), transcodes to
  the native format per device. Encode with `gltf-transform etc1s`/`uastc` or
  `toktx`. Load with `KTX2Loader` (+ `/basis/` transcoder files, hosted like
  Draco).
- **WebP** for UI-ish images (logos, photos) — smaller on the wire, but
  decompressed in VRAM. Fine for a handful.
- Utility textures that shape the look — ship tiny ones: blue-noise 128²
  (dithering/grain), tiling perlin 256² (masks, godray noise), a water-normals
  tile, a soft round sprite for particles. All well under 100 KB combined.
- Power-of-two sizes, mipmaps on, `colorSpace = SRGBColorSpace` only for
  color/albedo (NOT for normal/noise/data textures — a classic silent bug).

## 3. Audio: dual format, tiny loops

Encoding (from WAV masters) with ffmpeg:

```bash
for f in *.wav; do
  ffmpeg -i "$f" -c:a libopus -b:a 64k  "webm/${f%.wav}.webm"   # primary: ~half the size
  ffmpeg -i "$f" -c:a libmp3lame -q:a 5 "mp3/${f%.wav}.mp3"     # safari/fallback
done
```

Howler takes `src: [webm, mp3]` and picks the first playable. Loop beds:
15–30s seamless loops at 64–96kbps opus ≈ 150–300 KB each. UI ticks: < 10 KB.
Structure: `/sounds/webm/*.webm`, `/sounds/mp3/*.mp3` (see sound-design.md).

## 4. Fonts

2–3 `woff2` max, subset to used glyphs (`glyphhanger` or fontTools
`pyftsubset`). `font-display: swap` + preload the display face:

```html
<link rel="preload" href="/fonts/Display.woff2" as="font" type="font/woff2" crossorigin>
```

## 5. Loading strategy (what happens behind the loader)

Phase the load; the intro must not wait for the outro:

1. **Critical (blocks intro):** app JS, draco/basis decoders, intro-section
   GLB + global GLB, utility textures, display font. Loader UI shows real
   progress (`THREE.LoadingManager.onProgress`).
2. **Adjacent (starts immediately after intro plays):** remaining section
   GLBs, in scroll order. Use `link rel=prefetch` or just fire the loads.
3. **On interaction:** sounds (first pointer/scroll event — also satisfies
   autoplay policy), any CMS images below the fold.

```js
const manager = new THREE.LoadingManager();
manager.onProgress = (_, loaded, total) => loader.setProgress(loaded / total);
manager.onLoad = () => { ui.loaderDone(); choreo.playIntro(); };
```

Never let the world render half-loaded: keep the canvas black (or
loader-covered) until phase 1 completes, then play the intro reveal. Pop-in
destroys the illusion more than 2 extra seconds of loader.

## 6. CMS content (optional)

Portfolio/team data from Sanity/Contentful: fetch at *build* time (SSG) so the
payload ships as static JSON — no runtime API dependency, no CORS issues, no
layout jump. Images via the CMS CDN with explicit width params
(`?w=800&fm=webp`). If the 3D scene needs CMS-driven textures (e.g. project
logos on meshes), download them at build time into `/public` so they're
same-origin — remote CDNs can break in dev/local mirrors and add DNS cost.

## 7. Verification

- `gltf-transform inspect` every shipped GLB — check triangle count and that
  textures didn't sneak in uncompressed.
- DevTools Network tab, "Disable cache", throttle to Fast 4G: first experience
  interactive ≤ 5s.
- `renderer.info` in a dev overlay: watch geometries/textures/programs counts
  don't leak when sections activate/deactivate (dispose on deactivate if
  memory becomes a problem — usually keeping everything resident is fine
  under these budgets).
