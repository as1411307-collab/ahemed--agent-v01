# Procedural Shaders — worlds from math

This is the technique that made the "Earth" look real. The object is a simple
mesh (a sphere, a plane, a dome); the realism is a **fragment shader** that
computes a believable color for every pixel, every frame, from noise + lighting.
No texture downloads, infinite detail, never repeats.

Mental model of a `ShaderMaterial`:
- **uniforms** = values you pass in from JS each frame (time, sun direction,
  camera position, scroll-driven amounts).
- **vertexShader** = positions geometry and hands varyings (world position,
  normal) to the fragment stage.
- **fragmentShader** = runs per pixel; returns `gl_FragColor`. This is where the
  world is built.

Paste `assets/noise.glsl` at the top of the fragment shader (or prepend it as a
string in JS) so `snoise`, `fbm`, `hash`, `rotY` are available.

## The realism pipeline inside a fragment shader

For a surface point, do these in order. Each step is a layer of believability:

1. **Shape from noise.** Build a scalar field (elevation, density, cloud cover)
   with `fbm`, then **domain-warp** it for organic forms:
   ```glsl
   vec3 warp = vec3(fbm(p*1.7 + 11.3), fbm(p*1.7 + 27.9), fbm(p*1.7 + 43.1));
   float e = fbm(p*1.9 + warp*0.65) * 0.5 + 0.5;   // 0..1 elevation
   ```
   Domain warping is the difference between "blobby noise" and "coastlines."

2. **Map the field to a palette by bands.** Real materials change color with
   height/wetness/slope. Blend, don't hard-switch:
   ```glsl
   float sea = 0.5;
   float land = smoothstep(sea-0.012, sea+0.03, e);          // ocean vs land mask
   vec3 ocean = mix(deepBlue, shallowTeal, smoothstep(0.0, sea, e));
   float h = smoothstep(sea, 1.0, e);                         // height above sea
   vec3 lcol = mix(sand, grass, smoothstep(0.0,0.10,h));
   lcol = mix(lcol, forest, smoothstep(0.10,0.40,h));
   lcol = mix(lcol, rock,   smoothstep(0.45,0.70,h));
   lcol = mix(lcol, snow,   smoothstep(0.74,0.95,h));
   vec3 base = mix(ocean, lcol, land);
   ```
   Add fine tonal variation so it isn't plasticky: `base *= 0.9 + 0.18*fbm(p*6.5);`

3. **Light it like a real surface.** Lambertian day/night from the dot of normal
   and sun, plus a warm terminator band where they meet:
   ```glsl
   float ndl = dot(N, L);                       // N=world normal, L=sun dir
   float day = smoothstep(-0.18, 0.22, ndl);
   vec3 lit = mix(base*nightTint, base*(0.55 + 0.85*max(ndl,0.0)), day);
   float term = smoothstep(-0.05,0.18,ndl) * smoothstep(0.45,0.10,ndl);
   lit += warmDawn * term * 0.55;               // sunrise/sunset rim
   ```

4. **Specular + animated micro-detail** make water and wet surfaces alive:
   ```glsl
   vec3 H = normalize(L + V);                    // V = view dir
   float spec = pow(max(dot(N,H),0.0), 80.0) * (1.0-land) * day;
   lit += sunColor * spec * 0.8;
   float ripple = fbm(p*42.0 + vec3(uTime*0.6,uTime*0.2,uTime*0.4))*0.5+0.5;
   lit += seaSparkleColor * pow(ripple,5.0) * (1.0-land) * day * 0.5;
   ```

5. **Secondary signals** sell the world: night-side city lights (cluster noise
   masked to land + night), cloud shadows (sample a cloud noise field and darken
   ground beneath), aurora near poles, atmospheric limb tint near the silhouette.
   These are all just more `fbm` masked by `smoothstep`s and added to `lit`.

## Layered spheres = a planet with weather and air

Realistic planets are **three nested meshes**, cheap and effective:

- **Surface** — `SphereGeometry(1, 128, 128)` + the shader above.
- **Clouds** — `SphereGeometry(1.015, 112, 112)`, a transparent shader of animated
  `fbm` cloud cover, rotating at a *different* speed than the surface. Sample the
  same cloud field in the surface shader to cast real shadows on the ground.
- **Atmosphere** — `SphereGeometry(1, 64, 64)` scaled to ~1.22, a **fresnel** glow
  (`pow(1.0 - dot(N,V), p)`) brightest at the rim, additively blended. This single
  shell is what makes a ball read as a planet with air.

```js
const mat = new THREE.ShaderMaterial({
  uniforms: { uTime:{value:0}, uSunDir:{value:new THREE.Vector3()},
              uCamPos:{value:new THREE.Vector3()} /* + your scroll amounts */ },
  vertexShader: `
    varying vec3 vObjPos; varying vec3 vWorldNormal; varying vec3 vWorldPos;
    void main(){
      vObjPos = position;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: NOISE_GLSL + `
    uniform float uTime; uniform vec3 uSunDir, uCamPos;
    varying vec3 vObjPos; varying vec3 vWorldNormal; varying vec3 vWorldPos;
    void main(){
      vec3 p = normalize(vObjPos);
      vec3 N = normalize(vWorldNormal);
      vec3 V = normalize(uCamPos - vWorldPos);
      vec3 L = normalize(uSunDir);
      /* steps 1–5 here */
      gl_FragColor = vec4(lit, 1.0);
    }`,
});
```
Drive `uTime`, `uSunDir`, `uCamPos` from the render loop every frame.

## Other procedural surfaces (same toolkit)

- **Ocean plane** — a large plane; displace vertices and/or shade with animated
  `fbm` for swell; add the specular+sparkle from step 4; fresnel for horizon.
- **Terrain** — a plane subdivided; displace `position.y` by `fbm` on the **CPU**
  (so you can also place objects on it: `y = terrainHeight(x,z)`), then shade by
  height/slope as in step 2.
- **Sky dome** — a big back-side sphere following the camera, vertical gradient +
  faint `fbm` clouds.
- **Volumetric-ish fog / god rays** — additive planes/cones with soft noise and a
  gradient falloff; keep them subtle or they whiteout the scene.
- **Marble / rock / wood** for materials — domain-warped `fbm` mapped to a 2-color
  palette; feed into a `MeshStandardMaterial` via `onBeforeCompile` if you want it
  lit by the PBR pipeline instead of a custom shader.

## GLSL gotchas that waste time

- `patch`, `sample`, `input`, `output`, `filter` and other words are **reserved**
  in GLSL — naming a variable that produces a cryptic "not compiled" error. Rename
  (e.g. `patch` → `meadow`).
- Compile errors print the offending shader source to the console with a line
  number — read it; don't guess.
- Keep fullscreen `fbm` to ~4 octaves; each octave is another noise evaluation per
  pixel. Close-up hero objects can afford 5–6.
- `mod`, precision, and integer loop bounds matter on some GPUs — keep loop counts
  constant (`for(int i=0;i<4;i++)`), not uniform-driven.
