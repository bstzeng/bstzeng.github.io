// 清明上河圖：會動的人、牲畜、車、轎、船
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, M, box, cyl, lathe, rod, tube, surface, mat } from "../../xishan/js/geo.js";
import { hull } from "../../xishan/js/boats.js";
import * as P from "./plan.js";

const ROBES = [0x3d4f6b, 0x6b5a43, 0xd8cfb8, 0x5a6b5a, 0x7a3b2e, 0x4a4a52, 0x8d7a55, 0x2f3d4f, 0xb8a98a, 0x9a8b70, 0x5d6f80, 0xc9bda0];
const tr = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
function plain(g) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!["position", "normal"].includes(k)) n.deleteAttribute(k); return n; }

/* ======================= 人群（instanced） ======================= */
export class Crowd {
  constructor(scene, max = 520) {
    this.max = max; this.n = 0; this.people = [];
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
    const robe = new THREE.LatheGeometry([[0.2, 0], [0.25, 0.05], [0.22, 0.5], [0.18, 0.9], [0.16, 1.05], [0, 1.06]].map(([a, b]) => new THREE.Vector2(a, b)), 9);
    const body = mergeGeometries([plain(robe), plain(tr(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 9), 0, 1.24, 0)), plain(tr(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 9), 0, 0.96, 0))]);
    const head = mergeGeometries([plain(tr(new THREE.SphereGeometry(0.105, 9, 7), 0, 1.56, 0)), plain(tr(new THREE.SphereGeometry(0.055, 6, 5), 0, 1.66, -0.03))]);
    const cone = tr(new THREE.ConeGeometry(0.3, 0.16, 11), 0, 1.69, 0);
    const cap = mergeGeometries([plain(tr(new THREE.CylinderGeometry(0.095, 0.11, 0.14, 8), 0, 1.68, -0.01)), plain(tr(new THREE.BoxGeometry(0.5, 0.03, 0.04), 0, 1.7, -0.06))]);
    const arm = mergeGeometries([plain(tr(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6), 0, -0.25, 0)), plain(tr(new THREE.SphereGeometry(0.045, 6, 4), 0, -0.52, 0.02))]);
    const pole = tr(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 5), 0, 0, 0, Math.PI / 2);
    const basket = new THREE.CylinderGeometry(0.22, 0.16, 0.3, 9);
    const sack = new THREE.CapsuleGeometry(0.2, 0.35, 3, 7).rotateZ(Math.PI / 2);
    const mk = (geo, m, count) => { const im = new THREE.InstancedMesh(geo, m, count); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.frustumCulled = false; im.count = count; scene.add(im); return im; };
    this.body = mk(body, std({ color: 0xffffff }), max);
    this.head = mk(head, std({ color: 0xd6b08a }), max);
    this.cone = mk(cone, std({ color: 0xb59a5a }), max);
    this.cap = mk(cap, std({ color: 0x1c1c1c }), max);
    this.arm = mk(arm, std({ color: 0xffffff }), max * 2);
    this.pole = mk(pole, std({ color: 0x8a7a4a }), max);
    this.basket = mk(basket, std({ color: 0x9c8650 }), max * 2);
    this.sack = mk(sack, std({ color: 0xc9b07a }), max);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.m = new THREE.Matrix4(); this.t = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.col = new THREE.Color(); this.mh = new THREE.Matrix4(); this.ma = new THREE.Matrix4(); this.q2 = new THREE.Quaternion(); this.e2 = new THREE.Euler();
  }
  add(o = {}) {
    if (this.n >= this.max) return null;
    const i = this.n++;
    const seed = ((i * 2654435761) >>> 0) ^ 0x5bd1e995;
    const r = P.rng(seed); r(); r();
    const p = { i, x: 0, y: P.LAND, z: 0, h: 0, lean: 0, bob: 0, armL: 0, armR: 0, sideL: 0, sideR: 0, carry: o.carry || null, hat: o.hat ?? (r() < 0.3 ? "cone" : r() < 0.6 ? "cap" : null), scale: 1.05 + r() * 0.14, ph: r() * 6.28, sway: 0, ride: false, hidden: false, kind: o.kind || "walk" };
    if (p.kind === "boat" || p.kind === "tracker" || p.carry) p.hat = r() < 0.7 ? "cone" : null;
    this.col.setHex(o.color ?? ROBES[Math.floor(r() * ROBES.length)]);
    this.body.setColorAt(i, this.col); this.arm.setColorAt(i * 2, this.col); this.arm.setColorAt(i * 2 + 1, this.col);
    this.people.push(p);
    return p;
  }
  /** 依每個人的狀態寫入矩陣 */
  commit() {
    const { m, t, q, e, v, s } = this;
    for (const p of this.people) {
      const i = p.i;
      if (p.hidden) { for (const im of [this.body, this.head, this.cone, this.cap, this.pole, this.sack]) im.setMatrixAt(i, this.zero); this.arm.setMatrixAt(i * 2, this.zero); this.arm.setMatrixAt(i * 2 + 1, this.zero); this.basket.setMatrixAt(i * 2, this.zero); this.basket.setMatrixAt(i * 2 + 1, this.zero); continue; }
      e.set(p.lean, p.h, p.tilt || 0, "YXZ"); q.setFromEuler(e);
      const sc = p.scale;
      m.compose(v.set(p.x, p.y + p.bob, p.z), q, s.set(sc, sc, sc));
      const mh = this.mh.copy(m);
      this.body.setMatrixAt(i, m);
      this.head.setMatrixAt(i, mh);
      this.cone.setMatrixAt(i, p.hat === "cone" ? mh : this.zero);
      this.cap.setMatrixAt(i, p.hat === "cap" ? mh : this.zero);
      for (const side of [0, 1]) {
        const sx = side ? 0.19 : -0.19;
        const a = side ? p.armR : p.armL, sd = side ? p.sideR : p.sideL;
        t.compose(v.set(sx, 1.4, 0), this.q2.setFromEuler(this.e2.set(a, 0, sd * (side ? -1 : 1), "XYZ")), s.set(1, 1, 1));
        this.arm.setMatrixAt(i * 2 + side, this.ma.copy(m).multiply(t));
      }
      if (p.carry === "pole") {
        this.pole.setMatrixAt(i, this.ma.copy(m).multiply(t.makeTranslation(0.12, 1.47, 0)));
        for (const k of [0, 1]) this.basket.setMatrixAt(i * 2 + k, this.ma.copy(m).multiply(t.makeTranslation(0.12 + Math.sin(p.sway + k) * 0.05, 0.78, k ? 0.86 : -0.86)));
      } else { this.pole.setMatrixAt(i, this.zero); this.basket.setMatrixAt(i * 2, this.zero); this.basket.setMatrixAt(i * 2 + 1, this.zero); }
      this.sack.setMatrixAt(i, p.carry === "sack" ? this.ma.copy(m).multiply(t.makeTranslation(0.05, 1.56, -0.16)) : this.zero);
    }
    for (const im of [this.body, this.head, this.cone, this.cap, this.arm, this.pole, this.basket, this.sack]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
/** 常用動作 */
export const anim = {
  walk(p, t, speed = 1) { const w = Math.sin(t * 5.6 * speed + p.ph); p.bob = Math.abs(w) * 0.035; p.lean = 0.04; p.armL = w * 0.5; p.armR = -w * 0.5; p.sideL = p.sideR = 0.06; p.sway = t * 5.6 * speed + p.ph; if (p.carry === "pole") { p.armR = -1.15; p.armL = w * 0.3; } if (p.carry === "sack") { p.armL = p.armR = -2.7; p.sideL = p.sideR = 0.3; } },
  stand(p, t) { p.bob = 0; p.lean = 0; p.armL = 0.05 + Math.sin(t * 0.7 + p.ph) * 0.05; p.armR = 0.05; p.sideL = p.sideR = 0.08; },
  talk(p, t) { anim.stand(p, t); p.armR = -0.7 + Math.sin(t * 2.2 + p.ph) * 0.45; p.sideR = 0.25; },
  cheer(p, t, k = 1) { const w = Math.sin(t * 7 + p.ph); p.armR = -2.3 * k - w * 0.4 * k; p.armL = -1.2 * k + w * 0.5 * k; p.sideL = p.sideR = 0.25; p.bob = Math.abs(w) * 0.04 * k; p.lean = -0.08 * k; },
  pull(p, t) { const w = Math.sin(t * 3.2 + p.ph); p.lean = 0.42; p.armL = p.armR = -1.25 + w * 0.1; p.sideL = p.sideR = 0.1; p.bob = Math.abs(w) * 0.03; },
  pole(p, t) { const w = Math.sin(t * 1.4 + p.ph); p.lean = 0.25 + w * 0.15; p.armL = -1.3 - w * 0.5; p.armR = -1.1 - w * 0.5; p.sideL = p.sideR = 0.15; },
  sell(p, t) { anim.stand(p, t); p.armR = -1.0 + Math.sin(t * 1.5 + p.ph) * 0.35; p.h += Math.sin(t * 0.3 + p.ph) * 0.002; },
};

/* ======================= 牲畜 ======================= */
const SPECIES = {
  donkey: { L: 1.4, Hh: 0.75, R: 0.32, col: 0x7d7468, neck: 0.55, ear: 0.26, load: 0x2e2a26 },
  mule: { L: 1.6, Hh: 0.85, R: 0.36, col: 0x5a4a3a, neck: 0.6, ear: 0.2 },
  ox: { L: 2.0, Hh: 0.8, R: 0.5, col: 0x6b4a32, neck: 0.35, horn: true },
  horse: { L: 1.9, Hh: 1.0, R: 0.4, col: 0x5b3a26, neck: 0.8, ear: 0.12, saddle: true },
  camel: { L: 2.3, Hh: 1.25, R: 0.48, col: 0xb89a6a, neck: 1.2, hump: true, load: 0x8a6a4a },
};
const animalMats = {};
const am = (hex) => animalMats[hex] || (animalMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92 }));
export function makeAnimal(kind, tint) {
  const S = SPECIES[kind], col = tint ?? S.col;
  const g = new THREE.Group();
  const parts = [];
  // 身體（橢球）、頸、頭、尾、耳、角、駝峰
  parts.push(plain(tr(new THREE.SphereGeometry(1, 12, 8), 0, S.Hh + S.R * 0.8, 0, 0, 0, 0, S.R * 0.95, S.R, S.L / 2)));
  const chest = [0, S.Hh + S.R * 1.1, S.L * 0.42], headP = [0, S.Hh + S.R * 1.1 + S.neck * 0.8, S.L * 0.42 + S.neck * 0.55];
  parts.push(plain(rod(chest, headP, S.R * 0.42, S.R * 0.3, 7)));
  parts.push(plain(tr(new THREE.SphereGeometry(1, 9, 7), headP[0], headP[1], headP[2] + S.R * 0.35, 0.5, 0, 0, S.R * 0.3, S.R * 0.32, S.R * 0.7)));
  parts.push(plain(rod([0, S.Hh + S.R * 1.2, -S.L / 2], [0, S.Hh + S.R * 0.2, -S.L / 2 - 0.2], 0.04, 0.02, 4)));
  if (S.ear) for (const s of [-1, 1]) parts.push(plain(rod([s * 0.08, headP[1] + 0.1, headP[2]], [s * 0.16, headP[1] + 0.1 + S.ear, headP[2] - 0.05], 0.04, 0.02, 4)));
  if (S.horn) for (const s of [-1, 1]) parts.push(plain(tube([[s * 0.12, headP[1] + 0.12, headP[2]], [s * 0.3, headP[1] + 0.2, headP[2] - 0.05], [s * 0.32, headP[1] + 0.38, headP[2] + 0.05]], 0.035, 8, 4)));
  if (S.hump) for (const z of [-0.45, 0.4]) parts.push(plain(tr(new THREE.SphereGeometry(1, 8, 6), 0, S.Hh + S.R * 1.75, z, 0, 0, 0, S.R * 0.55, S.R * 0.75, S.R * 0.6)));
  const body = new THREE.Mesh(mergeGeometries(parts), am(col)); body.castShadow = true; g.add(body);
  // 馱的貨
  if (S.load) for (const s of [-1, 1]) { const ld = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, S.L * 0.38), am(S.load)); ld.position.set(s * (S.R + 0.12), S.Hh + S.R * 0.9, 0); ld.castShadow = true; g.add(ld); }
  if (S.saddle) { const sd = new THREE.Mesh(new THREE.BoxGeometry(S.R * 2.1, 0.12, 0.6), am(0x7a2e22)); sd.position.set(0, S.Hh + S.R * 1.85, 0); g.add(sd); }
  // 四條腿（可擺動）
  const legs = [];
  const legG = mergeGeometries([plain(tr(new THREE.CylinderGeometry(S.R * 0.17, S.R * 0.12, S.Hh + S.R * 0.6, 6), 0, -(S.Hh + S.R * 0.6) / 2, 0)), plain(tr(new THREE.CylinderGeometry(S.R * 0.15, S.R * 0.15, 0.08, 6), 0, -(S.Hh + S.R * 0.6), 0))]);
  for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
    const pv = new THREE.Group(); pv.position.set(sx * S.R * 0.5, S.Hh + S.R * 0.6, sz * S.L * 0.33);
    const lm = new THREE.Mesh(legG, am(col)); lm.castShadow = true; pv.add(lm); g.add(pv);
    legs.push({ pv, ph });
  }
  g.userData = { legs, S, kind };
  return g;
}
export function stepAnimal(g, t, speed, ph = 0) {
  for (const l of g.userData.legs) l.pv.rotation.x = Math.sin(t * 4.2 * Math.max(0.3, speed) + l.ph + ph) * 0.42 * Math.min(1, speed);
}

/* ======================= 車、轎 ======================= */
function wheel(r = 0.75) {
  const g = new THREE.Group();
  const parts = [plain(new THREE.TorusGeometry(r, 0.06, 6, 20)), plain(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 8).rotateX(Math.PI / 2))];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; parts.push(plain(rod([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.025, 0.025, 4))); }
  const m = new THREE.Mesh(mergeGeometries(parts), am(0x4a3826)); m.castShadow = true; g.add(m);
  g.rotation.y = Math.PI / 2;
  return g;
}
export function makeCart(kind = "ox") {
  const g = new THREE.Group(), b = new Batch();
  const L = kind === "big" ? 4.2 : 3.0, W = kind === "big" ? 1.9 : 1.5, y = kind === "big" ? 1.0 : 0.85;
  b.add("woodGrain", box(W, 0.12, L), M([0, y, 0]));
  for (const s of [-1, 1]) b.add("woodDark", box(0.08, 0.5, L), M([s * W / 2, y + 0.3, 0]));
  for (const s of [-1, 1]) b.add("woodDark", rod([s * 0.45, y - 0.05, L / 2], [s * 0.45, y - 0.25, L / 2 + 2.2], 0.05, 0.04, 5));
  if (kind === "big") {
    // 太平車：上面有棚
    b.add("mat", new THREE.CylinderGeometry(1.0, 1.0, L * 0.85, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), M([0, y + 0.55, -0.2]));
  } else {
    for (let i = 0; i < 6; i++) b.add(["goods1", "goods3", "woodGrain"][i % 3], box(0.5, 0.4, 0.5), M([(i % 2 - 0.5) * 0.6, y + 0.3, -1 + Math.floor(i / 2) * 0.8]));
  }
  b.build(g);
  const wheels = [];
  for (const s of [-1, 1]) { const w = wheel(kind === "big" ? 0.95 : 0.78); w.position.set(s * (W / 2 + 0.12), kind === "big" ? 0.95 : 0.78, -0.2); g.add(w); wheels.push(w); }
  g.userData = { wheels, r: kind === "big" ? 0.95 : 0.78, L };
  return g;
}
export function makeBarrow() {
  const g = new THREE.Group(), b = new Batch();
  b.add("woodGrain", box(0.8, 0.08, 1.6), M([0, 0.62, 0]));
  for (const s of [-1, 1]) b.add("woodDark", rod([s * 0.3, 0.62, -0.8], [s * 0.35, 0.95, -1.6], 0.035, 0.03, 4));
  b.add("goods1", lathe([[0, 0], [0.3, 0.02], [0.34, 0.25], [0.28, 0.45], [0, 0.48]], 8), M([0, 0.66, 0.1], [0, 0, Math.PI / 2]));
  b.build(g);
  const w = wheel(0.5); w.position.set(0, 0.5, 0.5); g.add(w);
  g.userData = { wheels: [w], r: 0.5, L: 1.6 };
  return g;
}
export function makeSedan() {
  const g = new THREE.Group(), b = new Batch();
  b.add("woodGrain", box(1.0, 1.3, 1.2), M([0, 1.25, 0]));
  b.add("lattice", new THREE.PlaneGeometry(0.6, 0.5), M([0.51, 1.4, 0], [0, Math.PI / 2, 0]));
  b.add("lattice", new THREE.PlaneGeometry(0.6, 0.5), M([-0.51, 1.4, 0], [0, -Math.PI / 2, 0]));
  b.add("redDark", lathe([[0.85, 0], [0.7, 0.25], [0.2, 0.5], [0, 0.55]], 4), M([0, 1.9, 0], [0, Math.PI / 4, 0]));
  for (const s of [-1, 1]) b.add("woodDark", rod([s * 0.56, 1.35, -2.0], [s * 0.56, 1.35, 2.0], 0.045, 0.045, 5));
  // 清明掃墓：轎頂插柳枝
  for (const k of [-1, 1]) b.add("goods2", tube([[k * 0.2, 2.35, 0], [k * 0.5, 2.9, 0.2], [k * 0.9, 2.7, 0.5]], 0.03, 8, 3));
  b.build(g);
  return g;
}

/* ======================= 大船（放桅過橋） ======================= */
export function makeBigBoat() {
  const b = new Batch();
  const L = 20, B = 4.8, D = 1.0;
  const h = hull(b, { L, B, D, draft: 0.65, rise: 0.75 });
  const y = h.deckY;
  // 船尾的低艙（篷頂）
  const x0 = h.X(0.06), x1 = h.X(0.34), w = h.half(0.2) * 0.92;
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) b.add("woodDark", cyl(0.08, 0.08, 1.5, 6), M([x0 + ((x1 - x0) * i) / 4, y + 0.75, s * w]));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.add("lattice", new THREE.PlaneGeometry((x1 - x0) / 4 - 0.15, 0.9), M([x0 + ((x1 - x0) * (i + 0.5)) / 4, y + 0.85, s * (w + 0.01)], [0, s > 0 ? 0 : Math.PI, 0]));
  b.add("mat", surface(6, 8, (u, v) => { const a = Math.PI * v; return [x0 - 0.3 + (x1 - x0 + 0.6) * u, y + 1.5 + Math.sin(a) * 0.45, -Math.cos(a) * (w + 0.35)]; }, (u, v) => [u * 3, v * 2]));
  // 中段貨物
  const r = P.rng(77);
  for (let i = 0; i < 26; i++) {
    const x = h.X(0.38 + r() * 0.24), z = (r() - 0.5) * 3.2;
    if (r() < 0.6) b.add("goods1", lathe([[0, 0], [0.3, 0.02], [0.36, 0.25], [0.3, 0.5], [0, 0.52]], 8), M([x, y, z], [0, 0, Math.PI / 2]));
    else b.add("woodGrain", box(0.7, 0.55, 0.6), M([x, y + 0.28, z], [0, r(), 0]));
  }
  // 桅座（兩片夾板）與船頭繩索、錨
  const mx = h.X(0.64);
  for (const s of [-1, 1]) b.add("woodDark", box(0.5, 1.2, 0.1), M([mx, y + 0.6, s * 0.2]));
  b.add("rope", new THREE.TorusGeometry(0.3, 0.05, 6, 14).rotateX(Math.PI / 2), M([h.X(0.9), y + 0.1, 0]));
  b.add("woodGrain", rod([h.X(0.03), h.sheer(0.03) + 0.2, 0.6], [h.X(0.03) - 4.0, -0.3, 1.4], 0.07, 0.05, 6));
  // 艙頂撐住桅杆的叉架
  b.add("woodDark", rod([x1 - 0.4, y + 1.95, -0.3], [x1 - 0.4, y + 2.35, 0], 0.05, 0.05, 4));
  b.add("woodDark", rod([x1 - 0.4, y + 1.95, 0.3], [x1 - 0.4, y + 2.35, 0], 0.05, 0.05, 4));
  const g = new THREE.Group();
  b.build(g, { cast: true, receive: true });
  // 桅杆：繞桅座轉軸放倒（向船尾倒，靠在艙頂叉架上）
  const mast = new THREE.Group(); mast.position.set(mx, y + 0.9, 0);
  const bm = new Batch();
  bm.add("woodDark", rod([0, 0, 0], [0, 11.5, 0], 0.17, 0.09, 8));
  bm.add("woodDark", rod([0, 10.2, -2.4], [0, 10.2, 2.4], 0.06, 0.05, 5));
  bm.add("clothWhite", cyl(0.24, 0.2, 4.2, 8), M([-0.3, 8.0, 0]));
  for (const t of [0.15, 0.5, 0.85]) bm.add("rope", new THREE.TorusGeometry(0.25, 0.025, 4, 10), M([-0.3, 6.1 + t * 3.9, 0], [Math.PI / 2, 0, 0]));
  bm.build(mast);
  g.add(mast);
  // 放倒時的最低角度：桅杆靠在叉架上
  const rest = Math.atan2(x1 - 0.4 - mx, y + 2.35 - (y + 0.9));   // 負值：往船尾倒
  g.userData = { L, B, mast, mx, deckY: y, restAngle: rest, cabinTop: y + 1.95 };
  return g;
}
