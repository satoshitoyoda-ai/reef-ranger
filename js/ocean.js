// The underwater world: seabed canyon, coral / kelp / deep-sea decor, light shafts, surface, marine snow, bubbles.
import * as THREE from 'three';
import { U, stdMat } from './shade.js';
import { rng, fbm, sm, clamp, canvasTex } from './u.js';

export const LEN = 600;          // metres of swim per level
export const BIOMES = {
  reef: { name: 'Coral Reef', fog: '#1189b4', fogD: 0.019, top: '#8fe6f3', bot: '#053a52', sun: '#fff1d0', sunI: 1.7, hemiSky: '#bdf2ff', hemiGround: '#2f7a78', hemiI: 1.45,
    sand: '#ecd9a4', rock: '#8a8276', caus: 1.0, rays: 0.5, surfY: 22, snow: '#eafcff', zone: 'Sunlight zone · about 10 m deep' },
  kelp: { name: 'Kelp Forest', fog: '#2a7867', fogD: 0.028, top: '#a9ecc9', bot: '#082f29', sun: '#fff0c8', sunI: 1.5, hemiSky: '#c9f5dc', hemiGround: '#24503f', hemiI: 1.15,
    sand: '#b9a87c', rock: '#5f6758', caus: 0.85, rays: 0.8, surfY: 22, snow: '#f2fff0', zone: 'Sunlight zone · about 15 m deep' },
  deep: { name: 'Deep Sea', fog: '#04203a', fogD: 0.036, top: '#0a3150', bot: '#01070d', sun: '#6aa8ff', sunI: 0.25, hemiSky: '#4a82b8', hemiGround: '#081018', hemiI: 0.7,
    sand: '#3a4250', rock: '#232a35', caus: 0.0, rays: 0.0, surfY: 60, snow: '#7fffe6', glow: true, zone: 'Midnight zone · 1,000 m+ deep' },
};

const C = h => new THREE.Color(h);
function paintV(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.setRGB(1, 1, 1); fn(c, p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 1, i); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const merge = list => {
  const out = []; for (const g of list) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k); out.push(n); }
  const total = out.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
  for (const g of out) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m;
};

/* ---------------- decor geometry ---------------- */
function brainGeo() {
  const g = new THREE.SphereGeometry(1, 30, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), p = g.attributes.position, rid = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x); const r = Math.sin(a * 9 + Math.sin(y * 8) * 2.2 + fbm(x * 2 + 3, z * 2, 2) * 5); rid.push(r); const k = 1 + r * 0.045; p.setXYZ(i, x * k, (y * k) * 0.62 - 0.12, z * k); }
  g.computeVertexNormals();
  return paintV(g, (c, x, y, z, ny, i) => c.setScalar(rid[i] > 0 ? 1.0 : 0.62));
}
function branchGeo(seed) {
  const r = rng(seed), parts = [], Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const grow = (pos, dir, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.72, rad, len, 6, 1); g.translate(0, len / 2, 0); Q.setFromUnitVectors(up, dir); g.applyQuaternion(Q); g.translate(pos.x, pos.y, pos.z);
    parts.push(paintV(g, (c, x, yy) => c.setScalar(0.62 + depth * 0.12)));
    const end = pos.clone().addScaledVector(dir, len);
    if (depth < 3) { const kids = depth === 0 ? 3 : 2; for (let k = 0; k < kids; k++) { const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.1, 0.25, (r() - 0.5) * 1.1)).normalize(); grow(end, nd, len * 0.74, rad * 0.72, depth + 1); } }
    else { const t = new THREE.SphereGeometry(rad * 0.9, 6, 4); t.translate(end.x, end.y, end.z); parts.push(paintV(t, c => c.setScalar(1.08))); }
  };
  for (let k = 0; k < 3; k++) grow(new THREE.Vector3((r() - 0.5) * 0.4, -0.05, (r() - 0.5) * 0.4), new THREE.Vector3((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize(), 0.42, 0.07, 0);
  return merge(parts);
}
function tableGeo() {
  const top = new THREE.CylinderGeometry(1, 0.85, 0.1, 22, 1); top.translate(0, 0.7, 0);
  paintV(top, (c, x, y, z) => c.setScalar(0.75 + 0.25 * Math.abs(Math.sin(Math.atan2(z, x) * 14 + Math.hypot(x, z) * 9))));
  const st = new THREE.CylinderGeometry(0.1, 0.18, 0.7, 7); st.translate(0, 0.35, 0); paintV(st, c => c.setScalar(0.6));
  return merge([top, st]);
}
function fanGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.splineThru([[-0.55, 0.5], [-0.62, 1.0], [-0.3, 1.32], [0.1, 1.38], [0.5, 1.15], [0.6, 0.55], [0.08, 0.06]].map(p => new THREE.Vector2(...p)));
  const g = new THREE.ShapeGeometry(s, 6); return paintV(g, (c, x, y) => c.setScalar(0.75 + y * 0.2));
}
function fanAlpha() {
  return canvasTex(256, 256, (g, W) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W); g.strokeStyle = '#fff'; const r = rng(4);
    const br = (x, y, a, len, w, d) => { if (d > 7 || len < 4) return; const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); br(x2, y2, a + 0.35 + r() * 0.2, len * 0.82, w * 0.8, d + 1); br(x2, y2, a - 0.35 - r() * 0.2, len * 0.82, w * 0.8, d + 1); };
    br(128, 256, Math.PI / 2, 46, 6, 0);
    g.lineWidth = 1.6; for (let i = 0; i < 60; i++) { g.beginPath(); g.moveTo(r() * W, r() * W); g.lineTo(r() * W, r() * W); g.stroke(); }
  }, { linear: true });
}
function tubeSpongeGeo(seed) {
  const r = rng(seed), parts = [];
  for (let k = 0; k < 4; k++) { const h = 0.5 + r() * 0.8, rad = 0.1 + r() * 0.06; const g = new THREE.CylinderGeometry(rad * 1.15, rad * 0.9, h, 12, 3, true); g.translate((r() - 0.5) * 0.35, h / 2, (r() - 0.5) * 0.35); g.rotateZ((r() - 0.5) * 0.3); parts.push(paintV(g, (c, x, y) => c.setScalar(0.7 + 0.35 * sm(h * 0.7, h, y)))); }
  return merge(parts);
}
function anemoneGeo() {
  const r = rng(9), parts = [];
  const base = new THREE.CylinderGeometry(0.28, 0.34, 0.16, 14); base.translate(0, 0.08, 0); parts.push(paintV(base, c => c.set('#8c4a7a')));
  for (let k = 0; k < 70; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.26, len = 0.32 + r() * 0.22; const g = new THREE.CylinderGeometry(0.008, 0.022, len, 4, 4); g.translate(0, len / 2, 0); g.rotateZ(-d * 1.6); g.rotateY(-a); g.translate(Math.cos(a) * d, 0.14, Math.sin(a) * d); parts.push(paintV(g, (c, x, y) => c.lerpColors(C('#b86aa8'), C('#e9ffd6'), sm(0.25, 0.55, y)))); }
  return merge(parts);
}
function grassGeo() {
  const r = rng(2), parts = [];
  for (let k = 0; k < 8; k++) { const h = 0.5 + r() * 0.7; const g = new THREE.PlaneGeometry(0.05, h, 1, 4); g.translate(0, h / 2, 0); g.rotateY(r() * Math.PI); g.translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3); parts.push(paintV(g, (c, x, y) => c.lerpColors(C('#2f6a2a'), C('#8ec85a'), y / 1.2))); }
  return merge(parts);
}
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.72 + fbm(x * 1.6 + seed, z * 1.6 + y * 1.3, 3) * 0.6; p.setXYZ(i, x * k, Math.max(y * k * 0.7, -0.3), z * k); }
  g.computeVertexNormals();
  return paintV(g, (c, x, y, z, ny) => { c.setScalar(0.75 + fbm(x * 3, z * 3 + y, 2) * 0.4); });
}
function starGeo() {
  const s = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.07 : 0.2; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0);
  return paintV(g, (c, x, y, z) => c.setScalar(Math.sin(x * 90) * Math.sin(z * 90) > 0.6 ? 1.15 : 0.85));
}
function kelpGeo(H) {
  const parts = [], r = rng(21);
  const st = new THREE.CylinderGeometry(0.03, 0.05, H, 4, 16); st.translate(0, H / 2, 0); parts.push(paintV(st, c => c.set('#6b5a1e')));
  for (let y = 0.8, k = 0; y < H - 0.4; y += 0.55, k++) {
    const g = new THREE.PlaneGeometry(0.26, 1.1, 1, 4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setX(i, p.getX(i) * (1 - Math.abs(yy) / 0.7) + Math.sin(yy * 9) * 0.03); }
    g.translate(0.12, 0.45, 0); g.rotateZ(-0.75 - r() * 0.3); g.rotateY(k * 2.4); g.translate(0, y, 0);
    const tint = r(); parts.push(paintV(g, (c, x, yy) => c.lerpColors(C('#9a7b22'), C('#c9a93a'), tint).multiplyScalar(0.85 + 0.15 * Math.sin(yy * 3))));
    const b = new THREE.SphereGeometry(0.045, 6, 4); b.translate(Math.cos(-k * 2.4) * 0.06, y + 0.03, Math.sin(-k * 2.4) * 0.06); parts.push(paintV(b, c => c.set('#b59a3a')));
  }
  return merge(parts);
}
function tubeWormGeo() {
  const r = rng(31), parts = [];
  for (let k = 0; k < 12; k++) { const h = 0.6 + r() * 1.1, x = (r() - 0.5) * 0.6, z = (r() - 0.5) * 0.6; const g = new THREE.CylinderGeometry(0.035, 0.04, h, 6, 2); g.translate(x, h / 2, z); parts.push(paintV(g, c => c.set('#e8e4d8'))); const t = new THREE.ConeGeometry(0.07, 0.16, 6); t.rotateX(Math.PI); t.translate(x, h + 0.07, z); parts.push(paintV(t, c => c.set('#e0302a'))); }
  return merge(parts);
}
function ventGeo() {
  const g = new THREE.CylinderGeometry(0.4, 1.4, 5, 10, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.8 + fbm(x * 2 + y, z * 2 - y, 2) * 0.5; p.setXYZ(i, x * k, y, z * k); }
  g.translate(0, 2.5, 0); g.computeVertexNormals(); return paintV(g, (c, x, y) => c.setScalar(0.5 + fbm(x * 4, y * 4, 2) * 0.5));
}

/* ---------------- textures / shaders ---------------- */
let _bubbleTex;
export function bubbleTex() {
  return _bubbleTex || (_bubbleTex = canvasTex(64, 64, (g, W) => {
    const gr = g.createRadialGradient(32, 32, 10, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W); g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(22, 20, 6, 4, -0.6, 0, Math.PI * 2); g.fill();
  }));
}

function rayMaterial(col, k) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCol: { value: C(col) }, uI: { value: k }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vY = position.y; vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime, uI, uSeed; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.2) * (1.0 + vY) * (1.0 + vY);
        a *= 0.65 + 0.35*sin(uTime*0.6 + uSeed + vY*3.0); a *= smoothstep(140.0, 50.0, vD) * smoothstep(2.0, 9.0, vD);
        gl_FragColor = vec4(uCol * a * uI, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

/* ---------------- particle pool (bubbles, pops, smoke, sparkles) ---------------- */
export class Bubbles {
  constructor(scene, n = 700) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.col = new Float32Array(n * 3); this.kind = new Uint8Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: bubbleTex() }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 col; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * uScale / max(-mv.z, 0.5); vA = alpha; vC = col; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, size = 0.12, life = 2, hex = 0xffffff, kind = 0) {
    const i = this.i = (this.i + 1) % this.n, c = new THREE.Color(hex);
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.life[i] = life; this.max[i] = life; this.size[i] = size; this.kind[i] = kind; this.col.set([c.r, c.g, c.b], i * 3);
  }
  burst(pos, n = 14, spd = 2.5, size = 0.1, hex = 0xffffff) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57; this.emit(pos.x, pos.y, pos.z, Math.cos(a) * Math.cos(b) * spd, Math.sin(b) * spd + 0.8, Math.sin(a) * Math.cos(b) * spd, size * (0.5 + Math.random()), 0.6 + Math.random() * 0.8, hex); } }
  update(dt, t) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3, smoke = this.kind[i] === 1;
      this.v[k] *= 1 - dt * 1.6; this.v[k + 2] *= 1 - dt * 1.6; this.v[k + 1] += dt * (smoke ? 0.4 : 1.6) - this.v[k + 1] * dt * 0.8;
      this.p[k] += (this.v[k] + (smoke ? 0 : Math.sin(t * 6 + i) * 0.25)) * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const f = this.life[i] / this.max[i]; this.alpha[i] = Math.min(1, f * 3) * (smoke ? 0.55 : 0.9);
      if (smoke) this.size[i] += dt * 0.5;
    }
    const a = this.pts.geometry.attributes; a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = a.col.needsUpdate = true;
  }
}

/* ---------------- the world ---------------- */
export class Ocean {
  constructor(scene, biome = 'reef', seed = 7) {
    this.scene = scene; this.id = biome; this.E = BIOMES[biome]; this.r = rng(seed); this.root = new THREE.Group(); scene.add(this.root);
    const E = this.E; U.uSurfY.value = E.surfY; U.uCausAmt.value = E.caus;
    scene.fog = new THREE.FogExp2(E.fog, E.fogD); scene.background = C(E.fog);
    this.lights();
    this.dome(); this.terrain();
    if (E.rays > 0) { this.surface(); this.rays(); }
    this.snow();
    if (biome === 'reef') this.decorReef(); else if (biome === 'kelp') this.decorKelp(); else this.decorDeep();
  }
  pathX(z) { return 9 * Math.sin(z / 70) + 4 * Math.sin(z / 27 + 1); }
  ground(x, z) {
    const d = Math.abs(x - this.pathX(z)), id = this.id;
    let h = -2 + fbm(x * 0.05 + 10, z * 0.05, 3) * 3 + Math.sin(x * 1.3 + z * 0.4) * 0.06;
    const wall = id === 'kelp' ? 6 : id === 'deep' ? 16 : 11;
    h += sm(14, 32, d) * (wall + fbm(x * 0.03 + 5, z * 0.03, 3) * wall);
    if (id === 'deep') h += sm(0.55, 0.8, fbm(x * 0.02, z * 0.02 + 3, 2)) * 6 - 2;
    return h;
  }
  lights() {
    const E = this.E;
    this.hemi = new THREE.HemisphereLight(E.hemiSky, E.hemiGround, E.hemiI); this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(E.sun, E.sunI); this.sun.position.set(20, 60, 10); this.root.add(this.sun);
  }
  dome() {
    const E = this.E;
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: C(E.top) }, bot: { value: C(E.bot) }, mid: { value: C(E.fog) } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, bot, mid; varying vec3 vD; void main(){ float h = normalize(vD).y; vec3 c = mix(bot, mid, smoothstep(-0.7, 0.0, h)); c = mix(c, top, smoothstep(0.05, 0.8, h)); gl_FragColor = vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
    this.domeM = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), m); this.domeM.renderOrder = -10; this.root.add(this.domeM);
  }
  terrain() {
    const E = this.E, cols = 72, rows = 270, W = 130, z0 = 40, z1 = -LEN - 80;
    const pos = [], col = [], idx = []; const sand = C(E.sand), rock = C(E.rock), alg = C(this.id === 'reef' ? '#8fae6a' : this.id === 'kelp' ? '#6d7d3e' : '#2a3a4a'), pink = C('#d9a3b7'), c = new THREE.Color();
    for (let j = 0; j <= rows; j++) {
      const z = z0 + (z1 - z0) * j / rows, cx = this.pathX(z);
      for (let i = 0; i <= cols; i++) {
        const d = (i / cols - 0.5) * W, x = cx + d * (1 + Math.abs(d) / W), y = this.ground(x, z);
        pos.push(x, y, z);
        const slope = Math.abs(this.ground(x + 1, z) - y) + Math.abs(this.ground(x, z - 1) - y);
        c.copy(sand).multiplyScalar(0.9 + fbm(x * 0.3, z * 0.3, 2) * 0.2);
        c.lerp(rock, sm(0.35, 0.9, slope)); c.lerp(alg, sm(0.55, 0.75, fbm(x * 0.08 + 3, z * 0.08, 2)) * 0.6);
        if (this.id === 'reef') c.lerp(pink, sm(0.62, 0.72, fbm(x * 0.15 + 9, z * 0.15, 2)) * 0.5 * sm(0.3, 0.9, slope));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, stdMat({ roughness: 0.95 }, {})); this.root.add(m); this.floor = m;
  }
  surface() {
    const E = this.E, g = new THREE.PlaneGeometry(900, 900, 1, 1); g.rotateX(Math.PI / 2);
    const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, depthWrite: false,
      uniforms: { uTime: U.uTime, uCol: { value: C(E.top) }, uFog: { value: C(E.fog) }, uFogD: { value: E.fogD } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uFogD; uniform vec3 uCol, uFog; varying vec3 vW;
        void main(){ vec2 p = vW.xz*0.07; float w = sin(p.x*3.1 + uTime*0.6 + sin(p.y*2.3 + uTime*0.4)*1.5) + sin(p.y*3.7 - uTime*0.5 + sin(p.x*1.7 - uTime*0.3)*1.5);
          vec3 dir = normalize(vW - cameraPosition); float br = 0.75 + 0.2*w + pow(max(dir.y,0.0), 5.0)*0.9;
          vec3 c = uCol*br; float d = length(vW - cameraPosition); c = mix(c, uFog, 1.0 - exp(-pow(d*uFogD*0.55, 2.0))); gl_FragColor = vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    this.surf = new THREE.Mesh(g, m); this.surf.position.y = E.surfY; this.surf.renderOrder = -5; this.root.add(this.surf);
  }
  rays() {
    this.rayList = []; const E = this.E;
    for (let i = 0; i < 22; i++) {
      const g = new THREE.CylinderGeometry(1, 1.7, 1, 18, 1, true); g.translate(0, -0.5, 0);
      const m = new THREE.Mesh(g, rayMaterial(E.sun, E.rays * (0.06 + Math.random() * 0.06)));
      const r = 1.2 + Math.random() * 2.6, len = E.surfY + 6; m.scale.set(r, len, r); m.rotation.set(0.25 + (Math.random() - 0.5) * 0.08, 0, 0.12 + (Math.random() - 0.5) * 0.08);
      m.userData.dz = -10 - i * 7.5; this.root.add(m); this.rayList.push(m);
    }
  }
  snow() {
    const E = this.E, n = E.glow ? 700 : 2600, a = new Float32Array(n * 3); for (let i = 0; i < a.length; i++) a[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    this.snowM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: E.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(60, 34, 60) }, uCol: { value: C(E.snow) }, uGlow: { value: E.glow ? 1 : 0 } },
      vertexShader: `uniform float uTime, uGlow; uniform vec3 uCam, uBox; varying float vA; varying float vTw;
        void main(){ vec3 p = position*uBox; p += vec3(sin(uTime*0.3 + position.y*20.0)*0.6, -uTime*0.18, cos(uTime*0.2 + position.x*20.0)*0.6);
          p = mod(p - uCam + uBox*0.5, uBox) + uCam - uBox*0.5; vec4 mv = modelViewMatrix*vec4(p,1.0);
          float s = mix(1.0 + position.z*1.5, 0.7 + position.z*1.6, uGlow); gl_PointSize = s * 160.0 / max(-mv.z, 1.0);
          vA = smoothstep(28.0, 6.0, -mv.z) * smoothstep(0.5 + uGlow*2.0, 2.0 + uGlow*3.0, -mv.z); vTw = 0.5 + 0.5*sin(uTime*(1.0+position.x*3.0) + position.y*40.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uGlow; varying float vA; varying float vTw; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * mix(0.45, 0.75*vTw, uGlow); gl_FragColor = vec4(uCol, a); }` });
    this.snowP = new THREE.Points(g, this.snowM); this.snowP.frustumCulled = false; this.root.add(this.snowP);
  }

  /* ---- scatter + instancing ---- */
  scatter(n, o) {
    const r = this.r, out = []; let tries = 0;
    while (out.length < n && tries++ < n * 30) {
      const z = 30 - r() * (LEN + 90), side = r() < 0.5 ? -1 : 1, d = o.dmin + Math.pow(r(), o.pow ?? 1) * (o.dmax - o.dmin);
      const x = this.pathX(z) + side * d;
      if (o.clump && fbm(x * 0.07 + (o.seed || 0), z * 0.07, 2) < o.clump) continue;
      out.push([x, this.ground(x, z) + (o.y || 0), z]);
    }
    return out;
  }
  inst(geo, mat, pts, sc, colors, o = {}) {
    const by = new Map(); for (const p of pts) { const k = Math.floor(-p[2] / 90); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
    const Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color(), r = this.r;
    for (const list of by.values()) {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        const k = sc[0] + r() * (sc[1] - sc[0]), tilt = o.tilt ?? 0.15;
        e.set((r() - 0.5) * tilt, r() * 6.28, (r() - 0.5) * tilt); Q.setFromEuler(e); S.set(k * (o.sx || 1), k * (o.sy || 1), k * (o.sx || 1)); P.set(p[0], p[1], p[2]);
        m.setMatrixAt(i, new THREE.Matrix4().compose(P, Q, S));
        if (colors) { c.copy(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.85 + r() * 0.3); m.setColorAt(i, c); }
      });
      m.computeBoundingSphere(); this.root.add(m);
    }
  }
  decorReef() {
    const sway = (amp, freq, len, k = 1.5) => ({ amp, freq, k, len, mode: 4 });
    const cs = a => a.map(C);
    this.inst(brainGeo(), stdMat({ roughness: 0.8 }), this.scatter(420, { dmin: 2.5, dmax: 30, pow: 0.9 }), [0.4, 1.4], cs(['#d8b56a', '#9fc46a', '#b59ad8', '#e0a070', '#cfcf8a']));
    for (const s of [3, 8, 13]) this.inst(branchGeo(s), stdMat({ roughness: 0.7 }), this.scatter(170, { dmin: 3, dmax: 28, clump: 0.36, seed: s }), [0.8, 1.7], cs(['#ff7eb6', '#a77bff', '#ff9a5a', '#ffd36b', '#7fd6ff']));
    this.inst(tableGeo(), stdMat({ roughness: 0.75 }), this.scatter(90, { dmin: 6, dmax: 26 }), [0.9, 1.9], cs(['#9fc48a', '#d2b07a', '#8fb5c9']));
    const fanM = stdMat({ roughness: 0.8, side: THREE.DoubleSide, alphaMap: fanAlpha(), alphaTest: 0.4 }, { swim: sway(0.22, 1.1, 1.4, 1.0) });
    this.inst(fanGeo(), fanM, this.scatter(180, { dmin: 4, dmax: 28, clump: 0.36, seed: 4 }), [0.8, 1.8], cs(['#c43a8a', '#8a4ad8', '#e8603a', '#e8c040']), { tilt: 0.05 });
    this.inst(tubeSpongeGeo(5), stdMat({ roughness: 0.8, side: THREE.DoubleSide }), this.scatter(150, { dmin: 3.5, dmax: 28 }), [0.8, 1.7], cs(['#ff8a2a', '#ffd23a', '#a050d8', '#40c0a0']));
    this.anemones = this.scatter(10, { dmin: 3.5, dmax: 7.5 });
    this.inst(anemoneGeo(), stdMat({ roughness: 0.6 }, { swim: sway(0.08, 2.0, 0.5, 6), rim: '#33204a' }), this.anemones, [1.3, 1.7], null, { tilt: 0.05 });
    this.inst(grassGeo(), stdMat({ roughness: 0.8, side: THREE.DoubleSide }, { swim: sway(0.25, 1.6, 1.2, 2) }), this.scatter(700, { dmin: 1, dmax: 22, clump: 0.5, seed: 7 }), [0.8, 1.5], null, { tilt: 0.1 });
    this.inst(rockGeo(1), stdMat({ roughness: 0.95 }), this.scatter(120, { dmin: 6, dmax: 32, pow: 0.7 }), [0.6, 2.4], cs(['#8b8275', '#7d8a72', '#9a8a7e']));
    this.inst(starGeo(), stdMat({ roughness: 0.6 }), this.scatter(70, { dmin: 1, dmax: 14 }), [0.8, 1.4], cs(['#ff5a3a', '#ff9a2a', '#7a5af0']), { tilt: 0.02 });
  }
  decorKelp() {
    const sway = (amp, freq, len, k) => ({ amp, freq, k, len, mode: 4 });
    const H = this.E.surfY + 2;
    this.inst(kelpGeo(H), stdMat({ roughness: 0.7, side: THREE.DoubleSide }, { swim: sway(1.6, 0.8, H, 0.12), causMul: 0.6 }), this.scatter(340, { dmin: 3.5, dmax: 34, pow: 0.9 }), [0.85, 1.05], null, { tilt: 0.04 });
    this.inst(rockGeo(2), stdMat({ roughness: 0.95 }), this.scatter(190, { dmin: 2, dmax: 32, pow: 0.7 }), [0.7, 2.8], ['#5f6758', '#6d6650', '#4f5a52'].map(C));
    const urchin = (() => { const parts = [new THREE.SphereGeometry(0.12, 10, 8)]; const r = rng(3); for (let i = 0; i < 40; i++) { const g = new THREE.CylinderGeometry(0.003, 0.008, 0.16, 3); g.translate(0, 0.16, 0); g.rotateX(r() * 3); g.rotateY(r() * 6.3); parts.push(g); } return merge(parts.map(g => paintV(g, c => c.set('#5a2a6a')))); })();
    this.inst(urchin, stdMat({ roughness: 0.6 }), this.scatter(160, { dmin: 1.5, dmax: 20, clump: 0.45, seed: 2 }), [0.8, 1.4], null);
    this.inst(grassGeo(), stdMat({ roughness: 0.8, side: THREE.DoubleSide }, { swim: sway(0.3, 1.4, 1.2, 2) }), this.scatter(400, { dmin: 1, dmax: 20, clump: 0.55, seed: 9 }), [0.8, 1.6], ['#6a8a3a', '#8a9a3a'].map(C));
    this.inst(starGeo(), stdMat({ roughness: 0.6 }), this.scatter(60, { dmin: 1, dmax: 14 }), [0.8, 1.4], ['#ff7a3a', '#c060c0'].map(C), { tilt: 0.02 });
  }
  decorDeep() {
    this.inst(rockGeo(3), stdMat({ roughness: 0.95 }), this.scatter(200, { dmin: 3, dmax: 34, pow: 0.7 }), [0.8, 3.2], ['#2a3240', '#343a46'].map(C));
    this.vents = this.scatter(7, { dmin: 7, dmax: 12 });
    this.inst(ventGeo(), stdMat({ roughness: 0.9 }), this.vents, [0.8, 1.3], ['#3a3f48'].map(C), { tilt: 0.05 });
    this.inst(tubeWormGeo(), stdMat({ roughness: 0.6, emissive: '#200404' }), this.vents.flatMap(v => [[v[0] + 2, v[1], v[2]], [v[0] - 2, v[1], v[2] + 1.5], [v[0], v[1], v[2] - 2]]).map(p => [p[0], this.ground(p[0], p[2]), p[2]]), [0.9, 1.4], null);
  }
  update(dt, cam) {
    if (this.domeM) this.domeM.position.copy(cam.position);
    if (this.snowM) this.snowM.uniforms.uCam.value.copy(cam.position);
    if (this.rayList) for (const m of this.rayList) {
      let z = null;
      if (!m.userData.placed) { z = cam.position.z + m.userData.dz; m.userData.placed = true; }
      else if (m.position.z > cam.position.z + 25 || m.position.z < cam.position.z - 190) z = cam.position.z - 150 - Math.random() * 25;
      if (z !== null) m.position.set(this.pathX(z) + (Math.random() - 0.5) * 30, this.E.surfY, z);
    }
  }
  dispose() { this.scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
