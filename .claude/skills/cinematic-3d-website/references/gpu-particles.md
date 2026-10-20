# GPU particles: the cinematic hero

The signature move of this genre: tens of thousands of glowing particles that
drift like plankton, then condense into a *shape* — a human figure, a logo, a
product — as you scroll. All simulation runs on the GPU (TSL compute on
WebGPU, with the same code compiling to WebGL2), so 100k+ particles are cheap.

## 1. Data layout

Per particle, stored in storage buffers (instanced attributes on WebGL):

- `position: vec3` — current simulated position
- `velocity: vec3`
- `targetA / targetB: vec3` — two morph target positions (see §3)
- `seed: float` — per-particle random, drives size/phase/lifetime variation

```js
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec3, float,
         sin, time, mix, uv } from 'three/tsl';

const COUNT = quality.particleCount;
const positions  = new THREE.StorageInstancedBufferAttribute(COUNT, 3);
const velocities = new THREE.StorageInstancedBufferAttribute(COUNT, 3);
const targetsA   = new THREE.StorageInstancedBufferAttribute(COUNT, 3);
const targetsB   = new THREE.StorageInstancedBufferAttribute(COUNT, 3);
const seeds      = new THREE.StorageInstancedBufferAttribute(COUNT, 1);
```

## 2. Emit from a mesh surface (this is how particles "become" a figure)

Load any (Draco-compressed) mesh — a human figure, your logo extruded, a
product scan — and sample points uniformly on its surface with
`MeshSurfaceSampler`. Those points become morph targets.

```js
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

function samplePoints(mesh, count) {
  const sampler = new MeshSurfaceSampler(mesh).build();
  const out = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    sampler.sample(p);
    out.set([p.x, p.y, p.z], i * 3);
  }
  return out;
}
// targetsA ← human figure points, targetsB ← logo points, etc.
```

For an *animated* figure (a swimmer, a walker): sample the mesh in its bind
pose, and additionally bake 2–4 posed variants (or skin the points on the GPU
if you're comfortable) — cross-fading between pose point-sets at 0.5–1s
intervals reads convincingly as motion once noise is layered on top.

## 3. The compute pass: attraction + curl noise + drag

Every frame each particle: (a) springs toward its morphed target, (b) gets
pushed by curl noise (divergence-free → fluid-like swirls, no clumping),
(c) drags to a stop. `morph` (0..1) is keyframed in Theatre per section.

```js
const uMorph      = uniform(0);      // 0 = shape A, 1 = shape B
const uAttraction = uniform(1.5);    // spring strength; 0 = free-floating cloud
const uTurbulence = uniform(0.35);   // curl noise amplitude (velocity FX boosts this)
const uDelta      = uniform(0.016);

const simulate = Fn(() => {
  const pos = storage(positions, 'vec3', COUNT).element(instanceIndex);
  const vel = storage(velocities, 'vec3', COUNT).element(instanceIndex);
  const tA  = storage(targetsA, 'vec3', COUNT).element(instanceIndex);
  const tB  = storage(targetsB, 'vec3', COUNT).element(instanceIndex);

  const target = mix(tA, tB, uMorph);
  const toTarget = target.sub(pos);
  vel.addAssign(toTarget.mul(uAttraction).mul(uDelta));          // spring
  vel.addAssign(curlNoise(pos.mul(0.8).add(time.mul(0.1)))       // swirl
                 .mul(uTurbulence).mul(uDelta));
  vel.addAssign(vec3(0, 0.02, 0).mul(uDelta));                   // buoyancy (underwater feel)
  vel.mulAssign(float(0.96));                                    // drag
  pos.addAssign(vel);
})().compute(COUNT);

// per frame: uDelta.value = dt; renderer.compute(simulate);
```

`curlNoise` = curl of 3 offset simplex/perlin samples; implement once in TSL
(≈30 lines, standard formulation: noise sampled at ±ε offsets, cross-derived).
The `procedural-3d-realism` skill has noise recipes.

Tuning grammar:
- **Idle cloud:** attraction 0–0.2, turbulence high → nebula drifting.
- **Condensing into figure:** ramp attraction to 2–4 over ~1s while morph sits
  on the figure's targets. The "snap" moment is the money shot.
- **Explode/disperse (section exit):** attraction to 0 + one-frame velocity
  impulse away from the shape's centroid.

## 4. Rendering the particles

Instanced sprites with additive blending and a soft radial falloff. Size
varies by seed and pulses subtly.

```js
const mat = new THREE.SpriteNodeMaterial({
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
});
mat.positionNode = storage(positions, 'vec3', COUNT).toAttribute();
mat.scaleNode = float(0.02).mul(seedAttr.mul(1.5).add(0.5))
  .mul(sin(time.mul(2).add(seedAttr.mul(50))).mul(0.15).add(1)); // shimmer
mat.colorNode = uColor.mul(
  // soft disc: 1 at center → 0 at edge, squared for glow falloff
  float(1).sub(uv().sub(0.5).length().mul(2)).clamp(0, 1).pow(2)
).mul(uBrightness);   // push > 1 so bloom catches the particles
const particles = new THREE.Sprite(mat); particles.count = COUNT;
```

Key look decisions:
- `depthWrite: false` + additive = overlapping particles sum into glow.
- Set brightness so particle cores exceed the bloom threshold (~1.0+): the
  bloom pass, not the sprite, produces the "made of light" look.
- Fade particles by camera distance (`smoothstep` on view depth) so they
  dissolve into fog instead of clipping.

## 5. Depth sorting (only if you must)

Additive blending is order-independent — **no sorting needed**. That's why
this look is standard. If the design needs alpha-blended (smoky, non-glowing)
particles, sort on GPU with a bitonic sort compute pass over view-space depth
(three.js ships TSL compute-sort examples), or fake it: render back half and
front half as two draw calls sorted once per section. Try additive first;
sorting is a rabbit hole.

## 6. Pointer interaction

Forward normalized pointer position into the sim (via worker message if
applicable), unproject to a world-space point on the particle plane, and add a
repulsion/attraction term:

```js
const toPointer = uPointerWorld.sub(pos);
const d = toPointer.length().max(0.001);
vel.addAssign(toPointer.div(d).mul(uPointerForce).div(d.mul(d).add(1)).mul(uDelta));
```

Negative force = particles shy away from the cursor (feels alive); small
positive force on hover-over-CTA = the world reaches toward the button.
Even better paired with the fluid trail texture in postprocessing-look.md.

## 7. Budget & fallbacks

| Tier | Count | Notes |
|---|---|---|
| high (desktop WebGPU) | 100k–200k | full curl noise, pointer force |
| med | 40k–80k | curl noise every other frame (cache in velocity) |
| low (mobile/WebGL) | 10k–30k | replace curl with 2 sine-wobble octaves |

The composition must be *designed* to survive low tier: the figure silhouette
should read at 10k points (denser sampling on silhouette edges helps — sample
weighted by face normal · view direction if needed).
