# Post-processing — the cinematic finish

Raw 3D renders look clean but "digital." A short post-processing chain makes the
frame look **photographed**: highlights bloom, a vignette focuses the eye, and
fine grain unifies everything and hides banding. This is a high
realism-per-effort step — do it on almost every scene.

## EffectComposer chain

Render through an `EffectComposer` instead of `renderer.render()`:

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass }     from 'three/addons/postprocessing/ShaderPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom: bright things bleed light. (resolution, strength, radius, threshold)
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight),
                                  0.6, 0.55, 0.78);
composer.addPass(bloom);

composer.addPass(new OutputPass());   // tone mapping + color space, applied here in the chain

composer.addPass(grainPass);          // custom grade pass, below — keep it LAST
```

In the loop call `composer.render()` (not `renderer.render()`), and resize it:
`composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);`

> **Bloom threshold** controls *what* glows: only pixels brighter than the
> threshold bloom. Set it so the sun, lights, and specular highlights bleed but
> the whole frame doesn't go soft. Tune `strength` until bright edges *just*
> bleed — overdone bloom looks cheap.

## Custom grade pass: grain + vignette (+ optional warm/flash)

A tiny `ShaderPass` for the final look. Film grain breaks up gradients and banding
(a huge realism cue) and the vignette pulls focus to the center.

```js
const grainPass = new ShaderPass({
  uniforms: { tDiffuse:{value:null}, uTime:{value:0}, uVignette:{value:1.0} },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col += (h21(vUv*vec2(1920.0,1080.0)+uTime)-0.5)*0.045;   // fine film grain
      vec2 q = vUv-0.5; float v = smoothstep(0.95,0.30, length(q)*uVignette);
      col *= mix(0.62,1.0,v);                                  // vignette darkens edges
      gl_FragColor = vec4(col,1.0);
    }`,
});
// each frame: grainPass.uniforms.uTime.value = t;
```

Extend the same pass with extra uniforms when a scene needs them:
- a **warm grade** `col = mix(col, col*vec3(1.06,1.01,0.92), uWarm)` for a sunlit act;
- a **flash** `col = mix(col, vec3(1.0,0.97,0.9), uFlash)` to mask a hard cut
  between two scenes during a scroll transition;
- subtle **chromatic aberration** at the edges for a lens feel (sample R/G/B at
  slightly offset uvs scaled by `length(q)`).

Drive those uniforms from your scroll/keyframe logic.

## Bloom + emissive = glow that feels lit

Bloom only blooms what's bright. To make something glow (neon, sun, screens,
city lights), make it actually bright: use an emissive material color above 1.0,
or additively-blended sprites, and let bloom do the rest. Crank `bloom.strength`
slightly during night/dark beats and ease it back for day — small dynamic moves
in post sell mood changes.

## Order matters

`RenderPass → (selective/extra passes) → bloom → OutputPass → grain/vignette`.
Keep the grain/vignette grade **last** so grain sits on top of the final image and
the vignette frames everything, including bloom.
