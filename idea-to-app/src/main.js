import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, lerp, prog, easeInOutExpo, mulberry32, setMaxAniso, FONT, MONO } from './lib.js';
import { sceneDescribe, scenePlan, sceneBuild, sceneShip, makeHud } from './scenes.js';

const W = 1920, H = 1080, FPS = 60, DURATION = 15;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);
setMaxAniso(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1500);
scene.add(camera);

// ---------------------------------------------------------------- dome with gradient blobs
const domeVert = /* glsl */ `
  varying vec3 vP;
  void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const domeFrag = /* glsl */ `
  uniform float uTime; uniform float uIntensity;
  varying vec3 vP;
  vec3 blob(vec3 d, vec3 c, vec3 col, float w){ return col * pow(max(dot(d, normalize(c)), 0.0), w); }
  void main(){
    vec3 d = normalize(vP);
    float s = uTime * 0.08;
    vec3 col = mix(vec3(0.004,0.003,0.010), vec3(0.016,0.010,0.030), smoothstep(-0.7, 0.9, d.y));
    col += blob(d, vec3(-0.85 + 0.06*sin(s), 0.38, -0.55), vec3(0.36,0.12,0.95), 9.0) * 1.3;   // violet
    col += blob(d, vec3( 0.78, -0.22 + 0.05*cos(s), -0.6), vec3(1.00,0.36,0.10), 11.0) * 1.3;  // orange
    col += blob(d, vec3(-0.15, -0.55, -0.82), vec3(0.06,0.20,0.95), 9.0) * 1.3;               // blue
    col += blob(d, vec3( 0.28 + 0.05*sin(s*1.3), 0.62, -0.72), vec3(0.95,0.20,0.55), 12.0) * 1.3; // pink
    col += blob(d, vec3( 0.05, 0.25, 0.95), vec3(0.45,0.22,0.70), 3.0) * 0.6;          // behind camera (reflections)
    col += blob(d, vec3( 0.95, 0.4, 0.3), vec3(1.0,0.45,0.25), 8.0) * 0.5;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }`;
function makeDome(intensity) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(600, 96, 48),
    new THREE.ShaderMaterial({
      vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: intensity } },
    }),
  );
}
const dome = makeDome(0.2);
dome.renderOrder = -1;
scene.add(dome);

// environment: brighter dome + two soft boxes, prefiltered once (static)
{
  const envScene = new THREE.Scene();
  envScene.add(makeDome(1.6));
  const box = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); envScene.add(m);
  };
  box(260, 60, new THREE.Vector3(0, 220, 120), 2.2);
  box(80, 200, new THREE.Vector3(-260, 40, 160), 1.2);
  box(60, 160, new THREE.Vector3(280, 10, 90), 0.9);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
}
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(8, 16, 14);
scene.add(key);

// ---------------------------------------------------------------- scenes in world space
const sceneDefs = [
  { make: sceneDescribe, pos: [-18, 0.5, 0], rotY: 0.2,
    cam: { pos: [0.25, 0.95, 9.6], tgt: [0.05, 0.8, 0], dPos: [0.8, 0.15, -0.7], dTgt: [0.25, 0, 0] } },
  { make: scenePlan, pos: [-7.5, 3.0, -6], rotY: 0.06,
    cam: { pos: [0.55, 0.9, 10.3], tgt: [0.55, 0.8, -1.0], dPos: [-0.7, -0.2, -0.7], dTgt: [-0.2, 0, 0] } },
  { make: sceneBuild, pos: [7, -0.8, -3], rotY: -0.08,
    cam: { pos: [0.0, 0.45, 12.3], tgt: [0.0, 0.35, 0], dPos: [0.7, 0.25, -0.8], dTgt: [0.2, 0, 0] } },
  { make: sceneShip, pos: [18, 1.5, -8], rotY: -0.22,
    cam: { pos: [-0.85, 0.25, 9.9], tgt: [-0.85, 0.15, 0], dPos: [-0.5, 0.15, -0.7], dTgt: [-0.15, 0, 0] } },
];
const stories = sceneDefs.map((d) => {
  const s = d.make();
  s.group.position.set(...d.pos);
  s.group.rotation.y = d.rotY;
  s.group.updateMatrixWorld(true);
  scene.add(s.group);
  return { ...s, def: d };
});
const hud = makeHud(camera);

// ---------------------------------------------------------------- camera path
const WIDE = { pos0: new THREE.Vector3(0, 7.8, 42), pos1: new THREE.Vector3(0, 7.2, 40.2), tgt: new THREE.Vector3(0, 0.6, -5) };
const holds = [
  { t0: 0.0, t1: 2.75, s: 0 },
  { t0: 3.3, t1: 5.75, s: 1 },
  { t0: 6.3, t1: 9.35, s: 2 },
  { t0: 9.9, t1: 12.4, s: 3 },
  { t0: 13.9, t1: 15.0, wide: true },
];
const _v = new THREE.Vector3();
function holdState(h, u) {
  if (h.wide) return { pos: WIDE.pos0.clone().lerp(WIDE.pos1, u), tgt: WIDE.tgt.clone() };
  const st = stories[h.s], c = st.def.cam, k = u - 0.5;
  const pos = st.group.localToWorld(_v.set(c.pos[0] + c.dPos[0] * k, c.pos[1] + c.dPos[1] * k, c.pos[2] + c.dPos[2] * k)).clone();
  const tgt = st.group.localToWorld(_v.set(c.tgt[0] + c.dTgt[0] * k, c.tgt[1] + c.dTgt[1] * k, c.tgt[2] + c.dTgt[2] * k)).clone();
  return { pos, tgt };
}
function cameraAt(t) {
  t = clamp(t, 0, DURATION);
  for (let i = 0; i < holds.length; i++) {
    const h = holds[i];
    if (t >= h.t0 && t <= h.t1) return { ...holdState(h, (t - h.t0) / (h.t1 - h.t0)), roll: 0 };
    const n = holds[i + 1];
    if (n && t > h.t1 && t < n.t0) {
      const e = easeInOutExpo((t - h.t1) / (n.t0 - h.t1));
      const A = holdState(h, 1), B = holdState(n, 0);
      const pos = A.pos.lerp(B.pos, e), tgt = A.tgt.lerp(B.tgt, e);
      const arc = Math.sin(Math.PI * e);
      if (!n.wide) pos.add(_v.set(0, 1.2 * arc, 2.8 * arc));
      return { pos, tgt, roll: n.wide ? 0 : 0.07 * arc * (i % 2 ? -1 : 1) };
    }
  }
  return { ...holdState(holds[holds.length - 1], 1), roll: 0 };
}

// ---------------------------------------------------------------- glowing tube (CatmullRom), draws on
const tubePts = [];
const tubeIdx = [];
const L = (s, x, y, z) => stories[s].group.localToWorld(new THREE.Vector3(x, y, z));
tubePts.push(L(0, -10, -4.2, -4));
stories.forEach((st, s) => {
  if (s > 0) {
    const a = tubePts[tubePts.length - 1], b = L(s, -5.6, -2.7, -1.6);
    tubePts.push(a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -2.6, -3.5)));
  }
  tubeIdx.push(tubePts.length);
  tubePts.push(L(s, -5.6, -2.7, -1.6), L(s, 0, -0.9, -2.3), L(s, 5.6, -2.5, -1.5));
});
tubePts.push(L(3, 10, -1.5, -5), L(3, 16, 2.5, -10));
const curve = new THREE.CatmullRomCurve3(tubePts, false, 'catmullrom', 0.5);
const DIV = 4000;
const lens = curve.getLengths(DIV);
const totalLen = lens[DIV];
const uOf = (i) => lens[Math.round((i / (tubePts.length - 1)) * DIV)] / totalLen;
const tubeMat = new THREE.ShaderMaterial({
  uniforms: {
    uProg: { value: 0 }, uLen: { value: totalLen },
    uCol: { value: new THREE.Vector3(2.3, 0.75, 0.3) }, uHead: { value: new THREE.Vector3(1.0, 0.8, 0.6) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `
    uniform float uProg; uniform float uLen; uniform vec3 uCol; uniform vec3 uHead;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      if (vUv.x > uProg) discard;
      float d = (uProg - vUv.x) * uLen;
      float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
      float head = exp(-d * 1.6);
      float tail = smoothstep(0.0, 0.012, vUv.x);
      vec3 c = uCol * (0.3 + 0.8 * core) + uHead * head * (0.5 + core) * 7.0;
      gl_FragColor = vec4(c * tail, 1.0);
    }`,
});
const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 2400, 0.038, 12, false), tubeMat);
scene.add(tube);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6, 4.5) }));
scene.add(head);
const headLight = new THREE.PointLight(0xffa070, 14, 9, 1.6);
scene.add(headLight);

// progress keyframes: [time, u]
const ease = (x) => easeInOutExpo(x);
const progKeys = [[0, 0.0]];
holds.slice(0, 4).forEach((h, s) => {
  progKeys.push([h.t0, uOf(tubeIdx[s])]);
  progKeys.push([h.t1, uOf(tubeIdx[s] + 2)]);
});
progKeys.push([13.9, 1.0]);
progKeys[1][1] = 0; // first hold draws from the very start of the curve
function tubeProgress(t) {
  if (t <= 0) return 0;
  for (let i = 1; i < progKeys.length - 1; i++) {
    const [ta, ua] = progKeys[i], [tb, ub] = progKeys[i + 1];
    if (t >= ta && t <= tb) {
      const x = (t - ta) / (tb - ta);
      const isHold = i % 2 === 1; // odd index starts a hold
      return lerp(ua, ub, isHold ? x : ease(x));
    }
  }
  return 1.0;
}

// ---------------------------------------------------------------- scattered glass + orbs, kept off the camera path
const camSamples = [];
for (let t = 0; t <= DURATION; t += 0.02) camSamples.push(cameraAt(t));
const sceneCenters = stories.map((st) => st.group.localToWorld(new THREE.Vector3(0, 0.5, 0)));
function segDist(p, a, b) {
  const ab = _v.copy(b).sub(a);
  const f = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return { d: p.distanceTo(a.clone().addScaledVector(ab, f)), f };
}
function clearOfPath(p, r) {
  for (const s of camSamples) {
    if (p.distanceTo(s.pos) < 4.0 + r) return false;
    if (p.distanceTo(WIDE.pos1) < 14 + r) return false;
    const { d, f } = segDist(p, s.pos, s.tgt);
    if (f > 0.02 && d < lerp(1.6, 6.2, f) + r) return false;
  }
  for (const c of sceneCenters) {
    const { d, f } = segDist(p, WIDE.pos1, c);
    if (f > 0.02 && d < lerp(1.0, 5.5, f) + r) return false;
    if (p.distanceTo(c) < 7.5 + r) return false;
  }
  return true;
}
const rnd = mulberry32(42);
const shapes = [];
{
  const geos = {
    sphere: new THREE.SphereGeometry(1, 64, 40),
    ring: new THREE.TorusGeometry(1, 0.26, 40, 140),
    ico: new THREE.IcosahedronGeometry(1, 0),
  };
  const kinds = ['sphere', 'ring', 'ico'];
  let tries = 0;
  while (shapes.length < 46 && tries++ < 20000) {
    const p = new THREE.Vector3(lerp(-36, 36, rnd()), lerp(-12, 13, rnd()), lerp(-30, 12, rnd()));
    const r = lerp(0.45, 1.6, Math.pow(rnd(), 1.6));
    if (!clearOfPath(p, r * 1.2)) continue;
    if (shapes.some((s) => s.position.distanceTo(p) < (s.userData.r + r) * 1.6)) continue;
    const kind = kinds[shapes.length % 3];
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: kind === 'ring' ? 0.08 : 0.03, transmission: 1,
      thickness: r * (kind === 'ring' ? 0.6 : 1.4), ior: 1.52, dispersion: 4.5,
      specularIntensity: 1, envMapIntensity: 1.5, iridescence: kind === 'sphere' ? 0.35 : 0, iridescenceIOR: 1.3,
    });
    const mesh = new THREE.Mesh(geos[kind], m);
    mesh.position.copy(p);
    mesh.scale.setScalar(r);
    mesh.userData = { r, base: p.clone(), w: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.7), r0: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6), ph: rnd() * 6.28 };
    scene.add(mesh);
    shapes.push(mesh);
  }
}
const ORBS = 160;
const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), ORBS);
orbs.frustumCulled = false;
const orbData = [];
{
  const pal = [[1, 0.45, 0.2], [0.55, 0.35, 1], [0.35, 0.6, 1], [1, 0.35, 0.65], [1, 0.85, 0.7]];
  let tries = 0;
  while (orbData.length < ORBS && tries++ < 40000) {
    const p = new THREE.Vector3(lerp(-40, 40, rnd()), lerp(-14, 15, rnd()), lerp(-34, 16, rnd()));
    const r = lerp(0.025, 0.085, rnd());
    if (!clearOfPath(p, 0.3)) continue;
    const c = pal[orbData.length % pal.length], k = lerp(2.5, 7, rnd());
    orbs.setColorAt(orbData.length, new THREE.Color(c[0] * k, c[1] * k, c[2] * k));
    orbData.push({ p, r, ph: rnd() * 6.28, sp: lerp(0.2, 0.6, rnd()), amp: lerp(0.15, 0.5, rnd()) });
  }
  orbs.count = orbData.length;
}
scene.add(orbs);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// ---------------------------------------------------------------- post: HDR + MSAA, bloom, neutral TM, CA/vignette/grain
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFrame: { value: 0 }, uCA: { value: 0.0045 }, uVig: { value: 0.42 }, uGrain: { value: 0.03 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uFrame; uniform float uCA; uniform float uVig; uniform float uGrain;
    varying vec2 vUv;
    float hash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * (0.4 + 2.0 * r2);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float v = smoothstep(0.95, 0.25, length(d * vec2(1.0, 0.78)));
      col *= mix(1.0 - uVig, 1.0, v);
      float n = hash(vec3(gl_FragCoord.xy, uFrame)) + hash(vec3(gl_FragCoord.yx + 17.0, uFrame + 7.0)) - 1.0;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * uGrain * (0.6 + 0.4 * (1.0 - lum));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finalPass);

// ---------------------------------------------------------------- frame update — everything is a function of t
function update(t) {
  const c = cameraAt(t);
  camera.position.copy(c.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(c.tgt);
  camera.rotateZ(c.roll);
  camera.updateMatrixWorld(true);

  dome.material.uniforms.uTime.value = t;
  for (const st of stories) st.update(t);
  hud.update(t);

  const u = tubeProgress(t);
  tubeMat.uniforms.uProg.value = u;
  const hp = curve.getPointAt(clamp(u, 0, 1));
  head.position.copy(hp);
  headLight.position.copy(hp);
  head.visible = u > 0.0005 && u < 0.999;

  for (const s of shapes) {
    const d = s.userData;
    s.rotation.set(d.r0.x + d.w.x * t, d.r0.y + d.w.y * t, d.r0.z + d.w.z * t);
    s.position.set(d.base.x, d.base.y + 0.25 * Math.sin(t * 0.6 + d.ph), d.base.z);
  }
  orbData.forEach((o, i) => {
    _p.set(o.p.x + o.amp * Math.sin(t * o.sp + o.ph), o.p.y + o.amp * Math.cos(t * o.sp * 0.8 + o.ph), o.p.z);
    _s.setScalar(o.r);
    _m.compose(_p, _q, _s);
    orbs.setMatrixAt(i, _m);
  });
  orbs.instanceMatrix.needsUpdate = true;

  finalPass.uniforms.uFrame.value = Math.round(t * FPS) % 4096;
}

function renderAt(t) {
  update(t);
  composer.render();
}

// ---------------------------------------------------------------- boot
async function boot() {
  await Promise.all([
    ...['400', '500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px ${FONT}`)),
    ...['400', '500'].map((w) => document.fonts.load(`${w} 20px ${MONO}`)),
  ]);
  renderer.compile(scene, camera);
  // warm every scene so no shader compiles mid-render
  for (const t of [0.5, 4, 8, 11.5, 14.5]) renderAt(t);
  window.renderAt = (t) => { renderAt(t); return true; };
  window.__meta = { W, H, FPS, DURATION, shapes: shapes.length, orbs: orbData.length, gpu: gpuName() };
  window.__ready = true;

  if (RENDER_MODE) return;
  const fixed = params.get('t');
  if (fixed !== null) { renderAt(parseFloat(fixed)); return; }
  // interactive preview: real-time playback, space = pause, arrows = scrub
  const info = document.getElementById('info');
  let t = 0, last = performance.now(), paused = false;
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') paused = !paused;
    if (e.code === 'ArrowRight') t = Math.min(DURATION, t + (e.shiftKey ? 1 : 1 / FPS));
    if (e.code === 'ArrowLeft') t = Math.max(0, t - (e.shiftKey ? 1 : 1 / FPS));
  });
  const loop = (now) => {
    const dt = (now - last) / 1000; last = now;
    if (!paused) t = (t + dt) % DURATION;
    renderAt(t);
    info.textContent = `t = ${t.toFixed(2)}s   [space] pause  [←/→] step  [shift] ±1s`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function gpuName() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
}
boot();
