import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass }     from 'three/addons/postprocessing/ShaderPass.js';

/* ════════════════════════════════════════════════════════════════════════
   PROCEDURAL 3D — STARTER
   A code-generated planet (surface + atmosphere), cinematic post, and a
   scroll/mouse-driven camera with frame-rate-independent damping.
   Replace the planet shader or swap in a GLB to make it your own.
   ════════════════════════════════════════════════════════════════════════ */

/* ── renderer: tone mapping + color space = where realism starts ── */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));   // cap: retina fullscreen shaders overheat laptops
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.1, 320);
camera.position.set(0, 0.12, 3.85);

/* gradient background painted on a tiny canvas (no image files) */
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#0a1326'); g.addColorStop(.45,'#060a16'); g.addColorStop(1,'#020308');
  ctx.fillStyle = g; ctx.fillRect(0,0,16,256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

/* ── shared noise GLSL (simplex + fbm + helpers) — see assets/noise.glsl ── */
const NOISE = `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx; i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*snoise(p); p*=2.02; a*=0.5; } return v; }
`;

/* ── the planet: a sphere + a procedural surface shader ── */
const uniforms = {
  uTime:{ value:0 }, uSunDir:{ value:new THREE.Vector3(-0.7,0.32,0.62).normalize() },
  uCamPos:{ value:new THREE.Vector3() }, uNight:{ value:0 },
};
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 128),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader:`
      varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main(){ vObj=position; vN=normalize(mat3(modelMatrix)*normal);
        vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: NOISE + `
      uniform float uTime, uNight; uniform vec3 uSunDir, uCamPos;
      varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 p = normalize(vObj);
        // 1. shape from domain-warped noise
        vec3 warp = vec3(fbm(p*1.7+11.3), fbm(p*1.7+27.9), fbm(p*1.7+43.1));
        float e = fbm(p*1.9 + warp*0.65)*0.5+0.5;
        // 2. palette by height
        float sea=0.5; float land=smoothstep(sea-0.012, sea+0.03, e);
        vec3 ocean=mix(vec3(0.02,0.09,0.15), vec3(0.09,0.32,0.38), smoothstep(0.0,sea,e));
        float h=smoothstep(sea,1.0,e);
        vec3 lcol=mix(vec3(0.78,0.69,0.47), vec3(0.30,0.45,0.26), smoothstep(0.0,0.10,h));
        lcol=mix(lcol, vec3(0.13,0.25,0.17), smoothstep(0.10,0.40,h));
        lcol=mix(lcol, vec3(0.38,0.35,0.31), smoothstep(0.45,0.70,h));
        lcol=mix(lcol, vec3(0.88,0.91,0.93), smoothstep(0.74,0.95,h));
        vec3 base=mix(ocean,lcol,land); base*=0.90+0.18*fbm(p*6.5+5.0);
        // 3. lighting: day/night + warm terminator
        vec3 N=normalize(vN); vec3 V=normalize(uCamPos-vW); vec3 L=normalize(uSunDir);
        float ndl=dot(N,L); float day=smoothstep(-0.18,0.22,ndl);
        vec3 lit=mix(base*vec3(0.03,0.05,0.10), base*(0.55+0.85*max(ndl,0.0)), day);
        float term=smoothstep(-0.05,0.18,ndl)*smoothstep(0.45,0.10,ndl);
        lit+=vec3(0.55,0.28,0.12)*term*0.55;
        // 4. ocean glint + animated sparkle
        vec3 H=normalize(L+V); float spec=pow(max(dot(N,H),0.0),80.0)*(1.0-land)*day;
        lit+=vec3(1.0,0.94,0.80)*spec*0.8;
        float rip=fbm(p*42.0+vec3(uTime*0.6,uTime*0.2,uTime*0.4))*0.5+0.5;
        lit+=vec3(0.85,0.93,1.0)*pow(rip,5.0)*(1.0-land)*day*0.5;
        // 5. night-side city lights (cluster noise on land)
        float pop=fbm(p*2.6+20.0)*0.5+0.5; float cells=fbm(p*52.0+7.0)*0.5+0.5;
        float lights=smoothstep(0.55,0.75,pop)*smoothstep(0.55,0.85,cells)*land*(1.0-day)*uNight;
        lit+=vec3(1.0,0.82,0.45)*lights;
        gl_FragColor=vec4(lit,1.0);
      }`,
  })
);
scene.add(planet);

/* ── atmosphere shell: fresnel rim glow (makes the ball read as a planet) ── */
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.ShaderMaterial({
    transparent:true, side:THREE.BackSide, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uSunDir:uniforms.uSunDir },
    vertexShader:`varying vec3 vN; varying vec3 vW;
      void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`uniform vec3 uSunDir; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW);
        float rim=pow(1.0-max(dot(N,V),0.0), 3.0);
        float lit=0.4+0.6*max(dot(N,normalize(uSunDir)),0.0);
        gl_FragColor=vec4(vec3(0.45,0.66,1.0)*rim*lit, rim); }`,
  })
);
atmo.scale.setScalar(1.22); scene.add(atmo);

/* a few stars from a Points cloud + a canvas dot texture (no image files) */
const dot = (() => { const c=document.createElement('canvas'); c.width=c.height=64;
  const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'#fff'); g.addColorStop(.4,'rgba(255,255,255,.6)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const starPos = new Float32Array(900*3);
for (let i=0;i<900;i++){ const r=24+Math.random()*24, th=Math.acos(2*Math.random()-1), ph=Math.random()*6.28;
  starPos[i*3]=r*Math.sin(th)*Math.cos(ph); starPos[i*3+1]=r*Math.cos(th); starPos[i*3+2]=r*Math.sin(th)*Math.sin(ph); }
const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos,3)),
  new THREE.PointsMaterial({ size:0.16, map:dot, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0.85 }));
scene.add(stars);

/* ════════════════════ POST-PROCESSING ════════════════════ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms:{ tDiffuse:{value:null}, uTime:{value:0}, uVignette:{value:1.0} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime,uVignette; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
      c+=(h21(vUv*vec2(1920.0,1080.0)+uTime)-0.5)*0.045;
      vec2 q=vUv-0.5; float v=smoothstep(0.95,0.30,length(q)*uVignette); c*=mix(0.62,1.0,v);
      gl_FragColor=vec4(c,1.0); }`,
});
composer.addPass(grain);

/* ════════════════════ SCROLL + CAMERA KEYFRAMES ════════════════════ */
const damp = THREE.MathUtils.damp;
const dampV = (v,tx,ty,tz,l,dt)=>{ v.x=damp(v.x,tx,l,dt); v.y=damp(v.y,ty,l,dt); v.z=damp(v.z,tz,l,dt); };

let scrollProg=0, sp=0;
function readScroll(){ const max=document.documentElement.scrollHeight-innerHeight;
  scrollProg = max>0 ? Math.min(1,Math.max(0,scrollY/max)) : 0; }
addEventListener('scroll', readScroll, { passive:true }); readScroll();

let ptrTX=0, ptrTY=0, ptrX=0, ptrY=0;
addEventListener('pointermove', e => { ptrTX=e.clientX/innerWidth-0.5; ptrTY=e.clientY/innerHeight-0.5; });

const KF = [
  { p:0.00, pos:new THREE.Vector3(0,0.12,3.85),  look:new THREE.Vector3(0,0,0),      sun:new THREE.Vector3(-0.70,0.32,0.62) },
  { p:0.50, pos:new THREE.Vector3(-0.5,0.05,2.70),look:new THREE.Vector3(0,0,0),      sun:new THREE.Vector3(-0.10,0.16,-0.98) },
  { p:1.00, pos:new THREE.Vector3(0.10,-0.18,1.55),look:new THREE.Vector3(0.06,0.30,0),sun:new THREE.Vector3(0.18,0.34,0.78) },
];
const _pos=new THREE.Vector3(), _look=new THREE.Vector3(), _sun=new THREE.Vector3(), _ct=new THREE.Vector3();
function sampleKF(p){
  let a=KF[0], b=KF[KF.length-1];
  for (let i=0;i<KF.length-1;i++){ if (p>=KF[i].p && p<=KF[i+1].p){ a=KF[i]; b=KF[i+1]; break; } }
  const u=a.p===b.p?0:(p-a.p)/(b.p-a.p); const e=u*u*(3-2*u);
  _pos.lerpVectors(a.pos,b.pos,e); _look.lerpVectors(a.look,b.look,e); _sun.lerpVectors(a.sun,b.sun,e).normalize();
}

/* ════════════════════ LOOP ════════════════════ */
const clock = new THREE.Clock();
function tick(){
  // delta FIRST, then t from the property getDelta already advanced — else dt≈0
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = clock.elapsedTime;

  readScroll();
  // debug hook for screenshotting a hidden/automation tab: window.__p = 0.5
  if (typeof window.__p === 'number') sp = window.__p;
  else sp = damp(sp, scrollProg, 9.0, dt);
  ptrX = damp(ptrX, ptrTX, 3.0, dt); ptrY = damp(ptrY, ptrTY, 3.0, dt);

  planet.rotation.y = t*0.02 + sp*Math.PI*1.1;     // idle spin + scroll-driven turn
  uniforms.uNight.value = THREE.MathUtils.smoothstep(sp,0.30,0.45)*(1-THREE.MathUtils.smoothstep(sp,0.70,0.85));

  sampleKF(sp);
  const cx=_pos.x+ptrX*0.28, cy=_pos.y-ptrY*0.20;
  if (typeof window.__p==='number'){ camera.position.set(cx,cy,_pos.z); _ct.copy(_look); }
  else { dampV(camera.position,cx,cy,_pos.z,7,dt); dampV(_ct,_look.x,_look.y,_look.z,7,dt); }
  camera.lookAt(_ct);

  uniforms.uTime.value=t; uniforms.uCamPos.value.copy(camera.position); uniforms.uSunDir.value.copy(_sun);
  grain.uniforms.uTime.value=t;
  bloom.strength = 0.50 + uniforms.uNight.value*0.30;
  stars.material.opacity = 0.5 + 0.45*uniforms.uNight.value;

  composer.render();
}

addEventListener('resize', () => {
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
});

let _last=0;
function frame(time){ requestAnimationFrame(frame); if (document.hidden) return;
  if (time-_last < 15) return; _last=time; tick(); }
requestAnimationFrame(frame);
renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault());
