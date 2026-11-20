// 清明上河圖：世界配置（公尺）。畫卷由右往左看：x 大 = 畫的右端（郊野），x 小 = 左端（城內）。
// 觀者站在南邊（+z）往北看。陸地 y = LAND，水面 y = 0。
import { spline, Line, rng, clamp, lerp, smooth } from "../../xishan/js/layout.js";
export { rng, clamp, lerp, smooth, Line, spline };

export const LAND = 1.6;
export const X0 = -620, X1 = 640;          // 畫卷左右端

/* ---------------- 段落（畫卷上的位置） ---------------- */
export const SECTIONS = [
  { name: "郊野", x0: 640, x1: 330, note: "清晨郊外，驢隊馱炭進城，掃墓歸來的轎子隊伍" },
  { name: "汴河", x1: 60, x0: 330, note: "汴河上漕船往來，縴夫拉船，岸邊卸貨" },
  { name: "虹橋", x1: -60, x0: 60, note: "無柱木拱虹橋，大船放桅過橋，橋上人群叫喊圍觀" },
  { name: "街市", x1: -330, x0: -60, note: "沿街店鋪、彩樓歡門、車馬轎子" },
  { name: "城門", x1: -400, x0: -330, note: "城門樓，駱駝隊穿過門洞" },
  { name: "城內", x1: X0, x0: -400, note: "城內十字街，醫鋪、茶坊、說書" },
];

/* ---------------- 汴河 ---------------- */
export const RIVER_HW = 18;
export const river = new Line(spline([
  [500, 230], [462, 182], [420, 150], [330, 92], [240, 46], [150, 18], [60, 4], [0, -2], [-70, -16], [-150, -48], [-220, -96], [-280, -150], [-330, -220],
], 2));

/* ---------------- 虹橋（無柱木拱） ---------------- */
function frame() {
  const n = river.near(0, -2), p = river.at(n.s);
  let ax = p.nx, az = p.nz;
  if (az < 0) { ax = -ax; az = -az; }        // a 正方向朝南（觀者這一側）
  return { cx: p.x, cz: p.z, ax, az, tx: p.tx, tz: p.tz, s: n.s };
}
const F = frame();
export const bridge = {
  ...F, half: 26, hw: 4.2, walkHW: 3.5, rise: 6.2, y0: LAND + 0.1, thick: 0.9, span: 19,
  deck(a) { return this.y0 + this.rise * (1 - (Math.min(1, Math.abs(a) / this.half)) ** 2); },
  toLocal(x, z) { const dx = x - this.cx, dz = z - this.cz; return { a: dx * this.ax + dz * this.az, b: dx * this.tx + dz * this.tz }; },
  toWorld(a, b) { return { x: this.cx + a * this.ax + b * this.tx, z: this.cz + a * this.az + b * this.tz }; },
};
export const bridgeS = bridge.toWorld(bridge.half, 0);   // 南端（觀者這側）
export const bridgeN = bridge.toWorld(-bridge.half, 0);  // 北端

/* ---------------- 城門 ---------------- */
export const gate = { x: -362, z: 4, dx: 15, dz: 32, h: 8.5, tunnel: 6.4 };

/* ---------------- 地形 ---------------- */
function hump(x, z, cx, cz, h, rx, rz = rx) { const dx = (x - cx) / rx, dz = (z - cz) / rz; return h * Math.exp(-(dx * dx + dz * dz)); }
export function terrainH(x, z) {
  let h = LAND;
  // 郊野的緩坡與遠方小山
  h += hump(x, z, 520, -170, 22, 120, 60) + hump(x, z, 400, -210, 16, 90, 50) + hump(x, z, 610, -60, 8, 70, 50);
  h += hump(x, z, -560, -230, 14, 120, 60);
  h += (Math.sin(x * 0.03) * Math.sin(z * 0.05)) * 0.25 * smooth(300, 420, x);
  const r = river.near(x, z, 80);
  if (r.d < RIVER_HW) { const t = r.d / RIVER_HW; return -3.4 * (1 - t * t) - 0.4; }
  if (r.d < RIVER_HW + 5) h = Math.min(h, lerp(-0.4, h, smooth(RIVER_HW, RIVER_HW + 5, r.d)));
  // 郊野的小溪
  const c = creek.near(x, z, 30);
  if (c.d < 3) return -1.1;
  if (c.d < 6) h = Math.min(h, lerp(-1.1, h, smooth(3, 6, c.d)));
  return h;
}
export const creek = new Line(spline([[488, 214], [472, 165], [455, 80], [462, 20], [450, -40], [440, -120]], 2));
export const creekBridge = (() => { const n = creek.near(455, 30); const p = creek.at(n.s); return { x: p.x, z: p.z, ax: p.nx, az: p.nz, half: 5, hw: 1.4 }; })();

/* ---------------- 道路 ---------------- */
const nearBank = (s0, s1, off, step = 8) => { const out = []; for (let s = s0; s <= s1; s += step) { const p = river.at(s); out.push([p.x - p.nx * off, p.z - p.nz * off]); } return out; };
const farBank = (s0, s1, off, step = 8) => { const out = []; for (let s = s0; s <= s1; s += step) { const p = river.at(s); out.push([p.x + p.nx * off, p.z + p.nz * off]); } return out; };
// river 的法線指向北（遠岸）還是南：算一次
const sideSign = (() => { const p = river.at(F.s); return p.nz < 0 ? 1 : -1; })();   // farBank 要乘的號
const bank = (far, s0, s1, off, step) => (sideSign > 0 ? (far ? farBank : nearBank) : (far ? nearBank : farBank))(s0, s1, off, step);

const bs = F.s;
export const roads = [
  { id: "country", name: "郊野小路", w: 4, kind: "earth", pts: spline([[640, 40], [590, 30], [540, 46], [490, 34], [455, 30], [420, 44], [370, 60], [330, 92 + 34]], 3) },
  { id: "near", name: "汴河南岸", w: 6, kind: "earth", pts: spline(bank(false, 30, bs - 22, 36, 10).concat([[bridgeS.x + bridge.ax * 6, bridgeS.z + bridge.az * 6]]), 3) },
  { id: "towpath", name: "縴道", w: 3.2, kind: "earth", pts: spline(bank(true, 40, bs - 30, 24, 10), 3) },
  { id: "bridge", name: "虹橋", w: 7, kind: "none", pts: [[bridgeN.x - bridge.ax * 8, bridgeN.z - bridge.az * 8], [bridgeS.x + bridge.ax * 6, bridgeS.z + bridge.az * 6]] },
  { id: "street", name: "城外大街", w: 8, kind: "stone", pts: spline([[bridgeS.x + bridge.ax * 6, bridgeS.z + bridge.az * 6], [-40, 32], [-110, 22], [-200, 10], [-300, 4], [gate.x + gate.dx, 4], [gate.x - gate.dx, 4], [-460, 4], [-620, 4]], 3) },
  { id: "far", name: "北岸小路", w: 4, kind: "earth", pts: spline([[bridgeN.x - bridge.ax * 8, bridgeN.z - bridge.az * 8], [-30, -60], [-90, -80], [-120, -130]], 3) },
  { id: "cross", name: "城內十字街", w: 7, kind: "stone", pts: spline([[-490, 90], [-490, 4], [-490, -110]], 3) },
  { id: "bankst", name: "河街", w: 4, kind: "stone", pts: spline(bank(false, bs + 12, bs + 150, 26, 8), 3) },
];
export const roadLines = roads.map((r) => ({ ...r, line: new Line(r.pts, 20) }));
export const road = (id) => roadLines.find((r) => r.id === id);

/* ---------------- 建築 ---------------- */
// type 沿用溪山行旅的建築套件：shop / two / house / ware / shed / yamen / gate；thatch = 茅草屋頂
export const buildings = [];
export const plaques = [];          // 自訂招牌 {text, x, z, y, rot, w, h, vertical}
export const caiLou = [];           // 彩樓歡門
(() => {
  const r = rng(23);
  const put = (b) => buildings.push({ w: 11, d: 8, rot: 0, ...b });
  // 郊野茅屋
  for (const [x, z, rot] of [[575, -10, 0.2], [540, -55, -0.1], [505, -20, 0.35], [408, -18, 0.1], [600, 80, Math.PI]]) put({ type: "house", thatch: true, x, z, rot, w: 10, d: 7, name: "農舍" });
  put({ type: "shed", thatch: true, x: 352, z: 64, rot: Math.PI * 0.85, w: 9, d: 6, name: "路邊茶棚" });
  // 汴河南岸：面向河的酒樓茶肆
  const near = road("near").line;
  for (let s = 30, i = 0; s < near.len - 30; s += 30, i++) {
    const p = near.at(s);
    // 路的北側（靠河）放房子，面向河
    const off = 13 * (sideSign > 0 ? -1 : 1);
    const x = p.x + p.nx * off, z = p.z + p.nz * off;
    const rot = Math.atan2(-(p.nx * Math.sign(off)), -(p.nz * Math.sign(off))) + Math.PI;
    const t = ["two", "shop", "shed", "shop", "two", "ware"][i % 6];
    put({ type: t, x, z, rot: Math.atan2(p.nx * Math.sign(off), p.nz * Math.sign(off)), w: t === "shed" ? 9 : 12, d: t === "shed" ? 6 : 9, name: { two: "酒樓", shop: "茶肆", shed: "茶棚", ware: "倉房" }[t] });
  }
  // 汴河北岸：倉房、民居
  for (const [x, z] of [[220, -2], [160, -26], [100, -40], [280, 20]]) put({ type: r() < 0.5 ? "ware" : "house", x, z, rot: Math.PI + 0.3, name: "倉房" });
  // 橋頭腳店（彩樓歡門）
  const bfoot = bridge.toWorld(bridge.half + 16, -14);
  put({ type: "two", x: bfoot.x, z: bfoot.z, rot: Math.atan2(-bridge.tx, -bridge.tz), w: 14, d: 10, name: "腳店" });
  caiLou.push({ host: buildings[buildings.length - 1] });
  // 城外大街：兩側店鋪
  const st = road("street").line;
  const names = ["香鋪", "絲帛鋪", "茶坊", "酒肆", "饅頭鋪", "解庫", "刀剪鋪", "紙馬鋪", "車行", "綢緞莊", "書坊", "糖果鋪"];
  let k = 0;
  for (let s = 40; s < st.len; s += 19) {
    const p = st.at(s);
    if (p.x < gate.x + gate.dx + 14 && p.x > gate.x - gate.dx - 14) continue;     // 城門前後留空
    if (p.x > -10) continue;
    for (const side of [-1, 1]) {
      if (r() < 0.12) continue;
      const front = p.nz * side > 0;                 // 靠觀者這一側：矮一點、退後一點，才看得到街
      const off = side * (front ? 11.5 : 12);
      const x = p.x + p.nx * off, z = p.z + p.nz * off;
      const t = front ? (r() < 0.6 ? "shop" : "shed") : r() < 0.45 ? "two" : "shop";
      put({ type: t, x, z, rot: Math.atan2(-p.nx * side, -p.nz * side), w: front ? 10 + Math.round(r() * 2) : 12 + Math.round(r() * 3), d: front ? 6.5 : 9, name: p.x < gate.x ? ["醫鋪", "茶坊", "酒肆", "香藥鋪", "絹鋪"][k % 5] : names[k % names.length] });
      k++;
    }
  }
  // 孫羊店（正店，大酒樓）與彩樓歡門
  const sy = buildings.find((b) => b.x < -230 && b.x > -280 && b.z < 0) || buildings.find((b) => b.x < -200);
  if (sy) { sy.type = "two"; sy.w = 18; sy.d = 12; sy.name = "孫羊店"; caiLou.push({ host: sy }); }
  // 城內：醫鋪「趙太丞家」
  const zt = buildings.find((b) => b.x < -500 && b.z > 0);
  if (zt) { zt.name = "趙太丞家"; }
  // 城內十字街兩側
  for (const z of [-60, -90, 50, 80]) for (const side of [-1, 1]) put({ type: r() < 0.5 ? "two" : "shop", x: -490 + side * 12, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, name: ["茶坊", "說書場", "綵帛鋪", "酒肆"][Math.floor(r() * 4)] });
  // 城內寺院門
  put({ type: "yamen", x: -560, z: -50, rot: 0, w: 16, d: 10, name: "寺院" });
  // ---- 補滿畫面：北岸橋頭街、街後第二排、郊野村落、城內巷弄 ----
  const free = (x, z, w, d) => {
    const R = Math.max(w, d) / 2;
    for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) if (terrainH(x + dx, z + dz) < LAND - 0.2) return false;
    for (const L of roadLines) if (L.line.near(x, z, 40).d < L.w / 2 + Math.min(w, d) / 2 + 0.8) return false;
    for (const b of buildings) if (Math.abs(b.x - x) < (b.w + w) / 2 + 1 && Math.abs(b.z - z) < (b.d + d) / 2 + 1) return false;
    const bl = bridge.toLocal(x, z); if (Math.abs(bl.a) < bridge.half + 6 && Math.abs(bl.b) < 12) return false;
    if (Math.abs(x - gate.x) < gate.dx / 2 + 8 + w / 2 && Math.abs(z - gate.z) < 90) return false;
    return true;
  };
  const along = (id, s0, s1, step, off, opt) => {
    const L = road(id).line;
    for (let s = s0; s < Math.min(s1, L.len); s += step) for (const side of opt.sides || [-1, 1]) {
      const p = L.at(s), o = side * (off + (opt.jit ? (r() - 0.5) * opt.jit : 0));
      const x = p.x + p.nx * o, z = p.z + p.nz * o;
      const w = opt.w ? opt.w() : 11, d = opt.d ? opt.d() : 8;
      const rot = Math.atan2(-p.nx * side, -p.nz * side);
      if (r() < (opt.skip ?? 0.15) || !free(x, z, Math.max(w, d), Math.max(w, d))) continue;
      const t = opt.type();
      put({ type: t, x, z, rot, w, d, name: opt.name(t), thatch: opt.thatch });
    }
  };
  const shopNames = ["飲子", "香飲子", "酒店", "麵食店", "肉鋪", "茶坊", "客店", "腳店", "果子鋪", "王家羅帛", "劉家上色沉檀", "久住王員外家"];
  let ni = 0;
  along("far", 10, 165, 15, 10, { type: () => (r() < 0.5 ? "two" : "shop"), name: () => shopNames[ni++ % shopNames.length], skip: 0.1 });
  along("bankst", 8, 144, 16, 8, { sides: [1, -1], type: () => (r() < 0.5 ? "shop" : "shed"), name: (t) => (t === "shed" ? "茶棚" : shopNames[ni++ % shopNames.length]), skip: 0.25 });
  along("street", 30, 600, 19, 28, { sides: [-1, 1], type: () => (r() < 0.85 ? "house" : "shed"), name: () => "民居", skip: 0.55, jit: 4, w: () => 10 + r() * 4 });
  along("near", 20, 400, 22, 26, { sides: [sideSign > 0 ? 1 : -1], type: () => (r() < 0.7 ? "house" : "shed"), name: () => "民居", skip: 0.3, jit: 6 });
  along("towpath", 20, 390, 30, 16, { sides: [sideSign > 0 ? 1 : -1, sideSign > 0 ? -1 : 1], type: () => (r() < 0.6 ? "ware" : "house"), name: (t) => (t === "ware" ? "倉房" : "民居"), skip: 0.45, jit: 4 });
  along("country", 10, 360, 34, 18, { type: () => (r() < 0.75 ? "house" : "shed"), name: () => "農舍", thatch: true, skip: 0.45, jit: 10, w: () => 8 + r() * 3, d: () => 6 + r() * 2 });
  along("cross", 10, 200, 14, 24, { type: () => (r() < 0.5 ? "two" : "house"), name: () => "民居", skip: 0.15 });
  for (let i = 0; i < 18; i++) { const x = -610 + r() * 230, z = -140 + r() * 250, w = 10 + r() * 4; if (free(x, z, w, w)) put({ type: r() < 0.4 ? "two" : "house", x, z, rot: Math.round(r() * 3) * Math.PI / 2, w, d: 8, name: "民居" }); }
  for (let i = 0; i < 18; i++) { const x = 360 + r() * 270, z = -120 + r() * 230; if (free(x, z, 10, 10)) put({ type: "house", thatch: true, x, z, rot: (r() - 0.5) * 0.8, w: 8 + r() * 2, d: 6, name: "農舍" }); }
})();

for (const b of buildings) if (/酒|腳店|孫羊|客店/.test(b.name) && (b.type === "two" || b.type === "shop")) b.flag = true;

/* ---------------- 攤位（有大傘的） ---------------- */
export const stalls = (() => {
  const out = [], r = rng(31);
  // 橋上兩側（佔掉部分橋面，就像畫裡那樣）
  for (const a of [-17, -11, 11, 17, 22]) for (const s of [-1, 1]) if (r() < 0.8) { const p = bridge.toWorld(a, s * 2.9); out.push({ x: p.x, z: p.z, rot: Math.atan2(bridge.ax, bridge.az) + (s > 0 ? 0 : Math.PI), kind: "umbrella", onBridge: a }); }
  // 橋頭、街邊
  const st = road("street").line;
  for (let s = 14; s < st.len; s += 9) { const p = st.at(s); if (Math.abs(p.x - gate.x) < 30) continue; const side = r() < 0.5 ? -1 : 1; out.push({ x: p.x + p.nx * side * 5.3, z: p.z + p.nz * side * 5.3, rot: Math.atan2(p.nx * side, p.nz * side), kind: r() < 0.6 ? "umbrella" : "stall" }); }
  const nr = road("near").line;
  for (let s = 30; s < nr.len; s += 16) { const p = nr.at(s); out.push({ x: p.x - p.nx * 4.5 * sideSign, z: p.z - p.nz * 4.5 * sideSign, rot: 0, kind: "umbrella" }); }
  return out;
})();

/* ---------------- 樹（以柳為主，早春的榆、桃杏） ---------------- */
export const trees = (() => {
  const out = [], r = rng(41);
  const ok = (x, z) => {
    if (terrainH(x, z) < 0.6) return false;
    for (const b of buildings) if (Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) * 0.62 + 3) return false;
    for (const R of roadLines) if (R.line.near(x, z, 20).d < R.w / 2 + 1.5) return false;
    if (Math.abs(x - gate.x) < gate.dx + 6 && Math.abs(z - gate.z) < gate.dz / 2 + 30) return false;
    const bl = bridge.toLocal(x, z); if (Math.abs(bl.a) < bridge.half + 4 && Math.abs(bl.b) < 7) return false;
    return true;
  };
  const add = (type, x, z, sc = 1) => { if (ok(x, z)) out.push({ type, x, z, sc: sc * (0.85 + r() * 0.35), rot: r() * 6.3, seed: Math.floor(r() * 1e6) }); };
  for (let i = 0; i < 190; i++) add(r() < 0.4 ? "willow" : r() < 0.75 ? "broad" : "blossom", 330 + r() * 300, -150 + r() * 330, 1.1);
  // 郊野小路兩旁的老樹
  { const L = road("country").line; for (let s = 4; s < L.len; s += 9) for (const sd of [-1, 1]) { if (r() < 0.35) continue; const p = L.at(s), o = 4 + r() * 4; add(r() < 0.5 ? "willow" : "broad", p.x + p.nx * sd * o, p.z + p.nz * sd * o, 1.15); } }   // 郊野
  for (let s = 10; s < river.len - 10; s += 9) for (const side of [-1, 1]) { if (r() < 0.25) continue; const p = river.at(s); const o = RIVER_HW + 4 + r() * 5; add("willow", p.x + side * p.nx * o, p.z + side * p.nz * o); }
  for (let i = 0; i < 90; i++) add(r() < 0.5 ? "broad" : "willow", -60 + r() * 420, -170 + r() * 120);       // 北岸
  for (let i = 0; i < 70; i++) add(r() < 0.6 ? "broad" : "blossom", -620 + r() * 300, -150 + r() * 260);    // 城內、城外
  for (let i = 0; i < 70; i++) add(r() < 0.7 ? "broad" : "willow", -340 + r() * 330, 40 + r() * 70, 0.9);
  for (let i = 0; i < 40; i++) add(r() < 0.6 ? "willow" : "broad", -330 + r() * 300, -180 + r() * 120);                              // 街後院子
  return out;
})();

/* ---------------- 船 ---------------- */
export function moorings() {
  const out = [], r = rng(51);
  for (let s = 30; s < bs - 60; s += 17) for (const far of [false, true]) {
    if (r() < 0.12) continue;
    const p = river.at(s + r() * 8);
    const side = (far ? 1 : -1) * sideSign;
    const o = RIVER_HW - 4.5;
    out.push({ x: p.x + p.nx * side * o, z: p.z + p.nz * side * o, rot: Math.atan2(-p.tz, p.tx) + (r() < 0.5 ? Math.PI : 0), kind: r() < 0.5 ? "cargo" : r() < 0.6 ? "wupeng" : "huafang", seed: Math.floor(r() * 100) });
  }
  for (let s = bs + 40; s < river.len - 40; s += 30) { if (r() < 0.5) continue; const p = river.at(s); const side = (r() < 0.5 ? 1 : -1); out.push({ x: p.x + p.nx * side * (RIVER_HW - 4.5), z: p.z + p.nz * side * (RIVER_HW - 4.5), rot: Math.atan2(-p.tz, p.tx), kind: "wupeng", seed: s | 0 }); }
  return out;
}
/** 大船過橋的航線（沿河道中央，從下游往上游） */
export function bigBoatLine() { const pts = []; for (let s = 40; s <= bs + 170; s += 6) { const p = river.at(s); pts.push([p.x, p.z]); } return new Line(spline(pts, 1.5)); }
/** 縴夫拉的船：沿遠岸 */
export function towLine() { const pts = []; for (let s = 50; s <= bs - 40; s += 6) { const p = river.at(s); const side = sideSign; pts.push([p.x + p.nx * side * 8, p.z + p.nz * side * 8]); } return new Line(spline(pts, 1.5)); }

/* ---------------- 走路：地面與碰撞 ---------------- */
export function surfaces(x, z) {
  const out = [];
  const t = terrainH(x, z);
  if (t > 0.2) out.push({ y: t, kind: "ground" });
  const l = bridge.toLocal(x, z);
  if (Math.abs(l.a) <= bridge.half + 0.4 && Math.abs(l.b) <= bridge.walkHW) out.push({ y: bridge.deck(l.a), kind: "bridge" });
  const cb = creekBridge, dx = x - cb.x, dz = z - cb.z;
  if (Math.abs(dx * cb.ax + dz * cb.az) < cb.half && Math.abs(dx * -cb.az + dz * cb.ax) < cb.hw) out.push({ y: LAND + 0.3, kind: "bridge" });
  return out;
}
export function topSurface(x, z) { let b = null; for (const s of surfaces(x, z)) if (!b || s.y > b.y) b = s; return b; }
export const obstacles = (() => {
  const o = [];
  for (const b of buildings) o.push({ x: b.x, z: b.z, hx: b.w / 2 - 0.4, hz: b.d / 2 - 0.4, rot: b.rot });
  // 城台：門洞可以走
  const g = gate, half = g.dz / 2, tw = g.tunnel / 2;
  o.push({ x: g.x, z: g.z - (tw + half) / 2, hx: g.dx / 2, hz: (half - tw) / 2, rot: 0 });
  o.push({ x: g.x, z: g.z + (tw + half) / 2, hx: g.dx / 2, hz: (half - tw) / 2, rot: 0 });
  for (const s of [-1, 1]) o.push({ x: g.x, z: g.z + s * (half + 30), hx: 1.6, hz: 30, rot: 0 });   // 城牆
  return o;
})();
export function blocked(x, z, r = 0.35) {
  for (const b of obstacles) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r) return true;
  }
  return false;
}
function railing(x, z) { const l = bridge.toLocal(x, z); return Math.abs(l.a) <= bridge.half - 0.3 && Math.abs(l.b) > bridge.walkHW && Math.abs(l.b) < bridge.hw + 0.4; }
export function tryMove(px, pz, py, dx, dz) {
  const nx = px + dx, nz = pz + dz;
  if (railing(nx, nz) || blocked(nx, nz)) return null;
  let best = null;
  for (const s of surfaces(nx, nz)) if (s.y <= py + 0.6 && s.y >= py - 1.2 && (!best || s.y > best.y)) best = s;
  return best ? { x: nx, z: nz, y: best.y, kind: best.kind } : null;
}
/** 行人：跟著最接近上一步高度的面走 */
export function followY(x, z, yPrev) { let b = null; for (const s of surfaces(x, z)) if (!b || Math.abs(s.y - yPrev) < Math.abs(b.y - yPrev)) b = s; return b ? b.y : LAND; }
