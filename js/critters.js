// Procedural sea creatures: Pip the blacktip pup, reef fish, turtle, manta, jelly, seahorse,
// deep-sea fish, the grumpy predators, and option-A trash / ghost net / Gunk Bot.
// Every model is built in code (no downloaded art). Fish face +z; nose at +L/2.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stdMat } from './shade.js';
import { clamp, sm, rng, fbm, radialTex } from './u.js';

const V2 = THREE.Vector2, V3 = THREE.Vector3;
const C = h => new THREE.Color(h);
const UPV = new V3(0, 1, 0);

/* ---------------- geometry helpers ---------------- */
function paint(g, fn) {
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  const arr = new Float32Array(p.count * 3), c = new THREE.Color(), q = {};
  for (let i = 0; i < p.count; i++) {
    q.x = p.getX(i); q.y = p.getY(i); q.z = p.getZ(i); q.u = uv ? uv.getX(i) : 0; q.v = uv ? uv.getY(i) : 0; q.ny = n ? n.getY(i) : 0;
    c.setRGB(1, 1, 1); fn(c, q);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
const solid = (g, hex) => { const c0 = C(hex); return paint(g, c => c.copy(c0)); };
const merge = list => mergeGeometries(list, false);

function body(L, prof, sx = 1, sy = 1, N = 44, S = 20) {
  const pts = [];
  for (let i = 0; i <= N; i++) { const t = 1 - i / N; pts.push(new V2(Math.max(prof(t), 1e-4), L * (0.5 - t))); }
  const g = new THREE.LatheGeometry(pts, S); g.rotateX(Math.PI / 2); g.scale(sx, sy, 1); return g;
}
// t: 0 nose .. 1 tail, up: -1 belly .. 1 back, side: -1 left .. 1 right
const paintBody = (g, fn) => paint(g, (c, q) => fn(c, 1 - q.v, -Math.cos(q.u * Math.PI * 2), Math.sin(q.u * Math.PI * 2), q));
const ovalP = (R, nose = 0.6, peak = 0.36, tail = 0.12) => t => R * (t < peak ? Math.pow(Math.sin(Math.PI / 2 * t / peak), nose) : 1 - Math.pow((t - peak) / (1 - peak), 1.8) * (1 - tail));

function fin(pts, map, colorFn, opts = {}) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  if (opts.lines) for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  else s.splineThru(pts.slice(1).map(p => new V2(p[0], p[1])));
  s.closePath();
  const g = new THREE.ShapeGeometry(s, opts.segs ?? 5);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const r = map(uv.getX(i), uv.getY(i)); p.setXYZ(i, r[0], r[1], r[2]); }
  g.computeVertexNormals();
  return paint(g, (c, q) => colorFn(c, q.u, q.v));
}
const tAt = (L, z) => clamp(0.5 - z / L, 0, 1);
const dorsalMap = (L, prof, sy, z0, sink = 0.88) => (u, v) => { const z = z0 + u; return [0, prof(tAt(L, z)) * sy * sink + v, z]; };
const ventralMap = (L, prof, sy, z0, sink = 0.88) => (u, v) => { const z = z0 + u; return [0, -prof(tAt(L, z)) * sy * sink + v, z]; };
const tailMap = (z0) => (u, v) => [0, v, z0 + u];
const pecMap = (sd, x0, y0, z0, droop = 0.5, curl = 0) => (u, v) => [sd * (x0 + v * 0.85), y0 - v * droop + v * v * curl, z0 + u];
const scaleP = (pts, k) => pts.map(([a, b]) => [a * k, b * k]);
const edge = (base, rim, lim) => (c, u, v) => { c.copy(base); if (lim(u, v)) c.copy(rim); };

function eyes(x, y, z, r, o = {}) {
  const out = [];
  for (const sd of [-1, 1]) {
    const e = new V3(sd * x, y, z);
    const w = new THREE.SphereGeometry(r, 16, 12); w.translate(e.x, e.y, e.z); solid(w, o.white ?? '#f4f6f8'); out.push(w);
    const pr = r * (o.pupil ?? 0.72), dir = new V3(sd, o.lift ?? 0.12, o.fwd ?? 0.6).normalize();
    const pc = e.clone().addScaledVector(dir, r - pr * 0.5);
    const pu = new THREE.SphereGeometry(pr, 14, 10); pu.translate(pc.x, pc.y, pc.z); solid(pu, o.iris ?? '#0e1216'); out.push(pu);
    const hc = pc.clone().addScaledVector(dir, pr * 0.62).add(new V3(0, pr * 0.38, pr * 0.1));
    const h = new THREE.SphereGeometry(pr * 0.3, 8, 6); h.translate(hc.x, hc.y, hc.z); solid(h, '#ffffff'); out.push(h);
    if (o.two) { const h2c = pc.clone().addScaledVector(dir, pr * 0.7).add(new V3(0, -pr * 0.3, -pr * 0.25)); const h2 = new THREE.SphereGeometry(pr * 0.14, 6, 4); h2.translate(h2c.x, h2c.y, h2c.z); solid(h2, '#ffffff'); out.push(h2); }
  }
  return out;
}
function tube(points, r, col, segs = 24, rfn) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new V3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, r, 6, false);
  if (rfn) { // variable radius along the tube
    const p = g.attributes.position, P = new V3();
    for (let i = 0; i <= segs; i++) { curve.getPointAt(i / segs, P); const k = rfn(i / segs); for (let j = 0; j <= 6; j++) { const idx = i * 7 + j; p.setXYZ(idx, P.x + (p.getX(idx) - P.x) * k, P.y + (p.getY(idx) - P.y) * k, P.z + (p.getZ(idx) - P.z) * k); } }
    g.computeVertexNormals();
  }
  return typeof col === 'function' ? paint(g, col) : solid(g, col);
}
function cone(r, h, col, from, dir, seg = 6) { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, new V3(...dir).normalize())); g.translate(...from); return solid(g, col); }

/* ---------------- species (merged, vertex-coloured, swim-bent) ---------------- */
const SPECIES_GEO = {};
const B = {};

B.clown = () => {
  const L = 0.42, R = 0.1, sx = 0.62, sy = 1.05, prof = ovalP(R, 0.55, 0.36, 0.2);
  const O = C('#ff6512'), W = C('#fbfaf3'), K = C('#16110e');
  const bands = [[0.2, 0.045], [0.5, 0.055], [0.85, 0.028]];
  const g = [paintBody(body(L, prof, sx, sy), (c, t, up) => { c.copy(O); for (const [b, w] of bands) { const d = Math.abs(t - b); if (d < w) { c.copy(W); break; } if (d < w + 0.02) { c.copy(K); break; } } })];
  const ek = (lim) => edge(O, K, lim);
  g.push(fin([[0.1, 0], [0.07, 0.05], [0.0, 0.045], [-0.06, 0.07], [-0.15, 0.05], [-0.17, 0]], dorsalMap(L, prof, sy, -0.01), ek((u, v) => v > 0.04)));
  g.push(fin([[0.0, 0], [-0.03, -0.045], [-0.1, -0.035], [-0.12, 0]], ventralMap(L, prof, sy, -0.02), ek((u, v) => v < -0.03)));
  g.push(fin([[0.01, 0.03], [-0.05, 0.075], [-0.1, 0.06], [-0.115, 0], [-0.1, -0.06], [-0.05, -0.075], [0.01, -0.03]], tailMap(-L / 2 + 0.03), ek((u, v) => u < -0.09 || Math.abs(v) > 0.066)));
  for (const sd of [-1, 1]) g.push(fin([[0.03, 0], [0.0, 0.05], [-0.05, 0.06], [-0.06, 0.01]], pecMap(sd, R * sx * 0.85, -0.02, L / 2 - 0.15, 0.5), ek((u, v) => v > 0.048)));
  g.push(...eyes(R * sx * 0.72, 0.025, L / 2 - 0.075, 0.022, { fwd: 0.5 }));
  return { geo: merge(g), len: L, swim: { amp: 0.045, freq: 9, k: 6, head: 0.06, len: 0.28 } };
};

B.tang = () => {
  const L = 0.5, R = 0.15, sx = 0.3, sy = 1.05, prof = ovalP(R, 0.75, 0.42, 0.16);
  const Bl = C('#1d4fd8'), K = C('#0f1222'), Y = C('#ffd21a'), Lt = C('#6f9bff');
  const g = [paintBody(body(L, prof, sx, sy), (c, t, up) => {
    c.copy(Bl);
    const pal = t > 0.16 && t < 0.86 && up > 0.1 + (t - 0.16) * 0.25 && up < 0.82;
    const inner = t > 0.4 && t < 0.72 && up > 0.34 && up < 0.62;
    if (pal && !inner) c.copy(K);
    if (t > 0.84 && Math.abs(up) < 0.55) c.copy(Y);
    if (up < -0.6) c.lerp(Lt, 0.25);
  })];
  g.push(fin([[0.15, 0], [0.12, 0.045], [0, 0.055], [-0.12, 0.055], [-0.2, 0.04], [-0.21, 0]], dorsalMap(L, prof, sy, 0, 0.9), edge(Bl, K, (u, v) => v > 0.042)));
  g.push(fin([[0.05, 0], [0.02, -0.04], [-0.1, -0.045], [-0.18, -0.03], [-0.19, 0]], ventralMap(L, prof, sy, 0, 0.9), edge(Bl, K, (u, v) => v < -0.036)));
  g.push(fin([[0.01, 0.035], [-0.06, 0.09], [-0.1, 0.11], [-0.075, 0.0], [-0.1, -0.11], [-0.06, -0.09], [0.01, -0.035]], tailMap(-L / 2 + 0.03), edge(Y, K, (u, v) => Math.abs(v) > 0.09 || (u < -0.07 && Math.abs(v) > 0.05))));
  for (const sd of [-1, 1]) g.push(fin([[0.03, 0], [0.0, 0.05], [-0.06, 0.07], [-0.07, 0.01]], pecMap(sd, R * sx * 0.8, -0.03, L / 2 - 0.17, 0.4), edge(Bl, Y, (u, v) => v > 0.05)));
  g.push(...eyes(R * sx * 0.78, 0.04, L / 2 - 0.09, 0.022, { fwd: 0.5 }));
  return { geo: merge(g), len: L, swim: { amp: 0.05, freq: 8, k: 6, head: 0.05, len: 0.32 } };
};

B.parrot = () => {
  const L = 0.75, R = 0.16, sx = 0.5, sy = 0.95, prof = ovalP(R, 0.5, 0.34, 0.2);
  const T = C('#22b99b'), Td = C('#157e74'), S = C('#8ae6c9'), P = C('#ff8fb0'), Bk = C('#eef4e8');
  const g = [paintBody(body(L, prof, sx, sy), (c, t, up, side, q) => {
    c.lerpColors(T, Td, sm(0.2, 0.9, up));
    if (Math.sin(t * 110) * Math.sin((up + 1) * 14) > 0.55) c.lerp(S, 0.6);
    if (t < 0.26 && Math.sin(up * 9 + t * 34) > 0.35) c.copy(P);
    if (up < -0.5) c.lerp(P, 0.45);
    if (t < 0.05) c.copy(Bk);
  })];
  g.push(fin([[0.22, 0], [0.18, 0.04], [0, 0.05], [-0.2, 0.05], [-0.28, 0.035], [-0.29, 0]], dorsalMap(L, prof, sy, 0), edge(T, P, (u, v) => v > 0.038)));
  g.push(fin([[0.0, 0], [-0.03, -0.04], [-0.16, -0.04], [-0.2, 0]], ventralMap(L, prof, sy, -0.05), edge(T, P, (u, v) => v < -0.032)));
  g.push(fin([[0.01, 0.05], [-0.08, 0.13], [-0.15, 0.16], [-0.11, 0.0], [-0.15, -0.16], [-0.08, -0.13], [0.01, -0.05]], tailMap(-L / 2 + 0.04), edge(T, P, (u, v) => Math.abs(v) > 0.13 || u < -0.12)));
  for (const sd of [-1, 1]) g.push(fin([[0.04, 0], [0.0, 0.07], [-0.08, 0.09], [-0.09, 0.01]], pecMap(sd, R * sx * 0.8, -0.03, L / 2 - 0.22, 0.4), edge(T, P, (u, v) => v > 0.075)));
  g.push(...eyes(R * sx * 0.72, 0.04, L / 2 - 0.11, 0.026, { fwd: 0.5, iris: '#2a1608' }));
  return { geo: merge(g), len: L, swim: { amp: 0.06, freq: 6, k: 4, head: 0.1, len: 0.5 } };
};

B.puffer = () => {
  const L = 0.42, R = 0.17, sx = 0.92, sy = 0.9;
  const prof = t => Math.max(R * Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - 0.5 * sm(0.75, 1, t)), R * 0.2 * sm(0.7, 1, t));
  const Sd = C('#e4c66c'), Sp = C('#6b4a2b'), Be = C('#f7f3e6');
  const g = [paintBody(body(L, prof, sx, sy, 40, 24), (c, t, up, side, q) => {
    c.lerpColors(Be, Sd, sm(-0.45, -0.15, up));
    if (up > -0.2 && Math.sin(t * 46 + 1) * Math.sin(q.u * Math.PI * 14) > 0.55) c.copy(Sp);
  })];
  const r = rng(5);
  for (let k = 0; k < 46; k++) {
    const t = 0.12 + r() * 0.62, a = r() * Math.PI * 2, rr = prof(t);
    const p = [Math.sin(a) * rr * sx, -Math.cos(a) * rr * sy, L * (0.5 - t)];
    g.push(cone(0.008, 0.032, '#b89650', p, [Math.sin(a), -Math.cos(a), (0.42 - t) * 0.8], 4));
  }
  g.push(fin([[0.01, 0.03], [-0.04, 0.06], [-0.08, 0.04], [-0.08, -0.04], [-0.04, -0.06], [0.01, -0.03]], tailMap(-L / 2 + 0.03), edge(Sd, Sp, (u, v) => u < -0.07)));
  for (const sd of [-1, 1]) g.push(fin([[0.02, 0], [0.0, 0.04], [-0.04, 0.05], [-0.05, 0.0]], pecMap(sd, R * sx * 0.85, 0.0, L / 2 - 0.16, 0.2), edge(Sd, Sd, () => false)));
  g.push(...eyes(R * sx * 0.62, 0.055, L / 2 - 0.1, 0.036, { fwd: 0.9, two: true }));
  return { geo: merge(g), len: L, swim: { amp: 0.02, freq: 12, k: 4, head: -0.05, len: 0.2 } };
};

B.lion = () => {
  const L = 0.46, R = 0.09, sx = 0.55, sy = 1.1, prof = ovalP(R, 0.6, 0.35, 0.2);
  const Rd = C('#b5361f'), Cr = C('#f5e6d6');
  const g = [paintBody(body(L, prof, sx, sy), (c, t, up) => { c.copy(Math.sin(t * 46 + up * 1.2) > -0.1 ? Rd : Cr); if (up < -0.6) c.lerp(Cr, 0.5); })];
  for (let i = 0; i < 13; i++) {
    const z = 0.12 - i * 0.022, h = 0.12 + 0.08 * Math.sin(i / 12 * Math.PI);
    const s = new THREE.CylinderGeometry(0.002, 0.005, h, 4, 6); s.translate(0, h / 2, 0); s.rotateX(-0.3);
    paint(s, (c, q) => c.copy(Math.sin(q.y * 80) > 0 ? Rd : Cr));
    s.translate(0, prof(tAt(L, z)) * sy * 0.85, z); g.push(s);
  }
  for (const sd of [-1, 1]) g.push(fin([[0.03, 0], [0.0, 0.07], [-0.08, 0.15], [-0.19, 0.15], [-0.24, 0.07], [-0.2, 0.0], [-0.08, -0.01]], pecMap(sd, R * sx * 0.8, -0.02, L / 2 - 0.16, 0.35), (c, u, v) => c.copy(Math.sin(Math.atan2(v, -u - 0.02) * 22) > 0 ? Rd : Cr)));
  g.push(fin([[0.01, 0.03], [-0.05, 0.07], [-0.1, 0.06], [-0.11, 0], [-0.1, -0.06], [-0.05, -0.07], [0.01, -0.03]], tailMap(-L / 2 + 0.03), (c, u, v) => c.copy(Math.sin(u * 120) * Math.sin(v * 120) > 0.3 ? Rd : Cr)));
  g.push(...eyes(R * sx * 0.7, 0.03, L / 2 - 0.07, 0.02, { fwd: 0.5, iris: '#3a0c06' }));
  return { geo: merge(g), len: L, swim: { amp: 0.03, freq: 5, k: 6, head: 0.0, len: 0.25 } };
};

B.garibaldi = () => {
  const L = 0.42, R = 0.13, sx = 0.42, sy = 1.05, prof = ovalP(R, 0.65, 0.4, 0.2);
  const O = C('#ff5c00'), Od = C('#e04300');
  const g = [paintBody(body(L, prof, sx, sy), (c, t, up) => c.lerpColors(O, Od, sm(0.3, 0.9, up)))];
  const e = edge(O, Od, (u, v) => Math.abs(v) > 0.05);
  g.push(fin([[0.12, 0], [0.08, 0.05], [-0.06, 0.06], [-0.16, 0.045], [-0.17, 0]], dorsalMap(L, prof, sy, 0), e));
  g.push(fin([[0.0, 0], [-0.03, -0.045], [-0.13, -0.04], [-0.15, 0]], ventralMap(L, prof, sy, -0.02), e));
  g.push(fin([[0.01, 0.035], [-0.06, 0.08], [-0.1, 0.07], [-0.09, 0], [-0.1, -0.07], [-0.06, -0.08], [0.01, -0.035]], tailMap(-L / 2 + 0.03), e));
  for (const sd of [-1, 1]) g.push(fin([[0.03, 0], [0.0, 0.05], [-0.05, 0.06], [-0.06, 0.01]], pecMap(sd, R * sx * 0.8, -0.03, L / 2 - 0.15, 0.4), e));
  g.push(...eyes(R * sx * 0.75, 0.035, L / 2 - 0.08, 0.022, { fwd: 0.5 }));
  return { geo: merge(g), len: L, swim: { amp: 0.04, freq: 7, k: 6, head: 0.05, len: 0.28 } };
};

B.chromis = () => {
  const L = 0.17, R = 0.042, sx = 0.45, sy = 1.0, prof = ovalP(R, 0.6, 0.38, 0.15);
  const Bl = C('#45c2e6'), Bd = C('#2a83c4'), Be = C('#c9f1ff');
  const g = [paintBody(body(L, prof, sx, sy, 24, 12), (c, t, up) => { c.lerpColors(Be, Bl, sm(-0.6, -0.1, up)); c.lerp(Bd, sm(0.4, 1, up)); })];
  g.push(fin([[0.01, 0.012], [-0.03, 0.04], [-0.035, 0.0], [-0.03, -0.04], [0.01, -0.012]], tailMap(-L / 2 + 0.01), edge(Bl, Bd, () => false), { lines: true }));
  g.push(fin([[0.04, 0], [0.0, 0.02], [-0.05, 0.015], [-0.055, 0]], dorsalMap(L, prof, sy, 0), edge(Bd, Bd, () => false), { lines: true }));
  g.push(...eyes(R * sx * 0.7, 0.01, L / 2 - 0.03, 0.009, { fwd: 0.4 }));
  return { geo: merge(g), len: L, swim: { amp: 0.018, freq: 14, k: 14, head: 0.02, len: 0.1 } };
};

B.barracuda = (grumpy = true) => {
  const L = 1.4, R = 0.1, sx = 0.8, sy = 1.0;
  const prof = t => R * (t < 0.3 ? Math.pow(Math.sin(Math.PI / 2 * t / 0.3), 0.9) : 1 - Math.pow((t - 0.3) / 0.7, 1.5) * 0.86);
  const Be = C('#eef2f4'), Si = C('#c4cfd6'), Tp = C('#56707f'), Bar = C('#2e3c46'), Dk = C('#2c3640');
  const g = [paintBody(body(L, prof, sx, sy, 56, 20), (c, t, up) => {
    c.lerpColors(Be, Si, sm(-0.6, 0.1, up)); c.lerp(Tp, sm(0.2, 0.85, up));
    if (up > 0.05 && t > 0.2 && t < 0.85 && Math.sin(t * 34) > 0.55) c.lerp(Bar, 0.7);
  })];
  const e = edge(Dk, Dk, () => false);
  g.push(fin([[0.06, 0], [0.02, 0.08], [-0.03, 0.08], [-0.05, 0]], dorsalMap(L, prof, sy, 0.05), e));
  g.push(fin([[0.05, 0], [0.0, 0.07], [-0.06, 0.06], [-0.07, 0]], dorsalMap(L, prof, sy, -0.3), e));
  g.push(fin([[0.04, 0], [0.0, -0.06], [-0.06, -0.05], [-0.07, 0]], ventralMap(L, prof, sy, -0.32), e));
  g.push(fin([[0.02, 0.03], [-0.08, 0.1], [-0.2, 0.2], [-0.12, 0.0], [-0.2, -0.2], [-0.08, -0.1], [0.02, -0.03]], tailMap(-L / 2 + 0.04), e, { lines: true }));
  for (const sd of [-1, 1]) g.push(fin([[0.04, 0], [0.0, 0.05], [-0.08, 0.06], [-0.08, 0.0]], pecMap(sd, R * sx * 0.75, -0.04, L / 2 - 0.3, 0.4), e));
  g.push(cone(0.03, 0.14, '#c9d3da', [0, -0.04, L / 2 - 0.09], [0, 0.12, 1], 8));            // underbite jaw
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) g.push(cone(0.008, 0.022, '#ffffff', [sd * 0.035, -0.028, L / 2 - 0.05 - i * 0.03], [0, -1, 0.2], 4));
  g.push(...eyes(R * sx * 0.62, 0.035, L / 2 - 0.17, 0.034, { fwd: 0.7, iris: '#151515' }));
  if (grumpy) for (const sd of [-1, 1]) { const b = new THREE.BoxGeometry(0.016, 0.016, 0.085); b.rotateX(0.5); b.rotateY(sd * 0.2); b.translate(sd * 0.06, 0.082, L / 2 - 0.16); g.push(solid(b, '#1c242a')); }
  return { geo: merge(g), len: L, swim: { amp: 0.07, freq: 4.5, k: 2.5, head: 0.3, len: 1.2 } };
};

B.moray = () => {
  const L = 1.6, R = 0.085, sx = 0.72, sy = 1.0;
  const prof = t => t < 0.07 ? R * Math.pow(t / 0.07, 0.5) : R * (1 - Math.pow(Math.max(0, t - 0.5) / 0.5, 1.3) * 0.92);
  const G = C('#5b7a28'), Sp = C('#d3cb5c'), Be = C('#8aa040');
  const g = [paintBody(body(L, prof, sx, sy, 80, 16), (c, t, up, s, q) => { c.copy(G); if (Math.sin(t * 140) * Math.sin(q.u * Math.PI * 18) > 0.45) c.copy(Sp); if (up < -0.5) c.lerp(Be, 0.6); })];
  g.push(fin([[0.55, 0], [0.5, 0.03], [0, 0.04], [-0.5, 0.04], [-0.78, 0.02], [-0.8, 0]], dorsalMap(L, prof, sy, 0), edge(G, Sp, () => false), { segs: 12 }));
  g.push(fin([[0.1, 0], [0.05, -0.025], [-0.5, -0.03], [-0.78, -0.015], [-0.8, 0]], ventralMap(L, prof, sy, 0), edge(G, G, () => false), { segs: 12 }));
  for (const sd of [-1, 1]) { const m = new THREE.BoxGeometry(0.006, 0.012, 0.1); m.translate(sd * 0.052, -0.022, L / 2 - 0.065); g.push(solid(m, '#1b220e')); }
  g.push(...eyes(R * sx * 0.62, 0.035, L / 2 - 0.05, 0.02, { fwd: 0.6, iris: '#0b1622' }));
  return { geo: merge(g), len: L, swim: { amp: 0.09, freq: 3.6, k: 5, head: 0.7, len: 1.4 } };
};

B.angler = () => {
  const L = 0.6, R = 0.24, sx = 0.85, sy = 0.95;
  const prof = t => Math.max(R * Math.pow(Math.sin(Math.PI * Math.min(t * 1.05 + 0.02, 1)), 0.5) * (1 - 0.5 * sm(0.75, 1, t)), R * 0.2 * sm(0.7, 1, t));
  const D = C('#3b2c2a'), Mo = C('#6a524c');
  const g = [paintBody(body(L, prof, sx, sy, 40, 24), (c, t, up, s, q) => { c.copy(D); if (fbm(t * 9, q.u * 14, 2) > 0.58) c.lerp(Mo, 0.7); })];
  const mouth = new THREE.SphereGeometry(1, 20, 12); mouth.scale(0.17, 0.11, 0.06); mouth.translate(0, -0.06, L / 2 - 0.02); g.push(solid(mouth, '#120808'));
  for (let i = 0; i < 9; i++) { const a = -0.95 + i * (1.9 / 8); g.push(cone(0.012, 0.05, '#f2efe6', [Math.sin(a) * 0.15, 0.03, L / 2 - 0.0], [0, -1, 0.1], 4)); g.push(cone(0.011, 0.045, '#f2efe6', [Math.sin(a) * 0.15, -0.15, L / 2 - 0.01], [0, 1, 0.1], 4)); }
  g.push(tube([[0, 0.2, 0.12], [0, 0.33, 0.2], [0, 0.36, 0.36], [0, 0.31, 0.46]], 0.01, '#4b3a36', 16));
  g.push(fin([[0.02, 0.04], [-0.06, 0.08], [-0.1, 0.0], [-0.06, -0.08], [0.02, -0.04]], tailMap(-L / 2 + 0.04), edge(D, D, () => false)));
  for (const sd of [-1, 1]) g.push(fin([[0.03, 0], [0.0, 0.05], [-0.05, 0.05], [-0.05, 0]], pecMap(sd, R * sx * 0.85, -0.05, -0.02, 0.3), edge(D, D, () => false)));
  g.push(...eyes(R * sx * 0.55, 0.11, L / 2 - 0.12, 0.022, { fwd: 0.8 }));
  return { geo: merge(g), len: L, swim: { amp: 0.04, freq: 3, k: 4, head: 0.0, len: 0.4 }, lure: new V3(0, 0.31, 0.47) };
};

/* sharks: Pip, whale shark, hammerhead */
function sharkParts(o) {
  const L = o.L, R = o.R, sx = o.sx ?? 0.95, sy = o.sy ?? 0.86;
  const prof = o.prof ?? (t => t < 0.3 ? R * Math.pow(Math.sin(Math.PI / 2 * t / 0.3), o.nose ?? 0.75) : R * (1 - Math.pow((t - 0.3) / 0.7, 1.5) * 0.86));
  const Tp = C(o.top), Be = C(o.belly), Tip = C(o.tip ?? '#1b232b');
  const g = [];
  g.push(paintBody(body(L, prof, sx, sy, 60, 26), (c, t, up, s, q) => {
    c.lerpColors(Be, Tp, sm(-0.42, -0.08, up));
    if (o.spots && up > -0.3) { if (Math.sin(t * 95) * Math.sin(q.u * Math.PI * 26) > 0.72) c.copy(Be); else if (Math.abs(Math.sin(t * 48)) < 0.07 && t > 0.25) c.lerp(Be, 0.5); }
    if (o.shade) c.multiplyScalar(1 - 0.08 * sm(0.5, 1, up));
  }));
  const fs = (o.finScale ?? 1) * L, tipOn = o.tips !== false;
  const tc = (base, lim) => (c, u, v) => { c.copy(base); if (tipOn && lim(u, v)) c.copy(Tip); };
  const tTop = Tp;
  g.push(fin(scaleP([[0.13, 0], [0.05, 0.1], [-0.025, 0.235], [-0.045, 0.12], [-0.13, 0.01]], fs), dorsalMap(L, prof, sy, L * (0.5 - (o.dorsalT ?? 0.42)), 0.9), tc(tTop, (u, v) => v > 0.17 * fs), { segs: 8 }));
  g.push(fin(scaleP([[0.04, 0], [0.005, 0.05], [-0.03, 0.055], [-0.04, 0.0]], fs), dorsalMap(L, prof, sy, L * (0.5 - 0.74), 0.9), tc(tTop, (u, v) => v > 0.042 * fs)));
  g.push(fin(scaleP([[0.035, 0], [0.0, -0.045], [-0.03, -0.05], [-0.04, 0.0]], fs), ventralMap(L, prof, sy, L * (0.5 - 0.76), 0.9), tc(Be, (u, v) => v < -0.04 * fs)));
  g.push(fin(scaleP([[0.06, 0.05], [-0.06, 0.16], [-0.2, 0.3], [-0.17, 0.18], [-0.1, 0.02], [-0.15, -0.1], [-0.12, -0.14], [0.06, -0.04]], fs), tailMap(-L / 2 + 0.06 * L), tc(tTop, (u, v) => v > 0.22 * fs || v < -0.1 * fs), { segs: 8 }));
  const pt = 0.36, px = prof(pt) * sx * 0.72, py = -prof(pt) * sy * 0.45;
  for (const sd of [-1, 1]) {
    g.push(fin(scaleP([[0.07, 0], [0.02, 0.1], [-0.06, 0.22], [-0.1, 0.22], [-0.07, 0.08], [-0.06, 0]], fs * (o.pecScale ?? 1)), pecMap(sd, px, py, L * (0.5 - pt), 0.55, 0.4 / L), tc(Be.clone().lerp(Tp, 0.8), (u, v) => v > 0.17 * fs * (o.pecScale ?? 1)), { segs: 8 }));
    g.push(fin(scaleP([[0.03, 0], [-0.01, 0.05], [-0.05, 0.05], [-0.05, 0]], fs), pecMap(sd, prof(0.62) * sx * 0.6, -prof(0.62) * sy * 0.6, L * (0.5 - 0.62), 0.8), tc(Tp, (u, v) => v > 0.04 * fs)));
    for (let i = 0; i < 5; i++) {   // five gill slits
      const t = (o.gillT ?? 0.24) + i * 0.018, gx = prof(t) * sx * 0.99;
      const s = new THREE.BoxGeometry(0.012 * L, 0.075 * L, 0.006 * L); s.rotateZ(sd * 0.15); s.translate(sd * gx, -0.01 * L, L * (0.5 - t)); g.push(solid(s, o.gill ?? '#4b6273'));
    }
  }
  return { g, prof, L, R, sx, sy };
}
function sharkSurf(sp, t, ang, k = 1) { const r = sp.prof(t) * k; return [Math.cos(ang) * r * sp.sx, Math.sin(ang) * r * sp.sy, sp.L * (0.5 - t)]; }

B.whale = () => {
  const L = 5.5, R = 0.62;
  const sp = sharkParts({ L, R, sx: 1.18, sy: 0.8, top: '#3f566a', belly: '#eef1f2', spots: true, tips: false, nose: 0.35, finScale: 0.9, gill: '#30434f' });
  const m = tube([[-0.5, -0.12, L / 2 - 0.02], [0, -0.18, L / 2 + 0.02], [0.5, -0.12, L / 2 - 0.02]], 0.045, '#1c2830', 16); sp.g.push(m);
  sp.g.push(...eyes(R * 1.18 * 0.86, 0.02, L / 2 - 0.45, 0.06, { fwd: 0.3, white: '#2b3a44' }));
  return { geo: merge(sp.g), len: L, swim: { amp: 0.35, freq: 1.4, k: 0.9, head: 1.2, len: 4.5 } };
};
B.hammer = () => {
  const L = 2.3, R = 0.22;
  const sp = sharkParts({ L, R, sx: 0.9, sy: 0.85, top: '#8c9189', belly: '#f1f1ec', tips: false, finScale: 1.08, gill: '#666b63' });
  const h = new THREE.SphereGeometry(1, 24, 10); h.scale(0.46, 0.055, 0.13); h.translate(0, 0.0, L / 2 - 0.12);
  sp.g.push(paint(h, (c, q) => c.lerpColors(C('#f1f1ec'), C('#8c9189'), sm(-0.02, 0.01, q.y))));
  for (const sd of [-1, 1]) { const e = new THREE.SphereGeometry(0.03, 10, 8); e.translate(sd * 0.45, 0.0, L / 2 - 0.12); sp.g.push(solid(e, '#111')); }
  return { geo: merge(sp.g), len: L, swim: { amp: 0.16, freq: 3, k: 1.8, head: 0.5, len: 1.8 } };
};
B.dolphin = () => {
  const L = 2.0, R = 0.24, sx = 0.9, sy = 1.0;
  const prof = t => t < 0.06 ? R * 0.3 * Math.sqrt(t / 0.06) : t < 0.16 ? R * (0.3 + 0.62 * sm(0.06, 0.16, t)) : t < 0.4 ? R * (0.92 + 0.08 * sm(0.16, 0.4, t)) : R * (1 - Math.pow((t - 0.4) / 0.6, 1.6) * 0.9);
  const Tp = C('#6f7f90'), Be = C('#e3e8ec');
  const g = [paintBody(body(L, prof, sx, sy, 56, 22), (c, t, up) => c.lerpColors(Be, Tp, sm(-0.3, 0.15, up)))];
  g.push(fin(scaleP([[0.07, 0], [0.02, 0.06], [-0.04, 0.12], [-0.07, 0.11], [-0.05, 0.04], [-0.06, 0]], L), dorsalMap(L, prof, sy, L * (0.5 - 0.45)), edge(Tp, Tp, () => false), { segs: 8 }));
  g.push(fin(scaleP([[0.04, 0], [-0.03, 0.12], [-0.12, 0.24], [-0.09, 0.1], [-0.06, 0], [-0.09, -0.1], [-0.12, -0.24], [-0.03, -0.12]], L), (u, v) => [v, 0, -L / 2 + 0.06 + u], edge(Tp, Tp, () => false), { segs: 8 }));
  for (const sd of [-1, 1]) g.push(fin(scaleP([[0.04, 0], [0.0, 0.05], [-0.06, 0.11], [-0.07, 0.03]], L), pecMap(sd, prof(0.28) * sx * 0.7, -prof(0.28) * 0.5, L * (0.5 - 0.28), 0.6), edge(Tp, Tp, () => false)));
  const bh = new THREE.SphereGeometry(0.02, 8, 6); bh.scale(1, 0.4, 1.4); bh.translate(0, prof(0.2) * sy * 0.99, L * (0.5 - 0.2)); g.push(solid(bh, '#2b333b'));
  g.push(...eyes(prof(0.15) * sx * 0.86, 0.02, L * (0.5 - 0.15), 0.03, { fwd: 0.4, white: '#3a4651' }));
  return { geo: merge(g), len: L, swim: { amp: 0.12, freq: 3.2, k: 1.4, head: 0.3, len: 1.4, mode: 1 } };
};

export function speciesGeo(id) { if (!SPECIES_GEO[id]) SPECIES_GEO[id] = B[id](); return SPECIES_GEO[id]; }
const MATS = {};
export function speciesMat(id, own = false) {
  const s = speciesGeo(id);
  if (own || !MATS[id]) { const m = stdMat({ roughness: 0.55, side: THREE.DoubleSide }, { swim: Object.assign({ phase: Math.random() * 6 }, s.swim), rim: '#1d4d66' }); if (own) return m; MATS[id] = m; }
  return MATS[id];
}
export function makeFish(id, own = false) {
  const s = speciesGeo(id), m = new THREE.Mesh(s.geo, speciesMat(id, own));
  m.userData.len = s.len; return m;
}
export function makeSchool(id, n) {
  const s = speciesGeo(id);
  const im = new THREE.InstancedMesh(s.geo, speciesMat(id), n); im.frustumCulled = false; return im;
}

/* ---------------- Pip the blacktip reef shark pup (original character) ---------------- */
export function makePip() {
  const L = 1.7, R = 0.44;
  const prof = t => t < 0.32 ? R * Math.sqrt(Math.max(0, 1 - Math.pow((0.32 - t) / 0.32, 2))) : R * (1 - Math.pow((t - 0.32) / 0.68, 1.5) * 0.84);
  const sp = sharkParts({ L, R, sx: 0.95, sy: 0.86, prof, top: '#7d9db6', belly: '#f6f3ec', tip: '#1d262e', finScale: 0.82, pecScale: 1.1, gillT: 0.27, gill: '#5f7d93', shade: true });
  // red ranger neckerchief (merged so it swims with the body)
  const kt = 0.41, kr = prof(kt), arc = Math.PI * 1.25;
  const ring = new THREE.TorusGeometry(kr, 0.05, 8, 40, arc); ring.rotateZ(-Math.PI / 2 - arc / 2); ring.scale(0.95 * 1.04, 0.86 * 1.04, 1); ring.translate(0, 0, L * (0.5 - kt));
  sp.g.push(solid(ring, '#e5483b'));
  const by = -kr * 0.86 * 1.04;
  sp.g.push(fin([[-0.17, 0], [0.17, 0], [0.0, -0.3]], (u, v) => [u, by + v, L * (0.5 - kt) - 0.03 + v * 0.35], (c, u, v) => c.set(v < -0.18 ? '#c63a2f' : '#e5483b'), { lines: true }));
  const knot = new THREE.SphereGeometry(0.055, 10, 8); knot.translate(0, by - 0.01, L * (0.5 - kt)); sp.g.push(solid(knot, '#c23a2f'));
  const star = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 5); star.rotateX(Math.PI / 2); star.translate(0, by - 0.1, L * (0.5 - kt) - 0.06); sp.g.push(solid(star, '#ffcf3a'));
  const geo = merge(sp.g);
  const mat = stdMat({ roughness: 0.48, side: THREE.DoubleSide }, { swim: { amp: 0.13, freq: 5.5, k: 2.0, head: 0.35, len: 1.5 }, rim: '#2f6f8f' });
  const bodyM = new THREE.Mesh(geo, mat);
  // face: big eyes, smile, blush (not bent)
  const fg = [];
  const e = sharkSurf(sp, 0.165, 0.42, 0.8);
  fg.push(...eyes(e[0], e[1], e[2], 0.105, { fwd: 1.05, pupil: 0.74, two: true, lift: 0.18 }));
  const smile = [[0.088, -Math.PI / 2 - 0.62], [0.072, -Math.PI / 2 - 0.32], [0.064, -Math.PI / 2], [0.072, -Math.PI / 2 + 0.32], [0.088, -Math.PI / 2 + 0.62]].map(([t, a]) => sharkSurf(sp, t, a, 1.02));
  fg.push(tube(smile, 0.015, '#2b2f3a', 20));
  const faceM = new THREE.Mesh(merge(fg), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }));
  const blushM = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.55, depthWrite: false });
  const group = new THREE.Group(), inner = new THREE.Group();
  inner.add(bodyM, faceM);
  for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), blushM); const p = sharkSurf(sp, 0.12, sd > 0 ? -0.35 : Math.PI + 0.35, 1.0); b.position.set(...p); b.scale.set(0.45, 0.7, 1); inner.add(b); }
  inner.rotation.y = Math.PI;   // model faces +z; the game flies toward -z
  group.add(inner);
  return { group, inner, mat, mouth: new V3(0, -0.12, -0.9), L };
}

/* ---------------- special creatures (groups) ---------------- */
export function makeTurtle() {
  const g = new THREE.Group();
  const seeds = []; const r = rng(11);
  for (let i = 0; i < 5; i++) seeds.push([0, -0.8 + i * 0.4]);
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) seeds.push([sd * 0.62, -0.62 + i * 0.42]);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; seeds.push([Math.cos(a) * 1.0, Math.sin(a) * 1.0]); }
  const fills = ['#7a5530', '#8c6236', '#6b4a28', '#80592f'].map(C), Ln = C('#3a2814'), Pl = C('#e9dcae');
  const sh = new THREE.SphereGeometry(1, 36, 20);
  paint(sh, (c, q) => {
    if (q.y < -0.15) return c.copy(Pl);
    let d1 = 9, d2 = 9, k = 0;
    for (let i = 0; i < seeds.length; i++) { const d = Math.hypot(q.x - seeds[i][0], q.z - seeds[i][1]); if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d; }
    c.copy(fills[k % 4]); c.lerp(C('#c89a5a'), Math.max(0, 0.35 - d1 * 0.6));
    if (d2 - d1 < 0.06) c.copy(Ln);
  });
  sh.scale(0.42, 0.17, 0.55);
  const sk = C('#8f9c5a'), skd = C('#5f6a36');
  const head = new THREE.SphereGeometry(1, 18, 12); paint(head, (c, q) => { c.copy(sk); if (fbm(q.x * 5 + 3, q.z * 5, 2) > 0.55) c.copy(skd); if (q.z > 0.8 && q.y < 0) c.set('#d8d2a0'); }); head.scale(0.1, 0.085, 0.13); head.translate(0, 0.01, 0.6);
  const parts = [sh, head, ...eyes(0.06, 0.04, 0.66, 0.022, { fwd: 0.5 })];
  const mat = stdMat({ roughness: 0.65, side: THREE.DoubleSide }, { rim: '#1d4d66' });
  g.add(new THREE.Mesh(merge(parts), mat));
  const flip = (pts, sd, len) => fin(pts, (u, v) => [sd * v, -v * 0.1, u], (c, u, v) => { c.copy(sk); if (fbm(u * 18, v * 18, 2) > 0.55) c.copy(skd); });
  g.userData.flippers = [];
  for (const sd of [-1, 1]) {
    const f = new THREE.Mesh(flip([[0.08, 0], [0.04, 0.25], [-0.08, 0.5], [-0.12, 0.45], [-0.04, 0.2], [-0.06, 0]], sd), mat); f.position.set(sd * 0.3, -0.02, 0.28); g.add(f);
    const b = new THREE.Mesh(flip([[0.05, 0], [0.0, 0.12], [-0.08, 0.16], [-0.08, 0.02]], sd), mat); b.position.set(sd * 0.24, -0.03, -0.42); g.add(b);
    g.userData.flippers.push({ m: f, sd, big: true }, { m: b, sd, big: false });
  }
  return g;
}
export function animTurtle(g, t, ph = 0) {
  for (const f of g.userData.flippers) {
    if (f.big) { f.m.rotation.z = f.sd * Math.sin(t * 1.8 + ph) * 0.55; f.m.rotation.y = f.sd * (Math.cos(t * 1.8 + ph) * 0.3 - 0.1); }
    else f.m.rotation.y = f.sd * Math.sin(t * 1.8 + ph + 1) * 0.25;
  }
}

export function makeManta() {
  const right = [[0, 0.5], [0.3, 0.42], [0.8, 0.2], [1.3, -0.05], [0.9, -0.12], [0.45, -0.32], [0.15, -0.5], [0, -0.52]];
  const outline = [...right, ...right.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
  const Tp = C('#20262b'), Wp = C('#cfd6da'), Be = C('#f2f4f5');
  const layer = (y0, top) => fin(outline, (u, v) => [u, y0 * (1 - Math.abs(u) / 1.35), v], (c, u, v) => {
    if (top) { c.copy(Tp); if (v > -0.08 && v < 0.24 && Math.abs(u) > 0.24 && Math.abs(u) < 0.62) c.lerp(Wp, 0.75); }
    else { c.copy(Be); if (Math.abs(u) > 1.0) c.lerp(Tp, 0.6); if (fbm(u * 8, v * 8, 2) > 0.68) c.lerp(Tp, 0.5); }
  }, { lines: true, segs: 3 });
  const g = [layer(0.05, true), layer(-0.05, false)];
  const bd = new THREE.SphereGeometry(1, 20, 12); paint(bd, (c, q) => c.lerpColors(Be, Tp, sm(-0.15, 0.1, q.y))); bd.scale(0.3, 0.1, 0.46); g.push(bd);
  for (const sd of [-1, 1]) g.push(cone(0.045, 0.22, '#20262b', [sd * 0.2, 0, 0.42], [sd * 0.15, -0.1, 1], 6));
  g.push(tube([[0, 0, -0.45], [0, 0.02, -0.8], [0, 0.05, -1.2]], 0.015, '#20262b', 10));
  g.push(...eyes(0.27, 0.01, 0.42, 0.03, { fwd: 0.3, white: '#2a3036' }));
  const m = new THREE.Mesh(merge(g), stdMat({ roughness: 0.6, side: THREE.DoubleSide }, { swim: { amp: 0.22, freq: 1.6, k: 0.9, mode: 2 }, rim: '#1d4d66' }));
  m.scale.setScalar(1.6); return m;
}

export function makeJelly(hex = '#ffb3d9', glow = 0.35) {
  const g = [];
  const bell = new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); bell.scale(1, 0.75, 1);
  paint(bell, (c, q) => { c.set(hex); if (Math.sin(Math.atan2(q.x, q.z) * 8) > 0.6) c.multiplyScalar(0.8); });
  g.push(bell);
  const r = rng(3);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; g.push(tube([[Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], [Math.cos(a) * 0.09, -0.25, Math.sin(a) * 0.09], [Math.cos(a) * 0.04, -0.5, Math.sin(a) * 0.06], [Math.cos(a) * 0.08, -0.75, Math.sin(a) * 0.03]], 0.022, hex, 16)); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, x = Math.cos(a) * 0.26, z = Math.sin(a) * 0.26, len = 0.9 + r() * 0.5; g.push(tube([[x, -0.02, z], [x * 0.9, -len * 0.4, z * 0.9], [x * 0.8, -len, z * 0.8]], 0.005, hex, 10)); }
  const col = C(hex);
  const mat = stdMat({ transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, roughness: 0.25, emissive: col.clone().multiplyScalar(glow) }, { swim: { amp: 0.14, freq: 2.4, k: 1.6, head: 0.21, len: 0.24, mode: 3 }, rim: col.clone().multiplyScalar(0.6).getHex(), caustics: false });
  return new THREE.Mesh(merge(g), mat);
}

export function makeSeahorse() {
  const pts = [[0, 0.2, 0.0], [0, 0.16, -0.035], [0, 0.08, -0.05], [0, 0.0, -0.035], [0, -0.07, 0.0], [0, -0.12, 0.0], [0, -0.17, -0.02], [0, -0.19, -0.05], [0, -0.17, -0.075], [0, -0.14, -0.065], [0, -0.145, -0.045]];
  const Y = C('#f6b51e'), Yd = C('#cf8a12');
  const g = [tube(pts, 0.045, (c, q) => { c.copy(Y); if (Math.sin(q.y * 140) > 0.7) c.copy(Yd); }, 48, s => s < 0.12 ? 0.75 + s * 2 : s < 0.4 ? 1.0 : Math.max(0.12, 1 - (s - 0.4) * 1.5))];
  g.push(tube([[0, 0.185, 0.0], [0, 0.18, 0.05], [0, 0.17, 0.1]], 0.012, '#e6a417', 8));
  const crown = new THREE.SphereGeometry(0.02, 8, 6); crown.translate(0, 0.24, -0.02); g.push(solid(crown, '#e6a417'));
  g.push(fin([[0.0, 0.0], [-0.03, 0.03], [-0.05, 0.0], [-0.03, -0.04]], (u, v) => [0, v + 0.02, -0.07 + u], edge(C('#ffe08a'), C('#ffe08a'), () => false)));
  g.push(...eyes(0.03, 0.19, 0.01, 0.014, { fwd: 0.5 }));
  return new THREE.Mesh(merge(g), stdMat({ roughness: 0.5, side: THREE.DoubleSide }, { rim: '#1d4d66' }));
}

export function makeAngler(own = false) {
  const s = speciesGeo('angler'), g = new THREE.Group();
  g.add(new THREE.Mesh(s.geo, speciesMat('angler', own)));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: '#d6fff4' })); bulb.position.copy(s.lure); g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#7fffe0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(0.9); glow.position.copy(s.lure); g.add(glow);
  g.scale.setScalar(1.6); return g;
}

export function makeSquid() {
  const g = new THREE.Group();
  const L = 4.2, R = 0.55;
  const prof = t => t < 0.08 ? R * Math.sqrt(t / 0.08) * 0.9 : R * (0.9 + 0.1 * sm(0.08, 0.3, t)) * (1 - Math.pow(Math.max(0, t - 0.3) / 0.7, 1.3) * 0.95);
  const Rd = C('#c5462f'), Lt = C('#ee8a6a');
  const mantle = paintBody(body(L, prof, 1, 1, 50, 22), (c, t, up, s, q) => { c.copy(Rd); if (Math.sin(t * 60) * Math.sin(q.u * Math.PI * 20) > 0.6) c.copy(Lt); });
  mantle.translate(0, 0, -L / 2);
  const finG = fin([[0, 0], [0.2, 0.7], [-0.5, 0.75], [-0.9, 0]], (u, v) => [v, 0, -L + 0.9 + u], edge(Rd, Rd, () => false));
  const finG2 = fin([[0, 0], [0.2, -0.7], [-0.5, -0.75], [-0.9, 0]], (u, v) => [v, 0, -L + 0.9 + u], edge(Rd, Rd, () => false));
  const head = new THREE.SphereGeometry(1, 20, 14); head.scale(0.48, 0.42, 0.55); head.translate(0, 0, 0.25); solid(head, '#c84a32');
  const parts = [mantle, finG, finG2, head, ...eyes(0.4, 0.05, 0.35, 0.2, { fwd: 0.2, white: '#f4e9dc', pupil: 0.6 })];
  g.add(new THREE.Mesh(merge(parts), stdMat({ roughness: 0.5, side: THREE.DoubleSide }, { rim: '#4a1d14', swim: { amp: 0.15, freq: 1.2, k: 0.6, head: -1.0, len: 3.2 } })));
  const arms = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, long = i === 2 || i === 7, len = long ? 6 : 3.2, x0 = Math.cos(a) * 0.3, y0 = Math.sin(a) * 0.26;
    arms.push(tube([[x0, y0, 0.6], [x0 * 1.4, y0 * 1.4, 0.6 + len * 0.35], [x0 * 1.1 + 0.1, y0 * 1.6, 0.6 + len * 0.7], [x0 * 0.8, y0 * 1.2, 0.6 + len]], 0.07, (c, q) => c.copy(Math.sin(q.z * 12) > 0.6 ? Lt : Rd), 30, s => long ? (s < 0.8 ? 0.6 : 1.3) : 1 - s * 0.85));
  }
  g.add(new THREE.Mesh(merge(arms), stdMat({ roughness: 0.5, side: THREE.DoubleSide }, { swim: { amp: 0.35, freq: 1.6, k: 0.8, head: 0.5, len: -3.5 }, rim: '#4a1d14' })));
  return g;
}

/* ---------------- option A: trash, ghost net, Gunk Bot ---------------- */
let _glow;
export function glowTex() { return _glow || (_glow = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']], 64)); }

export function makeTrash(kind) {
  const g = new THREE.Group(); let r = 0.3;
  if (kind === 'can') {
    const c = new THREE.CylinderGeometry(0.11, 0.11, 0.36, 18, 6);
    paint(c, (col, q) => { col.set(Math.abs(q.y) > 0.15 ? '#c9cdd1' : '#d62f2f'); if (Math.abs(q.y - Math.sin(Math.atan2(q.x, q.z) * 2) * 0.05) < 0.02) col.set('#ffffff'); });
    g.add(new THREE.Mesh(c, stdMat({ roughness: 0.35, metalness: 0.4 }))); g.rotation.set(0.9, 0.3, 0.5); r = 0.3;
  } else if (kind === 'bottle') {
    const pts = []; for (let i = 0; i <= 16; i++) { const y = -0.22 + i * 0.03; const rr = y < 0.12 ? 0.1 : y < 0.2 ? 0.1 - (y - 0.12) * 0.8 : 0.035; pts.push(new V2(rr, y)); }
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide })));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), new THREE.MeshStandardMaterial({ color: '#2f7de1' })); cap.position.y = 0.27; g.add(cap);
    g.rotation.set(1.2, 0, 0.7); r = 0.32;
  } else {
    const b = new THREE.SphereGeometry(0.28, 14, 10); const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + fbm(x * 7 + 2, z * 7 + y * 5, 2) * 0.6; p.setXYZ(i, x * k, y * k * 1.2, z * k * 0.8); }
    b.computeVertexNormals();
    g.add(new THREE.Mesh(b, new THREE.MeshStandardMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.6, roughness: 0.4, side: THREE.DoubleSide })));
    for (const sd of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.6 })); h.position.set(sd * 0.08, 0.3, 0); g.add(h); }
    r = 0.38;
  }
  g.userData.r = r; return g;
}

export function makeNet() {
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#fff'; x.lineWidth = 6;
    for (let i = -1; i <= 9; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(256, i * 32 + 16); x.stroke(); x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 - 16, 256); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t; })();
  const geo = new THREE.PlaneGeometry(5, 3.4, 20, 14); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 1.3) * 0.25 + Math.cos(y * 1.7 + x) * 0.2 - (1.7 - y) * 0.15); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ alphaMap: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: '#4f8f7c', transparent: true });
  const g = new THREE.Group(); const net = new THREE.Mesh(geo, mat); g.add(net);
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff8a2a', roughness: 0.5 })); f.position.set(-2.4 + i * 0.8, 1.72, Math.sin(i) * 0.15); g.add(f); }
  g.userData.net = net; return g;
}

export function makeGunkBot() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#d6ad3f', roughness: 0.5, metalness: 0.25, emissive: '#3a2a08' });
  const dark = new THREE.MeshStandardMaterial({ color: '#6a5634', roughness: 0.6, metalness: 0.3 });
  const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), metal); bodyM.scale.set(1, 0.8, 1.15); g.add(bodyM);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const rv = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), dark); rv.position.set(Math.cos(a) * 0.5, -0.05, Math.sin(a) * 0.57); g.add(rv); }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.45, roughness: 0.05 }));
  dome.position.set(0, 0.28, 0.12); g.add(dome);
  for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })); w.position.set(sd * 0.12, 0.38, 0.28); g.add(w);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#111' })); pu.position.set(sd * 0.12 + sd * 0.02, 0.36 + (sd > 0 ? 0.03 : -0.02), 0.38); g.add(pu);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), dark); arm.rotation.z = sd * 1.1; arm.position.set(sd * 0.6, -0.1, 0.15); g.add(arm);
    const claw = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: '#d9822b', roughness: 0.5, metalness: 0.3 })); claw.position.set(sd * 0.82, -0.2, 0.25); claw.rotation.set(Math.PI / 2, 0, sd * 0.6); g.add(claw);
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 10), dark); stack.position.set(0.18, 0.5, -0.32); stack.rotation.x = -0.4; g.add(stack);
  const prop = new THREE.Group(); prop.position.set(0, 0, -0.62);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.02), new THREE.MeshStandardMaterial({ color: '#d9822b' })); b.rotation.z = i * Math.PI * 2 / 3; b.position.set(Math.sin(i * 2.09) * 0.14, Math.cos(i * 2.09) * 0.14, 0); prop.add(b); }
  g.add(prop); g.userData.prop = prop; g.userData.stack = stack;
  g.userData.r = 0.75; return g;
}

// one portrait object per Fish Guide id (fresh copy, used in the guide and the card window)
export function portraitOf(id) {
  if (id === 'pip') return makePip().group;
  if (id === 'turtle') return makeTurtle();
  if (id === 'manta') { const m = makeManta(); m.scale.setScalar(0.5); return m; }
  if (id === 'jelly') return makeJelly('#ff9fd0', 0.25);
  if (id === 'seahorse') { const s = makeSeahorse(); s.scale.setScalar(4); return s; }
  if (id === 'angler') return makeAngler();
  if (id === 'squid') { const s = makeSquid(); s.scale.setScalar(0.25); return s; }
  if (B[id]) return makeFish(id);
  return null;
}
