# Post-processing: where "realistic" actually happens

Raw renders look like tech demos. The cinematic identity comes from a short,
deliberate post chain. Order matters: **scene → bloom → godrays → grade
(overlay/vignette) → grain → tonemap/output**.

With `three/webgpu`, build it with the node-based `PostProcessing` class —
one pipeline for WebGPU and WebGL2.

```js
import * as THREE from 'three/webgpu';
import { pass, uniform, vec3, vec4, float, mix, time } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const scenePass = pass(scene, camera);
const color = scenePass.getTextureNode();

const bloomPass = bloom(color, /*strength*/ 1.2, /*radius*/ 0.4, /*threshold*/ 0.9);
let comp = color.add(bloomPass);
comp = applyGodrays(comp);        // §2
comp = applyGrade(comp);          // §3 overlay + vignette
comp = applyGrain(comp);          // §4
const post = new THREE.PostProcessing(renderer);
post.outputNode = comp;
// frame loop: post.render()  (instead of renderer.render)
```

## 1. Bloom — the light-maker

Bloom is why particles look like bioluminescence and rim-lit rocks glow.
- Threshold ~0.85–1.0: only *designed* hot spots bloom (particle cores,
  sun disc, accent edges). If the whole frame blooms, raise the threshold or
  dim the scene — full-frame bloom is the #1 amateur tell.
- Strength 0.8–1.8, keyframed per section in Theatre (intro dim → hero bright).
- Run at half resolution; nobody can tell.

Design rule: author materials in "HDR" — emissive values 2–8 on things meant
to glow, < 1 on everything else. Bloom then separates light from matter
automatically.

## 2. Godrays / light shafts

The underwater/atmosphere sell. Two credible approaches; pick by budget:

**a) Radial-blur godrays (screen-space, classic).** Render an occlusion
buffer (bright sun disc, scene as black silhouettes) at half res, then
radially blur it away from the light's screen position and add:

```js
// occlusion buffer: scene with black override material + bright disc at lightScreenPos
// then a ~48–64 tap radial march:
const godray = Fn(() => {
  const dir = uLightScreenPos.sub(screenUV);
  const acc = float(0).toVar(), decay = float(1).toVar();
  Loop(TAPS, ({ i }) => {
    const p = screenUV.add(dir.mul(float(i).div(TAPS)).mul(uDensity));
    acc.addAssign(occlusionTex.sample(p).r.mul(decay).mul(uWeight));
    decay.mulAssign(0.96);
  });
  return acc.mul(uExposure);
});
comp = comp.add(godray().mul(uGodrayColor).mul(uGodrayIntensity));
```

**b) Fake volumetric planes (cheapest, very art-directable).** 3–6 large
transparent planes slanting from the light direction, additive, with an
animated noise mask and soft edges. Looks great underwater where rays are
diffuse. Use this on the low quality tier (or everywhere — many award sites do).

Godray intensity is a per-section keyframe: rays sweep in at the hero moment,
fade during reading sections.

## 3. Color grade: per-section overlays + vignette

Grade transitions are how one world reads as different "rooms". Each section
declares a grade; lerp global uniforms toward the active section's values:

```js
const uOverlayColor   = uniform(new THREE.Color('#0a1428'));
const uOverlayOpacity = uniform(0.0);   // multiply-ish tint
const uVignette       = uniform(0.35);

const applyGrade = (c) => {
  c = mix(c, c.mul(vec4(uOverlayColor, 1)), uOverlayOpacity);
  const d = screenUV.sub(0.5).length();
  return c.mul(float(1).sub(d.mul(d).mul(uVignette.mul(2.2))));  // soft corner falloff
};

// per frame (SceneManager knows the active section):
lerpUniform(uOverlayColor,   section.grade.color,   0.05);
lerpUniform(uOverlayOpacity, section.grade.opacity, 0.05);
```

Vignette: 0.3–0.5. It focuses the eye and hides edge artifacts. Always-on.

## 4. Film grain

Kills the "too clean" CG look and dithers gradient banding on dark scenes
(critical for near-black palettes).

```js
const grain = hash(screenUV.mul(uResolution).add(time.mul(60)))  // animated white noise
  .sub(0.5).mul(0.06);                                           // amplitude 0.04–0.08
comp = comp.add(grain);
```

Animated grain (re-randomized per frame) reads as film; static grain reads as
a dirty screen. On the low tier, keep grain but stop animating it.

## 5. Tone mapping + color space

`ACESFilmicToneMapping` (or AgX in newer three) + exposure ~1.0. Set it on the
renderer and *stop touching saturation in materials* — grade via the overlay
uniforms instead. Author the scene dark: a near-black background (#050a14, not
#000) gives bloom and grain room to live.

## 6. Interactive fluid trail (the "wow, it responds" layer)

Advanced but signature: simulate a small 2D fluid (or cheap trail buffer)
driven by pointer movement, and use it as a screen-space texture that locally
boosts brightness / refracts the composite — the cursor leaves a glowing
ripple over the world.

Cheap version (trail buffer, 90% of the effect):
- 256×256 ping-pong render target. Each frame: sample previous frame with
  slight decay (×0.97) and a tiny blur; splat a soft disc at pointer position
  with intensity ∝ pointer speed.
- In the post chain: `comp = comp.add(comp.mul(trailTex.sample(screenUV).r.mul(0.6)))`
  and optionally offset `screenUV` by the trail gradient for refraction.

Full version: stable-fluids solve (advection + pressure) at 128–256², same
usage. Only on med/high tiers; skip entirely on mobile.

## 7. Transitions between sections

Beyond grade lerps, two cheap high-impact moves:
- **Exposure dip:** keyframe exposure 1.0 → 0.85 → 1.0 across a boundary —
  reads as a cinematic "breath".
- **DPR drop during fast transitions:** if scroll velocity exceeds a
  threshold, halve DPR for those frames and restore after — headroom exactly
  when the most movement happens (invisible in motion).

## 8. Debug harness

Build a dev-only panel (lil-gui / Tweakpane or Theatre studio itself) exposing
bloom strength/threshold, godray intensity, overlay color/opacity, grain
amplitude, vignette, exposure. The look is *found* by twiddling on real
content, not computed. Screenshot each section at final settings and keep them
in the repo as the visual spec.
