// 桜町散步：3D 日式街道漫遊
import * as THREE from 'three';
import { Kit, Atlas, Batch, rng } from './kit.js';
import { buildWorld, SL, CROSS_X, STATIONS, BOUND, SIGN_TEXT } from './world.js';
import { makePerson, makeDog, makeCat, TALK } from './npc.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const isTouch = matchMedia('(pointer: coarse)').matches;
const R = rng(7);

// ---------- 基本場景 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4f2, 90, 460);
const camera = new THREE.PerspectiveCamera(62, 1, .3, 1600);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 62; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a8672, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4); scene.add(sun, sun.target);
sun.castShadow = true;
const SM = isTouch ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 420 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = .06;

// 天空
const skyU = { top: { value: new THREE.Color(0x4f9fe0) }, bot: { value: new THREE.Color(0xd6ebf7) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vD; void main(){ float h = clamp(vD.y * 1.5 + 0.04, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h, 0.55)), 1.0);\n#include <colorspace_fragment>\n}',
}));
sky.renderOrder = -10; scene.add(sky);
const starGeo = new THREE.BufferGeometry();
{
  const p = [];
  for (let i = 0; i < 700; i++) { const a = R() * 6.283, y = R() * .95 + .05, r = Math.sqrt(1 - y * y); p.push(Math.cos(a) * r * 1300, y * 1300, Math.sin(a) * r * 1300); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);
// 富士山
const fujiMat = new THREE.MeshBasicMaterial({ color: 0x7f97bf, fog: false }), snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const fuji = new THREE.Group();
fuji.add(new THREE.Mesh(new THREE.CylinderGeometry(26, 300, 190, 40, 1, true), fujiMat));
const snow = new THREE.Mesh(new THREE.CylinderGeometry(26.4, 96, 49, 40, 1, false), snowMat); snow.position.y = 70.6; fuji.add(snow);
fuji.position.set(-40, 80, -780); scene.add(fuji);
// 雲
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: .92 });
const clouds = new THREE.Group();
{
  const g = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group(), a = R() * 6.283, d = 250 + R() * 500;
    c.position.set(Math.cos(a) * d, 150 + R() * 90, Math.sin(a) * d);
    for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(g, cloudMat); m.scale.set(26 + R() * 26, 9 + R() * 7, 16 + R() * 14); m.position.set((k - 2) * 22 + R() * 8, R() * 5, R() * 12); c.add(m); }
    clouds.add(c);
  }
}
scene.add(clouds);
// 草地
const grass = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7aa957 }));
grass.receiveShadow = true; scene.add(grass);

// ---------- 載入字型後建立世界 ----------
const M = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
  win: new THREE.MeshBasicMaterial({ vertexColors: true }),
  lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .5, depthWrite: false }),
  sign: null,
};
let W = null, train = null, haloMat = null;
const npcs = [];
function meshes(K, parent) {
  for (const k in K.b) {
    if (!K.b[k].pos.length) continue;
    const m = K.b[k].build(M[k]);
    if (k === 'solid') { m.castShadow = true; m.receiveShadow = true; }
    if (k === 'glass') m.renderOrder = 2;
    if (parent !== scene) m.matrixAutoUpdate = true;
    parent.add(m);
  }
}
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const soft = softTex();

function buildTrain(atlas) {
  const K = new Kit(atlas), GR = 0x2f7a55, CR = 0xf1e9cf;
  for (const c of [-1, 1]) {
    K.push(c * 6.9, 0, 0, 0);
    K.box(0, .7, 0, 13.4, .25, 2.6, 0x2a2a2e); K.box(0, .95, 0, 13.4, 1.0, 2.7, GR); K.box(0, 1.95, 0, 13.4, 1.4, 2.7, CR); K.box(0, 1.9, 0, 13.42, .1, 2.72, 0xd9a93a);
    K.box(0, 3.35, 0, 13.2, .22, 2.4, 0x8a8f96); K.box(0, 3.55, 0, 5, .2, 1.4, 0x9aa0a6);
    for (const s of [-1, 1]) {
      for (const x of [-4.4, 0, 4.4]) { K.box(x, 1.12, s * 1.36, 1.3, 2.0, .04, 0xe4dcc0); K.box(x, 2.1, s * 1.38, .9, .8, .04, 0xfff1d6, 'win'); K.box(x, 1.12, s * 1.385, .03, 2.0, .02, 0x555555); }
      for (const x of [-2.2, 2.2]) K.box(x, 2.1, s * 1.36, 2.4, .85, .04, 0xfff1d6, 'win');
      for (const x of [-5.9, 5.9]) K.box(x, 2.1, s * 1.36, .9, .85, .04, 0xfff1d6, 'win');
    }
    for (const x of [-4.2, 4.2]) { K.box(x, .25, 0, 2.6, .45, 1.9, 0x2a2a2e); for (const dx of [-.8, .8]) for (const s of [-1, 1]) K.cyl(x + dx, .45, s * .72, .42, .42, .12, 0x44474d, 10, 'solid', Math.PI / 2, 0); }
    // 車頭
    K.box(c * 6.71, 2.1, 0, .04, .9, 2.2, 0x2c3a48); K.box(c * 6.72, 3.0, 0, .04, .3, 1.4, 0x111111);
    K.sign(c > 0 ? '湯の里' : '桜町', c * 6.75, 3.15, 0, 1.2, .26, { bg: '#111111', fg: '#ffb300', ry: c * Math.PI / 2 });
    for (const s of [-1, 1]) { K.box(c * 6.72, 1.25, s * .9, .05, .22, .3, 0xfff6c8, 'lamp'); K.box(c * 6.72, 1.0, s * .9, .05, .14, .3, 0xc21a1a, 'lamp'); }
    if (c < 0) { K.boxR(-1, 4.1, 0, 2.2, .06, .06, 0x555b61, 0, 0, .5); K.boxR(1, 4.1, 0, 2.2, .06, .06, 0x555b61, 0, 0, -.5); K.box(0, 4.62, 0, .1, .06, 1.6, 0x555b61); }
    K.pop();
  }
  K.box(0, .85, 0, .7, .25, .4, 0x2a2a2e); K.box(0, 1.5, 0, .5, 1.6, 1.6, 0x3a3a40);
  const g = new THREE.Group(); meshes(K, g);
  return g;
}

// ---------- 狀態 ----------
const player = { x: 0, z: 58, y: SL, yaw: Math.PI, vy: 0, riding: false, rideOff: 0, model: null, phase: 0, moving: false };
const cam = { yaw: 0, pitch: .2, dist: 6.5, cur: 6.5, fp: false };
const T = { x: -105, v: 0, dir: 1, state: 'dwell', t: 7 };
const input = { kx: 0, ky: 0, jx: 0, jy: 0, run: false, keys: new Set() };
const stamps = { shrine: false, onsen: false, konbini: false, train: false, pagoda: false, dog: false };
let tod = 0, started = false, curAct = null, grid = null, inPool = false, inKonbini = false, inPagoda = false, place = '';
const ENV = [
  { top: 0x4f9fe0, bot: 0xd6ebf7, fog: 0xcfe4f2, f0: 90, f1: 460, sun: 0xfff4e0, si: 2.4, sd: [.45, .8, .35], h1: 0xcfe6ff, h2: 0x8a8672, hi: 1.15, win: 0x9db9c9, halo: 0, lamp: .9, sign: .93, unlit: 1, star: 0, cloud: 0xffffff, fuji: 0x8ea6cc, snow: 0xffffff, grass: 0x7aa957 },
  { top: 0x3b4a8a, bot: 0xffa868, fog: 0xe9a983, f0: 70, f1: 400, sun: 0xff9a5c, si: 2.0, sd: [-.82, .3, .22], h1: 0xffc9a0, h2: 0x5a5060, hi: .75, win: 0xffd89a, halo: .55, lamp: 1, sign: .97, unlit: .95, star: .15, cloud: 0xffb89a, fuji: 0x6a5a8a, snow: 0xffd2c0, grass: 0x7a9a57 },
  { top: 0x050818, bot: 0x1c2750, fog: 0x141c38, f0: 50, f1: 330, sun: 0x9fb4ff, si: 1.0, sd: [.3, .75, -.4], h1: 0x5a6cb0, h2: 0x2c2c40, hi: 1.5, win: 0xffd27a, halo: .7, lamp: 1, sign: 1, unlit: .85, star: 1, cloud: 0x232c52, fuji: 0x1a2244, snow: 0x5a6a9a, grass: 0x4a6a47 },
];
const env = { k: 0 }; // 目前混合值
const cA = new THREE.Color(), cB = new THREE.Color();
function applyEnv(dt) {
  const a = Math.floor(env.k), b = Math.min(2, a + 1), f = env.k - a, A = ENV[a], B = ENV[b];
  const L = (k) => A[k] + (B[k] - A[k]) * f, Cc = (k, out) => out.copy(cA.setHex(A[k])).lerp(cB.setHex(B[k]), f);
  Cc('top', skyU.top.value); Cc('bot', skyU.bot.value); Cc('fog', scene.fog.color); scene.fog.near = L('f0'); scene.fog.far = L('f1');
  Cc('sun', sun.color); sun.intensity = L('si'); Cc('h1', hemi.color); Cc('h2', hemi.groundColor); hemi.intensity = L('hi');
  Cc('win', M.win.color); M.lamp.color.setScalar(L('lamp')); if (M.sign) M.sign.color.setScalar(L('sign')); M.unlit.color.setScalar(L('unlit'));
  if (haloMat) { haloMat.opacity = L('halo'); haloMat.visible = haloMat.opacity > .01; }
  stars.material.opacity = L('star'); Cc('cloud', cloudMat.color); Cc('fuji', fujiMat.color); Cc('snow', snowMat.color); Cc('grass', grass.material.color);
  sunDir.set(A.sd[0] + (B.sd[0] - A.sd[0]) * f, A.sd[1] + (B.sd[1] - A.sd[1]) * f, A.sd[2] + (B.sd[2] - A.sd[2]) * f).normalize();
}
const sunDir = new THREE.Vector3(.45, .8, .35).normalize();

// ---------- 音效 ----------
const sfx = {
  ctx: null, on: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 無音效 */ } } },
  beep(f, dur = .15, type = 'sine', vol = .12, when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + .02);
  },
  chime() { this.beep(988, .35, 'sine', .1); this.beep(784, .5, 'sine', .1, .22); },
  clap() { for (const w of [0, .28]) { this.beep(1800, .05, 'square', .06, w); this.beep(900, .06, 'triangle', .08, w); } },
  bell() { this.beep(392, .9, 'triangle', .12); this.beep(588, .7, 'sine', .06, .02); },
  coin() { this.beep(1568, .08, 'square', .05); this.beep(2093, .16, 'square', .05, .07); },
  horn() { this.beep(370, .5, 'sawtooth', .05); this.beep(466, .5, 'sawtooth', .05); },
};

// ---------- UI ----------
let toastT = 0;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
let dlgT = 0;
function say(name, text, ms = 5200) { $('dlgName').textContent = name; $('dlgText').textContent = text; $('dlg').classList.add('show'); clearTimeout(dlgT); dlgT = setTimeout(() => $('dlg').classList.remove('show'), ms); }
const STAMP_INFO = { shrine: ['⛩', '神社參拜'], onsen: ['♨', '溫泉泡湯'], konbini: ['🏪', '超商購物'], train: ['🚃', '搭乘電車'], pagoda: ['🗼', '五重塔'], dog: ['🐕', '摸摸柴犬'] };
function drawStamps() {
  $('stamps').innerHTML = Object.keys(STAMP_INFO).map((k) => `<span class="${stamps[k] ? 'got' : ''}" title="${STAMP_INFO[k][1]}">${STAMP_INFO[k][0]}</span>`).join('');
}
function stamp(k) {
  if (stamps[k]) return;
  stamps[k] = true; drawStamps(); sfx.coin();
  const n = Object.values(stamps).filter(Boolean).length;
  setTimeout(() => toast(n === 6 ? '🎉 御朱印帳集滿了！你已經玩遍整個櫻町！' : `御朱印 +1「${STAMP_INFO[k][1]}」（${n}/6）`, 3200), 900);
}

// ---------- 碰撞 ----------
const CELL = 8;
function buildGrid(cols) {
  grid = new Map();
  for (const c of cols) for (let ix = Math.floor(c.x0 / CELL); ix <= Math.floor(c.x1 / CELL); ix++) for (let iz = Math.floor(c.z0 / CELL); iz <= Math.floor(c.z1 / CELL); iz++) {
    const k = ix * 4096 + iz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
  }
}
function pushOut(p, c, r) {
  const nx = Math.max(c.x0, Math.min(c.x1, p.x)), nz = Math.max(c.z0, Math.min(c.z1, p.z));
  let dx = p.x - nx, dz = p.z - nz; const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; return; }
  const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b);
  if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
}
function resolve(p, r) {
  const ix = Math.floor(p.x / CELL), iz = Math.floor(p.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((ix + i) * 4096 + iz + j); if (a) for (const c of a) pushOut(p, c, r); }
  for (const cr of W.crossings) if (cr.closed) for (const c of cr.barrier) pushOut(p, c, r);
}
function blocked(x, y, z) {
  const a = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)); if (!a) return false;
  for (const c of a) if (c.h >= 2.6 && y < c.h + SL && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true;
  return false;
}
function groundY(x, z) {
  for (const h of W.hz) if (x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1) {
    if (!h.axis) return h.ha;
    const t = h.axis === 'x' ? (x - h.x0) / (h.x1 - h.x0) : (z - h.z0) / (h.z1 - h.z0);
    return h.ha + (h.hb - h.ha) * t;
  }
  const p = W.pool; if (p && (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return SL - .62;
  for (const s of W.slabs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return SL;
  return .05;
}
function slabKind(x, z) { for (const s of W.slabs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.kind; return 'road'; }

// ---------- NPC ----------
function animate(o, t, moving, speed = 1) {
  const s = moving ? Math.sin(t * 7 * speed) : 0;
  if (o.kind === 'dog') {
    o.legs.forEach((l, i) => { l.rotation.x = (i % 3 === 0 ? s : -s) * .7; });
    o.tail.position.x = Math.sin(t * 14) * .04; o.body.position.y = moving ? Math.abs(s) * .03 : 0;
  } else if (o.kind === 'cat') {
    o.tail.rotation.z = Math.sin(t * 1.6) * .4; o.head.rotation.y = Math.sin(t * .5) * .5;
  } else {
    if (o.legs.length) { o.legs[0].rotation.x = s * .6; o.legs[1].rotation.x = -s * .6; }
    o.arms[0].rotation.x = -s * (o.robe ? .2 : .5); o.arms[1].rotation.x = s * (o.robe ? .2 : .5);
    o.body.position.y = moving ? Math.abs(Math.cos(t * 7 * speed)) * .035 : Math.sin(t * 1.6) * .008;
    if (o.robe) o.body.rotation.z = s * .03;
  }
}
function angLerp(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
function spawnNPCs() {
  const walkers = ['kimono', 'kimono2', 'kimono3', 'salary', 'salary2', 'salary', 'jk', 'jk2', 'jk', 'gakuran', 'gakuran', 'grandpa', 'grandma', 'kid', 'kid2', 'kid', 'yukata', 'yukata2', 'shopper', 'shopper', 'salary2', 'kimono2', 'jk2', 'grandpa', 'dog', 'dog'];
  const talkOf = (s) => s.replace(/\d/g, '').replace('kimono', 'kimono').replace('salary', 'salary');
  walkers.forEach((st, i) => {
    const o = st === 'dog' ? makeDog() : makePerson(st, i);
    const n = W.nodes[Math.floor(R() * W.nodes.length)], e = n.e[Math.floor(R() * n.e.length)];
    const key = st === 'dog' ? 'dog' : st === 'kid2' ? 'kid' : st === 'jk2' ? 'jk' : talkOf(st);
    const npc = { o, x: n.x, z: n.z, from: n, to: e.to, off: e.off, side: R() < .5 ? -1 : 1, speed: st === 'dog' ? 2.3 : (st.startsWith('grand') ? .8 : 1.1 + R() * .5), ph: R() * 10, yaw: 0, talk: TALK[key], line: 0, hold: 0, walker: true, key };
    const f = R(); npc.x += (e.to.x - n.x) * f; npc.z += (e.to.z - n.z) * f;
    scene.add(o.group); npcs.push(npc);
  });
  for (const s of W.spots) {
    const o = s.type === 'cat' ? makeCat() : makePerson(s.type, npcs.length);
    const npc = { o, x: s.x, z: s.z, y: s.y, yaw: s.ry, base: s.ry, talk: TALK[s.type], line: 0, ph: R() * 10, walker: false, key: s.type };
    o.group.position.set(s.x, s.y ?? groundY(s.x, s.z), s.z); o.group.rotation.y = s.ry;
    scene.add(o.group); npcs.push(npc);
  }
}
function updateNPCs(dt, t) {
  for (const n of npcs) {
    const dxp = player.x - n.x, dzp = player.z - n.z, dp = Math.hypot(dxp, dzp);
    n.o.group.visible = dp < 150;
    if (!n.walker) {
      const want = dp < 4.5 && n.o.kind !== 'cat' ? Math.atan2(dxp, dzp) : n.base;
      n.yaw = angLerp(n.yaw, want, Math.min(1, dt * 4)); n.o.group.rotation.y = n.yaw;
      animate(n.o, t + n.ph, false);
      if (n.key === 'miko' && dp >= 4.5) { n.o.arms[1].rotation.x = -.5 + Math.sin(t * 2.4) * .25; n.o.arms[0].rotation.x = -.3; }
      continue;
    }
    let moving = true;
    if (n.hold > 0) { n.hold -= dt; moving = false; n.yaw = angLerp(n.yaw, Math.atan2(dxp, dzp), Math.min(1, dt * 6)); }
    else {
      const ex = n.to.x - n.from.x, ez = n.to.z - n.from.z, el = Math.hypot(ex, ez) || 1;
      const tx = n.to.x - ez / el * n.side * n.off, tz = n.to.z + ex / el * n.side * n.off;
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d < .45) {
        const opts = n.to.e.filter((e) => e.to !== n.from), e = (opts.length ? opts : n.to.e)[Math.floor(R() * (opts.length || n.to.e.length))];
        n.from = n.to; n.to = e.to; n.off = e.off;
      } else {
        // 平交道前停等
        let wait = false;
        if (ex === 0 && Math.abs(n.z) > 3.7 && Math.abs(n.z) < 6.5 && Math.sign(dz) === -Math.sign(n.z)) { const cr = W.crossings.find((c) => c.x === n.from.x); if (cr && cr.closed) wait = true; }
        if (wait) moving = false;
        else { const st = Math.min(d, n.speed * dt); n.x += dx / d * st; n.z += dz / d * st; n.yaw = angLerp(n.yaw, Math.atan2(dx, dz), Math.min(1, dt * 7)); }
      }
    }
    n.o.group.position.set(n.x, groundY(n.x, n.z), n.z); n.o.group.rotation.y = n.yaw;
    animate(n.o, t + n.ph, moving, n.o.kind === 'dog' ? 1.8 : 1);
  }
}

// ---------- 互動 ----------
const KUJI = [['大吉', '萬事如意，旅途中會遇到美好的邂逅。'], ['中吉', '努力會有回報，記得泡個溫泉放鬆一下。'], ['小吉', '平凡中有小確幸，買個飯糰吧。'], ['吉', '穩穩地走，自然會到達目的地。'], ['末吉', '好運正在路上，耐心等電車。'], ['凶', '別擔心，把籤綁在架上，厄運就留在神社了。']];
const GOODS = [['鮭魚飯糰', 150], ['炸雞君', 220], ['關東煮', 380], ['哈密瓜麵包', 140], ['布丁', 180], ['炒麵麵包', 200], ['熱咖啡', 100], ['肉包', 160], ['雞蛋三明治', 260]];
const DRINKS = ['綠茶', '罐裝咖啡', '波子汽水', '玉米濃湯', '麥茶', '蘋果汁', '紅豆湯'];
function nearestAct() {
  let best = null, bd = 1e9;
  const tryA = (x, z, r, a) => { const d = Math.hypot(player.x - x, player.z - z); if (d < r && d < bd) { bd = d; best = a; } };
  if (player.riding) return T.state === 'dwell' ? { label: '下車', kind: 'alight' } : null;
  if (T.state === 'dwell' && player.y > .9 && player.z < 6.8 && Math.abs(player.x - T.x) < 14.5 && Math.abs(player.z) < 7) return { label: '乘車', kind: 'board' };
  for (const i of W.inter) tryA(i.x, i.z, i.r, i);
  for (const n of npcs) if (n.talk) tryA(n.x, n.z, n.o.kind === 'person' ? 2.3 : 1.8, { label: n.key === 'dog' || n.key === 'cat' ? '摸摸' : '對話', kind: 'talk', npc: n });
  return best;
}
function act() {
  const a = curAct; if (!a) return;
  sfx.init();
  if (a.kind === 'talk') {
    const n = a.npc; say(n.talk.name, n.talk.lines[n.line++ % n.talk.lines.length]); if (n.walker) n.hold = 4.5;
    if (n.key === 'dog') { stamp('dog'); sfx.beep(660, .08, 'square', .06); sfx.beep(880, .1, 'square', .06, .1); }
    else if (n.key === 'cat') sfx.beep(1200, .2, 'sine', .05);
    else sfx.beep(520, .06, 'sine', .05);
  } else if (a.kind === 'pray') {
    sfx.coin(); setTimeout(() => sfx.bell(), 400); setTimeout(() => sfx.clap(), 1500);
    say('參拜', '（投入五圓硬幣，搖響鈴鐺…二禮、二拍手、一禮）願望一定會實現的。', 6000); stamp('shrine');
  } else if (a.kind === 'kuji') {
    const k = KUJI[Math.floor(Math.random() * KUJI.length)]; sfx.coin(); say('御神籤 ・ ' + k[0], k[1], 6500);
  } else if (a.kind === 'konbini') {
    const g = GOODS[Math.floor(Math.random() * GOODS.length)]; sfx.coin(); say('超商店員', `「${g[0]}」一共 ${g[1]} 日圓。ありがとうございました～！`); stamp('konbini');
  } else if (a.kind === 'vend') {
    sfx.beep(180, .12, 'square', .08); sfx.beep(120, .2, 'square', .08, .15); toast('ガコン！你買了一罐「' + DRINKS[Math.floor(Math.random() * DRINKS.length)] + '」🥤');
  } else if (a.kind === 'board') {
    player.riding = true; player.rideOff = Math.max(-11, Math.min(11, player.x - T.x)); player.model.group.visible = false;
    toast('🚃 上車了！下一站：' + (T.dir > 0 ? STATIONS[1].zh : STATIONS[0].zh)); sfx.chime();
  } else if (a.kind === 'alight') {
    player.riding = false; player.x = T.x + player.rideOff; player.z = 4.3; player.y = 1.1; player.model.group.visible = !cam.fp;
  }
}

// ---------- 小地圖 ----------
const MAPW = 142, MAPH = 132;
const BCOL = { house: '#b08968', machiya: '#7a5a44', zakkyo: '#8b97a3', apartment: '#c7b299', konbini: '#18a058', sento: '#5b7fa3', koban: '#1e3a6e', station: '#17335c', shrine: '#d2401f', onsen: '#8a4a3a' };
let mapStatic = null;
function renderStatic(S, labels) {
  const c = document.createElement('canvas'); c.width = MAPW * 2 * S; c.height = MAPH * 2 * S;
  const x = c.getContext('2d'), X = (v) => (v + MAPW) * S, Z = (v) => (v + MAPH) * S;
  x.fillStyle = '#9cc47a'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#62656b'; x.fillRect(X(-BOUND.x - 2), Z(-BOUND.z - 3), (2 * BOUND.x + 4) * S, (2 * BOUND.z + 6) * S);
  const SC = { town: '#dcd8cf', park: '#8fc46f', shrine: '#e8e1ca', onsen: '#cbc4b0' };
  for (const s of W.slabs) { x.fillStyle = SC[s.kind]; x.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * S, (s.z1 - s.z0) * S); }
  x.fillStyle = '#8a8178'; x.fillRect(X(-BOUND.x), Z(-2.4), 2 * BOUND.x * S, 4.8 * S);
  x.strokeStyle = '#2a2a2a'; x.lineWidth = Math.max(1, S * .8); x.setLineDash([S * 2, S * 2]); x.beginPath(); x.moveTo(X(-BOUND.x), Z(0)); x.lineTo(X(BOUND.x), Z(0)); x.stroke(); x.setLineDash([]);
  for (const b of W.bldgs) { x.fillStyle = BCOL[b.type] || '#999'; x.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S); }
  for (const st of STATIONS) { x.fillStyle = '#a9a79f'; x.fillRect(X(st.x - 15), Z(2), 30 * S, 4.6 * S); }
  if (W.pool) { x.fillStyle = '#6fd0d0'; x.beginPath(); x.arc(X(W.pool.x), Z(W.pool.z), (W.pool.r + .5) * S, 0, 7); x.fill(); }
  if (labels) {
    x.font = `900 ${Math.round(S * 6.2)}px "Noto Sans TC",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const l of W.landmarks) {
      const w = x.measureText(l.t).width + S * 4;
      x.fillStyle = l.c; x.beginPath(); x.roundRect(X(l.x) - w / 2, Z(l.z) - S * 4.6, w, S * 9.2, S * 2); x.fill();
      x.fillStyle = '#fff'; x.fillText(l.t, X(l.x), Z(l.z) + S * .4);
    }
  }
  return c;
}
function drawMap(cv, st, S, big) {
  const x = cv.getContext('2d'), X = (v) => (v + MAPW) * S, Z = (v) => (v + MAPH) * S;
  x.drawImage(st, 0, 0, cv.width, cv.height);
  if (big) { x.fillStyle = '#ffe14a'; for (const n of npcs) { x.beginPath(); x.arc(X(n.x), Z(n.z), S * 1.3, 0, 7); x.fill(); } }
  x.fillStyle = '#2f7a55'; x.fillRect(X(T.x - 13.5), Z(-1.6), 27 * S, 3.2 * S); x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(X(T.x - 13.5), Z(-1.6), 27 * S, 3.2 * S);
  const px = player.riding ? T.x + player.rideOff : player.x, pz = player.riding ? 0 : player.z;
  x.save(); x.translate(X(px), Z(pz)); x.rotate(-cam.yaw);
  const r = cv.width / (big ? 62 : 22);
  x.fillStyle = '#ff2d55'; x.strokeStyle = '#fff'; x.lineWidth = big ? 2 : 1.5; x.beginPath(); x.moveTo(0, -r); x.lineTo(r * .7, r * .8); x.lineTo(0, r * .4); x.lineTo(-r * .7, r * .8); x.closePath(); x.fill(); x.stroke();
  x.restore();
}

// ---------- 粒子 ----------
let petals = null, steam = null;
function makeParticles() {
  const N = 260, p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = (R() - .5) * 60; p[i * 3 + 1] = R() * 18; p[i * 3 + 2] = (R() - .5) * 60; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  petals = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc4d8, size: .1, transparent: true, opacity: .95, depthWrite: false }));
  petals.frustumCulled = false; scene.add(petals);
  const st = W.steam[0], NS = 46, sp = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { const a = R() * 6.283, r = Math.sqrt(R()) * st.r; sp[i * 3] = st.x + Math.cos(a) * r; sp[i * 3 + 1] = st.y + R() * 6; sp[i * 3 + 2] = st.z + Math.sin(a) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  steam = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 4.2, map: soft, transparent: true, opacity: .24, depthWrite: false }));
  scene.add(steam);
}
function updateParticles(dt, t) {
  const p = petals.geometry.attributes.position.array, cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < p.length; i += 3) {
    p[i] += (Math.sin(t * .7 + i) * .6 + .5) * dt; p[i + 1] -= (.7 + (i % 7) * .08) * dt; p[i + 2] += Math.cos(t * .5 + i * 1.3) * .5 * dt;
    if (p[i + 1] < 0) p[i + 1] += 18;
    if (p[i] - cx > 30) p[i] -= 60; else if (p[i] - cx < -30) p[i] += 60;
    if (p[i + 2] - cz > 30) p[i + 2] -= 60; else if (p[i + 2] - cz < -30) p[i + 2] += 60;
  }
  petals.geometry.attributes.position.needsUpdate = true;
  const s = steam.geometry.attributes.position.array, st = W.steam[0];
  for (let i = 0; i < s.length; i += 3) { s[i + 1] += (.5 + (i % 5) * .1) * dt; s[i] += Math.sin(t + i) * .15 * dt; if (s[i + 1] > st.y + 6.5) s[i + 1] = st.y; }
  steam.geometry.attributes.position.needsUpdate = true;
  for (const w of W.waters) w.position.y = SL + .36 + Math.sin(t * 1.4) * .012;
}

// ---------- 電車 ----------
function updateTrain(dt) {
  if (T.state === 'dwell') {
    T.t -= dt;
    if (T.t <= 0) { T.state = 'run'; sfx.init(); if (Math.hypot(player.x - T.x, player.z) < 60) sfx.horn(); }
  } else {
    const target = T.dir > 0 ? STATIONS[1].x : STATIONS[0].x, dist = (target - T.x) * T.dir, a = 1.5;
    if (dist <= T.v * T.v / (2 * a) + .05) T.v = Math.max(.5, T.v - a * dt); else T.v = Math.min(15, T.v + a * dt);
    T.x += T.dir * Math.min(T.v * dt, dist);
    if (dist <= .03) {
      T.x = target; T.v = 0; T.state = 'dwell'; T.t = 10; T.dir = -T.dir;
      if (player.riding) { toast('📢 ' + (target > 0 ? STATIONS[1].zh : STATIONS[0].zh) + ' 到了，按「下車」離開電車'); stamp('train'); sfx.chime(); }
    }
  }
  train.position.x = T.x;
  const active = T.state === 'run' || T.t < 3;
  const a0 = T.x - 14 - (T.dir < 0 ? 42 : 3), a1 = T.x + 14 + (T.dir > 0 ? 42 : 3);
  let ring = 1e9;
  for (const cr of W.crossings) {
    const was = cr.closed;
    cr.closed = active && cr.x > a0 && cr.x < a1;
    if (cr.closed && !was && !player.riding && Math.abs(player.x - cr.x) < 6.4 && Math.abs(player.z) < 3.8) player.z = player.z < 0 ? -4.1 : 4.1;
    cr.k += ((cr.closed ? 1 : 0) - cr.k) * Math.min(1, dt * 2.2);
    for (const arm of cr.arms) arm.rotation.z = 1.4 * (1 - cr.k);
    const blink = cr.closed && (performance.now() % 900 < 450);
    cr.lamps.forEach((l, i) => l.material.color.setHex(cr.closed ? ((i % 2 === 0) === blink ? 0xff2a1a : 0x330000) : 0x330000));
    if (cr.closed) ring = Math.min(ring, Math.hypot(player.x - cr.x, player.z));
  }
  return ring;
}

// ---------- 輸入 ----------
addEventListener('keydown', (e) => {
  input.keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { if (started) act(); e.preventDefault(); }
  if (e.code === 'KeyM' && started) toggleMap();
  if (e.code === 'KeyV' && started) toggleView();
  if (e.code === 'KeyT' && started) nextTime();
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => input.keys.clear());
const ptr = new Map(); let joyId = null, joy0 = null;
const joyEl = $('joy');
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType !== 'mouse' && joyId === null && e.clientX < innerWidth * .45 && e.clientY > innerHeight * .3) {
    joyId = e.pointerId; joy0 = { x: e.clientX, y: e.clientY };
    joyEl.style.display = 'block'; joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.firstElementChild.style.transform = '';
  } else ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joy0.x, dy = e.clientY - joy0.y; const d = Math.hypot(dx, dy), m = 52;
    if (d > m) { dx *= m / d; dy *= m / d; }
    input.jx = dx / m; input.jy = -dy / m; joyEl.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
    return;
  }
  const p = ptr.get(e.pointerId); if (!p) return;
  const k = e.pointerType === 'mouse' ? .0045 : .0065;
  cam.yaw -= (e.clientX - p.x) * k; cam.pitch += (e.clientY - p.y) * k * .8;
  cam.pitch = Math.max(cam.fp ? -.9 : -.12, Math.min(1.25, cam.pitch));
  p.x = e.clientX; p.y = e.clientY;
});
const pUp = (e) => { if (e.pointerId === joyId) { joyId = null; input.jx = input.jy = 0; joyEl.style.display = 'none'; } ptr.delete(e.pointerId); };
canvas.addEventListener('pointerup', pUp); canvas.addEventListener('pointercancel', pUp);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(0, Math.min(16, cam.dist + e.deltaY * .01)); setFP(cam.dist < 1.2); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function setFP(v) { if (cam.fp === v) return; cam.fp = v; if (!v && cam.dist < 1.2) cam.dist = 6.5; if (v) cam.dist = 0; player.model.group.visible = !v && !player.riding; $('bView').classList.toggle('on', v); }
function toggleView() { setFP(!cam.fp); toast(cam.fp ? '第一人稱視角' : '第三人稱視角', 1200); }
function nextTime() { tod = (tod + 1) % 3; $('bTime').textContent = ['☀', '🌇', '🌙'][tod]; toast(['白天', '黃昏', '夜晚'][tod], 1200); }
function toggleMap() { const o = $('ovMap'); o.hidden = !o.hidden; }
$('bView').onclick = toggleView; $('bTime').onclick = nextTime;
$('bSnd').onclick = () => { sfx.on = !sfx.on; $('bSnd').textContent = sfx.on ? '🔊' : '🔇'; };
$('mini').onclick = toggleMap; $('ovMap').onclick = toggleMap;
$('act').addEventListener('pointerdown', (e) => { e.preventDefault(); act(); });
$('run').addEventListener('pointerdown', (e) => { e.preventDefault(); input.run = !input.run; $('run').classList.toggle('on', input.run); });

// ---------- 主迴圈 ----------
const clock = new THREE.Clock(); let bellT = 0, mapT = 0, hudT = 0;
const tmp = new THREE.Vector3();
function placeName() {
  if (player.riding) return '電車車內';
  if (inKonbini) return 'ニコマート 超商';
  const k = slabKind(player.x, player.z);
  if (k === 'shrine') return '桜山神社'; if (k === 'onsen') return '湯の里温泉'; if (k === 'park') return '桜町公園';
  for (const s of STATIONS) if (Math.abs(player.x - s.x) < 26 && player.z > -4 && player.z < 23) return s.name + '駅';
  if (Math.abs(player.x) < 7 && player.z > -72 && player.z < 72) return '表参道 櫻花大道';
  if (Math.abs(player.z) < 30) return '駅前商店街';
  return player.z < 0 ? '北町 住宅街' : '南町 住宅街';
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  env.k += Math.max(-dt * .8, Math.min(dt * .8, tod - env.k)); applyEnv(dt);
  const ring = updateTrain(dt);
  if (started && ring < 70) { bellT -= dt; if (bellT <= 0) { bellT = .45; const v = .09 * Math.max(0, 1 - ring / 70); sfx.beep(bellT2 ? 700 : 560, .22, 'square', v); bellT2 = !bellT2; } }

  // 玩家移動
  let ix = input.jx, iy = input.jy; const K = input.keys;
  if (K.has('KeyW') || K.has('ArrowUp')) iy += 1; if (K.has('KeyS') || K.has('ArrowDown')) iy -= 1;
  if (K.has('KeyD') || K.has('ArrowRight')) ix += 1; if (K.has('KeyA') || K.has('ArrowLeft')) ix -= 1;
  if (K.has('KeyQ')) cam.yaw += dt * 1.8; if (K.has('KeyR')) cam.yaw -= dt * 1.8;
  const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
  player.moving = false;
  if (started && !player.riding) {
    if (il > .08) {
      const sp = (input.run || K.has('ShiftLeft') || K.has('ShiftRight') ? 8.5 : 4.4) * (inPool ? .45 : 1) * Math.min(1, il);
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const mx = (fx * iy + rx * ix), mz = (fz * iy + rz * ix), ml = Math.hypot(mx, mz) || 1;
      player.x += mx / ml * sp * dt; player.z += mz / ml * sp * dt;
      player.yaw = angLerp(player.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));
      player.moving = true; player.phase += dt * (sp / 4.4);
    }
    resolve(player, .36); resolve(player, .36);
    const gy = groundY(player.x, player.z);
    player.y += (gy - player.y) * Math.min(1, dt * 12);
  } else if (player.riding) { player.x = T.x + player.rideOff; player.z = 0; player.y = 1.1; }
  const pm = player.model;
  pm.group.position.set(player.x, player.y, player.z); pm.group.rotation.y = player.yaw;
  animate(pm, player.moving ? player.phase : t, player.moving, 1);

  // 區域事件
  if (started && !player.riding) {
    const p = W.pool, ip = (player.x - p.x) ** 2 + (player.z - p.z) ** 2 < p.r * p.r;
    if (ip && !inPool) { toast('♨ 啊～～好舒服… 身體都暖起來了'); stamp('onsen'); sfx.beep(300, .5, 'sine', .05); }
    inPool = ip;
    let ik = false, ig = false;
    for (const z of W.zones) if (player.x > z.x0 && player.x < z.x1 && player.z > z.z0 && player.z < z.z1) { if (z.kind === 'konbini') ik = true; if (z.kind === 'pagoda') ig = true; }
    if (ik && !inKonbini) { sfx.init(); sfx.chime(); toast('🎵 いらっしゃいませ～！（歡迎光臨）'); }
    inKonbini = ik;
    if (ig && !inPagoda) { toast('🗼 五重塔：高 21 公尺，是櫻町的地標'); stamp('pagoda'); }
    inPagoda = ig;
  }

  updateNPCs(dt, t);

  // 相機
  const hy = player.riding ? 2.75 : player.y + (cam.fp ? 1.58 : 1.5);
  const cp = Math.cos(cam.pitch), spi = Math.sin(cam.pitch);
  const ox = Math.sin(cam.yaw) * cp, oz = Math.cos(cam.yaw) * cp;
  if (cam.fp) {
    camera.position.set(player.x, hy, player.z);
    camera.lookAt(player.x - ox, hy - spi, player.z - oz);
  } else {
    let want = cam.dist;
    if (!player.riding) {
      for (let d = .5; d <= cam.dist; d += .35) if (blocked(player.x + ox * d, hy + spi * d, player.z + oz * d)) { want = Math.max(.6, d - .45); break; }
      if (inKonbini && spi > 0) want = Math.min(want, (3.25 + SL - hy) / spi);
    }
    cam.cur = want < cam.cur ? want : cam.cur + (want - cam.cur) * Math.min(1, dt * 4);
    const cy = Math.max(groundY(player.x + ox * cam.cur, player.z + oz * cam.cur) + .35, hy + spi * cam.cur);
    camera.position.set(player.x + ox * cam.cur, cy, player.z + oz * cam.cur);
    camera.lookAt(player.x, hy + .15, player.z);
  }
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  clouds.rotation.y = t * .004;
  // 陰影跟隨
  const sx = Math.round(player.x / 4) * 4, sz = Math.round(player.z / 4) * 4;
  sun.target.position.set(sx, 0, sz); sun.position.set(sx + sunDir.x * 200, sunDir.y * 200, sz + sunDir.z * 200);
  updateParticles(dt, t);

  // HUD
  hudT -= dt;
  if (started && hudT <= 0) {
    hudT = .12;
    const a = nearestAct(); curAct = a;
    const b = $('act'); if (a) { if (b.textContent !== a.label) b.textContent = a.label; b.hidden = false; } else b.hidden = true;
    const pn = placeName(); if (pn !== place) { place = pn; const e = $('place'); e.textContent = pn; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  }
  mapT -= dt;
  if (mapT <= 0 && mapStatic) { mapT = .1; drawMap($('mini'), mapStatic.mini, $('mini').width / (MAPW * 2), false); if (!$('ovMap').hidden) drawMap($('big'), mapStatic.big, $('big').width / (MAPW * 2), true); }
  renderer.render(scene, camera);
}
let bellT2 = false;

// ---------- 啟動 ----------
async function boot() {
  try { await Promise.race([Promise.all([document.fonts.load('900 44px "Noto Sans JP"', SIGN_TEXT), document.fonts.load('900 44px "Noto Sans TC"', '櫻町超商溫泉神社公園站五重塔')]), new Promise((r) => setTimeout(r, 3500))]); } catch (e) { /* 使用系統字型 */ }
  const atlas = new Atlas(2048);
  M.sign = new THREE.MeshBasicMaterial({ map: atlas.texture() });
  W = buildWorld(scene, atlas);
  train = buildTrain(atlas);
  meshes(W.kit, scene);
  train.position.set(T.x, .05, 0); scene.add(train);
  // 電線
  {
    const p = [];
    for (const [x0, y0, z0, x1, y1, z1, sag] of W.wires) {
      const n = sag ? 5 : 1; let px = x0, py = y0, pz = z0;
      for (let i = 1; i <= n; i++) { const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f - sag * 4 * f * (1 - f); p.push(px, py, pz, x, y, z); px = x; py = y; pz = z; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1c1c1c })));
  }
  // 光暈
  {
    const h = W.kit.halos, p = [], c = [], col = new THREE.Color();
    for (let i = 0; i < h.length; i += 4) { p.push(h[i], h[i + 1], h[i + 2]); col.setHex(h[i + 3]); c.push(col.r, col.g, col.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    haloMat = new THREE.PointsMaterial({ size: 3.4, map: soft, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(g, haloMat));
  }
  buildGrid(W.colliders);
  spawnNPCs();
  player.model = makePerson('traveler', 1); scene.add(player.model.group);
  makeParticles();
  const dpr = Math.min(2, devicePixelRatio || 1), mini = $('mini'), big = $('big');
  mini.width = Math.round(mini.clientWidth * dpr) || 300; mini.height = Math.round(mini.width * MAPH / MAPW);
  const bw = Math.min(innerWidth - 24, (innerHeight - 110) * MAPW / MAPH, 900); big.style.width = bw + 'px'; big.width = Math.round(bw * dpr); big.height = Math.round(big.width * MAPH / MAPW);
  mapStatic = { mini: renderStatic(mini.width / (MAPW * 2), false), big: renderStatic(big.width / (MAPW * 2), true) };
  drawStamps();
  $('count').textContent = W.count;
  $('loading').hidden = true; $('bStart').hidden = false;
  window.__town = { W, player, cam, T, npcs, stamps, setTod: (v) => { tod = v; env.k = v; }, renderer };
  frame();
}
$('bStart').onclick = () => {
  started = true; $('ovStart').hidden = true; sfx.init();
  toast(isTouch ? '左半邊拖曳移動・右半邊拖曳轉視角' : 'WASD 移動・拖曳滑鼠轉視角・E 互動', 4200);
};
boot().catch((e) => { console.error(e); $('loading').textContent = '載入失敗：' + e.message; });
