// 船：斷面放樣的弧形船身＋竹篷、船艙、貨物、櫓與纜繩
import * as THREE from "three";
import { Batch, M, box, cyl, lathe, rod, tube, surface, roof } from "./geo.js";

/**
 * 船身：u 沿船長（0 船尾 → 1 船頭），v 從龍骨到舷緣
 * 回傳舷緣高度函式等，給上面的結構用
 */
export function hull(b, { L, B, D, draft = 0.45, rise = 0.55, bowUp = 1.0 }) {
  const half = (u) => (B / 2) * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * u), 0.5));
  const sheer = (u) => D + rise * Math.pow(Math.abs(2 * u - 1), 2.2) * (u > 0.5 ? bowUp : 0.8);
  const bottom = (u) => -draft * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * u), 0.6));
  const X = (u) => (u - 0.5) * L;
  for (const s of [-1, 1]) {
    const g = surface(36, 8, (u, v) => {
      const th = (v * Math.PI) / 2;
      const y = bottom(u) + (sheer(u) - bottom(u)) * Math.pow(1 - Math.cos(th), 0.85);
      return [X(u), y, s * half(u) * Math.pow(Math.sin(th), 0.8)];
    }, (u, v) => [u * L / 1.4, v * 2.4]);
    if (s < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    b.add("hull", g);
    // 舷緣護木
    const rail = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30; rail.push([X(u), sheer(u) + 0.04, s * (half(u) + 0.03)]); }
    b.add("woodDark", tube(rail, 0.07, 60, 5));
    const rail2 = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30; rail2.push([X(u), sheer(u) * 0.55 + bottom(u) * 0.45, s * (half(u) * 0.97 + 0.02)]); }
    b.add("woodDark", tube(rail2, 0.035, 60, 4));
  }
  // 船頭、船尾封板
  for (const u of [0, 1]) {
    const w = half(u), y0 = bottom(u), y1 = sheer(u);
    b.add("woodGrain", box(0.12, y1 - y0, w * 2 + 0.06), M([X(u), (y0 + y1) / 2, 0]));
  }
  // 甲板
  const deckY = D - 0.08;
  b.add("deck", surface(30, 2, (u, v) => { const uu = 0.04 + 0.92 * u; return [X(uu), deckY, (v * 2 - 1) * half(uu) * 0.92]; }, (u, v) => [v * 2, u * L / 1.2]));
  // 橫樑
  for (const u of [0.2, 0.4, 0.6, 0.8]) b.add("woodDark", box(0.14, 0.1, half(u) * 2), M([X(u), deckY + 0.05, 0]));
  return { half, sheer, X, deckY };
}

export function rope(b, pts, r = 0.025) { b.add("rope", tube(pts, r, pts.length * 6, 4)); }

/** 烏篷船（客船） */
export function wupeng(opts = {}) {
  const b = new Batch();
  const L = opts.L || 9, B = 2.2, D = 0.72;
  const h = hull(b, { L, B, D, draft: 0.38, rise: 0.45 });
  // 三段竹篷（中段最高），每段都有竹肋
  const segs = [[0.22, 0.42, 0.98], [0.42, 0.66, 1.1], [0.66, 0.8, 0.92]];
  for (const [u0, u1, hh] of segs) {
    const x0 = h.X(u0), x1 = h.X(u1), w = Math.min(h.half(u0), h.half(u1)) * 0.95;
    const shell = surface(6, 10, (u, v) => {
      const a = Math.PI * v;
      return [x0 + (x1 - x0) * u, h.deckY + Math.sin(a) * hh, -Math.cos(a) * w];
    }, (u, v) => [u * 1.6, v * 2.4]);
    b.add("mat", shell);
    for (const x of [x0, (x0 + x1) / 2, x1]) {
      const rib = [];
      for (let i = 0; i <= 10; i++) { const a = (Math.PI * i) / 10; rib.push([x, h.deckY + Math.sin(a) * (hh + 0.03), -Math.cos(a) * (w + 0.03)]); }
      b.add("bamboo", tube(rib, 0.03, 20, 4));
    }
  }
  // 篷上的小窗格
  for (const s of [-1, 1]) b.add("lattice", new THREE.PlaneGeometry(0.9, 0.42), M([h.X(0.54), h.deckY + 0.62, s * 0.99], [0, s > 0 ? 0 : Math.PI, 0]));
  // 座椅（乘客坐的長凳）
  for (const u of [0.32, 0.5]) b.add("woodGrain", box(0.4, 0.06, 1.5), M([h.X(u), h.deckY + 0.36, 0]));
  // 船頭的乘客座墊
  b.add("clothBlue", box(0.6, 0.12, 0.8), M([h.X(0.88), h.deckY + 0.08, 0]));
  // 竹篙、櫓
  b.add("bamboo", rod([h.X(0.15), h.deckY + 1.05, 0.4], [h.X(0.85), h.deckY + 0.95, 0.5], 0.035, 0.03, 5));
  const oarPivot = [h.X(0.04), h.sheer(0.04) + 0.15, 0.35];
  b.add("woodGrain", rod(oarPivot, [h.X(0.04) - 2.6, -0.25, 0.9], 0.05, 0.035, 6));
  b.add("woodGrain", box(0.7, 0.04, 0.22), M([h.X(0.04) - 2.4, -0.2, 0.85], [0, 0.3, -0.25]));
  b.add("woodGrain", rod(oarPivot, [h.X(0.08), h.sheer(0.08) + 1.1, 0.15], 0.035, 0.03, 5));
  // 纜繩圈
  b.add("rope", new THREE.TorusGeometry(0.22, 0.04, 6, 14).rotateX(Math.PI / 2), M([h.X(0.9), h.deckY + 0.08, 0]));
  rope(b, [[h.X(0.9) + 0.2, h.deckY + 0.08, 0.2], [h.X(0.97), h.sheer(0.97) + 0.05, 0.1], [h.X(1) + 0.2, h.sheer(1) - 0.2, 0]]);
  const g = new THREE.Group();
  b.build(g, { cast: true, receive: true });
  g.userData = { L, B, top: h.deckY + 1.1, seat: [h.X(0.88), h.deckY + 1.0, 0], stern: [h.X(0.05), h.sheer(0.05), 0], oarPivot };
  return g;
}

/** 畫舫：有船艙、窗格、屋頂、欄杆、燈籠 */
export function huafang() {
  const b = new Batch();
  const L = 16, B = 4.2, D = 0.95;
  const h = hull(b, { L, B, D, draft: 0.55, rise: 0.7 });
  const x0 = h.X(0.25), x1 = h.X(0.72), w = 1.7, y = h.deckY;
  // 艙柱與窗格
  for (let i = 0; i <= 5; i++) {
    const x = x0 + ((x1 - x0) * i) / 5;
    for (const s of [-1, 1]) b.add("red", cyl(0.09, 0.09, 2.2, 8), M([x, y + 1.1, s * w]));
    if (i < 5) for (const s of [-1, 1]) {
      const xm = x + (x1 - x0) / 10;
      b.add("redDark", box((x1 - x0) / 5 - 0.1, 0.6, 0.08), M([xm, y + 0.3, s * w]));
      b.add("lattice", new THREE.PlaneGeometry((x1 - x0) / 5 - 0.2, 1.1), M([xm, y + 1.2, s * (w + 0.02)]));
      b.add("paperWin", new THREE.PlaneGeometry((x1 - x0) / 5 - 0.2, 1.1), M([xm, y + 1.2, s * (w - 0.03)]));
    }
  }
  for (const x of [x0, x1]) { b.add("lattice2", new THREE.PlaneGeometry(2 * w - 1.6, 1.4), M([x, y + 1.25, 0], [0, Math.PI / 2, 0])); }
  b.add("green", box(x1 - x0 + 0.3, 0.25, 2 * w + 0.3), M([(x0 + x1) / 2, y + 2.3, 0]));
  roof(b, { ex: (x1 - x0) / 2 + 0.9, ez: w + 0.7, H: 1.3, type: "xieshan", lift: 0.6, res: 0.4, ridgeH: 0.3 }, M([(x0 + x1) / 2, y + 2.4, 0]));
  // 船頭甲板欄杆
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const u = 0.73 + i * 0.022; pts.push([h.X(u), h.sheer(u) + 0.55, s * h.half(u) * 0.85]); }
    b.add("red", tube(pts, 0.04, 20, 5));
    for (let i = 0; i <= 10; i += 2) { const u = 0.73 + i * 0.022; b.add("red", box(0.06, 0.55, 0.06), M([h.X(u), h.sheer(u) + 0.27, s * h.half(u) * 0.85])); }
  }
  for (const s of [-1, 1]) for (const x of [x0, x1]) b.add("lantern", lathe([[0, -0.28], [0.2, -0.2], [0.24, 0], [0.2, 0.2], [0, 0.28]], 10), M([x, y + 1.9, s * (w + 0.75)]));
  // 船尾的櫓
  b.add("woodGrain", rod([h.X(0.03), h.sheer(0.03) + 0.2, 0.5], [h.X(0.03) - 3.4, -0.3, 1.2], 0.06, 0.045, 6));
  const g = new THREE.Group();
  b.build(g);
  g.userData = { L, B, top: y + 4, stern: [h.X(0.05), h.sheer(0.05), 0] };
  return g;
}

/** 貨船：米袋、木箱、酒罈，船尾小篷，桅杆 */
export function cargo(seed = 1) {
  const b = new Batch();
  const L = 12, B = 3.3, D = 0.9;
  const h = hull(b, { L, B, D, draft: 0.55, rise: 0.5 });
  const y = h.deckY;
  // 貨物
  let k = seed;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 18; i++) {
    const x = h.X(0.3 + rnd() * 0.42), z = (rnd() - 0.5) * 1.8;
    const t = rnd();
    if (t < 0.45) b.add("goods1", lathe([[0, 0], [0.3, 0.02], [0.36, 0.25], [0.3, 0.5], [0, 0.52]], 8), M([x, y, z], [0, 0, Math.PI / 2 * (rnd() < 0.5 ? 1 : 0)]));
    else if (t < 0.75) b.add("woodGrain", box(0.7, 0.55, 0.6), M([x, y + 0.28 + (rnd() < 0.3 ? 0.55 : 0), z], [0, rnd(), 0]));
    else b.add("jar", lathe([[0, 0], [0.18, 0], [0.3, 0.2], [0.26, 0.5], [0.12, 0.62], [0.14, 0.7], [0, 0.7]], 10), M([x, y, z]));
  }
  // 船尾小篷
  const x0 = h.X(0.08), x1 = h.X(0.26), w = h.half(0.2) * 0.9;
  b.add("mat", surface(4, 8, (u, v) => { const a = Math.PI * v; return [x0 + (x1 - x0) * u, y + Math.sin(a) * 1.1, -Math.cos(a) * w]; }, (u, v) => [u, v * 2]));
  // 桅杆與收起的帆
  b.add("woodDark", rod([h.X(0.7), y, 0], [h.X(0.7), y + 8, 0], 0.11, 0.07, 8));
  b.add("clothWhite", cyl(0.18, 0.16, 3.0, 8), M([h.X(0.7) - 0.25, y + 6.2, 0], [0, 0, 0.05]));
  for (const t of [0.2, 0.5, 0.8]) b.add("rope", new THREE.TorusGeometry(0.2, 0.02, 4, 10), M([h.X(0.7) - 0.25, y + 4.9 + t * 2.6, 0], [Math.PI / 2, 0, 0]));
  rope(b, [[h.X(0.7), y + 7.8, 0], [h.X(0.88), y + 3, 0], [h.X(0.98), h.sheer(0.98), 0]]);
  rope(b, [[h.X(0.7), y + 7.8, 0], [h.X(0.4), y + 3, 0.7], [h.X(0.3), h.sheer(0.3), h.half(0.3)]]);
  // 櫓
  b.add("woodGrain", rod([h.X(0.03), h.sheer(0.03) + 0.2, 0.5], [h.X(0.03) - 3.0, -0.3, 1.1], 0.06, 0.045, 6));
  const g = new THREE.Group();
  b.build(g);
  g.userData = { L, B, top: y + 8.1 };
  return g;
}
