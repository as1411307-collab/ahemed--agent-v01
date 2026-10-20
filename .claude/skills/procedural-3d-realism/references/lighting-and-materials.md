# Lighting & Materials — making any surface look real

For **imported models** (and any non-shader geometry), realism is almost entirely
**lighting + materials + tone mapping**, not geometry. A simple model under great
lighting beats a detailed one under flat lighting every time.

## The single biggest win: image-based lighting (IBL)

Real objects are lit by their whole environment, not one bulb. An **environment
map** gives you that for free — soft, directional, color-rich light plus correct
reflections on metal/glossy surfaces. This one step is the difference between
"3D asset" and "photographed object."

```js
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// Optional: also show it as the background. Or load a real .hdr studio probe
// with RGBELoader for photoreal reflections.
```
Every `MeshStandardMaterial`/`MeshPhysicalMaterial` in the scene now picks up
this lighting automatically. With ACES tone mapping (see setup), it looks shot in
a studio.

For an outdoor/sky look, generate the environment from a `Sky` shader or a
gradient scene instead of RoomEnvironment.

## PBR materials (physically based)

Use `MeshStandardMaterial` (or `MeshPhysicalMaterial` for clearcoat/glass/sheen).
The two dials that matter most:

```js
const m = new THREE.MeshStandardMaterial({
  color: 0x8a8f98,
  metalness: 0.0,   // 0 = dielectric (plastic, wood, skin); 1 = metal
  roughness: 0.35,  // 0 = mirror; 1 = matte. Mid values read most "real".
});
```
- **Metalness is almost binary** in reality — set ~0 or ~1, not 0.5, unless it's a
  dirty/painted metal.
- **Roughness carries the realism.** Vary it across a surface (a roughness map, or
  noise via `onBeforeCompile`) so it isn't uniformly perfect — real surfaces have
  smudges, wear, micro-variation.
- `MeshPhysicalMaterial` adds `clearcoat` (car paint, lacquer), `transmission`
  (glass/liquid), `sheen` (fabric), `iridescence`.

To inject procedural variation into a standard material without writing a full
shader, hook `material.onBeforeCompile` and patch the GLSL — best of both worlds:
PBR lighting + your noise.

## The 3-light rig (when you don't use IBL, or to add accents on top)

Even with IBL, a touch of directional shaping adds drama. The classic rig:

```js
const key  = new THREE.DirectionalLight(0xfff2e0, 2.2); // main, warm, off to one side & high
key.position.set(5, 8, 4); key.castShadow = true;
const fill = new THREE.HemisphereLight(0xbcd3ff, 0x202028, 0.5); // sky/ground ambient, cool
const rim  = new THREE.DirectionalLight(0xaecbff, 1.4); // BEHIND the subject — separates it from bg
rim.position.set(-4, 3, -6);
scene.add(key, fill, rim);
```
- **Key** = direction + warmth of your light source.
- **Fill** = softens shadows so they aren't black; tint it opposite the key
  (warm key → cool fill) for natural color contrast.
- **Rim/back light** = the pro move. A light behind the subject draws a bright
  edge that pops it off the background. Most "why does this look expensive"
  lighting is a good rim.

## Soft shadows

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;          // kills shadow acne
key.shadow.camera.near = 1; key.shadow.camera.far = 40;
// tighten the shadow camera frustum to your subject for crisp, well-resolved shadows
mesh.castShadow = true; ground.receiveShadow = true;
```
A cheaper alternative for hero objects: a soft **contact-shadow blob** — a plane
with a radial-gradient canvas texture under the model. Costs nothing, reads great.

## Loading models (GLTF/GLB)

GLB is the web-native format. Keep files small (see the FBX→GLB pipeline below).

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
new GLTFLoader().load('assets/model.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  scene.add(model);
  // gltf.animations -> AnimationMixer; see animation-and-scroll.md
}, undefined, (err) => console.error('GLB load failed', err));
```
Remember `GLTFLoader` needs `vendor/jsm/utils/BufferGeometryUtils.js` (setup doc).

### Turning an FBX (or other) into a small GLB

If the source is FBX (often huge, with baked animation clips):

1. On Apple Silicon, the `fbx2gltf` binary is x86_64 — install Rosetta first:
   `softwareupdate --install-rosetta --agree-to-license`.
2. `npm i --no-save fbx2gltf` then run its `FBX2glTF -i in.fbx -o out --binary`.
3. Optimize with gltf-transform: `npm i --no-save @gltf-transform/cli`, then drop
   unused animation clips, resize textures (e.g. to 1024² WebP), and prune. Skip
   Draco unless size is critical (Draco needs an extra decoder vendored).
4. A 60–100MB FBX commonly becomes a 3–4MB GLB this way.

> If a baked "Run"/"Walk" clip drifts the model forward (root motion), neutralize
> the root bone's translation each frame so the animation plays in place and your
> own path/curve drives the movement.

## Coherence checklist (what actually reads as "real")

- One dominant light **direction** consistent across hero + shadows + any
  procedural sun.
- Tone mapping ON, exposure tuned so highlights roll off, not clip.
- Roughness/metalness varied, never uniform plastic.
- A rim light or fresnel edge separating subject from background.
- Reflections (from `scene.environment`) present on anything glossy.
- A faint, consistent grain + vignette over the whole frame (postprocessing doc).
