// 清明上河圖：世界建模（地形、路、無柱虹橋、城門、店鋪、彩樓歡門、攤傘、樹、水、山）
import * as THREE from "three";
import { Batch, M, box, cyl, lathe, rod, tube, surface, ribbon, roof, mat } from "../../xishan/js/geo.js";
import * as TX from "../../xishan/js/tex.js";
import { buildBuilding, buildStall } from "../../xishan/js/build.js";
import { buildTrees, buildReeds } from "../../xishan/js/plants.js";
import * as P from "./plan.js";

/* ---------------- 茅草（郊野茅屋） ---------------- */
let thatchMat;
function thatch() {
  if (thatchMat) return thatchMat;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = P.rng(5);
  g.fillStyle = "#a8925f"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.strokeStyle = `rgba(${90 + r() * 80},${70 + r() * 60},${30 + r() * 30},.5)`; const x = r() * 128, y = r() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 8 + r() * 10); g.stroke(); }
  for (let y = 0; y < 128; y += 16) { g.fillStyle = "rgba(60,45,20,.25)"; g.fillRect(0, y, 128, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  thatchMat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: 0xd8c8a0 });
  return thatchMat;
}

/* ---------------- 地形 ---------------- */
function vh(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (vh(i, j) * (1 - u) + vh(i + 1, j) * u) * (1 - v) + (vh(i, j + 1) * (1 - u) + vh(i + 1, j + 1) * u) * v; }
export function buildTerrain(scene) {
  const xs = [], zs = [];
  for (let x = P.X0 - 220; x <= P.X1 + 220; x += x > -460 && x < 480 ? 2.5 : 6) xs.push(x);
  for (let z = -330; z <= 230; z += z > -170 && z < 140 ? 2.5 : 6) zs.push(z);
  const W = xs.length, H = zs.length;
  const pos = new Float32Array(W * H * 3), col = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2);
  const cF = new THREE.Color(0xa8925e), cE = new THREE.Color(0xc2b085), cG = new THREE.Color(0x98a06a), cG2 = new THREE.Color(0x7f8d5a), cB = new THREE.Color(0x55624f), c = new THREE.Color();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = xs[i], z = zs[j], h = P.terrainH(x, z);
    pos.set([x, h, z], k * 3); uv.set([x / 6, z / 6], k * 2);
    // 郊野偏綠、市街偏土色；早春的田地一塊一塊，草地斑駁
    const country = P.smooth(250, 380, x);
    const n1 = vnoise(x * 0.035, z * 0.035), n2 = vnoise(x * 0.12 + 7, z * 0.12 - 3);
    const fx = x * 0.96 + z * 0.28, fz = z * 0.96 - x * 0.28;
    const plot = Math.floor(fx / 26) * 7 + Math.floor(fz / 18) * 13;
    const isField = country > 0.3 && (plot % 3 !== 0) && Math.abs(z - 40) > 8;
    const furrow = isField ? 0.5 + 0.5 * Math.sin(fz * 2.2) : 0;
    c.copy(cE).lerp(cG, 0.18 + 0.35 * n1 + 0.3 * country);
    if (isField) c.lerp(plot % 2 ? cG2 : cF, 0.55 + furrow * 0.15);
    c.lerp(cG2, Math.max(0, n2 - 0.55) * 0.9);
    if (h > P.LAND + 3) c.lerp(cG2, 0.5);
    if (h < 0.5) c.lerp(cB, P.smooth(0.5, -0.8, h));
    col.set([c.r, c.g, c.b], k * 3);
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.earth(), roughness: 0.97 });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "vec4 tc = texture2D(map, vMapUv); diffuseColor.rgb *= 0.78 + dot(tc.rgb, vec3(0.3,0.59,0.11)) * 0.4;"); };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
}

/* ---------------- 路、河岸 ---------------- */
export function buildGround(b) {
  const key = { stone: "flag", earth: "earth" };
  for (const R of P.roadLines) if (key[R.kind]) b.add(key[R.kind], ribbon(R.pts, () => R.w / 2, (x, z) => P.terrainH(x, z) + 0.05, 4));
  // 橋兩頭與城門前後的石砌河岸、廣場
  for (const side of [-1, 1]) {
    const pts = [];
    for (let s = P.bridge.s - 70; s <= P.bridge.s + 60; s += 2) { const p = P.river.at(s); pts.push([p.x + side * p.nx * P.RIVER_HW, p.z + side * p.nz * P.RIVER_HW]); }
    b.add("stone", surface(pts.length - 1, 1, (u, v) => { const p = pts[Math.round(u * (pts.length - 1))]; return [p[0], -1.5 + (P.LAND + 1.6) * v, p[1]]; }, (u, v) => [u * pts.length / 1.5, v]));
  }
  const plaza = (cx, cz, w, d, rot) => b.add("flag", surface(Math.ceil(w / 3), Math.ceil(d / 3), (u, v) => {
    const lx = (u - 0.5) * w, lz = (v - 0.5) * d, x = cx + lx * Math.cos(rot) + lz * Math.sin(rot), z = cz - lx * Math.sin(rot) + lz * Math.cos(rot);
    return [x, P.terrainH(x, z) + 0.06, z];
  }, (u, v) => [u * w / 4, v * d / 4]));
  const rot = Math.atan2(P.bridge.ax, P.bridge.az);
  const s = P.bridge.toWorld(P.bridge.half + 9, 0), n = P.bridge.toWorld(-P.bridge.half - 9, 0);
  plaza(s.x, s.z, 22, 18, rot); plaza(n.x, n.z, 18, 16, rot);
  plaza(P.gate.x, P.gate.z, 70, 26, 0);
  plaza(-490, 4, 22, 22, 0);
}

/* ---------------- 虹橋：無柱編木拱 ---------------- */
function bMat() {
  const B = P.bridge;
  const X = new THREE.Vector3(B.ax, 0, B.az), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(B.cx, 0, B.cz);
}
export function buildBridge(b) {
  const B = P.bridge, PM = bMat(), H = B.half, hw = B.hw;
  const deck = (a) => B.deck(a);
  // 橋面
  b.add("deck", surface(56, 6, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a), -hw + 0.3 + (2 * hw - 0.6) * v]; }, (u, v) => [v * 2 * hw / 1.6, u * 2 * H / 1.1]), null, PM);
  b.add("under", surface(56, 3, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a) - 0.35, -hw + 2 * hw * v]; }), null, PM);
  for (const s of [-1, 1]) b.add("woodDark", surface(56, 1, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a) - 0.55 * v, s * (hw - 0.05)]; }), null, PM);
  // 欄杆（木色）
  for (const s of [-1, 1]) {
    const z = s * (hw - 0.15), rail = [];
    for (let a = -H; a <= H + 0.01; a += 1.8) {
      b.add("woodDark", box(0.16, 1.15, 0.16), M([a, deck(a) + 0.55, z]), PM);
      b.add("woodDark", lathe([[0, 0], [0.1, 0], [0.12, 0.1], [0, 0.22]], 6), M([a, deck(a) + 1.12, z]), PM);
    }
    for (let a = -H; a <= H + 0.01; a += 1) rail.push([a, deck(a) + 1.05, z]);
    b.add("wood", tube(rail, 0.07, 120, 5), null, PM);
    b.add("wood", tube(rail.map(([a, y, zz]) => [a, y - 0.45, zz]), 0.05, 120, 4), null, PM);
  }
  // 編木拱：兩組長木交錯成多邊形拱（虹橋沒有橋墩）
  const S = B.span, yA = 0.2, yC = deck(0) - B.thick - 0.25;
  const arch = (a, off = 0) => yA + (yC - off - yA) * (1 - (a / S) ** 2);
  const sysA = [-S, -S * 0.38, S * 0.38, S], sysB = [-S, -S * 0.62, 0, S * 0.62, S];
  for (let k = 0; k < 9; k++) {
    const z = -hw + 0.6 + k * ((2 * hw - 1.2) / 8);
    const sys = k % 2 ? sysA : sysB, off = k % 2 ? 0 : 0.35;
    for (let i = 0; i < sys.length - 1; i++) b.add("woodDark", rod([sys[i], arch(sys[i], off), z], [sys[i + 1], arch(sys[i + 1], off), z], 0.2, 0.2, 5), null, PM);
  }
  // 橫木
  for (const a of [...sysA, ...sysB]) for (const off of [0, 0.35]) b.add("wood", rod([a, arch(a, off) + 0.05, -hw + 0.3], [a, arch(a, off) + 0.05, hw - 0.3], 0.16, 0.16, 5), null, PM);
  // 拱頂到橋面的短柱
  for (let a = -S * 0.85; a <= S * 0.85; a += 2.4) for (const z of [-hw + 0.6, 0, hw - 0.6]) b.add("woodDark", rod([a, arch(a) + 0.1, z], [a, deck(a) - 0.3, z], 0.1, 0.1, 4), null, PM);
  // 石砌橋台
  for (const e of [-1, 1]) {
    b.add("stone", box(6, P.LAND + 3, 2 * hw + 2), M([e * (S + 2), (P.LAND - 3) / 2, 0]), PM);
    b.add("stone", surface(10, 1, (u, v) => { const a = e * (S + 1 + (H - S - 1) * u); return [a, P.LAND - 0.2 + (deck(a) - 0.4 - P.LAND + 0.2) * v, -hw]; }), null, PM);
    b.add("stone", surface(10, 1, (u, v) => { const a = e * (S + 1 + (H - S - 1) * u); return [a, P.LAND - 0.2 + (deck(a) - 0.4 - P.LAND + 0.2) * v, hw]; }), null, PM);
    // 橋頭的表木（頂上有鶴）
    for (const s of [-1, 1]) {
      const a = e * (H + 1.5), z = s * (hw + 1.2);
      b.add("woodDark", rod([a, P.LAND, z], [a, P.LAND + 11, z], 0.14, 0.1, 6), null, PM);
      b.add("woodDark", rod([a - 0.9, P.LAND + 9.6, z], [a + 0.9, P.LAND + 9.6, z], 0.06, 0.06, 4), null, PM);
      b.add("clothWhite", lathe([[0, 0], [0.18, 0.1], [0.22, 0.35], [0.08, 0.5], [0.05, 0.8], [0, 0.85]], 6), M([a, P.LAND + 11, z]), PM);
    }
  }
}
/** 郊野小溪上的木板橋 */
export function buildCreekBridge(b) {
  const c = P.creekBridge, rot = Math.atan2(-c.az, c.ax);
  const PM = M([c.x, P.LAND + 0.2, c.z], [0, rot, 0]);
  b.add("deck", box(c.half * 2, 0.15, c.hw * 2), null, PM);
  for (const a of [-3, 0, 3]) for (const s of [-1, 1]) b.add("woodDark", cyl(0.12, 0.12, 2.6, 6), M([a, -1.2, s * (c.hw - 0.2)]), PM);
  for (const s of [-1, 1]) b.add("wood", rod([-c.half, 0.9, s * c.hw], [c.half, 0.9, s * c.hw], 0.04), null, PM);
}

/* ---------------- 城門 ---------------- */
export function buildGate(b, group) {
  const G = P.gate, y0 = P.LAND - 0.5;
  const shape = new THREE.Shape();
  const W = G.dz / 2, R = G.tunnel / 2, spring = 4.0;
  shape.moveTo(-W, 0); shape.lineTo(W, 0); shape.lineTo(W - 0.8, G.h); shape.lineTo(-W + 0.8, G.h); shape.lineTo(-W, 0);
  const hole = new THREE.Path();
  hole.moveTo(-R, 0); hole.lineTo(R, 0); hole.lineTo(R, spring); hole.absarc(0, spring, R, 0, Math.PI, false); hole.lineTo(-R, 0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: G.dx, bevelEnabled: false, curveSegments: 18 });
  // 擠出方向是 +z，轉成沿 x（路穿過城門的方向）
  g.translate(0, 0, -G.dx / 2);
  g.rotateY(Math.PI / 2);
  const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) / 3, uvs.getY(i) / 3);
  b.add("stone", g, M([G.x, y0, G.z]));
  b.add("stoneLight", box(G.dx + 0.4, 0.3, G.dz - 1.2), M([G.x, y0 + G.h + 0.15, G.z]));
  // 城樓（五開間，重簷歇山），屋脊沿 z
  const top = y0 + G.h + 0.3, PM = M([G.x, top, G.z], [0, Math.PI / 2, 0]);
  const bw = G.dz - 6, bd = G.dx - 3.5;
  for (let i = 0; i <= 5; i++) for (const z of [-bd / 2, bd / 2]) {
    const x = -bw / 2 + (bw * i) / 5;
    b.add("red", cyl(0.3, 0.32, 5.2, 10), M([x, 2.6, z]), PM);
  }
  b.add("plaster", box(bw, 4.2, bd - 1.4), M([0, 2.4, 0]), PM);
  b.add("green", box(bw + 0.6, 0.5, bd + 0.5), M([0, 5.3, 0]), PM);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) b.add("lattice2", new THREE.PlaneGeometry(bw / 5 - 0.6, 2.4), M([-bw / 2 + (bw / 5) * (i + 0.5), 2.8, s * (bd / 2 - 0.68)], [0, s > 0 ? 0 : Math.PI, 0]), PM);
  roof(b, { ex: bw / 2 + 2.6, ez: bd / 2 + 2.6, H: 2.6, type: "pent", ring: 0.5, lift: 1.2 }, PM.clone().multiply(M([0, 5.6, 0])));
  b.add("plaster", box(bw - 2, 2.2, bd - 2), M([0, 7.2, 0]), PM);
  roof(b, { ex: bw / 2 + 1.6, ez: bd / 2 + 1.8, H: 4.2, type: "xieshan", lift: 1.4, ridgeH: 0.7 }, PM.clone().multiply(M([0, 8.4, 0])));
  // 兩側殘缺的夯土城牆
  for (const s of [-1, 1]) {
    const len = 30;
    const wall = new THREE.BoxGeometry(3.2, G.h - 1.5, len);
    b.add("stone", wall, M([G.x, y0 + (G.h - 1.5) / 2, G.z + s * (G.dz / 2 + len / 2)]));
    for (let k = 0; k < 9; k++) b.add("stone", box(3.4, 1.0, 1.6), M([G.x, y0 + G.h - 1.0, G.z + s * (G.dz / 2 + 2 + k * 3.2)]));
  }
}

/* ---------------- 彩樓歡門 ---------------- */
export function buildCaiLou(b, group, host) {
  const y = P.terrainH(host.x, host.z);
  const fx = Math.sin(host.rot), fz = Math.cos(host.rot);
  const PM = M([host.x + fx * (host.d / 2 + 2.2), y, host.z + fz * (host.d / 2 + 2.2)], [0, host.rot, 0]);
  const W = host.w + 2, H = host.name === "孫羊店" ? 13 : 10.5;
  const n = Math.round(W / 2);
  for (let i = 0; i <= n; i++) {
    const x = -W / 2 + (W * i) / n;
    b.add(i % 2 ? "green" : "red", rod([x, 0, 0], [x, H - (i % 2) * 1.5, 0], 0.09, 0.07, 6), null, PM);
  }
  for (const yy of [3.6, 6.2, 8.6]) b.add("red", rod([-W / 2, yy, 0], [W / 2, yy, 0], 0.07, 0.07, 5), null, PM);
  // 上段的斜格
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 + (W * i) / n, x1 = -W / 2 + (W * (i + 1)) / n;
    b.add("green", rod([x0, 6.2, 0], [x1, 8.6, 0], 0.05, 0.05, 4), null, PM);
    b.add("blue", rod([x1, 6.2, 0], [x0, 8.6, 0], 0.05, 0.05, 4), null, PM);
  }
  // 頂上的彩旗與花球
  for (let i = 0; i <= n; i += 2) {
    const x = -W / 2 + (W * i) / n;
    b.add("lantern", lathe([[0, -0.25], [0.22, -0.1], [0.24, 0.05], [0.15, 0.2], [0, 0.25]], 8), M([x, H + 0.1, 0]), PM);
    const fl = new THREE.BufferGeometry();
    fl.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1.3, -0.35, 0, 0, -0.75, 0], 3)); fl.computeVertexNormals();
    b.add(i % 4 ? "clothBlue" : "clothRed", fl, M([x, H - 0.3, 0]), PM);
  }
  // 招牌
  const txt = host.name === "孫羊店" ? "孫羊正店" : "腳店";
  const tex = TX.signTex(txt, "#efe6cf", "#7a2a1a", true);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  sg.applyMatrix4(M([W / 2 - 1, 5, 0.1]).premultiply(PM)); group.add(sg);
}

/* ---------------- 攤位（大傘） ---------------- */
export function buildUmbrella(b, S, y) {
  const PM = M([S.x, y, S.z], [0, S.rot, 0]);
  b.add("woodDark", rod([0, 0, 0], [0, 3.2, 0], 0.05, 0.04, 5), null, PM);
  b.add("clothWhite", lathe([[0.02, 3.6], [1.0, 3.25], [1.9, 2.75], [2.0, 2.7]], 14), null, PM);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add("bamboo", rod([0, 3.55, 0], [Math.cos(a) * 1.95, 2.72, Math.sin(a) * 1.95], 0.02, 0.02, 3), null, PM); }
  b.add("woodGrain", box(1.6, 0.08, 0.8), M([0, 0.8, 0.7]), PM);
  for (const x of [-0.7, 0.7]) b.add("woodDark", box(0.06, 0.8, 0.6), M([x, 0.4, 0.7]), PM);
  const r = P.rng(Math.floor(S.x * 7 + S.z * 3));
  for (let i = 0; i < 4; i++) b.add(["goods1", "goods2", "goods3", "jar"][i], lathe([[0, 0], [0.14, 0.02], [0.18, 0.12], [0.16, 0.18]], 8), M([-0.55 + i * 0.37, 0.84, 0.7 + (r() - 0.5) * 0.3]), PM);
}

/* ---------------- 全部組起來 ---------------- */
export function buildWorld(scene) {
  buildTerrain(scene);
  const bG = new Batch(); buildGround(bG); buildBridge(bG); buildCreekBridge(bG);
  const signs = new THREE.Group();
  buildGate(bG, signs);
  const g1 = new THREE.Group(); const bridgeMeshes = bG.build(g1); scene.add(g1);
  const bB = new Batch(), bT = new Batch();
  for (const B of P.buildings) buildBuilding(B.thatch ? bT : bB, signs, { ...B, sign: undefined }, P.terrainH(B.x, B.z));
  for (const c of P.caiLou) buildCaiLou(bB, signs, c.host);
  for (const S of P.stalls) {
    const y = S.onBridge !== undefined ? P.bridge.deck(S.onBridge) : P.terrainH(S.x, S.z);
    if (S.kind === "umbrella") buildUmbrella(bB, S, y); else buildStall(bB, { ...S, color: "red" }, y);
  }
  // 店門前的蘆蓆遮陽棚（畫裡沿街幾乎每家都有）
  for (const B of P.buildings) {
    if (!["shop", "two", "shed"].includes(B.type) || B.thatch) continue;
    const y = P.terrainH(B.x, B.z), PM = M([B.x, y, B.z], [0, B.rot, 0]);
    const W = B.w * (0.55 + (Math.abs(Math.sin(B.x * 3.1)) * 0.3)), z0 = B.d / 2 + 0.6, z1 = z0 + 2.6 + Math.abs(Math.cos(B.z)) * 0.8;
    bB.add("mat", surface(4, 2, (u, v) => [(u - 0.5) * W, 2.75 - v * 0.6 - Math.sin(u * Math.PI) * 0.06, z0 + (z1 - z0) * v], (u, v) => [u * W / 2, v]), null, PM);
    for (const sx of [-0.5, 0, 0.5]) bB.add("bamboo", rod([sx * W, 0, z1], [sx * W, 2.2, z1], 0.04, 0.035, 4), null, PM);
    // 棚下的桌凳、貨架
    if (B.type !== "shed") for (const sx of [-0.25, 0.25]) { bB.add("woodGrain", box(1.4, 0.06, 0.7), M([sx * W, 0.78, (z0 + z1) / 2]), PM); for (const k of [-0.6, 0.6]) bB.add("woodDark", box(0.05, 0.75, 0.6), M([sx * W + k, 0.38, (z0 + z1) / 2]), PM); bB.add(["goods1", "goods2", "jar", "goods3"][Math.abs(Math.round(B.x + sx * 4)) % 4], lathe([[0, 0], [0.18, 0.02], [0.22, 0.16], [0.18, 0.24]], 8), M([sx * W, 0.81, (z0 + z1) / 2]), PM); }
  }
  // 郊野：籬笆、草垛
  for (const B of P.buildings) {
    if (!B.thatch) continue;
    const y = P.terrainH(B.x, B.z), PM = M([B.x, y, B.z], [0, B.rot, 0]), R = Math.max(B.w, B.d) / 2 + 3.5;
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; if (i > 1 && i < 4) continue; bB.add("bamboo", rod([Math.cos(a) * R, 0, Math.sin(a) * R * 0.8], [Math.cos(a) * R, 1.1, Math.sin(a) * R * 0.8], 0.04, 0.03, 3), null, PM); }
    for (const h of [0.35, 0.8]) bB.add("bamboo", tube(Array.from({ length: 27 }, (_, i) => { const a = (i / 26) * Math.PI * 2; return [Math.cos(a) * R, h, Math.sin(a) * R * 0.8]; }), 0.025, 52, 3), null, PM);
    bB.add("goods1", lathe([[0, 0], [1.1, 0.05], [1.0, 1.0], [0.5, 1.7], [0, 1.9]], 10), M([R - 1.5, 0, -R * 0.5]), PM);
  }
  const g2 = new THREE.Group(); bB.build(g2); scene.add(g2);
  const g3 = new THREE.Group(); const tm = bT.build(g3); for (const m of tm) if (m.material === mat("tile")) m.material = thatch(); scene.add(g3);
  // 招牌：店名直幅
  for (const B of P.buildings) {
    if (B.thatch || B.type === "ware" || B.type === "shed" || B.type === "yamen" || B.type === "house" || B.name === "民居") continue;
    const tex = TX.signTex(B.name, "#efe6cf", "#3a2a1a", true);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5 * Math.max(2, B.name.length) * 1.1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    const fx = Math.sin(B.rot), fz = Math.cos(B.rot), rx = Math.cos(B.rot), rz = -Math.sin(B.rot);
    m.position.set(B.x + fx * (B.d / 2 + 1.0) + rx * (B.w / 2 - 0.6), P.terrainH(B.x, B.z) + 2.4, B.z + fz * (B.d / 2 + 1.0) + rz * (B.w / 2 - 0.6));
    m.rotation.y = B.rot; m.castShadow = true;
    signs.add(m);
  }
  scene.add(signs);
  buildTrees(scene, P.trees, (x, z) => P.terrainH(x, z));
  const reeds = [], r = P.rng(9);
  for (let s = 10; s < P.river.len; s += 6) for (const side of [-1, 1]) {
    if (Math.abs(s - P.bridge.s) < 80 || r() < 0.5) continue;
    const p = P.river.at(s), o = P.RIVER_HW - 1 + r() * 3;
    reeds.push({ x: p.x + side * p.nx * o, z: p.z + side * p.nz * o, y: -0.2, rot: r() * 3, s: 0.8 + r() * 0.7 });
  }
  buildReeds(scene, reeds);
  return { bridgeMeshes };
}
