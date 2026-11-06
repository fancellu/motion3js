import * as THREE from 'three';

// ---------- math / easing (all pure functions of t) ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOutExpo = (x) =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
export const easeOutBack = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
// damped spring that lands exactly on 1 at x = 1
export const spring = (x) => (x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(2.5 * Math.PI * x));

export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- design tokens ----------
export const FONT = '"SF Pro Display", "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif';
export const MONO = '"SF Mono", "JetBrains Mono", Consolas, monospace';
export const ACCENT = '#ff8a4c';
export const GREEN = '#3ddc97';
export const font = (weight, size, fam = FONT) => `${weight} ${size}px ${fam}`;

// ---------- canvas helpers ----------
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Standard glass-panel face: faint dark tint + crisp white border. */
export function panelFace(ctx, W, H, r, { fill = 'rgba(14,12,26,0.30)', border = 0.9, inset = 5 } = {}) {
  rr(ctx, inset, inset, W - inset * 2, H - inset * 2, Math.max(r - inset, 2));
  ctx.fillStyle = fill;
  ctx.fill();
  // soft top sheen
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(255,255,255,${border})`;
  ctx.stroke();
}

/** Animated check mark (p: 0..1 draw-on). */
export function drawCheck(ctx, cx, cy, size, p, color = '#fff', width = 3) {
  if (p <= 0) return;
  const pts = [
    [cx - size * 0.5, cy + size * 0.02],
    [cx - size * 0.15, cy + size * 0.36],
    [cx + size * 0.52, cy - size * 0.38],
  ];
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const L = (l1 + l2) * clamp(p);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  if (L <= l1) {
    const k = L / l1;
    ctx.lineTo(lerp(pts[0][0], pts[1][0], k), lerp(pts[0][1], pts[1][1], k));
  } else {
    ctx.lineTo(...pts[1]);
    const k = (L - l1) / l2;
    ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k));
  }
  ctx.stroke();
  ctx.restore();
}

/** Right arrow drawn as a path (avoids relying on a glyph). */
export function drawArrow(ctx, x, y, len, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + len - len * 0.32, y - len * 0.3);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x + len - len * 0.32, y + len * 0.3);
  ctx.stroke();
  ctx.restore();
}

// ---------- geometry ----------
const geoCache = new Map();
/** Rounded extruded slab centred on the origin, front face at z = +depth/2. */
export function slabGeometry(w, h, depth, radius) {
  const key = [w, h, depth, radius].join('|');
  if (geoCache.has(key)) return geoCache.get(key);
  const b = Math.min(0.05, depth * 0.35);
  const iw = w - 2 * b, ih = h - 2 * b;
  const r = Math.max(0.01, Math.min(radius - b, iw / 2 - 0.001, ih / 2 - 0.001));
  const s = new THREE.Shape();
  const x = -iw / 2, y = -ih / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + iw - r, y);
  s.absarc(x + iw - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + iw, y + ih - r);
  s.absarc(x + iw - r, y + ih - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + ih);
  s.absarc(x + r, y + ih - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: depth - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 5,
    curveSegments: 14,
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  geoCache.set(key, g);
  return g;
}

/** Frosted glass: transmission ~1, roughness ~0.4, clear-coated. */
export function frosted(o = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: o.color ?? 0xffffff,
    metalness: 0,
    roughness: o.roughness ?? 0.4,
    transmission: 1,
    thickness: o.thickness ?? 0.6,
    ior: o.ior ?? 1.45,
    clearcoat: o.clearcoat ?? 1,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.12,
    specularIntensity: 1,
    envMapIntensity: o.env ?? 1.0,
    attenuationColor: new THREE.Color(o.attenuationColor ?? 0xffffff),
    attenuationDistance: o.attenuationDistance ?? Infinity,
  });
}

// ---------- glass panel with a per-frame canvas texture on its face ----------
let maxAniso = 8;
export const setMaxAniso = (a) => (maxAniso = a);

export class Panel {
  /**
   * @param {object} o
   * w,h (world units), depth, radius, ppu (canvas px per unit), material (null => canvas only),
   * draw(ctx, t, W, H, panel) in design px (100 per world unit), range [t0,t1] where content changes.
   */
  constructor(o) {
    this.w = o.w;
    this.h = o.h;
    this.depth = o.depth ?? 0.16;
    this.radius = o.radius ?? 0.22;
    this.range = o.range ?? [-1e9, 1e9];
    this.draw = o.draw;
    this.group = new THREE.Group();
    this.inner = new THREE.Group(); // animated transform lives here
    this.group.add(this.inner);
    if (o.material) {
      this.body = new THREE.Mesh(slabGeometry(this.w, this.h, this.depth, this.radius), o.material);
      this.inner.add(this.body);
    }
    const ppu = o.ppu ?? 220;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(this.w * ppu);
    this.canvas.height = Math.round(this.h * ppu);
    // willReadFrequently forces Chromium's CPU (software) canvas. The GPU-accelerated 2D canvas
    // caches glyphs/shadows across draws, which made pixels depend on which frames were drawn before.
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.px = this.canvas.width / (this.w * 100);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = maxAniso;
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.faceMat);
    this.face.position.z = o.material ? this.depth / 2 + 0.004 : 0;
    this.inner.add(this.face);
    this.lastT = NaN;
  }
  update(t) {
    const tc = clamp(t, this.range[0], this.range[1]);
    if (tc === this.lastT) return;
    this.lastT = tc;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.px, 0, 0, this.px, 0, 0);
    c.textBaseline = 'alphabetic';
    c.letterSpacing = '0px';
    this.draw(c, tc, this.w * 100, this.h * 100, this);
    this.tex.needsUpdate = true;
  }
  /** pop-in helper: p 0..1 */
  appear(p, { from = 0.7, dy = -0.25, dx = 0, dz = 0 } = {}) {
    this.group.visible = p > 0.001;
    const e = easeOutBack(clamp(p), 1.4);
    const s = lerp(from, 1, e);
    this.inner.scale.setScalar(s);
    const k = 1 - easeOutCubic(clamp(p));
    this.inner.position.set(dx * k, dy * k, dz * k);
    this.faceMat.opacity = clamp(p * 1.6);
  }
}
