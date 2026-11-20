// 樹：程序化枝幹＋葉片簇（instanced），風吹擺動在 shader 裡做
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, rod, tube } from "./geo.js";
import * as TX from "./tex.js";
import { rng } from "./layout.js";

export const wind = { value: 0 };

function swayMaterial(map, { amp = 0.25, double = true, color = 0xffffff } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.32, side: double ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.9, color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float ph = ip.x * 0.11 + ip.z * 0.07;
      float k = (uv.y + 0.2) * ${amp.toFixed(3)};
      transformed.x += sin(uTime * 1.6 + ph) * k;
      transformed.z += cos(uTime * 1.3 + ph * 1.3) * k * 0.6;`);
  };
  return m;
}
/** 柳條：attribute aSway（0 在枝頭，1 在下端） */
function willowMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: TX.leafTex("willow"), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = "uniform float uTime;\nattribute float aSway;\nattribute float aPhase;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float s = aSway * aSway;
      transformed.x += (sin(uTime * 1.1 + aPhase) * 0.55 + sin(uTime * 2.7 + aPhase * 2.0) * 0.12) * s;
      transformed.z += (cos(uTime * 0.9 + aPhase * 1.4) * 0.35) * s;`);
  };
  return m;
}

/* ---------------- 枝幹生成 ---------------- */
function grow(r, base, dir, len, rad, depth, opts, out) {
  const pts = [base.clone()];
  const n = 5;
  let p = base.clone(), d = dir.clone();
  for (let i = 1; i <= n; i++) {
    d.add(new THREE.Vector3((r() - 0.5) * opts.twist, (r() - 0.5) * opts.twist * 0.5 + opts.up, (r() - 0.5) * opts.twist)).normalize();
    p = p.clone().addScaledVector(d, len / n);
    pts.push(p);
  }
  out.wood.push({ pts, r0: rad, r1: rad * 0.55 });
  const tip = pts[pts.length - 1];
  if (depth <= 0) { out.tips.push({ p: tip, d: d.clone(), r: rad }); return; }
  const kids = opts.kids(depth);
  for (let k = 0; k < kids; k++) {
    const at = pts[Math.floor(2 + r() * (pts.length - 2))];
    const a = (k / kids) * Math.PI * 2 + r();
    const spread = opts.spread(depth);
    const nd = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread).normalize().lerp(d, 0.35).normalize();
    grow(r, at, nd, len * opts.shrink, rad * 0.62, depth - 1, opts, out);
  }
  if (opts.tipAlways) out.tips.push({ p: tip, d: d.clone(), r: rad });
}

const SPECS = {
  broad: { h: 5.5, rad: 0.42, depth: 3, twist: 0.6, up: 0.08, shrink: 0.68, kids: (d) => (d === 3 ? 4 : 3), spread: (d) => (d === 3 ? 1.4 : 1.1), cluster: 26, cr: 1.9, card: 1.25, leaf: "broad" },
  blossom: { h: 2.8, rad: 0.22, depth: 3, twist: 0.8, up: 0.05, shrink: 0.7, kids: () => 3, spread: () => 1.3, cluster: 14, cr: 1.1, card: 0.9, leaf: "blossom" },
  pine: { h: 9.5, rad: 0.4, depth: 2, twist: 0.45, up: 0.02, shrink: 0.5, kids: (d) => (d === 2 ? 7 : 3), spread: (d) => (d === 2 ? 3.2 : 2.2), pad: true, cluster: 30, cr: 2.3, card: 2.0, leaf: "pine" },
  cypress: { h: 9, rad: 0.32, depth: 2, twist: 0.25, up: 0.25, shrink: 0.4, kids: (d) => (d === 2 ? 9 : 2), spread: () => 0.9, cluster: 12, cr: 1.1, card: 1.3, leaf: "cypress" },
  willow: { h: 4.2, rad: 0.45, depth: 2, twist: 0.7, up: 0.06, shrink: 0.7, kids: (d) => (d === 2 ? 5 : 3), spread: () => 1.6, leaf: "willow" },
};

export function buildTrees(scene, list, groundAt) {
  const wood = new Batch();
  const cards = {};   // leaf kind → matrices
  const strands = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  for (const T of list) {
    const S = SPECS[T.type];
    const r = rng(T.seed);
    const y = groundAt(T.x, T.z);
    const base = new THREE.Vector3(T.x, y - 0.2, T.z);
    const out = { wood: [], tips: [] };
    const lean = new THREE.Vector3((r() - 0.5) * (T.type === "willow" ? 0.6 : 0.25), 1, (r() - 0.5) * (T.type === "willow" ? 0.6 : 0.25)).normalize();
    const H = S.h * T.sc;
    grow(r, base, lean, H, S.rad * T.sc, S.depth, { ...S, tipAlways: !!S.pad }, out);
    for (const w of out.wood) {
      wood.add("bark", tube(w.pts, (w.r0 + w.r1) / 2, 10, w.r0 > 0.2 ? 7 : 5));
    }
    // 樹根張開
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + r(); wood.add("bark", rod([T.x, y - 0.3, T.z], [T.x + Math.cos(a) * S.rad * 3 * T.sc, y - 0.25, T.z + Math.sin(a) * S.rad * 3 * T.sc], S.rad * 0.7 * T.sc, 0.04, 5)); }
    const key = S.leaf;
    if (!cards[key]) cards[key] = [];
    if (T.type === "willow") {
      // 從枝頭與枝條上垂下的柳條
      for (const w of out.wood.slice(1)) {
        for (let i = 2; i < w.pts.length; i++) {
          const p = w.pts[i];
          const n = 3;
          for (let k = 0; k < n; k++) {
            const off = new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6);
            const top = p.clone().add(off);
            const len = Math.min(top.y - y - 0.6, 3 + r() * 3.5);
            if (len < 1) continue;
            strands.push({ top, len, w: 0.5 + r() * 0.3, ph: r() * 6.28, rot: r() * Math.PI });
          }
        }
      }
      for (const t of out.tips) for (let k = 0; k < 6; k++) {
        const pp = t.p.clone().add(new THREE.Vector3((r() - 0.5) * 2, r() * 0.5, (r() - 0.5) * 2));
        e.set(r() * 6, r() * 6, r() * 6); q.setFromEuler(e); sc.setScalar(1.3);
        cards[key].push(m4.compose(pp, q, sc).clone());
      }
      continue;
    }
    for (const t of out.tips) {
      const n = S.cluster;
      for (let k = 0; k < n; k++) {
        let pp;
        if (S.pad) {
          // 松：水平的針葉層（像國畫裡的松針一團團平展）
          const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * S.cr * T.sc;
          pp = t.p.clone().add(new THREE.Vector3(Math.cos(a) * rr, (r() - 0.3) * 0.5 - rr * 0.12, Math.sin(a) * rr));
          e.set(-Math.PI / 2 + (r() - 0.5) * 0.5, r() * 6.28, 0, "YXZ");
        } else {
          const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * S.cr * T.sc;
          pp = t.p.clone().add(new THREE.Vector3(Math.cos(a) * rr, (r() - 0.35) * S.cr * 0.9 * T.sc, Math.sin(a) * rr));
          e.set((r() - 0.5) * 1.6, r() * 6.28, (r() - 0.5) * 1.6, "YXZ");
        }
        q.setFromEuler(e); sc.setScalar(S.card * T.sc * (0.75 + r() * 0.5));
        cards[key].push(m4.compose(pp, q, sc).clone());
      }
    }
  }
  const group = new THREE.Group();
  wood.build(group);
  // 葉片 instanced
  const card = new THREE.PlaneGeometry(1, 1);
  for (const [key, mats] of Object.entries(cards)) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(card, swayMaterial(TX.leafTex(key), { amp: key === "pine" ? 0.08 : 0.18 }), mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  }
  // 柳條：彎曲的長帶
  if (strands.length) {
    const geos = [];
    for (const s of strands) {
      const seg = 8, pos = [], uv = [], sw = [], ph = [], idx = [];
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const y = s.top.y - s.len * t;
        const bow = Math.sin(t * Math.PI * 0.6) * 0.5;
        for (const k of [-1, 1]) {
          const lx = k * s.w * 0.5 * (1 - t * 0.5);
          pos.push(s.top.x + lx * c + bow * sn, y, s.top.z - lx * sn + bow * c);
          uv.push((k + 1) / 2, 1 - t);
          sw.push(t); ph.push(s.ph);
        }
        if (i < seg) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("aSway", new THREE.Float32BufferAttribute(sw, 1));
      g.setAttribute("aPhase", new THREE.Float32BufferAttribute(ph, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    const mesh = new THREE.Mesh(merged, willowMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

/** 蘆葦、草叢（岸邊） */
export function buildReeds(scene, spots) {
  const card = new THREE.PlaneGeometry(1.4, 1.4).translate(0, 0.7, 0);
  const im = new THREE.InstancedMesh(card, swayMaterial(TX.leafTex("reed"), { amp: 0.3 }), spots.length * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach((s, i) => {
    for (let k = 0; k < 2; k++) {
      e.set(0, s.rot + k * Math.PI / 2, 0); q.setFromEuler(e);
      im.setMatrixAt(i * 2 + k, m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s, s.s)));
    }
  });
  im.frustumCulled = false;
  scene.add(im);
  return im;
}
