// 幾何工具：合併批次、程序化曲面、屋頂產生器
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as TX from "./tex.js";

/* ---------------- 材質 ---------------- */
const MATS = {};
export function mat(key) {
  if (MATS[key]) return MATS[key];
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const defs = {
    tile: () => { const t = TX.roofTiles(); return std({ map: t, normalMap: t.userData.normal, normalScale: new THREE.Vector2(1.2, 1.2), color: 0xb9c2c6, roughness: 0.75 }); },
    ridge: () => std({ color: 0x4d555b, roughness: 0.7 }),
    red: () => std({ color: 0x9e3a28, roughness: 0.6 }),        // 朱紅
    redDark: () => std({ color: 0x6e2a1d, roughness: 0.7 }),
    wood: () => std({ color: 0x7a5636, roughness: 0.8 }),
    woodDark: () => std({ color: 0x3e2c1e, roughness: 0.9 }),
    woodGrain: () => std({ map: TX.planks("#8b6a46", "#5a3f27", 8), roughness: 0.85 }),
    hull: () => std({ map: TX.planks("#6e5236", "#3e2c1c", 10, 9), roughness: 0.8 }),
    deck: () => std({ map: TX.planks("#9a7b55", "#5f4630", 6, 12), roughness: 0.85 }),
    green: () => std({ color: 0x3f7a6a, roughness: 0.65 }),      // 青綠彩畫
    blue: () => std({ color: 0x35587a, roughness: 0.65 }),
    gold: () => std({ color: 0xc9a14a, roughness: 0.45, metalness: 0.2 }),
    plaster: () => std({ map: TX.plaster(), roughness: 0.95 }),
    stone: () => std({ map: TX.masonry("#9a9c92"), roughness: 0.92 }),
    stoneLight: () => std({ color: 0xc9c7bb, roughness: 0.9 }),
    stoneDark: () => std({ color: 0x6f716b, roughness: 0.9 }),
    flag: () => std({ map: TX.flagstone(), roughness: 0.92 }),
    earth: () => std({ map: TX.earth(), roughness: 0.97 }),
    steps: () => std({ map: TX.steps(), roughness: 0.9 }),
    lattice: () => std({ map: TX.lattice(0), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    lattice2: () => std({ map: TX.lattice(1), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    paperWin: () => std({ color: 0xe9dcbc, roughness: 0.9, side: THREE.DoubleSide }),
    mat: () => std({ map: TX.bambooMat(), side: THREE.DoubleSide, roughness: 0.95 }),
    bamboo: () => std({ color: 0x8a7a4a, roughness: 0.8 }),
    clothRed: () => std({ map: TX.cloth("#a63a2b", "#bf5a43"), side: THREE.DoubleSide, roughness: 0.95 }),
    clothBlue: () => std({ map: TX.cloth("#2f5a86", "#4a76a1"), side: THREE.DoubleSide, roughness: 0.95 }),
    clothWhite: () => std({ color: 0xe8e0cc, side: THREE.DoubleSide, roughness: 0.95 }),
    rope: () => std({ color: 0x8a7652, roughness: 1 }),
    black: () => std({ color: 0x24211e, roughness: 0.9 }),
    lantern: () => std({ color: 0xd9502f, emissive: 0x5a1408, roughness: 0.6 }),
    goods1: () => std({ color: 0xb08a4e, roughness: 0.95 }),
    goods2: () => std({ color: 0x7d8a4a, roughness: 0.95 }),
    goods3: () => std({ color: 0x9a5a3a, roughness: 0.95 }),
    jar: () => std({ color: 0x5e4a3a, roughness: 0.6 }),
    under: () => std({ color: 0x4e3a28, roughness: 0.95, side: THREE.DoubleSide }),
    bark: () => std({ color: 0x4a3c30, roughness: 0.95 }),
  };
  MATS[key] = defs[key] ? defs[key]() : std({ color: 0xff00ff });
  return MATS[key];
}

/* ---------------- 合併批次 ---------------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2], "YXZ");
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(...p), _q, _s.set(...(Array.isArray(s) ? s : [s, s, s])));
}
function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) {
    const n = g.attributes.position.count, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}
export class Batch {
  constructor() { this.parts = new Map(); }
  add(key, geo, matrix, parent) {
    const g = clean(geo.clone());
    if (matrix) g.applyMatrix4(matrix);
    if (parent) g.applyMatrix4(parent);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  build(group, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [key, geos] of this.parts) {
      // 太多就分批合併
      for (let i = 0; i < geos.length; i += 1500) {
        const merged = mergeGeometries(geos.slice(i, i + 1500), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat(key));
        mesh.castShadow = cast && !["lattice", "lattice2", "paperWin"].includes(key);
        mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        meshes.push(mesh);
      }
    }
    this.parts.clear();
    return meshes;
  }
}

/* ---------------- 基本形 ---------------- */
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export function lathe(pts, seg = 16) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
export function tube(points, r = 0.05, seg = null, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.TubeGeometry(curve, seg || Math.max(4, points.length * 4), r, radial, false);
}
/** 兩點之間的圓柱（樹枝、欄杆、桿子） */
export function rod(a, b, r0, r1 = r0, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}
/** 參數曲面 fn(u,v) → [x,y,z]；uvFn(u,v) → [u,v] */
export function surface(nu, nv, fn, uvFn = (u, v) => [u, v], skip = null) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    pos.push(...fn(u, v)); uv.push(...uvFn(u, v));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (skip && skip(i, j)) continue;
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** 沿折線的帶狀面（道路、岸線） */
export function ribbon(points, widthFn, yFn, uvScale = 4) {
  const n = points.length;
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[Math.min(n - 1, i + 1)], o = points[Math.max(0, i - 1)];
    const tx = q[0] - o[0], tz = q[1] - o[1], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L;
    if (i > 0) acc += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
    const w = widthFn(i, p);
    for (const s of [-1, 1]) {
      const x = p[0] + nx * w * s, z = p[1] + nz * w * s;
      pos.push(x, yFn(x, z, i), z);
      uv.push((s * w) / uvScale, acc / uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- 屋頂 ---------------- */
const f = (t) => Math.pow(Math.max(0, t), 1.55);
/**
 * 屋頂（局部座標，簷口在 y=0，屋脊在 y=H）
 * type: hip 廡殿 / xieshan 歇山 / gable 懸山 / pent 腰簷（只有一圈）
 * ex, ez：簷口半寬、半深；lift：翼角起翹；ring：只做外圈（重簷的下層）
 */
export function roof(b, o, parent) {
  const { ex, ez, H, type = "xieshan", lift = 0.9, ring = 0, ridgeH = 0.55, caps = true } = o;
  const g = o.gable ?? ez * 0.78;
  const capH = 0.55;
  const hAt = (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    const tz = (ez - az) / ez;
    let t, h;
    if (type === "hip" || type === "pent") { const tx = (ex - ax) / ez; t = Math.min(tz, tx); h = H * f(Math.min(1, t)); }
    else if (type === "gable") { t = tz; h = H * f(tz); }
    else {
      if (ax <= ex - g) { t = tz; h = H * f(tz); }
      else { const tx = (ex - ax) / g; const he = capH * H * f(tx); const hs = H * f(tz); t = he < hs ? tx * 0.68 : tz; h = Math.min(hs, he); }
    }
    const cx = ax / ex, cz = az / ez;
    const edge = Math.pow(1 - Math.min(1, Math.max(0, t)), 2);
    let L = 0;
    if (type !== "gable") L = lift * edge * Math.pow(cx * cz, 5) + lift * 0.18 * edge * Math.pow(Math.max(cx, cz), 6);
    else L = lift * 0.15 * edge * Math.pow(cx, 6);
    return { h: h + L, t };
  };
  // 網格座標：在山花位置加一條線，讓山花面接近垂直
  const xs = [], zs = [];
  const step = o.res || 0.7;
  const nx = Math.max(6, Math.ceil((2 * ex) / step)), nz = Math.max(6, Math.ceil((2 * ez) / step));
  for (let i = 0; i <= nx; i++) xs.push(-ex + (2 * ex * i) / nx);
  for (let j = 0; j <= nz; j++) zs.push(-ez + (2 * ez * j) / nz);
  if (type === "xieshan") for (const s of [-1, 1]) xs.push(s * (ex - g), s * (ex - g + 0.04));
  xs.sort((a, b) => a - b);
  const pos = [], uv = [], idx = [], under = [];
  for (const z of zs) for (const x of xs) {
    const { h } = hAt(x, z);
    pos.push(x, h, z);
    const front = (ez - Math.abs(z)) / ez <= (ex - Math.abs(x)) / ez || type === "gable";
    uv.push(front ? x / 2.0 : z / 2.0, front ? -Math.abs(z) / 2.0 : -Math.abs(x) / 2.0);
  }
  const W = xs.length;
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
    if (ring) {
      const tc = [hAt(xs[i], zs[j]).t, hAt(xs[i + 1], zs[j + 1]).t, hAt(xs[i + 1], zs[j]).t, hAt(xs[i], zs[j + 1]).t];
      if (Math.min(...tc) > ring) continue;
    }
    const a = j * W + i, bb = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, bb, bb, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  top.setIndex(idx);
  top.computeVertexNormals();
  b.add("tile", top, null, parent);
  // 底面（椽子那一面）
  const und = top.clone();
  const up = und.attributes.position;
  for (let i = 0; i < up.count; i++) up.setY(i, up.getY(i) - 0.22);
  const ui = und.index.array.slice();
  for (let i = 0; i < ui.length; i += 3) { const t = ui[i + 1]; ui[i + 1] = ui[i + 2]; ui[i + 2] = t; }
  und.setIndex(Array.from(ui));
  und.computeVertexNormals();
  b.add("under", und, null, parent);
  // 簷口封板與瓦當
  const edgePts = [];
  const pushEdge = (x0, z0, x1, z1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3));
    const pts = [];
    for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n; pts.push([x, hAt(x, z).h, z]); }
    edgePts.push(pts);
  };
  pushEdge(-ex, ez, ex, ez); pushEdge(ex, -ez, -ex, -ez);
  if (type !== "gable") { pushEdge(ex, ez, ex, -ez); pushEdge(-ex, -ez, -ex, ez); }
  for (const pts of edgePts) {
    const fp = [], fi = [];
    pts.forEach(([x, y, z], k) => { fp.push(x, y + 0.02, z, x, y - 0.3, z); if (k) { const a = (k - 1) * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    fg.setIndex(fi); fg.computeVertexNormals();
    b.add("redDark", fg, null, parent);
    if (caps) {
      const cap = new THREE.CylinderGeometry(0.085, 0.085, 0.16, 6);
      for (let k = 0; k < pts.length; k += 1) {
        const [x, y, z] = pts[k];
        const nx2 = Math.abs(Math.abs(z) - ez) < 0.01 ? 0 : Math.sign(x), nz2 = Math.abs(Math.abs(z) - ez) < 0.01 ? Math.sign(z) : 0;
        const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        m.premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(nx2, nz2)));
        m.setPosition(x + nx2 * 0.05, y + 0.02, z + nz2 * 0.05);
        b.add("ridge", cap, m, parent);
      }
    }
  }
  // 正脊、垂脊、戧脊
  const ridgeTube = (pts, r = 0.16) => b.add("ridge", tube(pts.map(([x, y, z]) => [x, y + 0.12, z]), r, Math.max(6, pts.length * 2), 6), null, parent);
  const topH = hAt(0, 0).h;
  const xr = type === "hip" ? ex - ez : type === "gable" ? ex : ex - g;
  if (type !== "pent") {
    const rp = [];
    for (let k = -8; k <= 8; k++) { const x = (xr * k) / 8; rp.push([x, topH + ridgeH * 0.5 + 0.1 * Math.pow(Math.abs(k / 8), 4), 0]); }
    b.add("ridge", tube(rp, ridgeH * 0.5, 32, 6), null, parent);
    // 鴟吻：兩端向內捲的吻獸
    for (const s of [-1, 1]) {
      const kp = [];
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 1.25; kp.push([s * (xr + 0.1 - 0.5 * Math.sin(a) * 0.7), topH + ridgeH * 0.5 + 0.5 + 0.55 * (1 - Math.cos(a)), 0]); }
      b.add("ridge", tube(kp, ridgeH * 0.42, 14, 6), null, parent);
    }
  }
  if (type === "hip" || type === "pent") {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const x = sx * (ex - u * (ex - Math.max(xr, 0))), z = sz * (ez - u * ez);
        if (type === "pent" && hAt(x, z).t > ring) break;
        pts.push([x, hAt(x, z).h, z]);
      }
      if (pts.length > 1) ridgeTube(pts, 0.13);
    }
  } else if (type === "xieshan") {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const tx = k / 10; const x = sx * (ex - tx * g), z = sz * ez * (1 - 0.68 * tx); pts.push([x, hAt(x * 0.999, z * 0.999).h, z]); }
      ridgeTube(pts, 0.13);
      // 垂脊（沿山花邊）
      const vp = [];
      for (let k = 0; k <= 10; k++) { const z = sz * ez * 0.32 * (1 - k / 10); const x = sx * (ex - g); vp.push([x, H * f((ez - Math.abs(z)) / ez), z]); }
      ridgeTube(vp, 0.14);
      // 翼角上翹的尖
      const c = [sx * ex, hAt(sx * ex, sz * ez).h, sz * ez];
      b.add("ridge", tube([c, [c[0] + sx * 0.5, c[1] + 0.35, c[2] + sz * 0.5], [c[0] + sx * 0.7, c[1] + 0.85, c[2] + sz * 0.7]], 0.09, 8, 5), null, parent);
    }
    // 山花板（紅底）
    for (const sx of [-1, 1]) {
      const sp = [], si = [];
      const n = 12;
      for (let k = 0; k <= n; k++) {
        const z = -ez * 0.33 + (ez * 0.66 * k) / n;
        const yTop = H * f((ez - Math.abs(z)) / ez), yBot = capH * H;
        sp.push(sx * (ex - g + 0.06), Math.max(yTop, yBot), z, sx * (ex - g + 0.06), yBot - 0.1, z);
        if (k) { const a = (k - 1) * 2; si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
      sg.setIndex(si); sg.computeVertexNormals();
      b.add("red", sg, null, parent);
    }
  } else if (type === "gable") {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const z = sz * ez * (1 - k / 10); pts.push([sx * ex, hAt(sx * ex, z).h, z]); }
      ridgeTube(pts, 0.12);
    }
  }
  return { topH, hAt };
}

/** 攢尖頂（亭子）：n 邊形 */
export function pyramidRoof(b, { R, H, n = 6, lift = 0.7 }, parent) {
  const rings = 14;
  const ap = R * Math.cos(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const P = (a, rr) => [Math.cos(a) * R * rr, Math.sin(a) * R * rr];
    const geo = surface(8, rings, (u, v) => {
      const a = a0 + (a1 - a0) * u;
      const rr = 1 - v;
      const [x0, z0] = P(a0, rr), [x1, z1] = P(a1, rr);
      const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      const t = v;
      const corner = Math.pow(Math.abs(u - 0.5) * 2, 6);
      return [x, H * f(t) + lift * Math.pow(1 - t, 2) * corner, z];
    }, (u, v) => [u * (2 * R * Math.sin(Math.PI / n)) / 2, v * R / 2]);
    b.add("tile", geo, null, parent);
    const ug = geo.clone(); ug.translate(0, -0.18, 0);
    b.add("under", ug, null, parent);
    // 角脊
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([Math.cos(a0) * R * (1 - t), H * f(t) + lift * Math.pow(1 - t, 2) + 0.1, Math.sin(a0) * R * (1 - t)]); }
    b.add("ridge", tube(pts, 0.1, 16, 5), null, parent);
    const c = pts[0];
    b.add("ridge", tube([c, [c[0] * 1.06, c[1] + 0.3, c[2] * 1.06], [c[0] * 1.1, c[1] + 0.7, c[2] * 1.1]], 0.07, 8, 5), null, parent);
  }
  // 寶頂
  b.add("gold", lathe([[0, 0], [0.35, 0.05], [0.28, 0.4], [0.18, 0.55], [0.32, 0.85], [0.08, 1.4], [0, 1.5]], 10), new THREE.Matrix4().makeTranslation(0, H, 0), parent);
  return ap;
}
