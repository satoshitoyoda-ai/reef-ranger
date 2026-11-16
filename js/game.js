// Reef Ranger v1: Pip the shark pup swims through the ocean like a little plane.
// One game: bubbles clean up trash, ghost nets and Gunk Bots; the same bubbles put grumpy fish and bosses
// to sleep; Ranger Ray's photo requests are optional side quests that fill the Fish Guide. No fail state.
// Test-only URL helpers (normal play never uses them): ?screen=title|map|play|guide &place=reef|kelp|deep
//   &player=easy|free &t=SECONDS (fast-forward) &auto (auto-play) &card=ID &mute &sw (service worker on localhost)
import * as THREE from 'three';
import { U } from './shade.js';
import { Ocean, BIOMES, Bubbles, LEN } from './ocean.js';
import * as K from './critters.js';
import { SPECIES, KIND, PLACES, FUN } from './data.js';
import { clamp, rnd, pick, damp, sm } from './u.js';
import { sfx, say, ambience, unlock, setMuted, setVoice, setSilent } from './audio.js';
import * as SV from './save.js';

export const VERSION = 'v1.0.0';
const V3 = THREE.Vector3;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DATA = SV.load();
const ORDER = ['reef', 'kelp', 'deep'];
const S = {
  screen: Q.get('screen') || 'title', biome: Q.get('place') || DATA.settings.lastPlace, player: Q.get('player') || DATA.settings.last,
  auto: Q.has('auto'), ff: +(Q.get('t') || 0), card: Q.get('card'), nosave: Q.has('t') || Q.has('auto') || Q.has('card'),
  paused: false, portrait: false, scenic: true,
};
if (!['title', 'map', 'play', 'guide'].includes(S.screen)) S.screen = 'title';
if (!ORDER.includes(S.biome)) S.biome = 'reef';
if (!SV.PLAYERS.includes(S.player)) S.player = 'easy';
const SPEC = Object.fromEntries(SPECIES.map(s => [s.id, s]));
const easy = () => S.player === 'easy';
const article = name => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name.toLowerCase();
const INTRO = {
  reef: 'Pip! The reef is full of trash. Blow bubbles to float it away!',
  kelp: 'Pip! Trash is stuck in the kelp forest. Bubble it away!',
  deep: "Pip! Even the deep sea has trash. Your head-lamp will help. Bubble it away!",
};

/* ---------------- swimmer, progress, settings ---------------- */
let PL = null, found = new Set(['pip']), stars = 0, photos = {};
function setPlayer(p) {
  S.player = p; document.body.dataset.player = p; DATA.settings.last = p;
  PL = DATA.players[p]; found = new Set(PL.found); stars = PL.stars; photos = SV.loadPhotos(p);
  $('#stars b').textContent = stars;
}
let dirty = false;
function persist(now) {
  PL.found = [...found]; PL.stars = stars;
  if (S.nosave) return;
  dirty = true; if (now) flush();
}
function flush() { if (dirty && !S.nosave) { dirty = false; SV.save(DATA); } }
setInterval(flush, 2000);
addEventListener('pagehide', flush);
function applySettings() { setSilent(Q.has('mute')); setMuted(!DATA.settings.sound); setVoice(DATA.settings.voice); }
const swimmerName = p => DATA.settings.names[p] || (p === 'easy' ? 'Easy swim' : 'Free swim');

/* ---------------- renderer, scene, camera ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 700);
function onResize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  S.portrait = innerHeight > innerWidth * 1.05; $('#rotate').classList.toggle('on', S.portrait);
  if (S.portrait) pause(true);
  if (!thumbsDone && makeThumbs()) { if (S.screen === 'map') buildMap(); if (S.screen === 'guide') buildGuide(guideSel); }
}
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 200));

const bubbles = new Bubbles(scene, 900);
const pip = K.makePip(); pip.group.rotation.order = 'YXZ'; scene.add(pip.group);
const lamp = new THREE.SpotLight('#d8ecff', 0, 45, 0.6, 0.55, 1.1); lamp.position.set(0, 0.35, -0.7); pip.group.add(lamp, lamp.target); lamp.target.position.set(0, -1.5, -14);
const pipGlow = new THREE.PointLight('#9fd4ff', 0, 6, 1.5); pipGlow.position.set(0, 1.2, 1.5); pip.group.add(pipGlow);

const bubbleMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime },
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    vec3 ir = 0.5 + 0.5*cos(6.2831*(f*1.3 + vec3(0.0,0.33,0.67) + uTime*0.15)); vec3 c = mix(vec3(0.85,0.97,1.0), ir, 0.45);
    float a = 0.06 + pow(f, 2.2)*0.85; float hl = pow(max(dot(normalize(vN), normalize(vec3(-0.4,0.6,0.7))),0.0), 40.0);
    gl_FragColor = vec4(c + hl, a + hl); }`,
  transparent: true, depthWrite: false,
});
const sleepyMat = bubbleMat.clone(); sleepyMat.uniforms = { uTime: U.uTime };
sleepyMat.fragmentShader = bubbleMat.fragmentShader.replace('vec3(0.85,0.97,1.0)', 'vec3(0.84,0.76,1.0)');
const sphereG = new THREE.SphereGeometry(1, 20, 14);

/* ---------------- portraits (Fish Guide cards and the pop-up card window) ---------------- */
const pScene = new THREE.Scene(); pScene.background = new THREE.Color('#cfeefc');
pScene.add(new THREE.HemisphereLight('#ffffff', '#4f93ad', 1.7)); { const l = new THREE.DirectionalLight('#ffffff', 1.8); l.position.set(2, 4, 5); pScene.add(l); }
const pCam = new THREE.PerspectiveCamera(30, 1.4, 0.01, 200);
const PORT = {};
function portrait(id) {
  if (id in PORT) return PORT[id];
  const o = K.portraitOf(id); if (!o) return (PORT[id] = null);
  if (id === 'pip') o.rotation.y = Math.PI;
  const inner = new THREE.Group(); inner.add(o); const wrap = new THREE.Group(); wrap.add(inner);
  const box = new THREE.Box3().setFromObject(wrap), c = box.getCenter(new V3()), s = box.getSize(new V3());
  inner.position.sub(c);
  return (PORT[id] = { id, obj: wrap, size: Math.max(s.x, s.y, s.z) });
}
const PVIEW = { turtle: 0.95, manta: 1.15, jelly: 0.15, squid: 0.5, angler: 0.3 };
function renderPortrait(p, x, y, w, h, spin) {
  pScene.add(p.obj); p.obj.rotation.y = -1.05 + spin;
  pCam.aspect = w / h; pCam.updateProjectionMatrix();
  const d = p.size * 0.62 / Math.tan(THREE.MathUtils.degToRad(15)) / Math.min(1, pCam.aspect * 0.9);
  const el = PVIEW[p.id] ?? 0.18; pCam.position.set(0, d * el * 0.8, d * (1 - el * 0.25)); pCam.lookAt(0, 0, 0);
  const H = renderer.domElement.clientHeight, W = renderer.domElement.clientWidth;
  renderer.setViewport(x, H - y - h, w, h); renderer.setScissor(x, H - y - h, w, h); renderer.setScissorTest(true);
  renderer.render(pScene, pCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
  pScene.remove(p.obj);
}
const THUMB = {}, SIL = {};
let thumbsDone = false;
// Thumbnails are drawn once from the live canvas, so they wait until the page has a real size.
function makeThumbs() {
  const w = 220, h = 160, pr = renderer.getPixelRatio();
  if (thumbsDone || renderer.domElement.width < w * pr || renderer.domElement.height < h * pr) return false;
  thumbsDone = true;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  for (const s of SPECIES) {
    const p = portrait(s.id); if (!p) continue;
    renderPortrait(p, 0, 0, w, h, 0);
    g.clearRect(0, 0, w, h); g.drawImage(renderer.domElement, 0, 0, w * pr, h * pr, 0, 0, w, h); THUMB[s.id] = c.toDataURL('image/jpeg', 0.85);
    // silhouette for "not found yet": key out the background colour
    const im = g.getImageData(0, 0, w, h), d = im.data, br = d[0], bg = d[1], bb = d[2];
    for (let i = 0; i < d.length; i += 4) { const k = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb); if (k < 40) d[i + 3] = 0; else { d[i] = 43; d[i + 1] = 74; d[i + 2] = 92; d[i + 3] = 200; } }
    g.putImageData(im, 0, 0); SIL[s.id] = c.toDataURL('image/png');
  }
  return true;
}

/* ---------------- level state ---------------- */
let ocean = null, actors = [], shots = [];
const P = { pos: new V3(), heading: 0, pitch: 0, roll: 0, yawRate: 0, speed: 0, boost: 0, boostCd: 0, wob: 0, z0: 10 };
const T = {};
const input = { stick: { x: 0, y: 0 }, bias: { x: 0, y: 0 }, aim: null, firing: false, fireT: 0, keys: {} };
let shotCd = 0, snapCd = 0, pendingPhoto = null;

function add(obj, o = {}) { if (!obj.parent) scene.add(obj); const a = Object.assign({ obj, alive: true, r: 1, hp: 1, t0: Math.random() * 10, target: false, p: obj.position }, o); actors.push(a); return a; }
function kill(a) { a.alive = false; a.target = false; if (a.obj.parent) a.obj.parent.remove(a.obj); }
function lanePos(z, dx, h) { const x = ocean.pathX(z) + dx; return new V3(x, ocean.ground(x, z) + h, z); }
const _v = new V3(), _w = new V3();

function clearLevel() {
  for (const a of actors) if (a.obj.parent) a.obj.parent.remove(a.obj);
  for (const s of shots) scene.remove(s.m);
  actors = []; shots = []; if (ocean) ocean.dispose(); ocean = null;
}
function setupLevel(biome, scenic) {
  clearLevel(); S.biome = biome; S.scenic = scenic; ocean = new Ocean(scene, biome);
  Object.assign(T, { t: 0, prog: 0, ended: false, boss: null, bossOn: false, request: null, reqList: [], reqT: 15, reqAge: 0,
    trash: 0, naps: 0, photos: 0, freed: 0, stars: 0, autoT: 0, autoSnapT: 3, bubT: 0, said: {} });
  P.z0 = 10; P.pos.set(ocean.pathX(10), ocean.ground(ocean.pathX(10), 10) + 4.5, 10); P.heading = 0; P.pitch = 0; P.roll = 0; P.speed = 4; P.boost = 0; P.yawRate = 0;
  input.bias.x = input.bias.y = 0; input.firing = false;
  const deep = biome === 'deep'; lamp.intensity = deep ? 120 : 0; pipGlow.intensity = deep ? 3 : 0;
  populate(biome, scenic);
}

/* ---------------- friendly sea life ---------------- */
function orbiter(obj, sp, anchor, R, spd, o = {}) {
  obj.position.copy(anchor);
  return add(obj, Object.assign({ sp, kind: 'fish', anchor: anchor.clone(), R, w: spd / R * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.28, bob: 0.35,
    r: o.r ?? Math.max(0.6, (obj.userData.len || 0.5) * 0.7 * obj.scale.x),
    orbit(a, out, t) { out.set(this.anchor.x + Math.cos(a) * this.R, this.anchor.y + Math.sin(t * 0.4 + this.ph) * this.bob, this.anchor.z + Math.sin(a) * this.R * 0.8); },
    update(dt, t) { const a = t * this.w + this.ph; this.orbit(a, this.obj.position, t); this.orbit(a + 0.06 * Math.sign(this.w), _v, t + 0.06); this.obj.lookAt(_v); if (this.extra) this.extra(dt, t); },
  }, o));
}
function school(id, n, center, R) {
  const im = K.makeSchool(id, n), offs = [];
  for (let k = 0; k < n; k++) offs.push(new V3(rnd(-1, 1), rnd(-0.45, 0.45), rnd(-1, 1)).multiplyScalar(R));
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new V3(1, 1, 1), pp = new V3();
  const a = add(im, { sp: id, kind: 'school', r: R * 0.8, anchor: center.clone(), c: center.clone(), ph: Math.random() * 6.28, offs,
    update(dt, t) {
      const ang = t * 0.16 + this.ph; this.c.set(this.anchor.x + Math.cos(ang) * 6, this.anchor.y + Math.sin(t * 0.3 + this.ph) * 0.8, this.anchor.z + Math.sin(ang) * 5);
      const yaw = Math.atan2(-Math.sin(ang) * 6, Math.cos(ang) * 5);
      for (let i = 0; i < n; i++) {
        const o = this.offs[i]; pp.set(this.c.x + o.x + Math.sin(t * 1.1 + i) * 0.25, this.c.y + o.y + Math.sin(t * 1.7 + i * 2) * 0.12, this.c.z + o.z + Math.cos(t * 0.9 + i) * 0.25);
        e.set(Math.sin(t + i) * 0.08, yaw + Math.sin(t * 0.7 + i * 1.7) * 0.18, 0); q.setFromEuler(e); M.compose(pp, q, one); im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
    } });
  a.p = a.c; return a;
}
function populate(biome, scenic) {
  const L = -LEN;
  const zs = (n, a = -30, b = L + 40) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + Math.random() * 0.8) / n);
  if (biome === 'reef') {
    for (const z of zs(5)) school('chromis', 60, lanePos(z, rnd(-7, 7), rnd(3, 6)), 3.2);
    for (const z of zs(3, -70)) school('tang', 20, lanePos(z, rnd(-6, 6), rnd(2.5, 5)), 2.4);
    for (const p of ocean.anemones) for (let k = 0; k < 2; k++) { const f = orbiter(K.makeFish('clown'), 'clown', new V3(p[0], p[1] + 0.7, p[2]), 0.55, 0.35); f.bob = 0.12; f.r = 0.7; }
    for (const z of zs(8)) orbiter(K.makeFish('parrot'), 'parrot', lanePos(z, rnd(-7, 7), rnd(1.5, 3.5)), rnd(2, 4), 0.9);
    for (const z of zs(6)) { const f = K.makeFish('puffer'); f.scale.setScalar(1.3); orbiter(f, 'puffer', lanePos(z, rnd(-6, 6), rnd(1.5, 3)), 1.2, 0.3); }
    for (const z of zs(5)) { const f = K.makeFish('lion'); f.scale.setScalar(1.4); orbiter(f, 'lion', lanePos(z, rnd(-7, 7), rnd(1.2, 2.5)), 0.7, 0.18); }
    for (const z of zs(4)) { const s = K.makeSeahorse(); s.scale.setScalar(2.6); const p = lanePos(z, rnd(-5, 5), 1.0);
      add(s, { sp: 'seahorse', kind: 'fish', r: 0.8, home: p, update(dt, t) { this.obj.position.set(this.home.x, this.home.y + Math.sin(t * 0.8 + this.t0) * 0.25, this.home.z); this.obj.rotation.y = Math.sin(t * 0.3 + this.t0) * 0.8 + 1.2; } }); s.position.copy(p); }
    for (const z of zs(2, -60)) { const tu = K.makeTurtle(); tu.scale.setScalar(1.3); orbiter(tu, 'turtle', lanePos(z, rnd(-5, 5), rnd(3.5, 5)), 5, 1.0, { r: 1.0, extra(dt, t) { K.animTurtle(this.obj, t, this.ph); } }); }
    orbiter(K.makeManta(), 'manta', lanePos(-290, 0, 8), 14, 2.4, { r: 2.4, bob: 1 });
    orbiter(K.makeFish('whale'), 'whale', lanePos(-430, 10, 6), 18, 1.6, { r: 3.5 });
    orbiter(K.makeFish('hammer'), 'hammer', lanePos(-200, -8, 5), 10, 2.2, { r: 1.6 });
    if (scenic) for (const z of zs(2, -120)) orbiter(K.makeFish('barracuda'), 'barracuda', lanePos(z, rnd(-14, 14), rnd(4, 7)), 8, 2.2, { r: 1.2 });
    for (const z of zs(3, -60)) morayAt(z, Math.random() < 0.5 ? -1 : 1, !scenic);
  } else if (biome === 'kelp') {
    for (const z of zs(12)) orbiter(K.makeFish('garibaldi'), 'garibaldi', lanePos(z, rnd(-6, 6), rnd(1.5, 4)), rnd(1.5, 3), 0.6);
    for (const z of zs(4)) school('chromis', 50, lanePos(z, rnd(-7, 7), rnd(5, 10)), 3.5);
    for (const z of zs(2, -100)) orbiter(K.makeFish('dolphin'), 'dolphin', new V3(ocean.pathX(z) + rnd(-6, 6), ocean.E.surfY - 5, z), 12, 4, { r: 1.6, bob: 1.2 });
    for (const z of zs(8)) jellyAt(lanePos(z, rnd(-8, 8), rnd(6, 12)), '#f3e9ff', 0.25);
    if (scenic) for (const z of zs(2, -120)) orbiter(K.makeFish('barracuda'), 'barracuda', lanePos(z, rnd(-12, 12), rnd(4, 7)), 8, 2.2, { r: 1.2 });
    for (const z of zs(3, -60)) morayAt(z, Math.random() < 0.5 ? -1 : 1, !scenic);
  } else {
    for (const z of zs(7)) { const a = K.makeAngler(); orbiter(a, 'angler', lanePos(z, rnd(-6, 6), rnd(1.5, 4)), 1.2, 0.3, { r: 0.9 }); }
    for (const z of zs(16)) jellyAt(lanePos(z, rnd(-9, 9), rnd(2, 9)), Math.random() < 0.5 ? '#7fe8ff' : '#c58bff', 0.9);
    if (scenic) { const sq = K.makeSquid(); orbiter(sq, 'squid', lanePos(-330, 16, 7), 10, 1.0, { r: 3.5 }); }
  }
  if (scenic) return;   // title, map and Fish Guide backgrounds: sea life only
  cleanup(biome);       // trash, ghost nets, Gunk Bots
  grumpies(biome);      // grumpy fish cross ahead, a boss waits at the end
  setupRequests();      // Ranger Ray's photo side quests
}
function jellyAt(p, hex, glow) {
  const j = K.makeJelly(hex, glow); j.scale.setScalar(1.4); j.position.copy(p);
  return add(j, { sp: 'jelly', kind: 'fish', r: 0.8, home: p.clone(), update(dt, t) { this.obj.position.set(this.home.x + Math.sin(t * 0.2 + this.t0) * 0.8, this.home.y + Math.sin(t * 0.5 + this.t0) * 1.0, this.home.z); if (this.obj.position.distanceTo(P.pos) < 1.6 && S.screen === 'play') bumpPip(); } });
}
function morayAt(z, side, grumpy) {
  const home = lanePos(z, side * rnd(4.5, 6.5), 0.35);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), new THREE.MeshStandardMaterial({ color: ocean.E.rock, roughness: 1, flatShading: true }));
  rock.position.copy(home).add(new V3(side * 0.6, 0.2, 0)); rock.scale.set(1.2, 0.9, 1.3); scene.add(rock); add(rock, { kind: 'deco', update() {} });
  const eel = K.makeFish('moray', grumpy); eel.position.copy(home);
  const face = new V3(-side, 0.15, 0.6).normalize();
  return add(eel, { sp: 'moray', kind: grumpy ? 'pred' : 'fish', r: 0.8, hp: easy() ? 2 : 3, home, face, out: 0,
    update(dt, t) {
      if (this.state === 'sleep') { this.out = damp(this.out, 0.25, 1, dt); napZ(this, dt); }
      else { const near = this.home.distanceTo(P.pos) < 16 || S.screen !== 'play'; this.out = damp(this.out, near ? 1 : 0.3, 2, dt); if (grumpy) this.target = near; }
      const snapK = this.state === 'sleep' ? 0 : Math.max(0, Math.sin(t * 2.2 + this.t0)) * 0.25;
      this.obj.position.copy(this.home).addScaledVector(this.face, (this.out - 0.6) * 0.9 + snapK);
      _v.copy(this.obj.position).add(this.face); this.obj.lookAt(_v);
    },
    hit() { this.hp--; sfx.pop(); if (this.hp <= 0) nap(this); },
  });
}

/* ---------------- clean-up: trash, ghost nets, Gunk Bots ---------------- */
function cleanup(biome) {
  for (let z = -30; z > -LEN + 30; z -= rnd(20, 30)) { const n = 2 + (Math.random() < 0.5 ? 1 : 0); for (let k = 0; k < n; k++) trash(lanePos(z + rnd(-4, 4), rnd(-6, 6), rnd(1.2, 5.5))); }
  ghostNet(-140, biome === 'kelp' ? 'garibaldi' : biome === 'deep' ? 'angler' : 'turtle');
  ghostNet(-365, biome === 'reef' ? 'parrot' : biome === 'kelp' ? 'garibaldi' : 'angler');
  for (const z of [-215, -400]) gunkBot(z);
}
function wrapBubble(a, k = 1.15) { const b = new THREE.Mesh(sphereG, bubbleMat); b.scale.setScalar(a.r * k / a.obj.scale.x); a.obj.add(b); }
function popAway(a) { bubbles.burst(a.p, 22, 3, 0.16); sfx.pop(); kill(a); }
function trash(pos, kind = pick(['can', 'bottle', 'bag'])) {
  const obj = K.makeTrash(kind); obj.scale.setScalar(1.6); obj.position.copy(pos);
  return add(obj, { kind: 'trash', target: true, r: obj.userData.r * 1.6 + 0.25, base: pos.clone(), vy: 0, sink: 0,
    update(dt, t) {
      if (this.wrapped) { this.vy = Math.min(this.vy + dt * 2, 3.2); this.obj.position.y += this.vy * dt; this.obj.position.x += Math.sin(t * 3 + this.t0) * 0.01; this.obj.rotation.y += dt; if (this.obj.position.y > ocean.E.surfY - 1.5 || T.t - this.wrapT > 5) popAway(this); return; }
      if (this.sink) this.base.y = Math.max(this.base.y - this.sink * dt, ocean.ground(this.base.x, this.base.z) + 0.8);
      this.obj.position.set(this.base.x, this.base.y + Math.sin(t * 0.9 + this.t0) * 0.25, this.base.z); this.obj.rotation.x += dt * 0.2; this.obj.rotation.y += dt * 0.15;
    },
    hit() { this.wrapped = true; this.target = false; this.wrapT = T.t; wrapBubble(this); addStars(1, this.p); sfx.pop(); T.trash++; },
  });
}
function ghostNet(z, who) {
  const pos = lanePos(z, rnd(-2.5, 2.5), 3.0), g = K.makeNet(); g.position.copy(pos);
  const inside = who === 'turtle' ? K.makeTurtle() : who === 'angler' ? K.makeAngler() : K.makeFish(who);
  inside.scale.setScalar(who === 'turtle' ? 1.3 : who === 'angler' ? 1.6 : 2.0); inside.position.copy(pos).add(new V3(0.3, -0.3, -0.8)); inside.rotation.y = 0.9;
  const fishA = add(inside, { sp: who, kind: 'fish', noScan: true, r: 1,
    update(dt, t) {
      if (this.obj.userData.flippers) K.animTurtle(this.obj, t * (this.free ? 1.4 : 2.4), 0);
      if (!this.free) { this.obj.rotation.z = Math.sin(t * 2.5) * 0.1; return; }
      this.obj.position.addScaledVector(this.dir, dt * 3); _v.copy(this.obj.position).add(this.dir); this.obj.lookAt(_v);
      if (T.t - this.freeT > 9) kill(this);
    } });
  const max = easy() ? 3 : 5;
  return add(g, { kind: 'net', target: true, r: 2.4, hp: max, max,
    update(dt, t) {
      this.obj.rotation.x = Math.sin(t * 0.8) * 0.06; this.obj.rotation.z = Math.sin(t * 0.6) * 0.03 + (this.jig || 0) * Math.sin(t * 40) * 0.05; this.jig = Math.max(0, (this.jig || 0) - dt * 2);
      if (this.freeing) { this.obj.scale.multiplyScalar(1 - dt * 1.3); this.obj.position.y -= dt * 0.8; if (this.obj.scale.x < 0.08) kill(this); }
    },
    hit() {
      this.hp--; this.jig = 1; sfx.pop(); bubbles.burst(this.p, 10, 2, 0.12);
      this.obj.userData.net.material.opacity = 0.4 + 0.6 * this.hp / this.max;
      if (this.hp <= 0) {
        this.freeing = true; this.target = false; fishA.free = true; fishA.freeT = T.t; fishA.dir = new V3(Math.random() < 0.5 ? -1 : 1, 0.45, -0.4).normalize();
        T.freed++; addStars(3, this.p); discover(who, 'freed') || radio(`You freed the ${SPEC[who].name.toLowerCase()}! Great job, Pip!`);
      }
    } });
}
function gunkBot(trigZ) {
  const obj = K.makeGunkBot(); obj.visible = false; obj.position.set(0, -200, 0); obj.scale.setScalar(1.7);
  return add(obj, { kind: 'bot', r: 1.8, hp: easy() ? 2 : 4, trig: trigZ, state: 'wait', drop: 1.5, smoke: 0,
    update(dt, t) {
      const o = this.obj, ud = o.userData;
      if (this.state === 'wait') { if (P.pos.z < this.trig + 28 && S.screen === 'play') { this.state = 'on'; o.visible = true; this.target = true; this.ts = T.t; const z0 = P.pos.z - 30; o.position.copy(lanePos(z0, 6, 7)); radio('Uh-oh, a Gunk Bot! It is dumping trash. Bubble it!'); } return; }
      ud.prop.rotation.z += dt * 16;
      if (this.state === 'on') {
        const zz = P.pos.z - 15, x = ocean.pathX(zz) + Math.sin((T.t - this.ts) * 0.7) * 4.5, y = ocean.ground(x, zz) + 4.6 + Math.sin(T.t * 1.3) * 0.5;
        o.position.set(damp(o.position.x, x, 2, dt), damp(o.position.y, y, 2, dt), damp(o.position.z, zz, 3, dt)); o.lookAt(P.pos);
        if ((this.smoke -= dt) <= 0) { this.smoke = 0.12; ud.stack.getWorldPosition(_w); bubbles.emit(_w.x, _w.y + 0.2, _w.z, rnd(-0.2, 0.2), 0.6, rnd(-0.2, 0.2), 0.35, 1.6, 0x6b5a3a, 1); }
        if ((this.drop -= dt) <= 0) { this.drop = 2.6; const tr = trash(o.position.clone().add(new V3(0, -0.8, 0))); tr.sink = 0.5; }
        if (T.t - this.ts > 16 || T.bossOn) { this.state = 'leave'; this.target = false; }
      } else if (this.state === 'leave') { o.position.y += dt * 3; o.position.z -= dt * 6; if (o.position.y > ocean.E.surfY) kill(this); }
      else if (this.state === 'beaten') { o.rotation.y += dt * 7; o.position.y += dt * 2.2; if (o.position.y > ocean.E.surfY - 1 || T.t - this.bt > 5) popAway(this); }
      o.scale.setScalar(1.7 * (1 + (this.jig || 0) * 0.15 * Math.sin(T.t * 30))); this.jig = Math.max(0, (this.jig || 0) - dt * 3);
    },
    hit() { this.hp--; this.jig = 1; sfx.boing(); if (this.hp <= 0) { this.state = 'beaten'; this.bt = T.t; this.target = false; wrapBubble(this, 1.4); addStars(3, this.p); radio('Bye-bye, Gunk Bot! Pop!'); } },
  });
}

/* ---------------- grumpy fish and the boss: sleepy bubbles ---------------- */
function grumpies(biome) {
  for (let z = -90; z > -LEN * 0.78; z -= rnd(75, 95)) grumpy(z);
  T.boss = bossActor(biome);
}
function grumpy(z) {
  const deep = S.biome === 'deep', obj = deep ? K.makeAngler(true) : K.makeFish('barracuda', true); obj.visible = false; obj.position.set(0, -200, 0); if (!deep) obj.scale.setScalar(1.3);
  return add(obj, { sp: deep ? 'angler' : 'barracuda', kind: 'pred', r: deep ? 1.1 : 1.3, hp: easy() ? 2 : 3, trig: z, state: 'wait',
    update(dt, t) {
      const o = this.obj, p = o.position;
      if (this.state === 'wait') {
        if (P.pos.z < this.trig + 40 && S.screen === 'play' && !T.bossOn) {
          this.state = 'cross'; o.visible = true; this.target = true; this.side = Math.random() < 0.5 ? -1 : 1; p.copy(lanePos(this.trig, this.side * 14, rnd(3, 5.5))); this.v = new V3(-this.side * 3.4, 0, 1.2);
          if (!T.said.grumpy) { T.said.grumpy = true; radio(`Uh-oh, ${deep ? 'a grumpy anglerfish' : 'a grumpy barracuda'}! Sleepy bubbles help it take a nap.`); }
        }
        return;
      }
      if (this.state === 'cross') {
        p.addScaledVector(this.v, dt); _v.copy(p).add(this.v); o.lookAt(_v);
        if (p.distanceTo(P.pos) < 2.4 && !this.bumped) { this.bumped = true; bumpPip(); }
        if (Math.abs(p.x - ocean.pathX(p.z)) > 17 || p.z > P.pos.z + 6) { this.state = 'gone'; o.visible = false; this.target = false; }
      } else if (this.state === 'sleep') napZ(this, dt);
    },
    hit() { this.hp--; sfx.pop(); this.v.multiplyScalar(0.75); if (this.hp <= 0) nap(this); },
  });
}
function bossActor(biome) {
  const squid = biome === 'deep', obj = squid ? K.makeSquid() : K.makeFish('barracuda', true);
  obj.scale.setScalar(squid ? 1.15 : 2.4); obj.visible = false; obj.position.set(0, -200, 0);
  const max = easy() ? 8 : 12;
  return add(obj, { sp: squid ? 'squid' : 'barracuda', kind: 'boss', r: squid ? 2.6 : 2.2, hp: max, max, state: 'wait', ang: 0,
    update(dt, t) {
      const o = this.obj;
      // nobody fails: if the boss is not asleep after 45 s it gets tired and naps on its own
      if (this.state === 'on' && T.t - this.onT > 45) { this.hp = 0; nap(this, true); $('#bossbar').classList.remove('on'); this.sleepT0 = T.t; }
      if (this.state === 'wait') { if (T.prog > 0.84 && S.screen === 'play') { this.state = 'on'; this.onT = T.t; T.bossOn = true; o.visible = true; this.target = true; o.position.copy(P.pos).add(new V3(14, 3, -22)); $('#bossbar').classList.add('on'); $('#bossbar b').textContent = squid ? 'Giant squid is grumpy!' : 'Big Barracuda is grumpy!'; $('#bossbar i').style.width = '100%'; radio(squid ? 'Whoa, a giant squid! It needs a big nap. Lots of sleepy bubbles!' : 'The Big Barracuda is super grumpy. Lots of sleepy bubbles!'); } return; }
      if (this.state === 'on') {
        this.ang += dt * 0.5; const c = _w.copy(P.pos).add(new V3(0, 2.5, squid ? -20 : -17));
        const want = new V3(c.x + Math.cos(this.ang) * 8, c.y + Math.sin(this.ang * 1.7) * 1.5, c.z + Math.sin(this.ang) * 3);
        o.position.lerp(want, 1 - Math.exp(-1.5 * dt)); _v.copy(o.position).add(new V3(-Math.sin(this.ang), 0, Math.cos(this.ang))); o.lookAt(_v);
      } else if (this.state === 'sleep') { napZ(this, dt); if (T.t - this.sleepT0 > 3) T.bossOn = false; }
    },
    hit() { this.hp--; sfx.pop(); $('#bossbar i').style.width = (Math.max(0, this.hp) / this.max * 100) + '%'; if (this.hp <= 0) { nap(this, true); $('#bossbar').classList.remove('on'); this.sleepT0 = T.t; } },
  });
}
function nap(a, big) {
  a.state = 'sleep'; a.target = false; sfx.yawn(); addStars(big ? 6 : 2, a.p); T.naps++;
  slowSwim(a.obj, 0.12);
  if (a.sp) discover(a.sp, 'nap') || (big ? radio('Shhh... sweet dreams. You did it, Pip!') : null);
}
function slowSwim(obj, k) { obj.traverse(m => { const s = m.material && m.material.userData && m.material.userData.swim; if (s) { s.uSwim.value.x *= k; s.uSwim.value.y *= 0.4; } }); }
const zTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = 'bold 54px "Arial Rounded MT Bold", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#2b4f8f'; g.strokeText('Z', 32, 34); g.fillStyle = '#ffffff'; g.fillText('Z', 32, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const zMat = new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false });
function napZ(a, dt) {
  const o = a.obj, p = o.position, gy = ocean.ground(p.x, p.z) + 0.6 * o.scale.x;
  p.y = damp(p.y, gy, 0.5, dt); o.rotation.z = damp(o.rotation.z, 0.5, 1.2, dt);
  if ((a.zt = (a.zt || 0) - dt) <= 0) {
    a.zt = 0.8; const s = new THREE.Sprite(zMat.clone()); s.scale.setScalar(0.5 * Math.max(1, o.scale.x * 0.6)); s.position.copy(p).add(new V3(0, 0.8 * o.scale.x, 0));
    add(s, { kind: 'z', life: 2.4, update(dt2) { this.life -= dt2; this.obj.position.y += dt2 * 0.7; this.obj.position.x += Math.sin(this.life * 3) * 0.01; this.obj.material.opacity = Math.min(1, this.life); this.obj.scale.multiplyScalar(1 + dt2 * 0.25); if (this.life <= 0) { this.obj.material.dispose(); kill(this); } } });
  }
}

/* ---------------- Ranger Ray's photo requests (optional side quests) ---------------- */
function setupRequests() {
  const count = {};
  for (const a of actors) if (a.sp && !a.noScan && (a.kind === 'fish' || a.kind === 'school')) count[a.sp] = (count[a.sp] || 0) + (a.kind === 'school' ? 3 : 1);
  const ids = Object.keys(count).filter(id => count[id] >= 2 && id !== 'pip');
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  ids.sort((a, b) => (photos[a] ? 1 : 0) - (photos[b] ? 1 : 0));   // fish without a photo yet come first
  T.reqList = ids.slice(0, 3);
}
function nextRequest() {
  T.request = T.reqList.shift() || null; T.reqAge = 0;
  const r = $('#request');
  if (!T.request) return clearRequest();
  r.querySelector('img').src = THUMB[T.request] || ''; r.querySelector('b').textContent = SPEC[T.request].name;
  r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); $('#snapbtn').classList.add('ask');
  radio(`Can you snap a photo of ${article(SPEC[T.request].name)}? Tap the camera!`);
}
function clearRequest() { T.request = null; $('#request').classList.remove('on'); $('#snapbtn').classList.remove('ask'); }

/* ---------------- learning: cards, scans ---------------- */
let cardT = 0, cardId = null;
function discover(id, how) {
  if (found.has(id) || !SPEC[id]) return false;
  found.add(id); addStars(5, null); showCard(id, how); updateHud(true); persist(true); return true;
}
function showCard(id, how) {
  const s = SPEC[id], k = KIND[s.kind], c = $('#card');
  cardId = id; cardT = 6.5;
  c.querySelector('.new').textContent = how === 'freed' ? 'FREED! NEW FRIEND' : how === 'nap' ? 'NAPPING · NEW FRIEND' : how === 'photo' ? 'NEW PHOTO!' : 'NEW FRIEND!';
  c.querySelector('h3').textContent = s.name;
  const b = c.querySelector('.kind'); b.textContent = k.label; b.className = 'kind ' + k.cls;
  c.querySelector('p').textContent = s.fact;
  c.classList.add('on'); sfx.chime(); say(`${s.name}! ${s.fact}`);
}
function hideCard() { $('#card').classList.remove('on'); cardId = null; }
function scanCheck() {
  if (S.card) return;
  for (const a of actors) {
    if (!a.alive || !a.sp || a.noScan || a.kind === 'pred' || a.kind === 'boss' || found.has(a.sp) || !a.obj.visible) continue;
    if (a.p.distanceTo(P.pos) > 8.5 + a.r) continue;
    const s = project(a.p); if (s.z > 1 || s.x < 0 || s.x > innerWidth || s.y < 0 || s.y > innerHeight) continue;
    ping(s); discover(a.sp, 'scan'); return;
  }
}
function ping(s) { const r = $('#ping'); r.style.left = s.x + 'px'; r.style.top = s.y + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); }

/* ---------------- shooting and photos ---------------- */
const _p = new V3();
function project(v) { _p.copy(v).project(camera); return { x: (_p.x + 1) / 2 * innerWidth, y: (1 - _p.y) / 2 * innerHeight, z: _p.z }; }
const pxPerM = d => (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(d, 0.5);
function pickTarget(sx, sy, assist, filter) {
  let best = null, bd = 1e9;
  for (const a of actors) {
    if (!a.alive || !filter(a)) continue;
    const d3 = a.p.distanceTo(camera.position); if (d3 > 60 || d3 < 1) continue;
    const s = project(a.p); if (s.z > 1 || s.z < -1) continue;
    const d = Math.hypot(s.x - sx, s.y - sy) - a.r * pxPerM(d3); if (d < assist && d < bd) { bd = d; best = a; }
  }
  return best;
}
const assistPx = () => easy() ? 120 : 55;
function fire(sx, sy) {
  if (shotCd > 0 || T.ended) return; shotCd = 0.2;
  const tgt = pickTarget(sx, sy, assistPx(), a => a.target);
  const o = pip.group.localToWorld(pip.mouth.clone());
  let dir;
  if (tgt) dir = tgt.p.clone().sub(o).normalize();
  else { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), camera); dir = rc.ray.at(30, new V3()).sub(o).normalize(); }
  const sleepy = tgt && (tgt.kind === 'pred' || tgt.kind === 'boss');   // bubbles aimed at grumpy fish turn lavender
  const m = new THREE.Mesh(sphereG, sleepy ? sleepyMat : bubbleMat); m.scale.setScalar(sleepy ? 0.3 : 0.24); m.position.copy(o); scene.add(m);
  shots.push({ m, pos: o.clone(), vel: dir.multiplyScalar(24), tgt, life: 2.4, tint: sleepy ? 0xd8c8ff : 0xffffff });
  sfx.bloop(); P.puff = 1;
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    if (s.tgt && s.tgt.alive && s.tgt.target) { _v.copy(s.tgt.p).sub(s.pos).normalize().multiplyScalar(26); s.vel.lerp(_v, clamp(dt * 8, 0, 1)); }
    s.pos.addScaledVector(s.vel, dt); s.m.position.copy(s.pos);
    if (Math.random() < 0.7) bubbles.emit(s.pos.x, s.pos.y, s.pos.z, rnd(-0.3, 0.3), rnd(0, 0.4), rnd(-0.3, 0.3), 0.05 + Math.random() * 0.05, 0.6, s.tint);
    let hit = null;
    for (const a of actors) if (a.alive && a.target && a.p.distanceTo(s.pos) < a.r + 0.3) { hit = a; break; }
    const gnd = ocean.ground(s.pos.x, s.pos.z);
    if (hit || s.life <= 0 || s.pos.y < gnd + 0.15) {
      bubbles.burst(s.pos, 12, 2.2, 0.08, s.tint); scene.remove(s.m); shots.splice(i, 1);
      if (hit) hit.hit(); else sfx.pop();
    }
  }
}
const photoable = a => a.alive && a.sp && a.obj.visible && !(a.noScan && !a.free);   // not an animal still stuck in a net
function snap() {
  if (snapCd > 0 || T.ended || S.screen !== 'play') return; snapCd = 0.6; sfx.snap();
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  // Easy swim frames the middle of the screen with a wide helper; Free swim frames the crosshair ahead of Pip.
  const r = reticle(), sx = easy() ? innerWidth / 2 : r.x, sy = easy() ? innerHeight * 0.45 : r.y;
  const tg = (T.request && pickTarget(sx, sy, innerWidth * (easy() ? 0.45 : 0.25), a => photoable(a) && a.sp === T.request))
    || pickTarget(sx, sy, easy() ? innerWidth * 0.32 : 150, photoable);
  if (!tg) { toast('Oops, no fish in the photo!'); return; }
  const s = project(tg.p), px = tg.r * pxPerM(tg.p.distanceTo(camera.position)), st = px > 85 ? 3 : px > 42 ? 2 : 1;
  pendingPhoto = { x: s.x, y: s.y, size: px, stars: st, id: tg.sp };
  T.photos++; addStars(st, tg.p);
  const isNew = discover(tg.sp, 'photo');
  if (T.request === tg.sp) {
    addStars(3, tg.p); T.reqT = 7; clearRequest();
    if (!isNew) radio(`Great photo of the ${SPEC[tg.sp].name.toLowerCase()}! Thanks, Pip!`);
  } else if (!isNew) toast(`📷 ${SPEC[tg.sp].name}!`);
}
function capturePhoto(ph) {
  const pr = renderer.getPixelRatio(), s = clamp(ph.size * 2.8, 150, 380), c = document.createElement('canvas'); c.width = 200; c.height = 150;
  c.getContext('2d').drawImage(renderer.domElement, (ph.x - s * 0.666) * pr, (ph.y - s * 0.5) * pr, s * 1.333 * pr, s * pr, 0, 0, 200, 150);
  const img = c.toDataURL('image/jpeg', 0.72);
  const el = document.createElement('div'); el.className = 'polaroid'; el.innerHTML = `<img src="${img}"><span>${'★'.repeat(ph.stars)}<i>${'★'.repeat(3 - ph.stars)}</i></span>`;
  el.style.left = (innerWidth / 2 - 110) + 'px'; el.style.top = (innerHeight / 2 - 110) + 'px'; document.body.appendChild(el);
  requestAnimationFrame(() => setTimeout(() => { el.classList.add('fly'); }, 900));
  setTimeout(() => el.remove(), 2200);
  // keep the best photo of each animal for the Fish Guide
  const old = photos[ph.id];
  if (!old || ph.stars >= old.st) { photos[ph.id] = { img, st: ph.stars }; if (!S.nosave) SV.savePhotos(S.player, photos); }
}
function bumpPip() { if (P.wob > 0.3) return; P.wob = 1; P.speed *= 0.6; sfx.bump(); bubbles.burst(P.pos, 10, 2, 0.1); }

/* ---------------- HUD ---------------- */
function addStars(n, pos) {
  stars += n; T.stars += n; $('#stars b').textContent = stars; sfx.star(); persist();
  if (pos && S.screen === 'play') { const s = project(pos); if (s.z < 1) { const el = document.createElement('div'); el.className = 'plus'; el.textContent = `+${n} ★`; el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 1200); } }
}
let toastT = 0;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); toastT = 1.6; }
let radioT = 0;
function radio(text, speak = true) { const r = $('#radio'); r.querySelector('.txt').textContent = text; r.classList.add('on'); radioT = 4.5; if (speak && !cardId) say(text); }
function updateHud(force) {
  $('#guidebtn b').textContent = `${found.size}/${SPECIES.length}`;
  $('#prog i').style.width = (T.prog * 100) + '%'; $('#prog em').style.left = (T.prog * 100) + '%';
  if (force) { const g = $('#guidebtn'); g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); }
}

/* ---------------- input ---------------- */
const stage = $('#stage');
let stickId = null, aimId = null, stickO = { x: 0, y: 0 };
const playing = () => S.screen === 'play' && !T.ended && !S.paused && !S.portrait;
stage.addEventListener('pointerdown', e => {
  unlock();
  if (!playing()) return;
  ambience(true);
  if (!easy() && !S.auto && e.clientX < innerWidth * 0.42) { stickId = e.pointerId; stickO = { x: e.clientX, y: e.clientY }; const k = $('#stick'); k.style.left = (e.clientX - 70) + 'px'; k.style.top = (e.clientY - 70) + 'px'; k.classList.add('on'); return; }
  aimId = e.pointerId; input.aim = { x: e.clientX, y: e.clientY }; input.firing = true; input.fireT = 0.35; fire(e.clientX, e.clientY);
});
addEventListener('pointermove', e => {
  if (e.pointerId === stickId) { let dx = e.clientX - stickO.x, dy = e.clientY - stickO.y; const l = Math.hypot(dx, dy); if (l > 60) { dx *= 60 / l; dy *= 60 / l; } input.stick.x = dx / 60; input.stick.y = -dy / 60; $('#stick i').style.transform = `translate(${dx}px,${dy}px)`; }
  if (e.pointerId === aimId) input.aim = { x: e.clientX, y: e.clientY };
});
function releaseStick() { stickId = null; input.stick.x = input.stick.y = 0; $('#stick').classList.remove('on'); $('#stick i').style.transform = ''; }
const pointerEnd = e => {
  if (e.pointerId === stickId) releaseStick();
  if (e.pointerId === aimId || aimId === 'btn') { aimId = null; input.firing = false; }
};
addEventListener('pointerup', pointerEnd); addEventListener('pointercancel', pointerEnd);
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  input.keys[e.code] = true;
  if (!playing()) return;
  if (e.code === 'Space') { const r = reticle(); fire(r.x, r.y); }
  if (e.code.startsWith('Shift')) boost();
  if (e.code === 'KeyC') snap();
  if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
});
addEventListener('keyup', e => { input.keys[e.code] = false; });
function keySteer() { const k = input.keys; const x = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0), y = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0); return { x, y, any: x || y }; }
function boost() { if (P.boostCd > 0 || !playing()) return; P.boost = 1.4; P.boostCd = 3; sfx.zoom(); for (let i = 0; i < 20; i++) bubbles.emit(P.pos.x, P.pos.y, P.pos.z, rnd(-1, 1), rnd(-0.5, 1), rnd(1, 3), 0.1, 1); }
function reticle() { _v.set(-Math.sin(P.heading) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.heading) * Math.cos(P.pitch)).multiplyScalar(22).add(P.pos); return project(_v); }
const btn = (sel, fn) => { const el = $(sel); el.addEventListener('pointerdown', e => { e.stopPropagation(); unlock(); fn(e); }); };
btn('#firebtn', () => { if (!playing()) return; const r = reticle(); input.firing = true; input.fireT = 0.3; input.aim = { x: r.x, y: r.y, fromBtn: true }; fire(r.x, r.y); aimId = 'btn'; });
btn('#boostbtn', boost);
btn('#snapbtn', () => { if (playing()) snap(); });
btn('#guidebtn', () => go('guide'));
btn('#pausebtn', () => pause(true));
btn('#card', hideCard);

/* ---------------- pause ---------------- */
function pause(on) {
  if (S.screen !== 'play' || T.ended) return;
  if (on) { S.paused = true; input.firing = false; aimId = null; releaseStick(); ambience(false); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  $('#pausecard').classList.toggle('on', on);
}
function resume() { if (S.portrait) return; S.paused = false; $('#pausecard').classList.remove('on'); ambience(true); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { flush(); pause(true); ambience(false); } });

/* ---------------- screens ---------------- */
function go(screen, opts = {}) {
  hideCard(); $('#endcard').classList.remove('on'); $('#pausecard').classList.remove('on');
  if (screen === 'resume') { S.screen = 'play'; document.body.dataset.screen = 'play'; resume(); updateHud(); return; }
  if (screen === 'guide' && S.screen === 'play' && !T.ended) { S.paused = true; input.firing = false; releaseStick(); }
  else S.paused = false;
  S.screen = screen; document.body.dataset.screen = screen;
  if (screen === 'play') {
    if (opts.biome) S.biome = opts.biome;
    setupLevel(S.biome, false); DATA.settings.lastPlace = S.biome; persist(true);
    $('#lvl').textContent = BIOMES[S.biome].name;
    clearRequest(); $('#bossbar').classList.remove('on'); $('#radio').classList.remove('on');
    ambience(true);
  } else {
    if (!S.paused && (!ocean || ocean.id !== S.biome || !S.scenic)) setupLevel(S.biome, true);
    ambience(false);
  }
  if (screen === 'title') buildTitle();
  if (screen === 'guide') buildGuide(opts.sel || guideSel);
  if (screen === 'map') buildMap();
  updateHud();
}
function buildTitle() {
  for (const p of SV.PLAYERS) {
    const b = $(`#who-${p}`), pl = DATA.players[p];
    b.querySelector('b').textContent = swimmerName(p);
    b.querySelector('em').textContent = `★ ${pl.stars} · 🐠 ${pl.found.length}/${SPECIES.length}`;
  }
}
function buildMap() {
  const stops = [['reef', 'clown'], ['kelp', 'garibaldi'], ['open', 'whale'], ['deep', 'angler']];
  $('#mapwho').textContent = `${swimmerName(S.player)} · ★ ${stars} · 🐠 ${found.size}/${SPECIES.length}`;
  $('#stops').innerHTML = stops.map(([id, f], i) => {
    const p = PLACES[id], locked = id === 'open', n = SPECIES.filter(s => s.where === id && found.has(s.id)).length, tot = SPECIES.filter(s => s.where === id).length;
    const best = PL.best[id] ? ` · best ★${PL.best[id]}` : '';
    return `<button class="stop s${i} ${locked ? 'locked' : ''} ${id === S.biome ? 'here' : ''}" data-b="${id}"><span class="ph"><img src="${THUMB[f] || ''}"></span><b>${p.name}</b><small>${p.zone} · ${p.depth}</small><em>${locked ? 'Coming soon' : `Fish ${n}/${tot}${best}`}</em>${id === S.biome ? '<i class="pinpip"></i>' : ''}</button>`;
  }).join('');
  $$('#stops .stop').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); unlock(); if (b.classList.contains('locked')) return toast('Open Ocean is coming soon!'); go('play', { biome: b.dataset.b }); }));
}
let guideSel = 'pip';
function buildGuide(sel) {
  guideSel = sel;
  $('#ggrid').innerHTML = SPECIES.map(s => {
    const has = found.has(s.id), th = THUMB[s.id];
    return `<button class="gc ${has ? 'has' : 'not'} ${s.id === sel ? 'sel' : ''}" data-id="${s.id}">${th ? `<img src="${has ? th : SIL[s.id]}">` : '<span class="q">?</span>'}${has && photos[s.id] ? '<span class="cam">📷</span>' : ''}<b>${has ? s.name : '???'}</b></button>`;
  }).join('');
  $$('#ggrid .gc').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); unlock(); buildGuide(b.dataset.id); if (found.has(b.dataset.id)) say(`${SPEC[b.dataset.id].name}! ${SPEC[b.dataset.id].fact}`); }));
  const s = SPEC[sel], has = found.has(sel), k = KIND[s.kind];
  $('#gname').textContent = has ? s.name : 'Not found yet';
  const kb = $('#gkind'); kb.textContent = has ? k.label : '?'; kb.className = 'kind ' + (has ? k.cls : '');
  $('#gfact').textContent = has ? s.fact : (s.locked ? `Lives in the ${PLACES[s.where].name}. Coming in a later level!` : `Swim through the ${PLACES[s.where].name} to find this one.`);
  $('#gplace').textContent = `${PLACES[s.where].name} · ${PLACES[s.where].zone}`;
  $('#gcount').textContent = `${found.size} of ${SPECIES.length} found · ${swimmerName(S.player)}`;
  const ph = has && photos[sel], gp = $('#gphoto');
  gp.classList.toggle('on', !!ph);
  if (ph) { gp.querySelector('img').src = ph.img; gp.querySelector('span').innerHTML = `${'★'.repeat(ph.st)}<i>${'★'.repeat(3 - ph.st)}</i>`; }
}
const click = (sel, fn) => $(sel).addEventListener('click', e => { e.stopPropagation(); unlock(); fn(e); });
click('#gclose', () => go(S.paused ? 'resume' : 'map'));
$$('.who').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); unlock(); setPlayer(b.dataset.p); persist(true); go('map'); }));
click('#mapback', () => go('title'));
click('#mapguide', () => go('guide'));
click('#endnext', () => go('play', { biome: ORDER[(ORDER.indexOf(S.biome) + 1) % ORDER.length] }));
click('#endagain', () => go('play'));
click('#endguide', () => go('guide'));
click('#endmap', () => go('map'));
click('#presume', () => resume());
click('#pmap', () => go('map'));

/* ---------------- grown-ups menu (hold the gear for 2 seconds) ---------------- */
const gear = $('#gear'); let holdT = null, justOpened = false;
gear.addEventListener('pointerdown', e => { e.stopPropagation(); gear.classList.add('hold'); clearTimeout(holdT); holdT = setTimeout(() => { gear.classList.remove('hold'); justOpened = true; openGrown(); }, 2000); });
const cancelHold = () => { clearTimeout(holdT); gear.classList.remove('hold'); };
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(ev, cancelHold);
gear.addEventListener('click', e => { e.stopPropagation(); if (justOpened) { justOpened = false; return; } toast('Grown-ups: hold for 2 seconds'); });
function openGrown() {
  for (const t of $$('#grown .tog')) { const on = !!DATA.settings[t.dataset.set]; t.classList.toggle('on', on); t.textContent = on ? 'On' : 'Off'; }
  for (const p of SV.PLAYERS) $(`#name-${p}`).value = DATA.settings.names[p] || '';
  $('#ver').textContent = `Reef Ranger ${VERSION} · ${fps} fps · pixel ratio ${renderer.getPixelRatio()} · progress is saved on this device only`;
  $('#grown').classList.add('on');
}
$$('#grown .tog').forEach(t => t.addEventListener('click', e => { e.stopPropagation(); const k = t.dataset.set; DATA.settings[k] = !DATA.settings[k]; applySettings(); unlock(); persist(true); openGrown(); }));
for (const p of SV.PLAYERS) $(`#name-${p}`).addEventListener('input', e => { DATA.settings.names[p] = e.target.value.trim().slice(0, 12); persist(true); buildTitle(); });
$$('#grown [data-reset]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const p = b.dataset.reset;
  if (!confirm(`Start over for "${swimmerName(p)}"? This clears their fish, stars and photos on this iPad.`)) return;
  SV.resetPlayer(DATA, p); if (p === S.player) setPlayer(p); buildTitle(); toast('Done. Fresh start!');
}));
click('#grownclose', () => { $('#grown').classList.remove('on'); for (const i of $$('#grown input')) i.blur(); });

function endLevel() {
  T.ended = true; clearRequest(); input.firing = false; releaseStick();
  const e = $('#endcard'), place = BIOMES[S.biome].name;
  const prev = PL.best[S.biome] || 0, newBest = T.stars > prev;
  if (newBest) PL.best[S.biome] = T.stars;
  PL.swims = (PL.swims || 0) + 1; persist(true);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const bits = [`${T.trash} trash floated away`];
  if (T.freed) bits.push(`${plural(T.freed, 'friend')} freed`);
  if (T.naps) bits.push(`${plural(T.naps, 'nap')}`);
  if (T.photos) bits.push(`${plural(T.photos, 'photo')}`);
  e.querySelector('h2').textContent = `${place} is clean!`;
  e.querySelector('.line').textContent = bits.join(' · ');
  e.querySelector('.st').innerHTML = `★ +${T.stars} this swim${newBest && prev ? '<span class="best">NEW BEST</span>' : ''}`;
  e.querySelector('.fg').textContent = `🐠 ${found.size}/${SPECIES.length}`;
  e.classList.add('on'); sfx.chime(); say(`${place} is clean! Great job, Pip!`);
}

/* ---------------- main loop ---------------- */
function updatePip(dt) {
  const ocn = ocean, E = ocn.E, ks = keySteer();
  const tSpeed = (easy() ? 6.2 : 7.2) * (T.bossOn ? 0.35 : 1) * (T.ended ? 0.3 : 1) + (P.boost > 0 ? 7 : 0);
  P.speed = damp(P.speed, tSpeed, 2, dt);
  const ahead = P.pos.z - 14, cx = ocn.pathX(ahead);
  const free = !easy() && !S.auto;
  if (!free) {
    if (input.firing && input.aim && !input.aim.fromBtn) { input.bias.x = damp(input.bias.x, (input.aim.x / innerWidth - 0.5) * 2, 3, dt); input.bias.y = damp(input.bias.y, -(input.aim.y / innerHeight - 0.5) * 2, 3, dt); }
    else if (ks.any) { input.bias.x = damp(input.bias.x, ks.x, 3, dt); input.bias.y = damp(input.bias.y, ks.y, 3, dt); }
    else { input.bias.x = damp(input.bias.x, 0, 1, dt); input.bias.y = damp(input.bias.y, 0, 1, dt); }
    const desired = Math.atan2(-((cx + input.bias.x * 6) - P.pos.x), 14), prev = P.heading;
    P.heading = damp(P.heading, desired, 2.2, dt); P.yawRate = (P.heading - prev) / Math.max(dt, 1e-3);
    const fl = ocn.ground(P.pos.x, P.pos.z - 4), altT = clamp(fl + 4 + input.bias.y * 3, fl + 1.6, E.surfY - 3);
    P.pitch = damp(P.pitch, clamp((altT - P.pos.y) * 0.22, -0.5, 0.5), 3, dt);
  } else {
    const st = ks.any ? ks : input.stick, off = P.pos.x - cx;
    const corr = sm(10, 16, Math.abs(off)) * Math.sign(off) * 1.6;
    P.yawRate = damp(P.yawRate, -st.x * 1.35 + corr, 4, dt); P.heading = clamp(P.heading + P.yawRate * dt, -1.1, 1.1);
    P.pitch = damp(P.pitch, st.y * 0.65, 3, dt);
  }
  const cp = Math.cos(P.pitch), fwd = _w.set(-Math.sin(P.heading) * cp, Math.sin(P.pitch), -Math.cos(P.heading) * cp);
  P.pos.addScaledVector(fwd, P.speed * dt);
  const fl = ocn.ground(P.pos.x, P.pos.z) + 1.2; if (P.pos.y < fl) { P.pos.y = damp(P.pos.y, fl, 8, dt); P.pitch = Math.max(P.pitch, 0.08); }
  if (P.pos.y > E.surfY - 2) P.pos.y = E.surfY - 2;
  P.roll = damp(P.roll, clamp(P.yawRate * 0.6, -0.8, 0.8), 4, dt);
  P.boost = Math.max(0, P.boost - dt); P.boostCd = Math.max(0, P.boostCd - dt); P.wob = Math.max(0, P.wob - dt * 1.4); P.puff = Math.max(0, (P.puff || 0) - dt * 5);
}
function poseCam(dt) {
  const back = _v.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  const want = P.pos.clone().addScaledVector(back, 5.0).add(new V3(0, 2.15 - P.pitch * 1.2, 0));
  camera.position.lerp(want, dt > 0.5 ? 1 : 1 - Math.exp(-6 * dt));
  const look = P.pos.clone().addScaledVector(back, -7).add(new V3(0, 0.25 + P.pitch * 3, 0));
  camera.lookAt(look); camera.rotateZ(P.roll * 0.3);
  if (P.wob > 0) { camera.position.x += Math.sin(T.t * 47) * 0.06 * P.wob; camera.position.y += Math.sin(T.t * 39) * 0.04 * P.wob; }
  const fov = 60 + (P.boost > 0 ? 9 : 0) + (innerHeight < 520 ? -6 : 0); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix(); }
}
function titleCam(t) {
  const z = -24, x = ocean.pathX(z); P.pos.set(x, ocean.ground(x, z) + 3.6 + Math.sin(t * 0.8) * 0.15, z); P.heading = Math.sin(t * 0.25) * 0.25; P.pitch = 0; P.roll = Math.sin(t * 0.25 + 1) * 0.1; P.speed = 2;
  const a = Math.PI + 0.55 + Math.sin(t * 0.12) * 0.25;
  camera.position.set(P.pos.x + Math.sin(a) * 4.2, P.pos.y + 0.6, P.pos.z + Math.cos(a) * 4.2); camera.lookAt(P.pos.x - 0.6, P.pos.y + 0.35, P.pos.z);
  if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
}
function radioSchedule(dt) {
  const sd = T.said;
  if (!sd.intro && T.t > 0.6) { sd.intro = true; radio(INTRO[S.biome]); }
  if (!sd.fun && T.t > 26) { sd.fun = true; radio(FUN[S.biome]); }
  // photo requests: the first after ~15 s, the next ~7 s after one is done; a request nobody finds is dropped after 40 s
  if (T.request) { if ((T.reqAge += dt) > 40) { clearRequest(); T.reqT = 5; } }
  else if (T.reqList.length && !T.bossOn && (T.reqT -= dt) <= 0) nextRequest();
}
function step(dt) {
  if (S.paused || S.portrait) { U.uTime.value += dt; ocean.update(dt, camera); bubbles.update(dt, U.uTime.value); return; }
  T.t += dt; U.uTime.value = T.t;
  const play = S.screen === 'play';
  if (play) updatePip(dt); else titleCam(T.t);
  pip.group.position.copy(P.pos); pip.group.rotation.set(P.pitch, P.heading, P.roll + Math.sin(T.t * 14) * 0.12 * P.wob, 'YXZ');
  pip.inner.scale.setScalar(1 + (P.puff || 0) * 0.06);
  const sw = pip.mat.userData.swim.uSwim.value; sw.x = 0.12 + (P.boost > 0 ? 0.05 : 0); sw.y = 4 + P.speed * 0.38;
  if ((T.bubT -= dt) <= 0) { T.bubT = play ? 0.35 : 0.6; const m = pip.group.localToWorld(pip.mouth.clone()); bubbles.emit(m.x, m.y, m.z, rnd(-0.2, 0.2), 0.5, rnd(-0.2, 0.2), 0.06 + Math.random() * 0.05, 2.2); }
  for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; if (a.alive) a.update(dt, T.t); }
  if (actors.length > 400 || (T.t | 0) % 5 === 0) actors = actors.filter(a => a.alive);
  if (play) {
    shotCd -= dt; snapCd -= dt;
    if (!T.ended) {
      if (input.firing && input.aim && (input.fireT -= dt) <= 0) { input.fireT = 0.33; if (input.aim.fromBtn) { const r = reticle(); fire(r.x, r.y); } else fire(input.aim.x, input.aim.y); }
      if (S.auto && (T.autoT -= dt) <= 0) { T.autoT = 0.45; const tg = pickTarget(innerWidth / 2, innerHeight * 0.48, innerWidth * 0.4, a => a.target); if (tg) { const s = project(tg.p); fire(s.x, s.y); } }
      if (S.auto && T.request && (T.autoSnapT -= dt) <= 0) {   // test auto-play: snap only when the requested animal is in view
        T.autoSnapT = 0.5;
        if (pickTarget(innerWidth / 2, innerHeight * 0.45, innerWidth * 0.3, a => photoable(a) && a.sp === T.request)) { snap(); T.autoSnapT = 4; }
      }
      radioSchedule(dt);
    }
    updateShots(dt);
    T.prog = clamp((P.z0 - P.pos.z) / (LEN - 30), 0, 1);
    if (!T.ended && T.prog >= 1 && !T.bossOn) endLevel();
    scanCheck();
    poseCam(dt);
  }
  ocean.update(dt, camera); bubbles.update(dt, T.t);
  if (cardT > 0 && (cardT -= dt) <= 0) hideCard();
  if (radioT > 0 && (radioT -= dt) <= 0) $('#radio').classList.remove('on');
  if (toastT > 0 && (toastT -= dt) <= 0) $('#toast').classList.remove('on');
}
let lastT = performance.now(), fps = 60, fpsN = 0, fpsT = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), raw = (now - lastT) / 1000, dt = Math.min(raw, 1 / 20); lastT = now;
  // frame-rate guard: if the iPad can't keep up during play, render fewer pixels
  if (raw < 0.25) { fpsN++; fpsT += raw; if (fpsT >= 2) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; if (S.screen === 'play' && !S.paused && fps < 45 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); } } }
  try { step(dt); } catch (err) { console.error(err); }
  renderer.render(scene, camera);
  if (pendingPhoto) { capturePhoto(pendingPhoto); pendingPhoto = null; }
  if (S.screen === 'play') {
    const r = reticle(), el = $('#reticle'); el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    if ((T.t * 10 | 0) % 3 === 0) updateHud();
  }
  if (cardId) { const w = $('#card .win').getBoundingClientRect(); const p = portrait(cardId); if (p && w.width > 10) renderPortrait(p, w.left, w.top, w.width, w.height, Math.sin(T.t * 0.7) * 0.5); }
  if (S.screen === 'guide' && found.has(guideSel)) { const w = $('#gwin').getBoundingClientRect(); const p = portrait(guideSel); if (p && w.width > 10) renderPortrait(p, w.left, w.top, w.width, w.height, Math.sin(T.t * 0.5) * 0.7); }
}

/* ---------------- offline install ---------------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || Q.has('sw'))) {
  // when a new version has been cached, reload once so the update shows straight away (never mid-swim)
  const hadSW = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW && !reloaded && S.screen !== 'play') { reloaded = true; flush(); location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------------- boot ---------------- */
applySettings();
setPlayer(S.player);
makeThumbs();
go(S.screen);
if (S.ff > 0) { const n = Math.round(S.ff * 30); for (let i = 0; i < n; i++) step(1 / 30); } else step(1 / 60);
if (S.screen === 'play') poseCam(1);
if (S.card) showCard(S.card, 'scan');
onResize();
$('#loading').remove();
frame();
// test hooks for the console (no effect on play)
window.__rr = { S, T, P, DATA, actors: () => actors, found: () => found, photos: () => photos, go, showCard, fire, snap, project, flush, pause, VERSION };
