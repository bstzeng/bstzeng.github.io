// 建築套件：所有房子都由台基、立柱、斗拱、牆、門窗、屋頂組合而成
import * as THREE from "three";
import { Batch, M, box, cyl, lathe, rod, tube, surface, roof, pyramidRoof, mat } from "./geo.js";
import * as TX from "./tex.js";
import { rng, terrace, terraceStairs, backStairs, hall as HALL, BANK, terrainH } from "./layout.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- 構件 ---------------- */
function platform(b, P, w, d, h, { steps = true, stepsW = 3, back = false } = {}) {
  b.add("stone", box(w, h, d), M([0, h / 2, 0]), P);
  b.add("stoneLight", box(w + 0.15, 0.14, d + 0.15), M([0, h + 0.02, 0]), P);
  if (steps && h > 0.2) {
    const n = Math.max(2, Math.round(h / 0.17));
    for (let i = 0; i < n; i++) {
      const sh = h * (1 - i / n);
      b.add("stoneLight", box(stepsW, sh, 0.32), M([0, sh / 2, d / 2 + 0.16 + i * 0.32]), P);
      if (back) b.add("stoneLight", box(stepsW, sh, 0.32), M([0, sh / 2, -d / 2 - 0.16 - i * 0.32]), P);
    }
  }
}
function column(b, P, x, z, y0, h, r = 0.22, key = "red") {
  b.add("stoneLight", cyl(r * 1.45, r * 1.6, 0.22, 10), M([x, y0 + 0.11, z]), P);
  b.add(key, cyl(r * 0.92, r, h, 10), M([x, y0 + h / 2 + 0.2, z]), P);
}
function bracket(b, P, x, z, y, s = 1, dir = 0) {
  // 斗拱：櫨斗＋兩層拱＋散斗
  b.add("green", box(0.42 * s, 0.22 * s, 0.42 * s), M([x, y + 0.11 * s, z], [0, dir, 0]), P);
  b.add("woodDark", box(1.3 * s, 0.16 * s, 0.22 * s), M([x, y + 0.3 * s, z], [0, dir, 0]), P);
  b.add("woodDark", box(0.22 * s, 0.16 * s, 1.1 * s), M([x, y + 0.3 * s, z], [0, dir, 0]), P);
  b.add("blue", box(1.0 * s, 0.14 * s, 0.24 * s), M([x, y + 0.46 * s, z], [0, dir, 0]), P);
  for (const k of [-0.55, 0, 0.55]) b.add("green", box(0.24 * s, 0.14 * s, 0.24 * s), M([x + Math.cos(dir) * k * s, y + 0.6 * s, z - Math.sin(dir) * k * s]), P);
}
/** 一個開間的填充（沿 x 方向，z 為立面位置，朝外法線 nz） */
function bay(b, P, kind, xa, xb, z, y0, h, nz = 1) {
  const w = xb - xa, cx = (xa + xb) / 2;
  const R = (x, y, zz, ww, hh, dd, key) => b.add(key, box(ww, hh, dd), M([x, y, zz]), P);
  if (kind === "wall") { R(cx, y0 + h / 2, z, w, h, 0.2, "plaster"); return; }
  if (kind === "wood") { R(cx, y0 + h / 2, z, w, h, 0.16, "woodGrain"); return; }
  if (kind === "door") {
    // 格扇門：上段窗格、下段裙板
    const n = Math.max(2, Math.round(w / 0.9));
    for (let i = 0; i < n; i++) {
      const x0 = xa + (w * i) / n, ww = w / n, xx = x0 + ww / 2;
      R(xx, y0 + h * 0.2, z, ww - 0.04, h * 0.4, 0.08, "redDark");
      b.add("lattice", new THREE.PlaneGeometry(ww - 0.16, h * 0.52), M([xx, y0 + h * 0.67, z + nz * 0.05]), P);
      b.add("paperWin", new THREE.PlaneGeometry(ww - 0.16, h * 0.52), M([xx, y0 + h * 0.67, z - nz * 0.02]), P);
      R(xx - ww / 2 + 0.04, y0 + h / 2, z, 0.08, h, 0.12, "redDark");
    }
    R(cx, y0 + h - 0.04, z, w, 0.1, 0.14, "redDark");
    R(cx, y0 + h * 0.42, z, w, 0.08, 0.14, "redDark");
    return;
  }
  if (kind === "window") {
    R(cx, y0 + 0.5, z, w, 1.0, 0.2, "plaster");
    R(cx, y0 + 1.04, z, w, 0.1, 0.24, "woodDark");
    b.add("lattice2", new THREE.PlaneGeometry(w - 0.2, h * 0.42), M([cx, y0 + 1.1 + h * 0.21, z + nz * 0.06]), P);
    b.add("paperWin", new THREE.PlaneGeometry(w - 0.2, h * 0.42), M([cx, y0 + 1.1 + h * 0.21, z - nz * 0.02]), P);
    R(cx, y0 + 1.15 + h * 0.42, z, w, 0.1, 0.18, "woodDark");
    R(cx, y0 + (h + 1.2 + h * 0.42) / 2, z, w, h - 1.2 - h * 0.42, 0.16, "plaster");
    return;
  }
  if (kind === "open") {
    // 店面：櫃台、貨架
    R(cx, y0 + 0.5, z - nz * 0.4, w - 0.3, 1.0, 0.6, "woodGrain");
    R(cx, y0 + 1.02, z - nz * 0.4, w - 0.2, 0.06, 0.75, "woodDark");
    R(cx, y0 + h / 2, z - nz * 3.0, w, h, 0.15, "woodGrain");
    for (const yy of [1.2, 1.8, 2.4]) R(cx, y0 + yy, z - nz * 2.8, w - 0.2, 0.05, 0.4, "woodDark");
    R(cx, y0 + h - 0.25, z, w, 0.4, 0.1, "woodDark");
  }
}
function railing(b, P, a, c, y, h = 0.9, key = "red", step = 1.2, balus = true) {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((c[0] - a[0]) * i) / n, z = a[1] + ((c[1] - a[1]) * i) / n;
    b.add(key, box(0.12, h + 0.12, 0.12), M([x, y + (h + 0.12) / 2, z]), P);
    if (balus && i < n) for (let k = 1; k < 4; k++) {
      const t = (i + k / 4) / n;
      b.add(key, box(0.05, h * 0.62, 0.05), M([a[0] + (c[0] - a[0]) * t, y + h * 0.36, a[1] + (c[1] - a[1]) * t]), P);
    }
  }
  b.add(key, rod([a[0], y + h, a[1]], [c[0], y + h, c[1]], 0.05, 0.05, 6), null, P);
  b.add(key, rod([a[0], y + h * 0.68, a[1]], [c[0], y + h * 0.68, c[1]], 0.035, 0.035, 5), null, P);
  b.add(key, rod([a[0], y + 0.12, a[1]], [c[0], y + 0.12, c[1]], 0.04, 0.04, 5), null, P);
}

/* ---------------- 一棟房子的骨架 ---------------- */
function frame(b, P, { w, d, colH, y0 = 0, nx, nz = 2, front = "door", side = "wall", backSide = "wall", r = 0.2, brackets = false, colKey = "red", inset = 0.25 }) {
  nx = nx || Math.max(2, Math.round(w / 3.4));
  const xs = Array.from({ length: nx + 1 }, (_, i) => -w / 2 + inset + ((w - 2 * inset) * i) / nx);
  const zs = Array.from({ length: nz + 1 }, (_, i) => -d / 2 + inset + ((d - 2 * inset) * i) / nz);
  const zf = d / 2 - inset, zb = -d / 2 + inset;
  for (const x of xs) { column(b, P, x, zf, y0, colH, r, colKey); column(b, P, x, zb, y0, colH, r, colKey); }
  for (const z of zs.slice(1, -1)) { column(b, P, xs[0], z, y0, colH, r, colKey); column(b, P, xs[xs.length - 1], z, y0, colH, r, colKey); }
  // 額枋
  const top = y0 + colH + 0.2;
  b.add("green", box(w - 2 * inset + 0.3, 0.42, 0.3), M([0, top - 0.05, zf]), P);
  b.add("green", box(w - 2 * inset + 0.3, 0.42, 0.3), M([0, top - 0.05, zb]), P);
  b.add("green", box(0.3, 0.42, d - 2 * inset + 0.3), M([xs[0], top - 0.05, 0]), P);
  b.add("green", box(0.3, 0.42, d - 2 * inset + 0.3), M([xs[xs.length - 1], top - 0.05, 0]), P);
  b.add("blue", box(w - 2 * inset + 0.2, 0.22, 0.26), M([0, top - 0.42, zf]), P);
  // 開間
  const fk = Array.isArray(front) ? front : xs.slice(0, -1).map(() => front);
  for (let i = 0; i < nx; i++) {
    bay(b, P, fk[i], xs[i] + r, xs[i + 1] - r, zf, y0 + 0.2, colH - 0.2, 1);
    bay(b, P, backSide, xs[i] + r, xs[i + 1] - r, zb, y0 + 0.2, colH - 0.2, -1);
  }
  // 兩側（用旋轉的父矩陣）
  for (const s of [-1, 1]) {
    const PS = P.clone().multiply(M([0, 0, 0], [0, (s * Math.PI) / 2, 0]));
    for (let j = 0; j < nz; j++) {
      const za = zs[j], zb2 = zs[j + 1];
      const xa = s > 0 ? -zb2 : za, xb = s > 0 ? -za : zb2;
      bay(b, PS, side, xa + r, xb - r, s > 0 ? xs[xs.length - 1] : -xs[0], y0 + 0.2, colH - 0.2, 1);
    }
  }
  if (brackets) {
    for (const x of xs) { bracket(b, P, x, zf, top + 0.15, 1, 0); bracket(b, P, x, zb, top + 0.15, 1, 0); }
    for (let i = 0; i < nx; i++) { const x = (xs[i] + xs[i + 1]) / 2; bracket(b, P, x, zf, top + 0.15, 0.85, 0); bracket(b, P, x, zb, top + 0.15, 0.85, 0); }
    for (const z of zs) { bracket(b, P, xs[0], z, top + 0.15, 1, Math.PI / 2); bracket(b, P, xs[xs.length - 1], z, top + 0.15, 1, Math.PI / 2); }
  }
  return { top: top + (brackets ? 0.85 : 0.25), xs, zs };
}

/* ---------------- 招牌 ---------------- */
function signs(group, P, list) {
  for (const s of list) {
    const tex = TX.signTex(s.text, s.bg, s.fg, s.vertical !== false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    m.applyMatrix4(M(s.p, s.r || [0, 0, 0]).premultiply(P));
    m.castShadow = true;
    group.add(m);
  }
}

/* ---------------- 各種房子 ---------------- */
export function buildBuilding(b, group, B, ground) {
  // B.plain：民間樸素屋頂（翹角很小、沒有脊獸），給清明上河圖用
  const RF = (o) => (B.plain ? { ...o, lift: Math.min(o.lift ?? 0.9, 0.15), caps: false, ridgeH: 0.3, type: o.type === "xieshan" ? (B.roofType || "xieshan") : o.type, H: o.H * 0.82 } : o);
  const P = M([B.x, ground, B.z], [0, B.rot, 0]);
  const { w, d } = B;
  const r = rng(B.x * 13 + B.z * 7);
  if (B.type === "shop" || B.type === "two" || B.type === "ware") {
    const ph = 0.45;
    platform(b, P, w + 0.6, d + 0.6, ph, { stepsW: 2.6 });
    const colH = B.type === "two" ? 3.3 : 3.6;
    const nx = Math.max(3, Math.round(w / 3.4));
    const front = B.type === "ware" ? Array(nx).fill("wood").map((k, i) => (i === Math.floor(nx / 2) ? "door" : "wood"))
      : Array.from({ length: nx }, (_, i) => (i === 0 || i === nx - 1 ? "window" : "open"));
    const F = frame(b, P, { w, d, colH, y0: ph, nx, front, side: B.type === "ware" ? "wood" : "wall", backSide: B.type === "ware" ? "wood" : "window", r: 0.18, colKey: B.type === "ware" ? "wood" : "red" });
    let roofY = F.top;
    if (B.type === "two") {
      // 樓板、平座欄杆、腰簷
      b.add("woodDark", box(w + 1.6, 0.3, d + 1.6), M([0, roofY + 0.1, 0]), P);
      roof(b, RF({ ex: w / 2 + 1.3, ez: d / 2 + 1.3, H: 1.6, type: "pent", ring: 0.42, lift: 0.5, caps: false }), P.clone().multiply(M([0, roofY - 0.85, 0])));
      railing(b, P, [-w / 2 - 0.6, d / 2 + 0.65], [w / 2 + 0.6, d / 2 + 0.65], roofY + 0.25, 0.85, "red", 1.4);
      const F2 = frame(b, P, { w: w - 0.6, d: d - 0.6, colH: 2.9, y0: roofY + 0.25, nx, front: "door", side: "window", backSide: "window", r: 0.16 });
      roofY = F2.top;
    }
    roof(b, RF({ ex: w / 2 + 1.4, ez: d / 2 + 1.5, H: d * 0.36 + 0.6, type: B.type === "ware" ? "gable" : "xieshan", lift: B.type === "ware" ? 0.3 : 0.8 }), P.clone().multiply(M([0, roofY, 0])));
    const sg = [];
    if (B.sign) {
      sg.push({ text: B.sign + (B.type === "two" ? "樓" : "鋪"), p: [0, F.top - 0.05, d / 2 + 0.2], w: 2.4, h: 0.6, vertical: false, bg: "#1f3a33", fg: "#e9d9a6" });
      sg.push({ text: B.name, p: [w / 2 - 0.5, 2.0, d / 2 + 0.9], w: 0.45, h: 1.8, bg: "#efe6d0", fg: "#3a2a1a" });
      b.add("woodDark", box(0.08, 3.4, 0.08), M([w / 2 - 0.5, 1.7, d / 2 + 0.95]), P);
    }
    if (B.flag) {
      b.add("bamboo", rod([-w / 2 - 1.2, 0, d / 2 + 1.8], [-w / 2 - 1.2, 11, d / 2 + 1.8], 0.09, 0.06, 6), null, P);
      sg.push({ text: "酒", p: [-w / 2 - 0.5, 8.8, d / 2 + 1.8], w: 1.3, h: 2.8, bg: "#e8e0cc", fg: "#9e3a28", r: [0, 0.3, 0] });
    }
    signs(group, P, sg);
    // 燈籠
    if (B.type !== "ware") for (const x of [-w / 2 + 1.4, w / 2 - 1.4]) {
      b.add("lantern", lathe([[0, -0.3], [0.2, -0.22], [0.24, 0], [0.2, 0.22], [0, 0.3]], 10), M([x, F.top - 0.7, d / 2 + 0.9]), P);
      b.add("black", cyl(0.01, 0.01, 0.6, 3), M([x, F.top - 0.15, d / 2 + 0.9]), P);
    }
    return;
  }
  if (B.type === "house" || B.type === "yamen") {
    const ph = B.type === "yamen" ? 0.9 : 0.4;
    platform(b, P, w + 0.6, d + 0.6, ph, { stepsW: 2.4 });
    const nx = Math.max(3, Math.round(w / 3.6));
    const front = Array.from({ length: nx }, (_, i) => (i === Math.floor(nx / 2) ? "door" : "window"));
    const F = frame(b, P, { w, d, colH: B.type === "yamen" ? 4.4 : 3.4, y0: ph, nx, front, side: "wall", backSide: "wall", r: 0.18, brackets: B.type === "yamen" });
    if (B.type === "yamen") {
      roof(b, RF({ ex: w / 2 + 1.6, ez: d / 2 + 1.7, H: d * 0.38 + 0.8, type: "xieshan", lift: 0.9 }), P.clone().multiply(M([0, F.top, 0])));
      signs(group, P, [{ text: "明鏡高懸", p: [0, F.top - 0.1, d / 2 + 0.25], w: 3.2, h: 0.7, vertical: false, bg: "#1b2b4a", fg: "#e2c46a" }]);
      for (const s of [-1, 1]) b.add("stoneLight", lathe([[0, 0], [0.5, 0], [0.5, 0.5], [0.35, 0.6], [0.4, 1.2], [0.25, 1.5], [0, 1.6]], 8), M([s * 2.6, 0, d / 2 + 3.2]), P);
    } else {
      // 硬山：兩端山牆
      roof(b, RF({ ex: w / 2 + 0.5, ez: d / 2 + 1.2, H: d * 0.4, type: "gable", lift: 0.2 }), P.clone().multiply(M([0, F.top, 0])));
      for (const s of [-1, 1]) {
        const sp = surface(1, 8, (u, v) => { const z = -d / 2 - 1.2 + (d + 2.4) * u; const hh = (d * 0.4) * Math.pow(Math.max(0, (d / 2 + 1.2 - Math.abs(z)) / (d / 2 + 1.2)), 1.55); return [s * (w / 2 + 0.25), F.top + hh * v, z]; });
        b.add("plaster", sp, null, P);
      }
    }
    return;
  }
  if (B.type === "shed") {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("bamboo", rod([sx * w / 2, 0, sz * d / 2], [sx * w / 2, 2.8, sz * d / 2], 0.08, 0.07), null, P);
    roof(b, RF({ ex: w / 2 + 0.8, ez: d / 2 + 0.8, H: 1.4, type: "gable", lift: 0.1, caps: false }), P.clone().multiply(M([0, 2.8, 0])));
    // 長凳與茶桌
    for (const z of [-1.2, 1.2]) b.add("woodGrain", box(w * 0.7, 0.08, 0.4), M([0, 0.45, z]), P);
    b.add("woodGrain", box(w * 0.5, 0.06, 1.0), M([0, 0.75, 0]), P);
    for (const x of [-w * 0.2, w * 0.2]) b.add("jar", lathe([[0, 0], [0.12, 0], [0.16, 0.12], [0.08, 0.22], [0, 0.24]], 8), M([x, 0.78, 0]), P);
    return;
  }
  if (B.type === "kiosk") {
    platform(b, P, w + 1, d + 1, 0.6, { steps: true, stepsW: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(b, P, sx * w / 2, sz * d / 2, 0.6, 3.2, 0.17);
    for (const [a, c] of [[[-w / 2, d / 2], [-1.1, d / 2]], [[1.1, d / 2], [w / 2, d / 2]], [[-w / 2, -d / 2], [w / 2, -d / 2]], [[-w / 2, -d / 2], [-w / 2, d / 2]], [[w / 2, -d / 2], [w / 2, d / 2]]]) railing(b, P, a, c, 0.6, 0.6, "red", 1.2, true);
    b.add("green", box(w + 0.3, 0.35, 0.25), M([0, 4.0, d / 2]), P); b.add("green", box(w + 0.3, 0.35, 0.25), M([0, 4.0, -d / 2]), P);
    roof(b, RF({ ex: w / 2 + 1.3, ez: d / 2 + 1.3, H: 2.6, type: "xieshan", lift: 0.9 }), P.clone().multiply(M([0, 4.25, 0])));
    return;
  }
  if (B.type === "side") {
    platform(b, P, w + 1, d + 1, 0.8, { stepsW: 3 });
    const F = frame(b, P, { w, d, colH: 4.2, y0: 0.8, nx: 3, front: ["window", "door", "window"], side: "wall", backSide: "wall", r: 0.22, brackets: true });
    roof(b, RF({ ex: w / 2 + 1.7, ez: d / 2 + 1.8, H: 3.4, type: "xieshan", lift: 1.0 }), P.clone().multiply(M([0, F.top, 0])));
    return;
  }
  if (B.type === "gate") { gateTower(b, group, P, B); return; }
  if (B.type === "hall") { greatHall(b, group, P, B); return; }
}

/* ---------------- 門樓 ---------------- */
function gateTower(b, group, P, B) {
  const w = B.w, d = B.d;
  platform(b, P, w + 1.2, d + 1.6, 0.7, { stepsW: 4, back: true });
  const xs = [-w / 2, -w / 2 + w * 0.3, w / 2 - w * 0.3, w / 2];
  for (const x of xs) for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) column(b, P, x, z, 0.7, 5.2, 0.32);
  // 兩側開間做牆，中間是門洞
  for (const [a, c] of [[xs[0], xs[1]], [xs[2], xs[3]]]) {
    for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) b.add("plaster", box(c - a - 0.5, 4.8, 0.3), M([(a + c) / 2, 0.9 + 2.4, z]), P);
    b.add("plaster", box(0.3, 4.8, d - 1.2), M([a === xs[0] ? a : c, 3.3, 0]), P);
  }
  // 敞開的朱紅大門
  for (const s of [-1, 1]) {
    const door = new THREE.Matrix4().compose(V(s * (w * 0.2 - 0.05), 0.7 + 2.3, d / 2 - 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 1.25, 0)), V(1, 1, 1));
    b.add("red", box(w * 0.2, 4.6, 0.12), new THREE.Matrix4().makeTranslation(s * w * 0.1, 0, 0).premultiply(door), P);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) b.add("gold", box(0.08, 0.08, 0.05), new THREE.Matrix4().makeTranslation(s * (0.4 + i * 0.5), -1.6 + j * 0.55, 0.08).premultiply(door), P);
  }
  const top = 0.7 + 5.4;
  b.add("green", box(w + 0.6, 0.5, 0.4), M([0, top, d / 2 - 0.4]), P);
  b.add("green", box(w + 0.6, 0.5, 0.4), M([0, top, -d / 2 + 0.4]), P);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) { bracket(b, P, x, d / 2 - 0.4, top + 0.25, 1.1, 0); bracket(b, P, x, -d / 2 + 0.4, top + 0.25, 1.1, 0); }
  // 重簷
  roof(b, RF({ ex: w / 2 + 2.0, ez: d / 2 + 2.0, H: 2.2, type: "pent", ring: 0.5, lift: 1.0 }), P.clone().multiply(M([0, top + 1.0, 0])));
  b.add("plaster", box(w - 1.6, 1.8, d - 1.4), M([0, top + 2.4, 0]), P);
  for (const x of [-w / 2 + 0.8, -w * 0.15, w * 0.15, w / 2 - 0.8]) for (const z of [-d / 2 + 0.7, d / 2 - 0.7]) b.add("red", cyl(0.2, 0.2, 2.0, 8), M([x, top + 2.4, z]), P);
  roof(b, RF({ ex: w / 2 + 1.4, ez: d / 2 + 1.6, H: 3.2, type: "xieshan", lift: 1.2 }), P.clone().multiply(M([0, top + 3.4, 0])));
  signs(group, P, [
    { text: "溪山", p: [0, top + 2.4, d / 2 - 0.62], w: 2.6, h: 1.1, vertical: false, bg: "#18304a", fg: "#e2c46a" },
    { text: "溪山", p: [0, top + 2.4, -d / 2 + 0.62], w: 2.6, h: 1.1, vertical: false, bg: "#18304a", fg: "#e2c46a", r: [0, Math.PI, 0] },
  ]);
}

/* ---------------- 高台大殿 ---------------- */
function greatHall(b, group, P, B) {
  const { w, d } = B;
  const base = HALL.base;
  // 台基（含白石欄杆）
  b.add("stone", box(w + 8, base, d + 8), M([0, base / 2, 0]), P);
  b.add("stoneLight", box(w + 8.3, 0.18, d + 8.3), M([0, base + 0.05, 0]), P);
  for (const [a, c] of [[[-w / 2 - 4, d / 2 + 4], [-4.2, d / 2 + 4]], [[4.2, d / 2 + 4], [w / 2 + 4, d / 2 + 4]], [[-w / 2 - 4, -d / 2 - 4], [w / 2 + 4, -d / 2 - 4]], [[-w / 2 - 4, -d / 2 - 4], [-w / 2 - 4, d / 2 + 4]], [[w / 2 + 4, -d / 2 - 4], [w / 2 + 4, d / 2 + 4]]]) railing(b, P, a, c, base, 0.8, "stoneLight", 2.0, true);
  // 正面踏步（中間御路）
  for (let i = 0; i < 8; i++) { const sh = base * (1 - i / 8); b.add("stoneLight", box(8, sh, 0.5), M([0, sh / 2, d / 2 + 4.25 + i * 0.5]), P); }
  b.add("stoneDark", box(2.4, 0.4, 4.2), M([0, base * 0.45, d / 2 + 6.2], [-0.29, 0, 0]), P);
  // 外圈迴廊柱
  const colH = 6.2;
  const nx = 9, nz = 5;
  const F = frame(b, P, { w, d, colH, y0: base, nx, nz, front: Array.from({ length: nx }, (_, i) => (Math.abs(i - 4) <= 1 ? "door" : "window")), side: "window", backSide: "window", r: 0.36, brackets: true, inset: 0 });
  // 迴廊：往外再一圈柱
  for (let i = 0; i <= nx + 2; i++) {
    const x = -w / 2 - 2.6 + ((w + 5.2) * i) / (nx + 2);
    column(b, P, x, d / 2 + 2.6, base, colH - 0.8, 0.3);
    column(b, P, x, -d / 2 - 2.6, base, colH - 0.8, 0.3);
  }
  for (let j = 1; j <= nz; j++) {
    const z = -d / 2 - 2.6 + ((d + 5.2) * j) / (nz + 1);
    column(b, P, -w / 2 - 2.6, z, base, colH - 0.8, 0.3);
    column(b, P, w / 2 + 2.6, z, base, colH - 0.8, 0.3);
  }
  b.add("green", box(w + 5.6, 0.4, 0.3), M([0, base + colH - 0.4, d / 2 + 2.6]), P);
  b.add("green", box(w + 5.6, 0.4, 0.3), M([0, base + colH - 0.4, -d / 2 - 2.6]), P);
  b.add("green", box(0.3, 0.4, d + 5.6), M([-w / 2 - 2.6, base + colH - 0.4, 0]), P);
  b.add("green", box(0.3, 0.4, d + 5.6), M([w / 2 + 2.6, base + colH - 0.4, 0]), P);
  // 下簷（重簷的下層）
  const y1 = F.top - 0.3;
  roof(b, RF({ ex: w / 2 + 4.6, ez: d / 2 + 4.6, H: 4.2, type: "pent", ring: 0.5, lift: 1.4, res: 0.9 }), P.clone().multiply(M([0, y1, 0])));
  // 上層身（承托上簷）
  const w2 = w - 6, d2 = d - 6, yb = y1 + 1.9;
  b.add("woodDark", box(w2 + 0.4, 0.3, d2 + 0.4), M([0, yb, 0]), P);
  const F2 = frame(b, P, { w: w2, d: d2, colH: 3.2, y0: yb, nx: 7, nz: 3, front: "window", side: "window", backSide: "window", r: 0.3, brackets: true, inset: 0 });
  roof(b, RF({ ex: w2 / 2 + 4.2, ez: d2 / 2 + 4.2, H: 7.2, type: "xieshan", lift: 1.6, res: 0.9, ridgeH: 0.9 }), P.clone().multiply(M([0, F2.top - 0.2, 0])));
  signs(group, P, [{ text: "溪山殿", p: [0, F2.top - 1.2, d2 / 2 + 0.3], w: 4.2, h: 1.3, vertical: false, bg: "#14294a", fg: "#e6c25f" }]);
}

/* ---------------- 高台（石台、券門、雙側石階） ---------------- */
export function buildTerrace(b, group) {
  const { cx, cz, hx, hz, top } = terrace;
  const h = top - BANK + 1.5;
  const y0 = BANK - 1.5;
  b.add("stone", box(hx * 2, h, hz * 2), M([cx, y0 + h / 2, cz]));
  b.add("stoneLight", box(hx * 2 + 0.4, 0.3, hz * 2 + 0.4), M([cx, top + 0.05, cz]));
  // 台面鋪石
  b.add("flag", new THREE.PlaneGeometry(hx * 2 - 0.4, hz * 2 - 0.4).rotateX(-Math.PI / 2), M([cx, top + 0.21, cz]));
  // 女牆（城垛）沿邊，正面石階處留口
  const crenel = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 2.4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      b.add("stone", box(1.4, 1.0, 0.6), M([x0 + (x1 - x0) * t, top + 0.7, z0 + (z1 - z0) * t], [0, Math.atan2(-(z1 - z0), x1 - x0), 0]));
    }
    b.add("stone", box(L, 0.5, 0.6), M([(x0 + x1) / 2, top + 0.45, (z0 + z1) / 2], [0, Math.atan2(-(z1 - z0), x1 - x0), 0]));
  };
  const fz = cz + hz;
  const [s1, s2] = terraceStairs;
  crenel(cx - hx, fz - 0.3, s1.x0, fz - 0.3); crenel(s1.x1, fz - 0.3, s2.x0, fz - 0.3); crenel(s2.x1, fz - 0.3, cx + hx, fz - 0.3);
  crenel(cx - hx + 0.3, cz - hz, cx - hx + 0.3, fz); crenel(cx + hx - 0.3, cz - hz, cx + hx - 0.3, fz);
  // 三個石券門洞
  for (const k of [-1, 0, 1]) {
    const x = cx + k * 14, R = k === 0 ? 3.2 : 2.5, H = k === 0 ? 4.2 : 3.4;
    const shape = new THREE.Shape();
    shape.moveTo(-R, 0); shape.lineTo(-R, H); shape.absarc(0, H, R, Math.PI, 0, true); shape.lineTo(R, 0); shape.lineTo(-R, 0);
    const recess = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: false, curveSegments: 16 });
    recess.translate(0, 0, -3.0);
    b.add("black", recess, M([x, BANK - 0.02, fz + 0.02]));
    // 券臉石
    const ring = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI - (i / 16) * Math.PI; ring.push([x + Math.cos(a) * (R + 0.3), BANK + H + Math.sin(a) * (R + 0.3), fz + 0.12]); }
    b.add("stoneLight", tube(ring, 0.32, 32, 6));
    for (const s of [-1, 1]) b.add("stoneLight", box(0.6, H, 0.4), M([x + s * (R + 0.3), BANK + H / 2, fz + 0.1]));
    // 朱門（半開）
    for (const s of [-1, 1]) b.add("red", box(R * 0.95, H + R * 0.6, 0.12), M([x + s * R * 0.5, BANK + (H + R * 0.6) / 2, fz - 2.5]));
  }
  // 雙側石階
  for (const st of terraceStairs) {
    const n = Math.round((top - BANK) / 0.18);
    const L = st.z1 - st.z0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const yTop = top - (top - BANK) * t;
      b.add("stoneLight", box(st.x1 - st.x0, yTop - y0, L / n + 0.02), M([(st.x0 + st.x1) / 2, (yTop + y0) / 2, st.z0 + L * (t + 0.5 / n)]));
    }
    // 兩側矮牆（欄杆）
    for (const x of [st.x0 - 0.3, st.x1 + 0.3]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x, top - (top - BANK) * t + 1.0, st.z0 + L * t]); }
      b.add("stone", tube(pts, 0.32, 16, 4));
      for (let i = 0; i <= 6; i++) { const t = i / 6; b.add("stone", box(0.5, 1.2, 0.5), M([x, top - (top - BANK) * t + 0.4, st.z0 + L * t])); }
    }
  }
  // 後方石階（下到宮苑）
  {
    const st = backStairs, yb = terrainH((st.x0 + st.x1) / 2, st.z0);
    const n = Math.round((top - yb) / 0.18), L = st.z1 - st.z0;
    for (let i = 0; i < n; i++) {
      const t = i / n, yTop = yb + (top - yb) * (i + 1) / n;
      b.add("stoneLight", box(st.x1 - st.x0, yTop - (yb - 1), L / n + 0.02), M([(st.x0 + st.x1) / 2, (yTop + yb - 1) / 2, st.z0 + L * (t + 0.5 / n)]));
    }
    for (const x of [st.x0 - 0.3, st.x1 + 0.3]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x, yb + (top - yb) * t + 1.0, st.z0 + L * t]); }
      b.add("stone", tube(pts, 0.32, 16, 4));
    }
  }
  // 石獅
  for (const st of terraceStairs) for (const x of [st.x0 - 0.8, st.x1 + 0.8]) {
    b.add("stoneLight", box(1.2, 0.8, 1.2), M([x, BANK + 0.4, st.z1 + 1]));
    b.add("stoneLight", lathe([[0, 0], [0.45, 0], [0.5, 0.4], [0.3, 0.7], [0.42, 1.1], [0.2, 1.45], [0, 1.5]], 8), M([x, BANK + 0.8, st.z1 + 1]));
  }
}

/* ---------------- 白牆院落 ---------------- */
export function buildWall(b, W, groundAt) {
  for (let i = 0; i < W.pts.length - 1; i++) {
    const [ax, az] = W.pts[i], [cx, cz] = W.pts[i + 1];
    const segs = W.gap && W.gap[0] === i ? [[0, W.gap[1]], [W.gap[2], 1]] : [[0, 1]];
    for (const [t0, t1] of segs) {
      const x0 = ax + (cx - ax) * t0, z0 = az + (cz - az) * t0, x1 = ax + (cx - ax) * t1, z1 = az + (cz - az) * t1;
      const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = groundAt(mx, mz);
      const P = M([mx, y, mz], [0, rot, 0]);
      b.add("stoneDark", box(L, 0.5, 0.7), M([0, 0.25, 0]), P);
      b.add("plaster", box(L, W.h - 0.5, 0.5), M([0, 0.25 + (W.h - 0.5) / 2, 0]), P);
      // 牆頭瓦
      roof(b, { ex: L / 2 + 0.2, ez: 0.75, H: 0.45, type: "gable", lift: 0, caps: true, ridgeH: 0.25, res: 0.5 }, P.clone().multiply(M([0, W.h, 0])));
      // 漏窗
      for (let k = 1; k < Math.floor(L / 6); k++) {
        const x = -L / 2 + k * 6;
        b.add("lattice2", new THREE.CircleGeometry(0.55, 16), M([x, 1.9, 0.26]), P);
        b.add("lattice2", new THREE.CircleGeometry(0.55, 16), M([x, 1.9, -0.26], [0, Math.PI, 0]), P);
      }
    }
    if (W.gap && W.gap[0] === i) {
      // 院門門罩
      const t = (W.gap[1] + W.gap[2]) / 2, gx = ax + (cx - ax) * t, gz = az + (cz - az) * t;
      const L = Math.hypot(cx - ax, cz - az) * (W.gap[2] - W.gap[1]);
      const rot = Math.atan2(-(cz - az), cx - ax), y = groundAt(gx, gz);
      const P = M([gx, y, gz], [0, rot, 0]);
      for (const s of [-1, 1]) b.add("plaster", box(0.7, W.h + 0.9, 0.9), M([s * (L / 2 + 0.2), (W.h + 0.9) / 2, 0]), P);
      roof(b, { ex: L / 2 + 1.0, ez: 1.2, H: 0.9, type: "xieshan", lift: 0.5, caps: true, res: 0.4, ridgeH: 0.3 }, P.clone().multiply(M([0, W.h + 0.9, 0])));
    }
  }
}

/* ---------------- 觀景亭（六角攢尖） ---------------- */
export function buildPavilion(b, x, z, y, R) {
  const P = M([x, y, z]);
  b.add("stone", cyl(R + 1.2, R + 1.4, 0.8, 6), M([0, 0.2, 0]), P);
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const px = Math.cos(a) * R, pz = Math.sin(a) * R;
    column(b, P, px, pz, 0.6, 3.1, 0.18);
    if (k !== 1) {
      // 美人靠
      const qx = Math.cos(a1) * R, qz = Math.sin(a1) * R;
      b.add("redDark", rod([px, 1.05, pz], [qx, 1.05, qz], 0.06), null, P);
      b.add("woodGrain", rod([px * 0.92, 1.0, pz * 0.92], [qx * 0.92, 1.0, qz * 0.92], 0.18, 0.18, 4), null, P);
    }
    b.add("green", rod([px, 3.75, pz], [Math.cos(a1) * R, 3.75, Math.sin(a1) * R], 0.16, 0.16, 6), null, P);
  }
  pyramidRoof(b, { R: R + 1.5, H: 3.6, n, lift: 0.9 }, P.clone().multiply(M([0, 3.95, 0])));
}

/* ---------------- 市集攤位 ---------------- */
export function buildStall(b, S, y) {
  const P = M([S.x, y, S.z], [0, S.rot, 0]);
  const cloth = S.color === "blue" ? "clothBlue" : "clothRed";
  const r = rng(Math.floor(S.x * 31 + S.z * 17));
  if (S.kind === "tent") {
    const h = 2.4, s = 1.8;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("bamboo", rod([sx * s, 0, sz * s], [sx * s, h, sz * s], 0.05, 0.04), null, P);
    b.add("bamboo", rod([0, 0, 0], [0, h + 1.5, 0], 0.06, 0.05), null, P);
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4, a1 = ((k + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      const R = s * Math.SQRT2;
      const g = surface(6, 6, (u, v) => {
        const a = a0 + (a1 - a0) * u, rr = R * (1 - v);
        const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.25;
        return [Math.cos(a) * rr * (1 - 0.29 * Math.sin(u * Math.PI)), h + 1.5 * v - sag, Math.sin(a) * rr * (1 - 0.29 * Math.sin(u * Math.PI))];
      });
      b.add(cloth, g, null, P);
      // 垂邊
      const fr = surface(6, 1, (u, v) => { const a = a0 + (a1 - a0) * u; const rr = R * (1 - 0.29 * Math.sin(u * Math.PI)); return [Math.cos(a) * rr, h - 0.35 * v, Math.sin(a) * rr]; });
      b.add(cloth, fr, null, P);
    }
  } else {
    // 桌、竿、彎曲布棚
    b.add("woodGrain", box(3.0, 0.08, 1.2), M([0, 0.85, 0]), P);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.5, 0.5]) b.add("woodDark", box(0.08, 0.85, 0.08), M([sx, 0.42, sz]), P);
    for (const sx of [-1.6, 1.6]) { b.add("bamboo", rod([sx, 0, 0.8], [sx, 2.4, 0.8], 0.04), null, P); b.add("bamboo", rod([sx, 0, -0.8], [sx, 2.0, -0.8], 0.04), null, P); }
    const awn = surface(8, 6, (u, v) => [-1.75 + 3.5 * u, 2.4 - 0.5 * v - Math.sin(u * Math.PI) * 0.18 - Math.sin(v * Math.PI) * 0.1, 1.3 - 2.3 * v]);
    b.add(cloth, awn, null, P);
  }
  // 貨品
  const goods = ["goods1", "goods2", "goods3"];
  for (let i = 0; i < 6; i++) {
    const gx = -1.2 + i * 0.48, gz = (r() - 0.5) * 0.6;
    const k = r();
    if (k < 0.35) b.add("bamboo", lathe([[0, 0], [0.18, 0.02], [0.24, 0.16], [0.25, 0.2]], 10), M([gx, 0.9, gz]), P);
    else if (k < 0.6) b.add("jar", lathe([[0, 0], [0.1, 0], [0.16, 0.12], [0.14, 0.26], [0.07, 0.32], [0.08, 0.36], [0, 0.36]], 10), M([gx, 0.9, gz]), P);
    else if (k < 0.8) b.add(goods[i % 3], cyl(0.12, 0.12, 0.5, 8), M([gx, 1.02, gz], [0, 0, Math.PI / 2]), P);
    else for (let j = 0; j < 5; j++) b.add(goods[(i + j) % 3], new THREE.IcosahedronGeometry(0.09, 0), M([gx + (r() - 0.5) * 0.3, 0.98 + (j > 2 ? 0.12 : 0), gz + (r() - 0.5) * 0.3]), P);
  }
  if (r() < 0.6) b.add("lantern", lathe([[0, -0.22], [0.16, -0.15], [0.18, 0], [0.16, 0.15], [0, 0.22]], 10), M([1.5, 1.9, 1.2]), P);
}
