// 翠嶺高爾夫球場：18 洞、標準桿 72、全長約 7,050 碼（照真實冠軍場的長度）
// 座標：公尺。每一洞自己一個座標系：發球台在原點附近，往 -z 方向打。y 是高度。
export const YD = 0.9144;

/* ---------------- 雜訊 ---------------- */
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(i, j, seed) { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z, seed = 0) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, z, oct = 4, seed = 0) { let s = 0, a = 1, f = 1, n = 0; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f, seed + k * 17); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- 折線（中心線） ---------------- */
export class Line {
  constructor(pts) {
    this.p = pts; this.s = [0];
    for (let i = 1; i < pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.s[this.s.length - 1];
  }
  /** {s, d（有號：在行進方向右側為正）, x, z} */
  near(x, z) {
    let best = { d2: Infinity };
    const P = this.p;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0], az = P[i][1], vx = P[i + 1][0] - ax, vz = P[i + 1][1] - az, L2 = vx * vx + vz * vz;
      let t = ((x - ax) * vx + (z - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t, pz = az + vz * t, d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < best.d2) best = { d2, i, t, px, pz, vx, vz, L: Math.sqrt(L2) };
    }
    const side = Math.sign((x - best.px) * (-best.vz) + (z - best.pz) * best.vx) || 1;   // 右手邊（-vz, vx）
    return { s: this.s[best.i] + best.L * best.t, d: Math.sqrt(best.d2) * side, x: best.px, z: best.pz, tx: best.vx / best.L, tz: best.vz / best.L };
  }
  at(s) {
    s = clamp(s, 0, this.len);
    let i = 0; while (i < this.s.length - 2 && this.s[i + 1] < s) i++;
    const t = (s - this.s[i]) / (this.s[i + 1] - this.s[i] || 1), a = this.p[i], b = this.p[i + 1];
    const L = this.s[i + 1] - this.s[i] || 1;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / L, tz: (b[1] - a[1]) / L };
  }
}

/* ---------------- 18 洞（碼數照真實球場） ---------------- */
// shape: S 直、L/R 左右狗腿、LL/RR/LR 兩次轉彎；turnAt 轉彎處（碼，從發球台）；elev 果嶺相對發球台的高低差（m）
// haz: fbL/fbR 球道沙坑, cross 橫跨沙坑, gbL/gbR/gbF/gbB 果嶺沙坑, wF 果嶺前水塘, wL/wR 沿邊湖, wC 發球台前水域（短洞）, creek 小溪橫越
export const HOLES = [
  { n: 1, par: 4, yards: 405, name: "晨露", shape: "R", turnAt: 250, turn: 18, elev: -3, fw: 36, haz: ["fbL", "gbL", "gbR"] },
  { n: 2, par: 5, yards: 535, name: "長堤", shape: "LR", turnAt: 270, turn: 16, turnAt2: 430, turn2: -14, elev: 2, fw: 38, haz: ["wL", "fbR", "cross", "gbF", "gbR"] },
  { n: 3, par: 3, yards: 178, name: "鏡湖", shape: "S", elev: -6, fw: 0, haz: ["wC", "gbB", "gbL"] },
  { n: 4, par: 4, yards: 428, name: "松濤", shape: "L", turnAt: 255, turn: 24, elev: 5, fw: 34, haz: ["fbR", "fbL", "gbL", "gbF"] },
  { n: 5, par: 4, yards: 372, name: "小溪", shape: "S", elev: -2, fw: 36, haz: ["creek", "gbR", "gbL"] },
  { n: 6, par: 3, yards: 206, name: "高台", shape: "S", elev: 8, fw: 0, haz: ["gbF", "gbL", "gbR"] },
  { n: 7, par: 5, yards: 562, name: "蜿蜒", shape: "RL", turnAt: 275, turn: 20, turnAt2: 445, turn2: -22, elev: -5, fw: 36, haz: ["fbL", "fbR", "wR", "gbL", "gbB"] },
  { n: 8, par: 4, yards: 446, name: "逆風", shape: "S", elev: 3, fw: 34, haz: ["fbL", "fbR", "gbL", "gbR", "gbF"] },
  { n: 9, par: 4, yards: 412, name: "歸途", shape: "R", turnAt: 240, turn: 26, elev: 0, fw: 36, haz: ["wF", "fbL", "gbB"] },
  { n: 10, par: 4, yards: 394, name: "竹林", shape: "L", turnAt: 245, turn: 20, elev: -4, fw: 36, haz: ["fbR", "gbL", "gbR"] },
  { n: 11, par: 3, yards: 156, name: "島嶼", shape: "S", elev: -3, fw: 0, haz: ["wC", "gbF"] },
  { n: 12, par: 5, yards: 515, name: "雙湖", shape: "R", turnAt: 300, turn: 18, elev: 1, fw: 38, haz: ["wL", "wF", "fbR", "gbB"] },
  { n: 13, par: 4, yards: 465, name: "長坡", shape: "S", elev: 9, fw: 36, haz: ["fbL", "cross", "gbL", "gbR"] },
  { n: 14, par: 4, yards: 352, name: "誘惑", shape: "L", turnAt: 215, turn: 30, elev: -2, fw: 32, haz: ["wL", "gbF", "gbR"] },
  { n: 15, par: 3, yards: 221, name: "峽谷", shape: "S", elev: -9, fw: 0, haz: ["gbL", "gbR", "gbF"] },
  { n: 16, par: 5, yards: 548, name: "大彎", shape: "LL", turnAt: 260, turn: 14, turnAt2: 430, turn2: 16, elev: 4, fw: 38, haz: ["fbR", "creek", "gbL", "gbF"] },
  { n: 17, par: 4, yards: 432, name: "風口", shape: "R", turnAt: 260, turn: 16, elev: -1, fw: 34, haz: ["wR", "fbL", "gbR", "gbB"] },
  { n: 18, par: 4, yards: 458, name: "凱旋", shape: "L", turnAt: 265, turn: 18, elev: 2, fw: 36, haz: ["wF", "wL", "fbR", "gbL", "gbR"] },
];
export const COURSE = { name: "翠嶺高爾夫球場", par: HOLES.reduce((a, h) => a + h.par, 0), yards: HOLES.reduce((a, h) => a + h.yards, 0) };

/* ---------------- 地面種類 ---------------- */
export const SURF = { TEE: 1, FAIRWAY: 2, FRINGE: 3, GREEN: 4, ROUGH: 5, DEEP: 6, BUNKER: 7, WATER: 8, PATH: 9, OB: 10 };
export const SURF_NAME = { 1: "發球台", 2: "球道", 3: "果嶺邊", 4: "果嶺", 5: "長草", 6: "深長草", 7: "沙坑", 8: "水域", 9: "車道", 10: "界外" };

/** 有花瓣的橢圓：回傳正規化距離（<1 在裡面） */
export function blobDist(b, x, z) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
  const lx = (dx * c + dz * s) / b.rx, lz = (-dx * s + dz * c) / b.rz;
  const r = Math.hypot(lx, lz), th = Math.atan2(lz, lx);
  return r / (1 + b.a1 * Math.sin(2 * th + b.p1) + b.a2 * Math.sin(3 * th + b.p2));
}

/* ---------------- 單洞 ---------------- */
export class Hole {
  constructor(spec) {
    Object.assign(this, spec);
    const r = rng(spec.n * 7919 + 13);
    this.r = r; this.seed = spec.n * 31;
    this.len = spec.yards * YD;
    // 中心線：從發球台往 -z 出發，依形狀轉彎；總長 = 實際碼數
    const segs = [];
    const deg = Math.PI / 180;
    if (spec.shape === "S") segs.push([this.len, 0]);
    else if (spec.shape.length === 1) segs.push([spec.turnAt * YD, 0], [this.len - spec.turnAt * YD, (spec.shape === "R" ? 1 : -1) * spec.turn * deg]);
    else segs.push([spec.turnAt * YD, 0], [(spec.turnAt2 - spec.turnAt) * YD, (spec.shape[0] === "R" ? 1 : -1) * spec.turn * deg], [this.len - spec.turnAt2 * YD, (spec.shape[1] === "R" ? 1 : -1) * Math.abs(spec.turn2) * deg]);
    const raw = [[0, 0]]; let hd = 0, x = 0, z = 0;
    for (const [L, t] of segs) { hd += t; const n = Math.max(2, Math.ceil(L / 12)); for (let k = 1; k <= n; k++) { x += Math.sin(hd) * (L / n); z -= Math.cos(hd) * (L / n); raw.push([x, z]); } }
    // 轉角圓滑化（長度幾乎不變），再把長度校正回實際碼數
    let pts = raw;
    for (let it = 0; it < 3; it++) pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : [(pts[i - 1][0] + 2 * p[0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * p[1] + pts[i + 1][1]) / 4]));
    let L = new Line(pts);
    const k = this.len / L.len; pts = pts.map(([a, b]) => [a * k, b * k]);
    this.line = new Line(pts);
    const end = this.line.at(this.line.len);
    // 果嶺
    const gr = spec.par === 3 ? 15 : spec.par === 5 ? 17 : 16;
    this.green = { x: end.x, z: end.z, rot: Math.atan2(end.tz, end.tx) + (r() - 0.5) * 0.6, rx: gr * (1.05 + r() * 0.25), rz: gr * (0.8 + r() * 0.15), a1: 0.06 + r() * 0.06, p1: r() * 6.28, a2: 0.04 + r() * 0.05, p2: r() * 6.28 };
    this.greenDir = { x: end.tx, z: end.tz };
    // 果嶺坡度：主要從後往前傾（1.5–3%），加上起伏
    const ga = Math.atan2(-end.tz, -end.tx) + (r() - 0.5) * 1.6;
    this.greenTilt = { x: Math.cos(ga) * (0.015 + r() * 0.015), z: Math.sin(ga) * (0.015 + r() * 0.015) };
    this.greenWaves = [0, 1, 2].map(() => ({ kx: (r() - 0.5) * 0.4, kz: (r() - 0.5) * 0.4, a: 0.06 + r() * 0.1, p: r() * 6.28 }));
    // 發球台：中心在原點後方一點
    this.tee = { x: 0, z: 4, w: 9, l: 18, rot: 0 };
    this.teeSpot = { x: 0, z: 0 };
    this.fwStart = spec.par === 3 ? this.len : spec.par === 4 ? 150 * YD : 160 * YD;
    // 地形高程：發球台 → 果嶺線性
    this.baseY = 20 + spec.n * 0.0;
    this.bunkers = []; this.waters = []; this.creeks = []; this.trees = [];
    this.pin = this.pinPosition(0);
    this.buildHazards();
    this.bbox = this.computeBBox();
    this.buildTrees();
  }
  elevAt(s) { return this.baseY + 1.0 + (this.elev * smooth(0, 1, s / this.len)); }
  fwHalf(s) {
    if (s < this.fwStart - 2 || s > this.len - 14) return 0;
    const base = this.fw / 2, w = base * (1 + 0.12 * Math.sin(s * 0.021 + this.seed) + 0.06 * Math.sin(s * 0.057 + this.seed * 2));
    return w * smooth(this.fwStart - 2, this.fwStart + 18, s);
  }
  blob(o) { const r = this.r; return { a1: 0.08 + r() * 0.12, p1: r() * 6.28, a2: 0.05 + r() * 0.08, p2: r() * 6.28, rot: r() * 3.14, ...o }; }
  buildHazards() {
    const L = this.line, r = this.r, g = this.green;
    const atS = (s, d) => { const p = L.at(s); return { x: p.x + -p.tz * d, z: p.z + p.tx * d, tx: p.tx, tz: p.tz }; };
    const gAt = (ang, off) => { const dx = this.greenDir.x, dz = this.greenDir.z, c = Math.cos(ang), s = Math.sin(ang); const vx = dx * c - dz * s, vz = dx * s + dz * c; return { x: g.x + vx * (Math.max(g.rx, g.rz) + off), z: g.z + vz * (Math.max(g.rx, g.rz) + off) }; };
    const landing = this.turnAt ? this.turnAt * YD : Math.min(this.len - 120, 245 * YD);
    for (const h of this.haz) {
      if (h === "fbL" || h === "fbR") { const sgn = h === "fbR" ? 1 : -1, p = atS(landing + (r() - 0.3) * 25, sgn * (this.fw / 2 + 4)); this.bunkers.push(this.blob({ x: p.x, z: p.z, rx: 9 + r() * 6, rz: 5 + r() * 3, rot: Math.atan2(p.tz, p.tx), depth: 0.9 })); }
      if (h === "cross") { const p = atS(this.len - 95 - r() * 30, (r() - 0.5) * 6); this.bunkers.push(this.blob({ x: p.x, z: p.z, rx: 4.5, rz: this.fw / 2 + 2, rot: Math.atan2(p.tz, p.tx), depth: 1.0 })); }
      if (h.startsWith("gb")) { const ang = { gbL: -Math.PI / 2, gbR: Math.PI / 2, gbF: Math.PI, gbB: 0 }[h] + (r() - 0.5) * 0.5; const p = gAt(ang, 4); this.bunkers.push(this.blob({ x: p.x, z: p.z, rx: 8 + r() * 4, rz: 4 + r() * 2.5, rot: Math.atan2(p.z - g.z, p.x - g.x) + Math.PI / 2, depth: 1.3, greenside: true })); }
      if (h === "wF") { const p = atS(this.len - 40, 0); this.waters.push(this.blob({ x: p.x, z: p.z, rx: 32, rz: 15, rot: Math.atan2(p.tz, p.tx) + Math.PI / 2 + (r() - 0.5) * 0.4, a1: 0.1, a2: 0.06 })); }
      if (h === "wC") { const p = atS(this.len * 0.45, 0); this.waters.push(this.blob({ x: p.x, z: p.z, rx: 28, rz: this.len * 0.3, rot: Math.atan2(p.tz, p.tx), a1: 0.08, a2: 0.05 })); }
      if (h === "wL" || h === "wR") { const sgn = h === "wR" ? 1 : -1; const s0 = this.fwStart + 20 + r() * 40; const p = atS(s0 + 70, sgn * (this.fw / 2 + 30)); this.waters.push(this.blob({ x: p.x, z: p.z, rx: 80, rz: 22, rot: Math.atan2(p.tz, p.tx), a1: 0.08, a2: 0.06 }));   // rx 沿球道方向、rz 橫向 }
      if (h === "creek") { const s = this.fwStart + 30 + r() * 60; const p = L.at(s); const nx = -p.tz, nz = p.tx; const pts = []; for (let k = -6; k <= 6; k++) { const d = k * 15; pts.push([p.x + nx * d + p.tx * Math.sin(k * 0.9 + this.seed) * 10, p.z + nz * d + p.tz * Math.sin(k * 0.9 + this.seed) * 10]); } this.creeks.push({ line: new Line(pts), w: 3.2 }); }
    }
  }
  pinPosition(k) {
    // 每天的旗位：果嶺上前中後、左右
    const g = this.green, r = rng(this.n * 101 + k * 7);
    const ang = r() * 6.28, rr = 0.2 + r() * 0.42;
    const c = Math.cos(g.rot), s = Math.sin(g.rot), lx = Math.cos(ang) * rr * g.rx, lz = Math.sin(ang) * rr * g.rz;
    return { x: g.x + lx * c - lz * s, z: g.z + lx * s + lz * c };
  }
  computeBBox() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of this.line.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (const w of this.waters) { x0 = Math.min(x0, w.x - w.rz); x1 = Math.max(x1, w.x + w.rz); z0 = Math.min(z0, w.z - w.rz); z1 = Math.max(z1, w.z + w.rz); }
    const m = 130;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  }
  /** 離球道中心線多遠算界外 */
  obDist(s) { return Math.max(48, this.fw / 2 + 32) + (this.par === 3 ? 10 : 0); }

  /* ---------- 高度 ---------- */
  height(x, z) { return this.cache ? this.cached(x, z) : this.heightExact(x, z); }
  heightExact(x, z) {
    const n = this.line.near(x, z), s = n.s, ad = Math.abs(n.d);
    let h = this.elevAt(s);
    const seed = this.seed;
    const big = fbm(x * 0.006, z * 0.006, 3, seed) * 9, mid = fbm(x * 0.022, z * 0.022, 3, seed + 5) * 2.2, fine = fbm(x * 0.08, z * 0.08, 2, seed + 9) * 0.35;
    // 球道內起伏小，越外面越大
    const k = smooth(14, 70, ad);
    h += big * (0.25 + 0.75 * k) + mid * (0.35 + 0.65 * k) + fine * (0.4 + 0.6 * k);
    // 長草區的土丘
    const fw = Math.max(12, this.fwHalf(s));
    h += 1.4 * Math.exp(-(((ad - fw - 10) / 7) ** 2)) * (0.6 + 0.4 * vnoise(s * 0.03, 3, seed));
    // 界外外面：坡地、樹林
    h += smooth(60, 160, ad) * (6 + big * 0.6);
    // 果嶺：抬高的平台 + 傾斜 + 起伏
    const g = this.green, gd = blobDist(g, x, z);
    if (gd < 2.2) {
      const gy = this.elevAt(this.len) + 0.7 + this.greenPlane(x, z);
      const w = 1 - smooth(1.05, 2.0, gd);
      h = lerp(h, gy, w);
    }
    // 發球台：平台
    const t = this.tee, tdx = Math.abs(x - t.x) - t.w / 2, tdz = Math.abs(z - t.z) - t.l / 2, td = Math.max(tdx, tdz);
    if (td < 6) h = lerp(h, this.elevAt(0) + 1.0, 1 - smooth(0, 6, td));
    // 沙坑：凹下去，邊緣有唇
    for (const b of this.bunkers) {
      const d = blobDist(b, x, z);
      if (d < 1.6) h += d < 1 ? -b.depth * (1 - d * d) : 0.35 * Math.exp(-(((d - 1.15) / 0.18) ** 2));
    }
    // 水：挖成凹地
    for (const w of this.waters) { const d = blobDist(w, x, z); if (d < 1.5) { const lvl = this.waterLevel(w); h = Math.min(h, lerp(lvl - 2.2, Math.max(h, lvl + 0.4), smooth(0.85, 1.45, d))); } }
    for (const c of this.creeks) { const q = c.line.near(x, z), d = Math.abs(q.d); if (d < c.w * 3) { const lvl = this.creekLevel(c); h = Math.min(h, lerp(lvl - 1.2, Math.max(h, lvl + 0.3), smooth(c.w * 0.7, c.w * 2.6, d))); } }
    return h;
  }
  greenPlane(x, z) {
    const g = this.green, dx = x - g.x, dz = z - g.z;
    let h = dx * this.greenTilt.x + dz * this.greenTilt.z;
    for (const w of this.greenWaves) h += w.a * Math.sin(dx * w.kx + dz * w.kz + w.p);
    return h;
  }
  waterLevel(w) { if (w._lvl === undefined) { const n = this.line.near(w.x, w.z); w._lvl = this.elevAt(n.s) - 1.2 + Math.min(0, fbm(w.x * 0.006, w.z * 0.006, 3, this.seed) * 9 * 0.3); } return w._lvl; }
  creekLevel(c) { if (c._lvl === undefined) { const p = c.line.at(c.line.len / 2), n = this.line.near(p.x, p.z); c._lvl = this.elevAt(n.s) - 1.0; } return c._lvl; }
  /** 預先算好整洞的高度格子（之後物理、地形網格都用雙線性內插，很快） */
  buildCache(step = 1, onProgress) {
    const bb = this.bbox, W = Math.ceil((bb.x1 - bb.x0) / step) + 2, H = Math.ceil((bb.z1 - bb.z0) / step) + 2, a = new Float32Array(W * H);
    for (let j = 0; j < H; j++) { for (let i = 0; i < W; i++) a[j * W + i] = this.heightExact(bb.x0 + i * step, bb.z0 + j * step); if (onProgress && j % 40 === 0) onProgress(j / H); }
    this.cache = { a, W, H, step, x0: bb.x0, z0: bb.z0 };
    for (const t of this.trees) t.y = this.height(t.x, t.z), t.cy = t.y + TREE_SPECS[t.kind].cy * t.s;
  }
  cached(x, z) {
    const c = this.cache, fx = (x - c.x0) / c.step, fz = (z - c.z0) / c.step;
    if (fx < 0 || fz < 0 || fx >= c.W - 1 || fz >= c.H - 1) return this.heightExact(x, z);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * c.W + i, A = c.a;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + c.W] * (1 - u) + A[k + c.W + 1] * u) * v;
  }
  normal(x, z, e = 0.15) {
    if (this.cache) e = Math.max(e, this.cache.step * 0.5);
    const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx / (2 * e), nz = -hz / (2 * e), l = Math.hypot(nx, 1, nz);
    return { x: nx / l, y: 1 / l, z: nz / l };
  }

  /* ---------- 地面種類 ---------- */
  surface(x, z) {
    for (const w of this.waters) if (blobDist(w, x, z) < 1) return SURF.WATER;
    for (const c of this.creeks) if (Math.abs(c.line.near(x, z).d) < c.w) return SURF.WATER;
    const n = this.line.near(x, z);
    if (Math.abs(n.d) > this.obDist(n.s) || n.s > this.len + 45 || (n.s <= 0 && Math.hypot(x, z) > 60)) return SURF.OB;
    for (const b of this.bunkers) if (blobDist(b, x, z) < 1) return SURF.BUNKER;
    const gd = blobDist(this.green, x, z);
    if (gd < 1) return SURF.GREEN;
    if (gd < 1.18) return SURF.FRINGE;
    const t = this.tee; if (Math.abs(x - t.x) < t.w / 2 && Math.abs(z - t.z) < t.l / 2) return SURF.TEE;
    const fw = this.fwHalf(n.s);
    if (Math.abs(n.d) < fw) return SURF.FAIRWAY;
    if (Math.abs(n.d) < fw + 2.2 && fw > 0) return SURF.FRINGE;
    if (Math.abs(n.d) > Math.max(fw, 14) + 14) return SURF.DEEP;
    return SURF.ROUGH;
  }

  /* ---------- 樹 ---------- */
  buildTrees() {
    const r = rng(this.n * 977), out = [];
    const L = this.line, bb = this.bbox;
    const ok = (x, z) => {
      if (blobDist(this.green, x, z) < 2.6) return false;
      for (const b of this.bunkers) if (blobDist(b, x, z) < 1.6) return false;
      for (const w of this.waters) if (blobDist(w, x, z) < 1.25) return false;
      for (const c of this.creeks) if (Math.abs(c.line.near(x, z).d) < c.w * 2.5) return false;
      if (Math.abs(x) < 14 && z > -30 && z < 30) return false;
      return true;
    };
    // 沿球道兩側的樹林（界外附近最密）
    for (let s = -20; s < L.len + 60; s += 4.5) for (const sgn of [-1, 1]) {
      const p = L.at(Math.min(s, L.len)), fw = Math.max(this.fwHalf(Math.max(0, s)), 12);
      for (let k = 0; k < 3; k++) {
        const d = fw + 24 + r() * 70 + k * 8;
        if (r() < 0.45 - k * 0.1) continue;
        const x = p.x + -p.tz * d * sgn + (r() - 0.5) * 6, z = p.z + p.tx * d * sgn + (r() - 0.5) * 6;
        if (ok(x, z)) out.push({ x, z, kind: r() < 0.55 ? 0 : r() < 0.6 ? 1 : 2, s: 0.8 + r() * 0.55, rot: r() * 6.28 });
      }
    }
    // 長草區偶爾的單棵大樹（會擋球）
    for (let i = 0; i < 10; i++) { const s = this.fwStart * 0.5 + r() * (L.len - 60), p = L.at(s), sgn = r() < 0.5 ? -1 : 1, d = this.fwHalf(s) + 12 + r() * 12; const x = p.x + -p.tz * d * sgn, z = p.z + p.tx * d * sgn; if (ok(x, z)) out.push({ x, z, kind: 1, s: 1.1 + r() * 0.3, rot: r() * 6.28, lone: true }); }
    // 果嶺後面的背景樹
    for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = 40 + r() * 50, x = this.green.x + this.greenDir.x * 45 + Math.cos(a) * d, z = this.green.z + this.greenDir.z * 45 + Math.sin(a) * d; if (ok(x, z)) out.push({ x, z, kind: r() < 0.5 ? 0 : 2, s: 0.9 + r() * 0.5, rot: r() * 6.28 }); }
    for (const t of out) { t.y = this.height(t.x, t.z); const sp = TREE_SPECS[t.kind]; t.h = sp.h * t.s; t.cr = sp.cr * t.s; t.cy = t.y + sp.cy * t.s; t.trunk = sp.trunk * t.s; }
    this.trees = out;
    this.treeGrid = new Map();
    for (const t of out) { const k = `${Math.floor(t.x / 16)},${Math.floor(t.z / 16)}`; if (!this.treeGrid.has(k)) this.treeGrid.set(k, []); this.treeGrid.get(k).push(t); }
  }
  treesNear(x, z) { const i = Math.floor(x / 16), j = Math.floor(z / 16), out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = this.treeGrid.get(`${i + a},${j + b}`); if (l) out.push(...l); } return out; }
  /** 往哪裡打：下一個轉彎點或果嶺（給自動球童建議用） */
  aimPoint(x, z, carry) {
    const n = this.line.near(x, z);
    const s = Math.min(this.len, n.s + carry);
    const dPin = Math.hypot(this.pin.x - x, this.pin.z - z);
    if (dPin <= carry * 1.05 || s >= this.len - 5) return { x: this.pin.x, z: this.pin.z };
    const p = this.line.at(s); return { x: p.x, z: p.z };
  }
}
export const TREE_SPECS = [
  { name: "松", h: 17, cr: 4.2, cy: 11, trunk: 0.35 },
  { name: "橡樹", h: 15, cr: 6.5, cy: 9.5, trunk: 0.5 },
  { name: "柏", h: 13, cr: 2.6, cy: 7.5, trunk: 0.28 },
];
export function loadHole(n) { return new Hole(HOLES[n - 1]); }
