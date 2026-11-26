// 球類小遊戲共用：公仔造型、卡通材質、陰影、音效、效能自動調整
import * as THREE from "three";

// ---------- 卡通材質 ----------
const GRAD = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const matCache = new Map();
export function toon(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : "");
  if (!extra && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...(extra || {}) });
  if (!extra) matCache.set(key, m);
  return m;
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2a1a2e, side: THREE.BackSide });
/** 公仔描邊：用放大的背面網格（反轉外殼），很便宜 */
export function outline(mesh, k = 0.06) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(1 + k);
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

// ---------- 地面圓形陰影 ----------
const BLOB_TEX = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,0.55)");
  gr.addColorStop(0.6, "rgba(0,0,0,0.25)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const BLOB_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function blob(size, opacity = 1) {
  const m = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity }));
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  return m;
}

// ---------- 公仔 ----------
const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), m);
const sph = (r, m, w = 16, h = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
/**
 * 大頭公仔，身高約 1（腳底 y=0），臉朝 +z。
 * o: { skin, hair, shirt, shorts, shoes, style: 'short'|'pony'|'spiky', band }
 */
export function makeChibi(o) {
  const g = new THREE.Group();
  const skin = toon(o.skin ?? 0xffdcc0), shirt = toon(o.shirt), shorts = toon(o.shorts), hair = toon(o.hair), shoe = toon(o.shoes ?? 0xffffff);
  const dark = new THREE.MeshBasicMaterial({ color: 0x241826 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, opacity: 0.7 });

  const leg = (sx) => {
    const L = new THREE.Group();
    L.position.set(sx * 0.075, 0.29, 0);
    const m = outline(cap(0.058, 0.12, skin), 0.08); m.position.y = -0.11; L.add(m);
    const s = outline(sph(0.07, shoe, 12, 8), 0.08); s.scale.set(1, 0.7, 1.45); s.position.set(0, -0.235, 0.03); L.add(s);
    g.add(L);
    return L;
  };
  const legL = leg(-1), legR = leg(1);
  const pants = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.13, 14), shorts), 0.05);
  pants.position.y = 0.31; g.add(pants);
  const body = outline(cap(0.13, 0.1, shirt), 0.05);
  body.position.y = 0.45; g.add(body);
  if (o.stripe != null) { // 球衣條紋
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.04, 14), toon(o.stripe));
    st.position.y = 0.47; g.add(st);
  }

  const head = new THREE.Group();
  head.position.y = 0.6; g.add(head);
  const hm = outline(sph(0.25, skin, 22, 16), 0.04); hm.position.y = 0.23; head.add(hm);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.268, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
  hairCap.position.y = 0.23; hairCap.rotation.x = -0.42; head.add(hairCap);
  const bangs = sph(0.1, hair, 10, 8); bangs.scale.set(1.9, 0.6, 0.8); bangs.position.set(0, 0.4, 0.15); head.add(bangs);
  if (o.style === "pony") {
    const p = outline(sph(0.1, hair, 12, 10), 0.06); p.scale.set(0.9, 1.4, 0.9); p.position.set(0, 0.2, -0.3); head.add(p);
  } else if (o.style === "spiky") {
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), hair);
      const a = -0.9 + i * 0.45;
      c.position.set(Math.sin(a) * 0.18, 0.44, Math.cos(a) * 0.05 - 0.06);
      c.rotation.set(-0.3, 0, -a * 0.6);
      head.add(c);
    }
  }
  if (o.band != null) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.022, 6, 24), toon(o.band));
    b.position.y = 0.31; b.rotation.x = Math.PI / 2 - 0.25; head.add(b);
  }
  for (const sx of [-1, 1]) {
    const e = sph(0.042, dark, 10, 8); e.scale.set(1, 1.35, 0.5); e.position.set(sx * 0.09, 0.21, 0.232); head.add(e);
    const hi = sph(0.014, white, 6, 4); hi.position.set(sx * 0.09 + 0.012, 0.235, 0.252); head.add(hi);
    const bl = sph(0.035, pink, 8, 6); bl.scale.set(1.3, 0.7, 0.4); bl.position.set(sx * 0.155, 0.15, 0.2); head.add(bl);
  }
  const mouth = sph(0.022, dark, 8, 6); mouth.scale.set(1.4, 0.6, 0.5); mouth.position.set(0, 0.12, 0.247); head.add(mouth);

  const arm = (sx) => {
    const A = new THREE.Group();
    A.position.set(sx * 0.165, 0.55, 0);
    const m = outline(cap(0.045, 0.13, shirt), 0.08); m.position.y = -0.1; A.add(m);
    const h = outline(sph(0.052, skin, 10, 8), 0.08); h.position.y = -0.21; A.add(h);
    const hand = new THREE.Group(); hand.position.y = -0.22; A.add(hand);
    A.rotation.z = sx * 0.18;
    g.add(A);
    return { A, hand };
  };
  const L = arm(-1), R = arm(1);
  return { g, head, body, legL, legR, armL: L.A, armR: R.A, handL: L.hand, handR: R.hand };
}

/** 走路／待機動畫 */
export function animChibi(c, t, speed, extra = {}) {
  const s = Math.min(1, speed / 4);
  const ph = t * (8 + speed * 1.4);
  c.legL.rotation.x = Math.sin(ph) * 0.8 * s;
  c.legR.rotation.x = -Math.sin(ph) * 0.8 * s;
  c.body.position.y = 0.45 + Math.abs(Math.sin(ph)) * 0.025 * s + Math.sin(t * 3) * 0.004;
  c.head.position.y = 0.6 + Math.abs(Math.sin(ph)) * 0.03 * s + Math.sin(t * 3 + 0.5) * 0.006;
  if (!extra.keepL) c.armL.rotation.x = -Math.sin(ph) * 0.6 * s;
}

// ---------- 音效（WebAudio 合成，不需要音檔） ----------
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  tone(f, dur, type = "sine", vol = 0.3, f2 = null, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, freq = 1200, q = 1, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.2, null, i * 0.09)); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.18, null, i * 0.12)); }
  point(good) { good ? this.tone(880, 0.12, "triangle", 0.15, 1320) : this.tone(300, 0.18, "triangle", 0.14, 200); }
  cheer() { this.noise(1.2, 0.12, 900, 0.4); this.noise(0.9, 0.08, 2200, 0.6, 0.1); }
}

// ---------- 渲染器與自動降畫質 ----------
export function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
  r.setPixelRatio(r.maxPR);
  let acc = 0, frames = 0, low = false;
  /** 每幀呼叫：連續幾秒偏慢就把解析度降到 1 倍（甚至 0.8） */
  r.tick = (dt) => {
    acc += dt; frames++;
    if (acc > 2) {
      const avg = acc / frames;
      const pr = r.getPixelRatio();
      if (avg > 1 / 45 && pr > 0.8) { r.setPixelRatio(Math.max(0.8, pr - 0.25)); low = true; }
      else if (!low && avg < 1 / 58 && pr < r.maxPR) r.setPixelRatio(Math.min(r.maxPR, pr + 0.25));
      acc = 0; frames = 0;
    }
  };
  return r;
}

export function fitRenderer(renderer, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);

/** 可轉動的球（貼一條帶子，旋轉才看得出來） */
export function makeBall(radius, base, band, segW = 18, segH = 12) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 64);
  g.fillStyle = band;
  g.fillRect(0, 26, 128, 12);
  g.fillRect(56, 0, 16, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, segW, segH), new THREE.MeshToonMaterial({ map: tex, gradientMap: GRAD }));
  return m;
}

/** 球的拖尾：依旋轉換顏色 */
export class Trail {
  constructor(scene, n = 14) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.line = new THREE.Line(this.geo, this.mat);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }
  reset(p) { for (let i = 0; i < this.n; i++) this.pos.set([p.x, p.y, p.z], i * 3); this.geo.attributes.position.needsUpdate = true; }
  push(p) {
    this.pos.copyWithin(3, 0, (this.n - 1) * 3);
    this.pos[0] = p.x; this.pos[1] = p.y; this.pos[2] = p.z;
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** 共用畫面：難度選單、結束畫面、提示文字 */
export function ui() {
  const $ = (id) => document.getElementById(id);
  let toastT = 0;
  return {
    $,
    toast(msg, cls = "", ms = 1300) {
      const t = $("toast");
      t.textContent = msg; t.className = "toast show " + cls;
      clearTimeout(toastT);
      toastT = setTimeout(() => (t.className = "toast " + cls), ms);
    },
    spin(label, amt, cls) {
      const s = $("spin");
      if (!label) { s.className = "spin"; return; }
      s.querySelector("b").textContent = label;
      s.querySelector("i").style.width = Math.round(Math.min(1, amt) * 100) + "%";
      s.className = "spin show " + cls;
      clearTimeout(s._t);
      s._t = setTimeout(() => (s.className = "spin " + cls), 1400);
    },
    show(id, on) { $(id).hidden = !on; },
  };
}
