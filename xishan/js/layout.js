// 溪山行旅：世界配置（公尺）。y 向上，水面 y = 0。
// 這個檔案只有數學與資料，不依賴 Three.js，可以直接在 Node 測試。

/* ---------------- 小工具 ---------------- */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Catmull-Rom 取樣成等距折線 */
export function spline(pts, step = 2) {
  const raw = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(pts[pts.length - 1]);
  // 重新取樣成等距
  const out = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    let [ax, az] = raw[i - 1];
    const [bx, bz] = raw[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      ax += (bx - ax) * t; az += (bz - az) * t;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az); acc = 0;
    }
    acc += seg;
  }
  if (Math.hypot(out[out.length - 1][0] - raw[raw.length - 1][0], out[out.length - 1][1] - raw[raw.length - 1][1]) > step * 0.3) out.push(raw[raw.length - 1]);
  return out;
}

/** 折線工具：最近點、切線、弧長 */
export class Line {
  constructor(pts, cell = 24) {
    this.p = pts;
    this.s = [0];
    for (let i = 1; i < pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.s[this.s.length - 1];
    // 空間格子加速最近點查詢
    this.cell = cell; this.grid = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
      const z0 = Math.floor(Math.min(az, bz) / cell), z1 = Math.floor(Math.max(az, bz) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = gx + "," + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(i);
      }
    }
  }
  /** 回傳 {d 距離, s 弧長, side 左右(+1 在行進方向右側), x, z} */
  near(x, z, maxR = 200) {
    const c = this.cell;
    const gx = Math.floor(x / c), gz = Math.floor(z / c);
    let best = { d: Infinity, s: 0, side: 1, x: 0, z: 0 };
    for (let r = 0; r <= Math.ceil(maxR / c); r++) {
      for (let ix = gx - r; ix <= gx + r; ix++) for (let iz = gz - r; iz <= gz + r; iz++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iz - gz)) !== r) continue;
        const list = this.grid.get(ix + "," + iz);
        if (!list) continue;
        for (const i of list) {
          const [ax, az] = this.p[i], [bx, bz] = this.p[i + 1];
          const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
          const t = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
          const px = ax + vx * t, pz = az + vz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < best.d) {
            // 右側：(-vz, vx) 是行進方向的右手邊（x 東、z 南的座標，從上往下看）
            const side = ((x - px) * -vz + (z - pz) * vx) >= 0 ? 1 : -1;
            best = { d, s: this.s[i] + Math.sqrt(L2) * t, side, x: px, z: pz };
          }
        }
      }
      if (best.d < (r + 0.5) * c) break;
    }
    return best;
  }
  at(s) {
    s = clamp(s, 0, this.len);
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const [ax, az] = this.p[lo], [bx, bz] = this.p[hi];
    const L = this.s[hi] - this.s[lo] || 1, t = (s - this.s[lo]) / L;
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx, tz, nx: -tz, nz: tx };
  }
}

/* ---------------- 河流 ---------------- */
export const WATER = 0;
export const BANK = 2.0;                 // 岸上地面高度
export const RIVER_HW = 21;              // 河寬一半

export const river = new Line(spline([
  [-620, -430], [-430, -300], [-300, -205], [-200, -135], [-125, -70], [-70, -20], [-15, 14], [60, 30], [160, 31], [290, 22], [430, 10], [640, -2],
], 2));

// 小溪：從西邊流入河（在主橋下游的西岸），主橋旁的朱欄小橋跨在它上面
const creekPts = (() => {
  const m = river.near(-118, -18);
  return spline([[-330, 40], [-260, 22], [-205, 6], [-160, -2], [m.x - 6, m.z + 6]], 2);
})();
export const creek = new Line(creekPts);
export const CREEK_HW = 3.6;

/* ---------------- 主橋（虹橋） ---------------- */
function bridgeFrame() {
  const n = river.near(-150, -95);
  const p = river.at(n.s);
  // 橋軸 = 河道的法線方向，a < 0 在西岸（外彎），a > 0 在東岸（市鎮）
  let ax = p.nx, az = p.nz;
  // 讓 a 正方向指向東北（市鎮）
  if (ax - az < 0) { ax = -ax; az = -az; }
  return { cx: p.x, cz: p.z, ax, az, tx: p.tx, tz: p.tz, s: n.s };
}
const BF = bridgeFrame();
export const bridge = {
  ...BF,
  half: 32,           // 半長
  hw: 4.0,            // 半寬（含欄杆）
  walkHW: 3.45,       // 可走範圍
  rise: 5.6,
  y0: 2.1,
  thick: 0.95,        // 橋面到下緣
  piers: [-16, -7, 7, 16],
  channel: 7,         // 中央航道半寬（立柱中心）
  deck(a) { return this.y0 + this.rise * (1 - (a / this.half) ** 2); },
  toLocal(x, z) { const dx = x - this.cx, dz = z - this.cz; return { a: dx * this.ax + dz * this.az, b: dx * this.tx + dz * this.tz }; },
  toWorld(a, b) { return { x: this.cx + a * this.ax + b * this.tx, z: this.cz + a * this.az + b * this.tz }; },
};
export const bridgeW = bridge.toWorld(-bridge.half, 0);   // 西端
export const bridgeE = bridge.toWorld(bridge.half, 0);    // 東端

/* 朱欄小橋：跨小溪 */
function smallBridgeFrame() {
  // 沿河岸小路與小溪交會處
  const s = creek.len - 26;
  const p = creek.at(s);
  return { cx: p.x, cz: p.z, ax: p.nx, az: p.nz, tx: p.tx, tz: p.tz, half: 8, hw: 1.7, walkHW: 1.35, rise: 1.3, y0: 2.0 };
}
export const smallBridge = {
  ...smallBridgeFrame(),
  deck(a) { return this.y0 + this.rise * (1 - (a / this.half) ** 2); },
  toLocal(x, z) { const dx = x - this.cx, dz = z - this.cz; return { a: dx * this.ax + dz * this.az, b: dx * this.tx + dz * this.tz }; },
  toWorld(a, b) { return { x: this.cx + a * this.ax + b * this.tx, z: this.cz + a * this.az + b * this.tz }; },
};

/* ---------------- 高台大殿 ---------------- */
export const terrace = { cx: 112, cz: -196, hx: 42, hz: 28, top: 11.0, rot: 0 };
export const hall = { cx: 112, cz: -200, w: 40, d: 22, base: 1.3 };
// 前方雙側石階（沿著正面，從地面到台頂）
export const terraceStairs = [
  { x0: 72, x1: 79, z0: -168, z1: -150 },   // 西側
  { x0: 145, x1: 152, z0: -168, z1: -150 }, // 東側
];
// 後方石階：從台頂下到宮苑
export const backStairs = { x0: 108, x1: 116, z0: -242, z1: -224 };

/* ---------------- 碼頭 ---------------- */
function dockAt(px, pz, side, w = 14, out = 9, top = 0.9, name = "") {
  const n = river.near(px, pz);
  const p = river.at(n.s);
  // 朝河心方向
  const inx = -side * p.nx, inz = -side * p.nz;
  const ex = p.x + side * p.nx * RIVER_HW, ez = p.z + side * p.nz * RIVER_HW;   // 岸線
  return { name, x: ex, z: ez, inx, inz, tx: p.tx, tz: p.tz, w, out, top, s: n.s, side };
}
export const docks = [
  dockAt(58, -8, -1, 16, 9, 0.9, "北岸渡口"),
  dockAt(48, 60, 1, 14, 9, 0.9, "南岸渡口"),
  dockAt(172, -5, -1, 18, 8, 0.9, "貨運碼頭"),
];
export function dockLocal(d, x, z) {
  const dx = x - d.x, dz = z - d.z;
  return { o: dx * d.inx + dz * d.inz, t: dx * d.tx + dz * d.tz };
}
/** 碼頭面高度（含往岸上的石階） */
export function dockHeight(d, x, z) {
  const { o, t } = dockLocal(d, x, z);
  if (Math.abs(t) > d.w / 2 || o > d.out || o < -5) return null;
  if (o >= 0) return d.top;
  // 岸邊石階：從碼頭面升到岸上
  if (Math.abs(t) < 3) return lerp(d.top, BANK, smooth(0, 1, -o / 4.2));
  return null;
}

/* ---------------- 道路 ---------------- */
function offsetRiver(s0, s1, off, step = 6) {
  const pts = [];
  for (let s = s0; s <= s1; s += step) { const p = river.at(s); pts.push([p.x + p.nx * off, p.z + p.nz * off]); }
  return pts;
}
const bW = bridgeW, bE = bridgeE;
export const roads = [
  { id: "market", name: "市街", w: 7, kind: "stone", pts: spline([[bE.x + 4 * bridge.ax, bE.z + 4 * bridge.az], [-80, -78], [-30, -56], [30, -46], [110, -44], [190, -46], [260, -42], [330, -30]], 3) },
  { id: "imperial", name: "御街", w: 9, kind: "stone", pts: spline([[112, -45], [112, -100], [112, -146]], 3) },
  { id: "back", name: "後街", w: 5, kind: "earth", pts: spline([[-70, -112], [-10, -118], [60, -122], [150, -118], [240, -106], [320, -88]], 3) },
  { id: "lane1", name: "巷", w: 3.5, kind: "earth", pts: spline([[10, -47], [12, -85], [14, -119]], 3) },
  { id: "lane2", name: "巷", w: 3.5, kind: "earth", pts: spline([[210, -46], [214, -80], [220, -110]], 3) },
  { id: "official", name: "官道", w: 6.5, kind: "earth", pts: spline([[bW.x - 6 * bridge.ax, bW.z - 6 * bridge.az], [-210, -62], [-245, -63], [-320, -70], [-420, -100], [-520, -150]], 3) },
  { id: "bankpath", name: "河岸小路", w: 3.6, kind: "earth", pts: spline(offsetRiver(BF.s - 40, BF.s + 300, 30), 3) },
  { id: "quay", name: "河街", w: 6, kind: "stone", pts: spline(offsetRiver(BF.s + 120, BF.s + 470, -27), 3) },
  { id: "southroad", name: "南岸小路", w: 4, kind: "earth", pts: spline([[48, 72], [40, 110], [10, 150], [-40, 180]], 3) },
  { id: "garden", name: "苑中小徑", w: 3, kind: "stone", pts: spline([[90, -226], [112, -236], [140, -228], [160, -238]], 2) },
  { id: "trail", name: "山徑", w: 2.6, kind: "steps", pts: spline([[160, -238], [178, -262], [196, -282], [212, -302], [222, -318]], 2) },
  { id: "upstream", name: "上游小路", w: 3.2, kind: "earth", pts: spline(offsetRiver(Math.max(0, BF.s - 260), BF.s - 40, 30), 3) },
];
export const roadLines = roads.map((r) => ({ ...r, line: new Line(r.pts, 20) }));

/* ---------------- 觀景亭 ---------------- */
export const pavilion = { x: 224, z: -322, r: 4.2 };

/* ---------------- 地形高度 ---------------- */
function hill(x, z, cx, cz, h, rx, rz = rx) {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  return h * Math.exp(-(dx * dx + dz * dz));
}
function noise2(x, z) {
  return Math.sin(x * 0.021 + Math.sin(z * 0.017) * 1.7) * 0.5 + Math.sin(z * 0.029 - x * 0.011) * 0.35 + Math.sin((x + z) * 0.063) * 0.15;
}
/** 是否是砌石岸（市鎮段、橋邊、碼頭） */
export function embanked(s, side) {
  const bs = BF.s;
  if (s > bs - 30 && s < bs + 30) return true;                // 主橋兩岸
  if (s > bs + 110 && s < bs + 470) return side === -1 || (s > bs + 215 && s < bs + 275);  // 北岸市鎮 + 南岸渡口
  return false;
}
export function hillH(x, z) {
  let h = 0;
  h += hill(x, z, 230, -330, 36, 70, 55);
  h += hill(x, z, 60, -330, 22, 90, 50);
  h += hill(x, z, -110, -360, 26, 110, 70);
  h += hill(x, z, 360, -250, 30, 110, 90);
  h += hill(x, z, -460, -260, 30, 120, 90);
  h += hill(x, z, 120, 330, 22, 160, 90);
  h += hill(x, z, -280, 260, 26, 160, 110);
  h += hill(x, z, 470, 230, 24, 140, 120);
  return h;
}
/** 地形高度（不含橋、碼頭等人造平面） */
export function terrainH(x, z) {
  const r = river.near(x, z, 120);
  let h = BANK + noise2(x, z) * 0.35 * smooth(60, 160, r.d);
  // 山坡（離河越遠越高），市鎮與官署區要平
  const town = smooth(30, 0, Math.max(Math.abs(x - 90) - 190, Math.abs(z + 85) - 80));
  const west = smooth(30, 0, Math.max(Math.abs(x + 230) - 90, Math.abs(z + 60) - 70));
  h += hillH(x, z) * (1 - Math.max(town, west) * 0.95) * smooth(30, 90, r.d);
  // 高台
  const tdx = Math.abs(x - terrace.cx) - terrace.hx, tdz = Math.abs(z - terrace.cz) - terrace.hz;
  if (tdx < 0 && tdz < 0) h = Math.max(h, terrace.top);
  // 河道
  const emb = embanked(r.s, r.side);
  if (r.d < RIVER_HW) {
    const t = r.d / RIVER_HW;
    const bed = -3.2 * (1 - t * t) - 0.6;
    // 砌石岸：牆前直接很深，水線就會貼在牆上（不會有鋸齒）
    h = emb ? Math.min(bed, r.d > RIVER_HW - 3 ? -6 : bed) : Math.min(h, lerp(bed, -0.5, smooth(0.75, 1, t)));
  } else if (!emb) {
    h = Math.min(h, lerp(-0.5, h, smooth(RIVER_HW, RIVER_HW + 7, r.d)));
  }
  // 小溪
  const c = creek.near(x, z, 40);
  if (c.d < CREEK_HW + 5) {
    const bed = -1.4;
    if (c.d < CREEK_HW) h = Math.min(h, bed);
    else h = Math.min(h, lerp(bed, h, smooth(CREEK_HW, CREEK_HW + 5, c.d)));
  }
  return h;
}
/** 地點是不是水面 */
export function isWater(x, z) { return terrainH(x, z) < 0.15; }

/* ---------------- 建築配置 ---------------- */
// type: shop/house/two/tea/hall/gate/pav/... rot 為朝向（弧度，0 = 正面朝南 +z）
export const buildings = [
  // 河街與市街（右側商鋪）
  { id: "tea", name: "茶肆", type: "two", x: 30, z: -38, w: 13, d: 9, rot: 0.02, sign: "茶" },
  { id: "wine", name: "酒樓", type: "two", x: 82, z: -35, w: 15, d: 10, rot: 0.0, sign: "酒", flag: true },
  { id: "cloth", name: "布莊", type: "shop", x: 150, z: -33, w: 12, d: 8, rot: 0.0, sign: "布" },
  { id: "silk", name: "綢緞莊", type: "shop", x: 196, z: -34, w: 12, d: 8, rot: 0.03, sign: "綢" },
  { id: "store", name: "貨棧", type: "ware", x: 238, z: -30, w: 16, d: 10, rot: 0.06 },
  { id: "herb", name: "藥鋪", type: "shop", x: -14, z: -40, w: 11, d: 8, rot: -0.35, sign: "藥" },
  { id: "rice", name: "米行", type: "shop", x: 4, z: -66, w: 11, d: 8, rot: Math.PI - 0.1, sign: "米" },
  { id: "inn", name: "客棧", type: "two", x: 58, z: -64, w: 14, d: 10, rot: Math.PI, sign: "客" },
  { id: "pawn", name: "當鋪", type: "shop", x: 160, z: -62, w: 11, d: 8, rot: Math.PI, sign: "當" },
  { id: "goods", name: "雜貨鋪", type: "shop", x: -52, z: -84, w: 10, d: 8, rot: Math.PI - 0.45, sign: "雜" },
  { id: "noodle", name: "麵館", type: "shop", x: 206, z: -62, w: 10, d: 8, rot: Math.PI, sign: "麵" },
  // 後街民居
  { id: "h1", name: "民居", type: "house", x: -30, z: -132, w: 12, d: 9, rot: Math.PI },
  { id: "h2", name: "民居", type: "house", x: 46, z: -136, w: 13, d: 9, rot: Math.PI },
  { id: "h3", name: "民居", type: "house", x: 180, z: -132, w: 12, d: 9, rot: Math.PI },
  // 高台宮苑
  { id: "hall", name: "大殿", type: "hall", x: hall.cx, z: hall.cz, w: hall.w, d: hall.d, rot: 0 },
  { id: "sideW", name: "西配殿", type: "side", x: 82, z: -212, w: 12, d: 8, rot: Math.PI / 2 },
  { id: "sideE", name: "東配殿", type: "side", x: 142, z: -212, w: 12, d: 8, rot: -Math.PI / 2 },
  { id: "kiosk", name: "水榭", type: "kiosk", x: 92, z: -240, w: 8, d: 6, rot: 0 },
  // 西區（左側）
  { id: "gate", name: "門樓", type: "gate", x: bW.x - 14 * bridge.ax, z: bW.z - 14 * bridge.az, w: 15, d: 6, rot: Math.atan2(-bridge.ax, -bridge.az) },
  { id: "yamen", name: "官署", type: "yamen", x: -275, z: -96, w: 16, d: 10, rot: 0 },
  { id: "academy", name: "書院", type: "house", x: -248, z: -12, w: 14, d: 10, rot: Math.PI },
  { id: "post", name: "驛站", type: "shop", x: -345, z: -54, w: 12, d: 8, rot: Math.PI, sign: "驛" },
  // 南岸
  { id: "ferry", name: "渡口茶棚", type: "shed", x: 46, z: 80, w: 9, d: 6, rot: Math.PI },
  { id: "farm1", name: "農舍", type: "house", x: -40, z: 108, w: 11, d: 8, rot: 0.3 },
  { id: "farm2", name: "農舍", type: "house", x: 130, z: 110, w: 11, d: 8, rot: -0.2 },
];

/** 白牆院落（左側） */
export const walls = [
  // 官署院牆
  { pts: [[-298, -74], [-252, -74], [-252, -114], [-298, -114], [-298, -74]], h: 3.2, gap: [0, 0.42, 0.58] },
  // 書院院牆
  { pts: [[-270, 4], [-226, 4], [-226, -30], [-270, -30], [-270, 4]], h: 3.0, gap: [2, 0.42, 0.58] },
  // 宮苑後牆
  { pts: [[70, -224], [70, -262], [154, -262], [154, -224]], h: 3.4, gap: [1, 0.85, 0.95] },
];

/* ---------------- 市集攤位 ---------------- */
export const stalls = (() => {
  const out = [], r = rng(7);
  const mk = (x, z, rot, kind) => out.push({ x, z, rot, kind, color: r() < 0.5 ? "red" : r() < 0.5 ? "blue" : "red" });
  // 市街兩側
  const m = roadLines.find((q) => q.id === "market").line;
  for (let s = 40; s < m.len - 40; s += 15) {
    const p = m.at(s);
    const side = (Math.floor(s / 15) % 2) ? 1 : -1;
    const x = p.x + p.nx * side * 5.8, z = p.z + p.nz * side * 5.8;
    if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) * 0.62)) continue;
    // 不擋住其他路口（御街、巷子）
    if (roadLines.some((rl) => rl.id !== "market" && rl.line.near(x, z, 30).d < rl.w / 2 + 2.5)) continue;
    mk(x, z, Math.atan2(p.nx * -side, p.nz * -side), r() < 0.35 ? "tent" : "stall");
  }
  // 御街口的小廣場帳篷
  for (const [x, z] of [[100, -58], [124, -58], [98, -76], [126, -78]]) mk(x, z, x < 112 ? Math.PI / 2 : -Math.PI / 2, "tent");
  // 渡口邊
  for (const [x, z] of [[40, -20], [72, -18], [150, -16]]) mk(x, z, 0, "stall");
  return out;
})();

/* ---------------- 樹木 ---------------- */
export const trees = (() => {
  const out = [], r = rng(11);
  const ok = (x, z, clear = 4) => {
    if (terrainH(x, z) < 0.6) return false;
    for (const b of buildings) if (Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) * 0.62 + clear) return false;
    for (const rl of roadLines) if (rl.line.near(x, z, 30).d < rl.w / 2 + 1.5) return false;
    if (Math.abs(x - terrace.cx) < terrace.hx + 2 && Math.abs(z - terrace.cz) < terrace.hz + 2) return false;
    if (x > backStairs.x0 - 3 && x < backStairs.x1 + 3 && z > backStairs.z0 - 4 && z < backStairs.z1 + 1) return false;
    const bl = bridge.toLocal(x, z);
    if (Math.abs(bl.a) < bridge.half + 3 && Math.abs(bl.b) < 6) return false;
    // 不長在院牆上、院門口
    for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < 2) return false;
      if (w.gap && w.gap[0] === i) { const g = (w.gap[1] + w.gap[2]) / 2; if (Math.hypot(x - ax - vx * g, z - az - vz * g) < 8) return false; }
    }
    return true;
  };
  const add = (type, x, z, sc = 1) => { if (ok(x, z)) out.push({ type, x, z, sc: sc * (0.85 + r() * 0.3), rot: r() * Math.PI * 2, seed: Math.floor(r() * 1e6) }); };
  // 橋頭垂柳
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const p = bridge.toWorld(a * (bridge.half + 6), b * 8);
    add("willow", p.x, p.z, 1.1);
  }
  // 沿河垂柳
  for (let s = 40; s < river.len - 40; s += 26) {
    for (const side of [-1, 1]) {
      if (r() < 0.45) continue;
      const p = river.at(s + r() * 10);
      const off = RIVER_HW + 5 + r() * 4;
      add("willow", p.x + side * p.nx * off, p.z + side * p.nz * off);
    }
  }
  // 庭院與林間官道：松柏、闊葉古樹
  const ofc = roadLines.find((q) => q.id === "official").line;
  for (let s = 10; s < ofc.len; s += 11) {
    const p = ofc.at(s);
    for (const side of [-1, 1]) if (r() < 0.8) add(r() < 0.5 ? "pine" : "broad", p.x + side * p.nx * (6 + r() * 8), p.z + side * p.nz * (6 + r() * 8), 1.05);
  }
  for (let i = 0; i < 26; i++) add(r() < 0.55 ? "pine" : "cypress", 70 + r() * 90, -228 - r() * 34);           // 宮苑
  for (let i = 0; i < 40; i++) add(r() < 0.6 ? "pine" : "broad", 150 + r() * 120, -260 - r() * 100, 1.1);       // 後山
  for (let i = 0; i < 18; i++) add(r() < 0.5 ? "cypress" : "broad", -300 + r() * 80, -120 + r() * 130);         // 官署、書院
  for (let i = 0; i < 26; i++) add(r() < 0.5 ? "broad" : "pine", -60 + r() * 260, 90 + r() * 120);               // 南岸
  for (let i = 0; i < 20; i++) add("broad", -40 + r() * 280, -150 + r() * 40, 0.95);                              // 後院
  // 桃花、杏花點綴
  for (const [x, z] of [[-120, -48], [-180, -20], [100, -232], [132, -246], [20, 90], [-230, -80], [-14, -100], [190, -96]]) add("blossom", x, z, 0.9);
  return out;
})();

/* ---------------- 船的航線 ---------------- */
// 遊河路線：北岸渡口 → 往西繞過河灣 → 穿過主橋 → 上游折返 → 再穿橋 → 南岸渡口 → 回北岸
function riverPt(s, off) {
  // 靠近主橋時一律走中央航道（離立柱最遠）
  const k = smooth(28, 60, Math.abs(s - BF.s));
  off *= lerp(0.25, 1, k);
  const p = river.at(s); return [p.x + p.nx * off, p.z + p.nz * off];
}
export function tourRoute() {
  const d0 = docks[0], d1 = docks[1];
  const bs = BF.s;
  const pts = [];
  const dockStand = (d) => [d.x + d.inx * (d.out + 2.2), d.z + d.inz * (d.out + 2.2)];
  pts.push(dockStand(d0));
  for (let s = d0.s - 20; s > bs - 150; s -= 25) pts.push(riverPt(s, -5));
  pts.push(riverPt(bs - 175, 0));
  pts.push(riverPt(bs - 185, 6));
  for (let s = bs - 160; s < d1.s - 20; s += 25) pts.push(riverPt(s, 5));
  pts.push(dockStand(d1));
  pts.push(riverPt(d1.s + 30, 3));
  pts.push(riverPt(d1.s + 55, -3));
  pts.push(riverPt(d0.s + 30, -9));
  pts.push(dockStand(d0));
  const line = new Line(spline(pts, 1.5));
  // 停靠點（弧長）
  const stops = [0, line.near(...dockStand(d1)).s, line.len];
  return { line, stops, docks: [0, 1, 0] };
}
// 其他船的循環路線（不經過渡口）
export function loopRoute(sA, sB, off) {
  const pts = [];
  for (let s = sA; s <= sB; s += 20) pts.push(riverPt(s, off));
  pts.push(riverPt(sB + 18, off * 0.2));
  for (let s = sB; s >= sA; s -= 20) pts.push(riverPt(s, -off));
  pts.push(riverPt(sA - 18, -off * 0.2));
  pts.push(pts[0]);
  return new Line(spline(pts, 1.5));
}

/* ---------------- 行人路線 ---------------- */
export function npcPaths() {
  const paths = [];
  // 過橋：西岸門樓 ↔ 東岸市街
  const bpts = [];
  for (let a = -bridge.half - 12; a <= bridge.half + 10; a += 2) { const p = bridge.toWorld(a, 1.5); bpts.push([p.x, p.z]); }
  paths.push({ pts: bpts, loop: false, n: 6 });
  const bpts2 = [];
  for (let a = bridge.half + 10; a >= -bridge.half - 12; a -= 2) { const p = bridge.toWorld(a, -1.6); bpts2.push([p.x, p.z]); }
  paths.push({ pts: bpts2, loop: false, n: 5 });
  for (const id of ["market", "quay", "back", "official", "bankpath", "imperial"]) {
    const rl = roadLines.find((q) => q.id === id);
    paths.push({ pts: rl.pts, loop: false, n: id === "market" ? 10 : id === "quay" ? 6 : 3, off: rl.w * 0.25 });
  }
  return paths;
}

/* ---------------- 走路：地面與碰撞 ---------------- */
/** 所有可以站的面（回傳高度或 null） */
export function surfaces(x, z) {
  const out = [];
  const t = terrainH(x, z);
  if (t > 0.15) out.push({ y: t, kind: "ground" });
  // 主橋
  let bl = bridge.toLocal(x, z);
  if (Math.abs(bl.a) <= bridge.half + 0.5 && Math.abs(bl.b) <= bridge.walkHW) out.push({ y: bridge.deck(clamp(bl.a, -bridge.half, bridge.half)), kind: "bridge" });
  bl = smallBridge.toLocal(x, z);
  if (Math.abs(bl.a) <= smallBridge.half + 0.4 && Math.abs(bl.b) <= smallBridge.walkHW) out.push({ y: smallBridge.deck(clamp(bl.a, -smallBridge.half, smallBridge.half)), kind: "bridge" });
  for (const d of docks) { const y = dockHeight(d, x, z); if (y !== null) out.push({ y, kind: "dock", dock: d }); }
  // 高台前的石階
  for (const st of terraceStairs) {
    if (x >= st.x0 && x <= st.x1 && z >= st.z0 && z <= st.z1) out.push({ y: lerp(terrace.top, BANK + 0.05, (z - st.z0) / (st.z1 - st.z0)), kind: "stairs" });
  }
  {
    const st = backStairs;
    if (x >= st.x0 && x <= st.x1 && z >= st.z0 && z <= st.z1) out.push({ y: lerp(terrainH((st.x0 + st.x1) / 2, st.z0) + 0.05, terrace.top, (z - st.z0) / (st.z1 - st.z0)), kind: "stairs" });
  }
  // 大殿台基（含前方踏步）
  if (Math.abs(x - hall.cx) < hall.w / 2 + 5 && z > hall.cz - hall.d / 2 - 5 && z < hall.cz + hall.d / 2 + 5) {
    out.push({ y: terrace.top + hall.base, kind: "hallbase" });
  }
  if (Math.abs(x - hall.cx) < 4 && z >= hall.cz + hall.d / 2 + 5 && z < hall.cz + hall.d / 2 + 9) {
    out.push({ y: lerp(terrace.top + hall.base, terrace.top, (z - (hall.cz + hall.d / 2 + 5)) / 4), kind: "stairs" });
  }
  // 觀景亭地坪
  if (Math.hypot(x - pavilion.x, z - pavilion.z) < pavilion.r + 1.2) out.push({ y: terrainH(pavilion.x, pavilion.z) + 0.6, kind: "pavilion" });
  return out;
}

/** 障礙物（建築、牆、攤位、樹幹），2D 矩形或圓 */
export const obstacles = (() => {
  const o = [];
  for (const b of buildings) {
    if (b.type === "hall") { o.push({ type: "box", x: b.x, z: b.z, hx: b.w / 2 - 3.2, hz: b.d / 2 - 3.2, rot: 0, y0: terrace.top, name: b.name }); continue; }
    if (b.type === "kiosk" || b.type === "shed") continue;
    if (b.type === "gate") {
      // 門樓：中間門洞可以通過
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      for (const side of [-1, 1]) o.push({ type: "box", x: b.x + c * side * 5.4, z: b.z - s * side * 5.4, hx: 2.4, hz: b.d / 2 - 0.4, rot: b.rot, name: b.name });
      continue;
    }
    o.push({ type: "box", x: b.x, z: b.z, hx: b.w / 2 - 0.6, hz: b.d / 2 - 0.6, rot: b.rot, name: b.name });
  }
  for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) {
    if (w.gap && w.gap[0] === i) {
      // 院門
      const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1];
      const segs = [[0, w.gap[1]], [w.gap[2], 1]];
      for (const [t0, t1] of segs) o.push(segBox(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1));
      continue;
    }
    o.push(segBox(...w.pts[i], ...w.pts[i + 1]));
  }
  for (const st of stalls) o.push({ type: "box", x: st.x, z: st.z, hx: st.kind === "tent" ? 1.8 : 1.6, hz: st.kind === "tent" ? 1.8 : 0.8, rot: st.rot });
  for (const t of trees) o.push({ type: "circle", x: t.x, z: t.z, r: t.type === "willow" || t.type === "broad" ? 0.55 : 0.4 });
  return o;
})();
function segBox(ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  return { type: "box", x: (ax + bx) / 2, z: (az + bz) / 2, hx: L / 2, hz: 0.45, rot: Math.atan2(-(bz - az), bx - ax) };
}
export function blocked(x, z, r = 0.35, y = 0) {
  for (const o of obstacles) {
    if (o.y0 !== undefined && y < o.y0 - 1) continue;
    if (o.type === "circle") { if (Math.hypot(x - o.x, z - o.z) < o.r + r) return o; continue; }
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < o.hx + r && Math.abs(lz) < o.hz + r) return o;
  }
  return null;
}

/**
 * 走一步：回傳新位置與高度；擋住時回傳 null
 * 規則：最多往上踩 0.6 公尺，最多往下掉 1.2 公尺（欄杆、岸邊不會掉下去），不能走進水裡
 */
export function groundAt(x, z, yNow) {
  const ss = surfaces(x, z);
  let best = null;
  for (const s of ss) if (s.y <= yNow + 0.6 && s.y >= yNow - 1.2 && (!best || s.y > best.y)) best = s;
  return best;
}
/** 傳送用：這個位置最高的可站立面 */
export function topSurface(x, z) {
  let best = null;
  for (const s of surfaces(x, z)) if (!best || s.y > best.y) best = s;
  return best;
}
/** 橋的欄杆：橋面範圍內、欄杆那一條帶子不能穿過 */
function railingHit(x, z) {
  for (const B of [bridge, smallBridge]) {
    const l = B.toLocal(x, z);
    if (Math.abs(l.a) <= B.half - 0.3 && Math.abs(l.b) > B.walkHW && Math.abs(l.b) < B.hw + 0.4) return true;
  }
  return false;
}
export function tryMove(px, pz, py, dx, dz, r = 0.35) {
  const nx = px + dx, nz = pz + dz;
  if (railingHit(nx, nz)) return null;
  const g = groundAt(nx, nz, py);
  if (!g) return null;
  if (g.kind === "ground" || g.kind === "stairs" || g.kind === "hallbase") { if (blocked(nx, nz, r, g.y)) return null; }
  return { x: nx, z: nz, y: g.y, kind: g.kind, dock: g.dock };
}
