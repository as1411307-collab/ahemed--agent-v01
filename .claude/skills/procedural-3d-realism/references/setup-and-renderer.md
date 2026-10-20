# Setup & Renderer

The reliability secret behind a scene that "just works on any machine" is the
**no-build, vendored, import-map** setup. No npm, no bundler, no version drift.
You ship plain files; the browser runs them. This is why the same site renders
identically on a beefy desktop and a modest laptop.

## 1. Vendor Three.js locally

Don't load Three.js from a CDN in production scenes (CDNs change, go down, or
rate-limit). Copy the library into the project. You need:

```
project/
├── index.html
├── main.js
├── styles.css
└── vendor/
    ├── three.module.js                 # the core library
    └── jsm/                             # addons you use, mirroring three's tree
        ├── postprocessing/             # EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass
        ├── loaders/                    # GLTFLoader (+ DRACOLoader if compressed)
        ├── shaders/                    # shaders some passes import
        └── utils/                      # BufferGeometryUtils.js  ← GLTFLoader needs this!
```

Fetch a matching set (pick a version and keep it consistent, e.g. r160):

```bash
mkdir -p vendor/jsm/{postprocessing,loaders,shaders,utils}
BASE="https://unpkg.com/three@0.160.0"
curl -sL "$BASE/build/three.module.js" -o vendor/three.module.js
for f in postprocessing/EffectComposer postprocessing/RenderPass \
         postprocessing/UnrealBloomPass postprocessing/OutputPass \
         postprocessing/ShaderPass postprocessing/MaskPass \
         shaders/CopyShader shaders/LuminosityHighPassShader shaders/OutputShader \
         loaders/GLTFLoader utils/BufferGeometryUtils; do
  curl -sL "$BASE/examples/jsm/$f.js" -o "vendor/jsm/$f.js"
done
```

> **Trap:** `GLTFLoader.js` imports `../utils/BufferGeometryUtils.js`. If you
> forget to vendor it, the *entire* module graph fails to load with a vague
> "failed to fetch dynamically imported module" and nothing renders. When a pass
> or loader errors on a missing import, vendor the file it names and retry.

## 2. The import map (in `index.html`)

An import map lets your code write clean `import ... from 'three'` while the
browser resolves it to your vendored files — no bundler required.

```html
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three.module.js",
    "three/addons/": "./vendor/jsm/"
  }
}
</script>
<canvas id="scene"></canvas>
<script type="module" src="main.js"></script>
```

Then in `main.js`:
```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
```

## 3. Renderer configuration (this is where realism starts)

The defaults look flat and "CG." These four settings do more for believability
than anything else:

```js
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance'
});

// Cap pixel ratio. Retina ×2–3 fullscreen shaders cook laptops for ~zero
// visual gain. 1.0–1.5 is the sweet spot; start at 1.0 and only raise if crisp
// edges are critical. (See performance-and-gotchas.md.)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
renderer.setSize(innerWidth, innerHeight);

// Filmic tone mapping: compresses bright highlights smoothly instead of
// clipping to flat white. THE difference between "render" and "photo."
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;   // your master brightness dial; tune per scene

// Correct color space so colors aren't washed out / oversaturated.
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

If you use PBR materials lit by an environment map, also:
```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // soft contact shadows
```

## 4. Scene, camera, background

```js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.1, 320);
camera.position.set(0, 0.15, 3.8);
```

A subtle **vertical gradient background** reads far better than a flat color and
costs nothing — paint it on a tiny canvas and use it as the scene background
texture:
```js
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#0a1326'); g.addColorStop(0.45, '#060a16'); g.addColorStop(1.0, '#020308');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
```
The same canvas-texture trick makes star sprites, sun glows, and soft particle
dots without any image files — draw a radial gradient onto a canvas and use it
as a `SpriteMaterial.map` or `PointsMaterial.map`.

## 5. Resize & boot

```js
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  // composer?.setSize(innerWidth, innerHeight);  // if using post-processing
});
```

The render loop itself has a critical ordering rule (the clock-delta bug) and a
performance shape — both are in `animation-and-scroll.md` and
`performance-and-gotchas.md`. Use the loop from `assets/starter/main.js` as your
baseline; it already does this correctly.
