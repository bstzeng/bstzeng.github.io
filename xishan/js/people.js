// 人物：袍、身、臂、頭、帽（每人 3 個網格），走路動畫
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { rng, Line, surfaces } from "./layout.js";
/** 行人：走在離上一步最近的面上（上橋、下橋都連續） */
function walkGround(x, z, yPrev) {
  const ss = surfaces(x, z);
  let best = null;
  for (const s of ss) if (!best || Math.abs(s.y - yPrev) < Math.abs(best.y - yPrev)) best = s;
  return best;
}
function topGround(x, z) { let best = null; for (const s of surfaces(x, z)) if (!best || s.y > best.y) best = s; return best; }

const ROBES = [0x3d4f6b, 0x6b5a43, 0xd8cfb8, 0x5a6b5a, 0x7a3b2e, 0x4a4a52, 0x8d7a55, 0x2f3d4f, 0xb8a98a];
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const T = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s))); return g; };

/** kind: walker / vendor / porter / carrier / boatman */
export function person(seed, kind = "walker") {
  // 打散種子：相鄰編號的人衣服顏色才會不同
  const r = rng(((seed * 2654435761) >>> 0) ^ 0x9e3779b9);
  r(); r();
  const robe = ROBES[Math.floor(r() * ROBES.length)], under = ROBES[Math.floor(r() * ROBES.length)];
  const skin = 0xd6b08a, hair = 0x1d1a18;
  const parts = [];
  // 長袍（下襬外張）
  const pts = [[0.2, 0], [0.25, 0.05], [0.22, 0.5], [0.18, 0.9], [0.16, 1.05], [0.0, 1.06]].map(([a, b]) => new THREE.Vector2(a, b));
  parts.push(colored(new THREE.LatheGeometry(pts, 10), kind === "porter" || kind === "boatman" ? under : robe));
  // 腰帶
  parts.push(colored(T(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 10), 0, 0.95, 0), 0x2a2420));
  // 上身、交領
  parts.push(colored(T(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 10), 0, 1.24, 0), robe));
  parts.push(colored(T(new THREE.BoxGeometry(0.05, 0.3, 0.02), 0.03, 1.3, 0.155, 0, 0, 0.5), 0xe8dfca));
  // 頭與帽
  parts.push(colored(T(new THREE.SphereGeometry(0.105, 10, 8), 0, 1.56, 0), skin));
  const hat = r();
  if (kind === "boatman" || kind === "porter" || hat < 0.25) parts.push(colored(T(new THREE.ConeGeometry(0.3, 0.16, 12), 0, 1.68, 0), 0xb59a5a));       // 斗笠
  else if (hat < 0.6) parts.push(colored(T(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), 0, 1.68, -0.01), 0x1c1c1c));                            // 幞頭
  else parts.push(colored(T(new THREE.SphereGeometry(0.06, 8, 6), 0, 1.7, -0.02), hair));                                                            // 髮髻
  if (kind === "carrier") {
    // 扁擔與兩個竹籃
    parts.push(colored(T(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), 0, 1.45, 0, Math.PI / 2, 0, 0), 0x8a7a4a));
    for (const s of [-1, 1]) {
      parts.push(colored(T(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 10), 0, 0.75, s * 0.85), 0x9c8650));
      for (const k of [-1, 1]) parts.push(colored(T(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 3), k * 0.15, 1.12, s * 0.85, 0, 0, k * 0.25), 0x5a4a30));
    }
  }
  if (kind === "porter") parts.push(colored(T(new THREE.CapsuleGeometry(0.2, 0.35, 3, 8), 0.05, 1.55, -0.18, 0, 0, Math.PI / 2), 0xc9b07a));   // 米袋
  if (kind === "vendor" && r() < 0.6) parts.push(colored(T(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 10), 0, 0.98, 0.32), 0x2a2420));            // 圍裙
  const body = new THREE.Mesh(mergeGeometries(parts), MAT);
  body.castShadow = true;
  const g = new THREE.Group();
  g.add(body);
  // 手臂（可擺動）
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.19, 1.4, 0);
    const a = new THREE.Mesh(mergeGeometries([
      colored(T(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6), 0, -0.25, 0), robe),
      colored(T(new THREE.SphereGeometry(0.045, 6, 5), 0, -0.52, 0.02), skin),
    ]), MAT);
    a.castShadow = true;
    pivot.add(a);
    // 挑擔：一手扶著扁擔前端，另一手自然垂下；搬貨：雙手扶住肩上的米袋
    if (kind === "carrier") pivot.rotation.x = s > 0 ? -1.15 : 0.15;
    if (kind === "porter") { pivot.rotation.x = -2.6; pivot.rotation.z = s * 0.25; }
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData = { arms, body, kind, phase: r() * 6.28 };
  return g;
}

/** 讓人沿路線走（含過橋：高度由走路系統算） */
export class Crowd {
  constructor(scene) { this.scene = scene; this.walkers = []; this.idle = []; }
  addWalkers(paths) {
    let seed = 100;
    for (const P of paths) {
      const line = new Line(P.pts, 20);
      for (let i = 0; i < P.n; i++) {
        const kind = P.porter ? "porter" : (seed % 7 === 0) ? "carrier" : "walker";
        const p = person(seed++, kind);
        const s = (line.len * (i + 0.37 * (seed % 3))) / P.n % line.len;
        const w = { g: p, line, s, dir: P.oneWay ? 1 : i % 2 ? 1 : -1, oneWay: !!P.oneWay, speed: (P.porter ? 0.7 : 0.9) + ((seed * 37) % 10) / 25, off: ((seed % 5) - 2) * (P.off || 0.5) * 0.5, y: 2 };
        const at = line.at(s);
        const g0 = topGround(at.x, at.z);
        w.y = g0 ? g0.y : 2;
        this.scene.add(p);
        this.walkers.push(w);
      }
    }
  }
  addIdle(spots) {
    let seed = 900;
    for (const s of spots) {
      const p = person(seed++, s.kind || "vendor");
      p.position.set(s.x, s.y, s.z);
      p.rotation.y = s.rot || 0;
      this.scene.add(p);
      this.idle.push({ g: p, s, t: (seed % 10) });
    }
  }
  update(dt, t) {
    for (const w of this.walkers) {
      w.s += w.dir * w.speed * dt;
      if (w.s > w.line.len) { if (w.oneWay) w.s -= w.line.len; else { w.s = w.line.len; w.dir = -1; } }
      if (w.s < 0) { w.s = 0; w.dir = 1; }
      const p = w.line.at(w.s);
      const x = p.x + p.nx * w.off * w.dir, z = p.z + p.nz * w.off * w.dir;
      const g = walkGround(x, z, w.y);
      if (g) w.y += (g.y - w.y) * Math.min(1, dt * 8);
      const bob = Math.abs(Math.sin(t * 5.5 * w.speed + w.g.userData.phase)) * 0.04;
      w.g.position.set(x, w.y + bob, z);
      w.g.rotation.y = Math.atan2(p.tx * w.dir, p.tz * w.dir);
      const sw = Math.sin(t * 5.5 * w.speed + w.g.userData.phase) * 0.5;
      const k = w.g.userData.kind;
      if (k === "walker") { w.g.userData.arms[0].rotation.x = sw; w.g.userData.arms[1].rotation.x = -sw; }
      else w.g.userData.body.rotation.z = sw * 0.06;
    }
    for (const i of this.idle) {
      const u = i.g.userData;
      if (u.kind === "vendor") { u.arms[1].rotation.x = -0.6 + Math.sin(t * 1.3 + u.phase) * 0.4; u.body.rotation.y = Math.sin(t * 0.4 + u.phase) * 0.3; }
      else if (u.kind === "boatman") { u.arms[0].rotation.x = -1.0 + Math.sin(t * 1.6 + u.phase) * 0.5; u.arms[1].rotation.x = -1.0 + Math.sin(t * 1.6 + u.phase) * 0.5; u.body.rotation.z = Math.sin(t * 1.6 + u.phase) * 0.06; }
    }
  }
}
