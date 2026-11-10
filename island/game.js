// 浮島工房 — 3D 畫面、操作、介面、音效（遊戲規則都在 logic.js）
import * as THREE from "three";
import { HR, APO, RES, RES_ORDER, NODES, PLOTS, UPGRADES, RECIPES, PLAYER, BOSS, BOSS2, BOSS3, HEAT, COLD, FOODS, FOOD_CAP, ISLANDS } from "./data.js";
import { createGame, serialize, update, upgrade, enqueue, nearPlot, bagCap, bagTotal, have, canAfford, islandAt, plotAvailable, cook, eat } from "./logic.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "island.save.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...serialize(G), played })); } catch {} };
const prefs = (() => { try { return JSON.parse(localStorage.getItem("island.prefs")) || { sound: true }; } catch { return { sound: true }; } })();
const saved = load();
let G = createGame(saved);
let played = saved?.played || 0;
const isSmall = Math.min(innerWidth, innerHeight) < 700;

/* ================= 渲染器 ================= */
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12405e);
scene.fog = new THREE.Fog(0x12405e, 26, 62);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);

const hemi = new THREE.HemisphereLight(0xdff4ff, 0x3a6a3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...o });
const M = {
  grass: mat(0x6cc04a), grass2: mat(0x4fa83d), dirt: mat(0x8a5a33), rock: mat(0x7b8088), rockDark: mat(0x5a5f68),
  trunk: mat(0x7a4b28), leaf: mat(0x3f9b3a), leaf2: mat(0x2f7f35), leafRound: mat(0x58b84a), stone: mat(0x9aa0a8),
  copper: mat(0xe0803a, { emissive: 0x6a2a00, emissiveIntensity: 0.3 }), emerald: mat(0x2ee88a, { emissive: 0x0a7a40, emissiveIntensity: 0.5, roughness: 0.3 }),
  wood: mat(0xb07a45), woodDark: mat(0x7a4b28), roof: mat(0xd2563a), white: mat(0xfff8e8), metal: mat(0x8090a0, { metalness: 0.5, roughness: 0.4 }),
  skin: mat(0xffd2a6), shirt: mat(0xff8a3d), pants: mat(0x3a5a9a), hair: mat(0x4a2a18), dark: mat(0x1a1a22),
  robot: mat(0x40c8c0), slime: new THREE.MeshStandardMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.85, roughness: 0.2 }),
  boss: mat(0x6f766a), moss: mat(0x4a8a3a), eye: new THREE.MeshBasicMaterial({ color: 0x9dff6a }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.28, depthWrite: false }),
};
const islandTheme = { home: 0x86d93c, pine: 0x7ed13a, gravel: 0x9ed24a, copper: 0xa8d048, works: 0x8ede44, oldwood: 0x6fc436, emerald: 0x74d86a, swamp: 0x7fae3e, boss: 0x8b8fa6 };
const CANOPY = [0x9ab84a, 0x8cae42, 0xa6c254, 0x80a23c].map((c) => mat(c));
const PILLAR = [0xb3a8e0, 0x9f94d2, 0xc2b8ea].map((c) => mat(c));
// 世界二：熔岩沙漠
const islandTheme2 = { oasis: 0xe9cf86, cactus: 0xe6c878, sand: 0xdcb86a, iron: 0xcfa866, forge: 0xd8b070, rift: 0x9a6a56, ruby: 0xa8705a, nest: 0x8e5c4c, rim: 0x5c4040, crater: 0x3c2c30 };
const SAND = [0xe0b06a, 0xcf9c58, 0xeac282].map((c) => mat(c));
const IRONROCK = [0x6a6e7c, 0x585c6a, 0x7c8090].map((c) => mat(c));
const BASALT = [0x3a3442, 0x2c2834, 0x48414f].map((c) => mat(c));
const M3 = {
  ledge: mat(0xb8894a), ledgeHot: mat(0x4a3030), cactus: mat(0x5fa84a), cactus2: mat(0x4c9440), dry: mat(0xc9a25a),
  rust: mat(0xb8623a), obsidian: mat(0x241e30, { roughness: 0.15, metalness: 0.4 }), ruby: mat(0xff3355, { emissive: 0x99001a, emissiveIntensity: 0.6, roughness: 0.25 }),
  lava: new THREE.MeshBasicMaterial({ color: 0xff7a1a }), lavaCore: new THREE.MeshBasicMaterial({ color: 0xffd040 }),
  water: new THREE.MeshBasicMaterial({ color: 0x4ac8ff }), portal: new THREE.MeshBasicMaterial({ color: 0xb46aff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  scorpion: mat(0x9a5a34), salamander: mat(0xff7a2a, { emissive: 0x802000, emissiveIntensity: 0.4 }), worm: mat(0xc8502a, { emissive: 0x5a1400, emissiveIntensity: 0.5 }), wormBelly: mat(0xffc060),
  ghost2: new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.25, depthWrite: false }),
};
// 世界三：極光冰原
const islandTheme3 = { camp: 0xf2f6fb, cedarwood: 0xe6f0f2, lake: 0xbfe6f5, village: 0xeef2f6, tundra: 0xd8e2ee, workshop: 0xe9eef5, ranch: 0xe2f0e6, glacier: 0xc4e4f2, cave: 0xc9d2ec, bliz1: 0xdfe6f2, bliz2: 0xd6deee, ruins: 0xcfd0e0, den: 0xd9dfe8, icebridge: 0xbcdff2, altar: 0xd8d0f0, throne: 0xb8c8f0 };
const ICEROCK = [0x9aa8c0, 0x8896b0, 0xaab8d0].map((c) => mat(c));
const M4 = {
  ledge: mat(0x8fc4e0), snowBlade: mat(0xffffff), pine: mat(0x2f6f4f), pine2: mat(0x3a8060), snow: mat(0xffffff), bush: mat(0x4a8a4a), berry: mat(0x6a4ad8),
  ice: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.8, roughness: 0.1, flatShading: true, emissive: 0x2a7090, emissiveIntensity: 0.4 }),
  silver: mat(0xe8eef8, { metalness: 0.8, roughness: 0.25 }), holeWater: new THREE.MeshBasicMaterial({ color: 0x1a5a9a }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff9a2a }), flameCore: new THREE.MeshBasicMaterial({ color: 0xffe060 }),
  wolf: mat(0x8a909c), wisp: new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x4ac8ff, emissiveIntensity: 0.9, flatShading: true }), yeti: mat(0xf4f6fa), yetiFace: mat(0x6a9ad0),
  queen: mat(0xa8d8ff, { emissive: 0x2060a0, emissiveIntensity: 0.4, roughness: 0.3 }), queenDark: mat(0x4a6ab0),
  slick: new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55, depthWrite: false }),
  ghost3: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
};
const WORLD_LOOK = {
  3: { sky: 0x101a3c, water: 0x8fd0ea, hemiSky: 0xdfeaff, hemiGround: 0x5a6a90, sun: 0xeaf2ff },
  1: { sky: 0x12405e, water: 0x1a86ee, hemiSky: 0xdff4ff, hemiGround: 0x3a6a3a, sun: 0xfff0d8 },
  2: { sky: 0x3a1410, water: 0xe8501a, hemiSky: 0xffe0c0, hemiGround: 0x6a3020, sun: 0xffe0b0 },
};
const M2 = { bark: mat(0x8a5638), ledge: mat(0x4f9c2c), ledgeBoss: mat(0x5c5f78), soil: mat(0x6e4a34), blade: mat(0xb9e86a) };

/* ================= 海 ================= */
const waterUniforms = { uTime: { value: 0 } };
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 120, 120), new THREE.MeshStandardMaterial({ color: 0x1a86ee, flatShading: true, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.94 }));
water.material.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = waterUniforms.uTime;
  sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.z += sin(position.x * 0.45 + uTime * 1.2) * 0.12 + cos(position.y * 0.38 + uTime * 0.9) * 0.1;");
};
water.rotation.x = -Math.PI / 2; water.position.y = -0.55; water.receiveShadow = true;
scene.add(water);

/* ================= 島 ================= */
const islandMeshes = new Map();
function hexGeo(rTop, rBot, h) { const g = new THREE.CylinderGeometry(rTop, rBot, h, 6); g.rotateY(0); return g; }
function buildIsland(isl) {
  // 地塊緊密相連成一整片草地：頂面剛好滿版、邊界有淺色小路、外緣是一階深綠色的岸、再外面是六角淺灘
  const g = new THREE.Group(); g.position.set(isl.cx, 0, isl.cz);
  const w2 = isl.w === 2, hot = w2 && (isl.heat || 0) >= 3;
  const boss = isl.id === "boss" || isl.id === "crater" || isl.id === "throne";
  const top = new THREE.Mesh(hexGeo(HR, HR, 0.36), mat((w2 ? islandTheme2 : islandTheme)[isl.id] || 0x86d93c)); top.position.y = -0.18; top.receiveShadow = true; g.add(top);
  const ledge = new THREE.Mesh(hexGeo(HR * 1.035, HR * 1.035, 0.5), w2 ? (hot || boss ? M3.ledgeHot : M3.ledge) : boss ? M2.ledgeBoss : M2.ledge); ledge.position.y = -0.6; g.add(ledge);
  const soil = new THREE.Mesh(hexGeo(HR * 0.98, HR * 0.8, 1.6), M2.soil); soil.position.y = -1.6; g.add(soil);
  const path = new THREE.Mesh(new THREE.RingGeometry(HR * 0.9, HR, 6, 1), new THREE.MeshBasicMaterial({ color: w2 ? (hot || boss ? 0xff9a50 : 0xfff0b8) : boss ? 0xc9cbe0 : 0xd9f58a, transparent: true, opacity: w2 && (hot || boss) ? 0.3 : 0.38, depthWrite: false }));
  path.rotation.x = -Math.PI / 2; path.rotation.z = Math.PI / 2; path.position.y = 0.006; g.add(path);
  const w3 = isl.w === 3;
  if (w3) { top.material.color.setHex(islandTheme3[isl.id] || 0xeef2f6); ledge.material = M4.ledge; path.material.color.setHex(0xffffff); path.material.opacity = 0.5; }
  const R = mulberry(isl.idx * 31 + 5);
  // 尖尖的草叢（三片一簇）
  const blade = new THREE.ConeGeometry(0.07, 0.42, 4);
  const blades = new THREE.InstancedMesh(blade, w2 ? (hot || boss ? BASALT[0] : M3.dry) : boss ? M.rockDark : M2.blade, 14 * 3);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  for (let i = 0; i < 14; i++) {
    const a = R() * 6.28, r = 0.6 + R() * (APO - 1.1), x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let k = 0; k < 3; k++) { e4.set((R() - 0.5) * 0.7, R() * 6.28, (R() - 0.5) * 0.7); q4.setFromEuler(e4); const sc = 0.7 + R() * 0.7; m4.compose(v4.set(x + (k - 1) * 0.1, 0.16 * sc, z + (R() - 0.5) * 0.15), q4, s4.set(1, sc, 1)); blades.setMatrixAt(i * 3 + k, m4); }
  }
  if (w3) blades.material = M4.snowBlade;
  g.add(blades);
  // 小花
  if (!boss && !w2 && !w3) for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), mat([0xffffff, 0xffe45a, 0xff9ad0][i % 3])); const a = R() * 6.28, r = R() * (APO - 0.6); f.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r); g.add(f); }
  if (boss) for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, h = 1.2 + R() * 1.2; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, h, 6), (w2 ? BASALT : PILLAR)[i % 3]); sp.position.set(Math.cos(a) * (APO - 0.7), h / 2, Math.sin(a) * (APO - 0.7)); sp.castShadow = true; g.add(sp); }
  if (isl.id === "swamp") for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.6 + R() * 0.4, 6), mat(0x4f7a2e)); p.rotation.x = -Math.PI / 2; const a = R() * 6.28, r = 0.6 + R() * (APO - 1.6); p.position.set(Math.cos(a) * r, 0.012, Math.sin(a) * r); g.add(p); }
  // 六角淺灘
  // 熔岩裂縫
  g.userData.lavas = [];
  for (const l of G.lavas) if (l.island === isl.id) {
    const lg = new THREE.Group(); lg.position.set(l.x - isl.cx, 0.012, l.z - isl.cz); lg.rotation.y = R() * 6;
    const a = new THREE.Mesh(new THREE.CircleGeometry(l.r + 0.12, 7), BASALT[1]); a.rotation.x = -Math.PI / 2; lg.add(a);
    const b = new THREE.Mesh(new THREE.CircleGeometry(l.r, 7), M3.lava.clone()); b.rotation.x = -Math.PI / 2; b.position.y = 0.006; lg.add(b);
    const c = new THREE.Mesh(new THREE.CircleGeometry(l.r * 0.5, 6), M3.lavaCore); c.rotation.x = -Math.PI / 2; c.position.y = 0.012; lg.add(c);
    g.add(lg); g.userData.lavas.push(b);
  }
  if (isl.id === "crater") { // 半血後才亮起來的外圈熔岩
    const ring = new THREE.Mesh(new THREE.RingGeometry(APO - BOSS2.ringIn, HR * 0.99, 6, 1), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 2; ring.position.y = 0.02; g.add(ring); g.userData.lavaRing = ring;
  }
  const foam = new THREE.Mesh(hexGeo(HR * 1.2, HR * 1.2, 0.04), new THREE.MeshBasicMaterial({ color: w2 ? 0xffc040 : 0x7fd4ff, transparent: true, opacity: 0.4, depthWrite: false }));
  if (w3) foam.material.color.setHex(0xe8f8ff);
  foam.position.y = -0.5; g.add(foam);
  g.userData.foam = foam;
  scene.add(g);
  islandMeshes.set(isl.id, { g, rise: 0 });
}
// 尚未開通的島：海面下的淡淡影子
const ghosts = new Map();
function buildGhost(isl) {
  const m = new THREE.Mesh(hexGeo(HR - 0.25, HR - 0.25, 0.06), isl.w === 3 ? M4.ghost3 : isl.w === 2 ? M3.ghost2 : M.ghost);
  m.position.set(isl.cx, -0.5, isl.cz); scene.add(m); ghosts.set(isl.id, m);
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ================= 資源節點 ================= */
const nodeMeshes = new Map(), nodeFish = new Map();
function makeNode(n) {
  const g = new THREE.Group(); g.position.set(n.x, 0, n.z);
  const R = mulberry(n.id * 97 + 3);
  const live = new THREE.Group(); g.add(live);
  if (n.type === "tree" || n.type === "bigtree") {
    // 分岔的樹幹 + 一團一團的樹冠
    const big = n.type === "bigtree", s = big ? 1.45 : 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.2 * s, 0.95 * s, 6), M2.bark); trunk.position.y = 0.47 * s; trunk.castShadow = true; live.add(trunk);
    for (const sgn of [-1, 1]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 0.6 * s, 5), M2.bark); br.position.set(sgn * 0.2 * s, 0.95 * s, 0); br.rotation.z = -sgn * 0.75; live.add(br); }
    const blobs = big ? 7 : 5;
    for (let k = 0; k < blobs; k++) {
      const top = k === 0, a = k * (6.28 / (blobs - 1)) + R();
      const rad = (top ? 0.62 : 0.4 + R() * 0.16) * s;
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), CANOPY[(n.id + k) % CANOPY.length]);
      c.position.set(top ? 0 : Math.cos(a) * 0.48 * s, (top ? 1.55 : 1.15 + R() * 0.25) * s, top ? 0 : Math.sin(a) * 0.48 * s);
      c.scale.y = 0.78; c.rotation.set(R() * 3, R() * 3, R() * 3); c.castShadow = true; live.add(c);
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 0.22, 6), M2.bark); stump.position.y = 0.11; g.add(stump);
  } else if (n.type === "cedar") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.6, 6), M2.bark); trunk.position.y = 0.3; trunk.castShadow = true; live.add(trunk);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.62 - k * 0.15, 0.7, 7), k % 2 ? M4.pine2 : M4.pine); c.position.y = 0.75 + k * 0.42; c.castShadow = true; live.add(c);
      const sn = new THREE.Mesh(new THREE.ConeGeometry((0.62 - k * 0.15) * 0.62, 0.3, 7), M4.snow); sn.position.y = 0.97 + k * 0.42; live.add(sn);
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 6), M2.bark); stump.position.y = 0.1; g.add(stump);
  } else if (n.type === "bush") {
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 - k * 0.04, 0), M4.bush); b.position.set((k - 1) * 0.22, 0.25 + (k === 1 ? 0.12 : 0), (k % 2) * 0.12); b.castShadow = true; live.add(b); }
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + R(); const br = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), M4.berry); br.position.set(Math.cos(a) * 0.3, 0.3 + R() * 0.25, Math.sin(a) * 0.25); live.add(br); }
    const twig = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), M2.bark); twig.position.y = 0.1; g.add(twig);
  } else if (n.type === "fishhole") {
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 9), M4.snow); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(0.34, 9), M4.holeWater); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.015; g.add(wat);
    const fish = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), mat(0x5aa8e0)); fish.rotation.z = Math.PI / 2; fish.position.y = 0.12; live.add(fish);
    nodeFish.set(n, fish);
  } else if (n.type === "icecrystal") {
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + R(), d = k ? 0.27 : 0, h = (k ? 0.45 : 0.8) + R() * 0.25; const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), M4.ice); c.scale.y = h / 0.3; c.position.set(Math.cos(a) * d, h * 0.6, Math.sin(a) * d); c.rotation.set((R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5); c.castShadow = true; live.add(c); }
    const rubble = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), M4.ice); rubble.position.y = 0.06; g.add(rubble);
  } else if (n.type === "cactus") {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 3, 7), M3.cactus); body.position.y = 0.65; body.castShadow = true; live.add(body);
    for (const [sx, y, len] of [[-1, 0.6, 0.35], [1, 0.85, 0.28]]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.2, 3, 6), M3.cactus2); arm.rotation.z = Math.PI / 2; arm.position.set(sx * 0.3, y, 0); live.add(arm);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, len, 3, 6), M3.cactus2); up.position.set(sx * 0.44, y + len / 2 + 0.08, 0); up.castShadow = true; live.add(up);
    }
    const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mat(0xff6ab0)); fl.position.y = 1.36; live.add(fl);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 7), M3.cactus2); stump.position.y = 0.08; g.add(stump);
  } else if (n.type === "obsidian") {
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + R(), d = k ? 0.26 : 0, h = (k ? 0.5 : 0.95) + R() * 0.3; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.2, h, 4), M3.obsidian); sh.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); sh.rotation.set((R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5); sh.castShadow = true; live.add(sh); }
    const rubble = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.15, 4), M3.obsidian); rubble.position.y = 0.07; g.add(rubble);
  } else {
    // 一叢六角石柱；礦石在柱頂鑲上有顏色的晶體
    const ore = n.type === "copper" ? M.copper : n.type === "emerald" ? M.emerald : n.type === "iron" ? M3.rust : n.type === "ruby" ? M3.ruby : n.type === "silver" ? M4.silver : null;
    const gem = n.type === "emerald" || n.type === "ruby";
    const PIL = n.type === "sandstone" ? SAND : n.type === "iron" ? IRONROCK : n.type === "ruby" ? BASALT : n.type === "silver" ? ICEROCK : PILLAR;
    const cols = [[0, 0, 0.3, 0.95], [0.3, 0.12, 0.22, 0.65], [-0.26, 0.18, 0.2, 0.5], [0.05, -0.3, 0.2, 0.42], [-0.2, -0.2, 0.16, 0.75]];
    cols.forEach(([x, z, r, h], k) => {
      h *= 0.85 + R() * 0.3;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 6), PIL[(n.id + k) % 3]); c.position.set(x, h / 2, z); c.rotation.y = R(); c.castShadow = true; live.add(c);
      if (ore && k < 4) { const cap = new THREE.Mesh(gem ? new THREE.OctahedronGeometry(r * 0.95, 0) : new THREE.CylinderGeometry(r * 0.7, r * 0.95, 0.14, 6), ore); cap.position.set(x, h + (gem ? r * 0.5 : 0.07), z); if (gem) cap.scale.y = 1.5; live.add(cap); }
    });
    const rubble = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 6), PIL[1]); rubble.position.y = 0.06; g.add(rubble);
  }
  live.rotation.y = R() * 6.28;
  scene.add(g);
  nodeMeshes.set(n, { g, live, grow: n.alive ? 1 : 0 });
}

/* ================= 建築 / 建造牌 ================= */
function labelSprite(w = 256, h = 128) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  sp.userData = { c, tex, key: "" };
  return sp;
}
function drawLabel(sp, title, lines) {
  const key = title + lines.map((l) => l.text + (l.ok ? "✓" : "")).join("|"); // 之前用物件直接 join，內容變了也不會重畫
  if (sp.userData.key === key) return;
  sp.userData.key = key;
  const { c, tex } = sp.userData, g = c.getContext("2d");
  const fs = 30, lh = 36;
  c.height = 56 + lines.length * lh; c.width = 300;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(255,248,232,0.95)"; roundRect(g, 4, 4, c.width - 8, c.height - 8, 18); g.fill();
  g.lineWidth = 5; g.strokeStyle = "#8a5a33"; g.stroke();
  g.fillStyle = "#8a5a33"; g.font = `900 ${fs}px "Noto Sans TC", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(title, c.width / 2, 32);
  g.font = `700 ${fs - 4}px "JetBrains Mono", "Noto Sans TC", sans-serif`;
  lines.forEach((l, i) => { g.fillStyle = l.ok ? "#2e8b2e" : "#203040"; g.fillText(l.text, c.width / 2, 56 + 14 + i * lh); });
  tex.needsUpdate = true;
  const s = 0.0052;
  sp.scale.set(c.width * s, c.height * s, 1);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function costLines(cost, paid) { return Object.entries(cost).map(([k, n]) => ({ text: `${RES[k].icon} ${paid[k] || 0}/${n}`, ok: (paid[k] || 0) >= n })); }

const plotMeshes = new Map();
function buildPlot(pl) {
  const old = plotMeshes.get(pl.id); if (old) scene.remove(old.g);
  const g = new THREE.Group(); g.position.set(pl.x, 0, pl.z);
  if (!pl.built && pl.type === "fire") { // 營火預定地：一圈石頭
    for (let k = 0; k < 7; k++) { const a = k * 0.9; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), M.rock); st.position.set(Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38); g.add(st); }
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xffc940, transparent: true, opacity: 0.5, depthWrite: false })); mark.rotation.x = -Math.PI / 2; mark.position.y = 0.02; g.add(mark);
    const lab = labelSprite(); lab.position.y = 1.3; g.add(lab); g.userData.label = lab;
  } else if (pl.type === "fire") {
    for (let k = 0; k < 7; k++) { const a = k * 0.9; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), M.rock); st.position.set(Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38); g.add(st); }
    for (let k = 0; k < 3; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 5), M2.bark); lg.rotation.set(Math.PI / 2 - 0.5, k * 2.1, 0); lg.position.y = 0.16; g.add(lg); }
    const flame = new THREE.Group();
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 6), M4.flame); f1.position.y = 0.5; flame.add(f1);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 5), M4.flameCore); f2.position.y = 0.42; flame.add(f2);
    const light = new THREE.PointLight(0xff9a40, 6, 5, 1.6); light.position.y = 0.8; flame.add(light);
    g.add(flame);
    const warm = new THREE.Mesh(new THREE.CircleGeometry(COLD.fireR, 40), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.14, depthWrite: false })); warm.rotation.x = -Math.PI / 2; warm.position.y = 0.015; g.add(warm);
    const ring = new THREE.Mesh(new THREE.RingGeometry(COLD.fireR - 0.07, COLD.fireR, 40), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.55, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const lab = labelSprite(); lab.position.y = 1.5; g.add(lab);
    Object.assign(g.userData, { flame, warm, fireRing: ring, fuelLabel: lab, pl });
  } else if (pl.type === "kitchen") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.1), M.wood); body.position.y = 0.45; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.6, 4), M4.snow); roof.position.y = 1.2; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.25, 10), M.dark); pot.position.set(0.95, 0.2, 0.3); g.add(pot);
    const soup = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), M4.flame); soup.rotation.x = -Math.PI / 2; soup.position.set(0.95, 0.33, 0.3); g.add(soup);
  } else if (!pl.built) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.08, 6), M.wood); pad.position.y = 0.04; g.add(pad);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), M.woodDark); p.position.set(x, 0.3, z); g.add(p); }
    const lab = labelSprite(); lab.position.y = 1.7; g.add(lab); g.userData.label = lab;
  } else if (pl.type === "warehouse") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.4), M.wood); body.position.y = 0.55; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.8, 4), M.roof); roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.05), M.woodDark); door.position.set(0, 0.38, 0.72); g.add(door);
    for (const [x, z] of [[1.15, 0.4], [1.2, -0.2], [1.05, 0.95]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), M.wood); cr.position.set(x, 0.2, z); cr.castShadow = true; g.add(cr); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(pl.r - 0.15, pl.r, 40), new THREE.MeshBasicMaterial({ color: 0xffc940, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); g.userData.ring = ring;
  } else if (pl.type === "workbench") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.7), M.wood); top.position.y = 0.7; top.castShadow = true; g.add(top);
    for (const [x, z] of [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), M.woodDark); l.position.set(x, 0.33, z); g.add(l); }
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.25), M.metal); anvil.position.set(-0.2, 0.87, 0); g.add(anvil);
    const ham = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), M.metal); ham.position.set(0.3, 0.8, 0.1); ham.rotation.y = 0.6; g.add(ham);
  } else if (pl.type === "hut") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.9, 8), M.white); body.position.y = 0.45; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 8), mat(0x40c8c0)); roof.position.y = 1.25; roof.castShadow = true; g.add(roof);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), M.metal); ant.position.y = 1.8; g.add(ant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); bulb.position.y = 2.06; g.add(bulb);
  } else if (pl.type === "well") {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.5, 10, 1, true), SAND[1]); wall.position.y = 0.25; wall.material.side = THREE.DoubleSide; wall.castShadow = true; g.add(wall);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(0.52, 10), M3.water); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.4; g.add(wat);
    for (const x of [-0.5, 0.5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), M.woodDark); post.position.set(x, 0.6, 0); g.add(post); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.4, 4), M.roof); roof.position.y = 1.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const ring = new THREE.Mesh(new THREE.RingGeometry(HEAT.wellR - 0.1, HEAT.wellR, 48), new THREE.MeshBasicMaterial({ color: 0x4ac8ff, transparent: true, opacity: 0.5, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(HEAT.wellR, 48), new THREE.MeshBasicMaterial({ color: 0x4ac8ff, transparent: true, opacity: 0.1, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.015; g.add(disc); g.userData.cool = disc;
  } else if (pl.type === "portal") {
    for (const x of [-0.62, 0.62]) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.7, 6), PILLAR[0]); pil.position.set(x, 0.85, 0); pil.castShadow = true; g.add(pil); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 6, 12, Math.PI), PILLAR[1]); arch.position.y = 1.7; g.add(arch);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), M3.portal.clone()); swirl.position.y = 1.15; swirl.scale.y = 1.6; g.add(swirl);
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xb46aff, transparent: true, opacity: 0.6, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; g.add(pad);
    const lab = labelSprite(); lab.position.y = 2.6; g.add(lab); drawLabel(lab, "往 " + PLOTS[pl.id].to, [{ text: "站定 1 秒傳送", ok: true }]);
    g.userData.swirl = swirl; g.userData.portalLabel = lab;
  } else if (pl.type === "factory" || pl.type === "furnace") {
    const fur = pl.type === "furnace";
    const body = new THREE.Mesh(fur ? new THREE.BoxGeometry(1.5, 1.1, 1.2) : new THREE.BoxGeometry(2.0, 1.2, 1.5), mat(fur ? 0x5a4a48 : 0xc9b28a));
    if (fur) { const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), M3.lava); glow.position.set(0.2, 0.4, 0.61); g.add(glow); body.scale.set(1, 1, 1); } body.position.y = 0.6; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 1.6), M.roof); roof.position.y = 1.27; g.add(roof);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 8), M.rock); chim.position.set(0.6, 1.7, -0.3); chim.castShadow = true; g.add(chim);
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 6, 10), M.metal); gear.position.set(-0.4, 0.7, 0.78); g.add(gear);
    g.userData.gear = gear; g.userData.chim = chim;
  }
  g.userData.type = pl.type;
  scene.add(g);
  plotMeshes.set(pl.id, { g });
}

const signMeshes = [];
function rebuildSignMeshes() {
  for (const s of signMeshes) scene.remove(s.g);
  signMeshes.length = 0;
  for (const s of G.signs) {
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), M.woodDark); post.position.y = 0.5; g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.08), M.wood); board.position.y = 0.95; g.add(board);
    const tgt = G.byId[s.target];
    board.rotation.y = Math.atan2(tgt.cx - s.x, tgt.cz - s.z);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: 0xffc940, transparent: true, opacity: 0.35, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; g.add(pad);
    const lab = labelSprite(); lab.position.y = 2.0; g.add(lab);
    scene.add(g); signMeshes.push({ g, s, lab, pad });
  }
}

/* ================= 角色 ================= */
function makePerson() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.32, 4, 8), M.shirt); body.position.y = 0.62; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M.skin); head.position.y = 1.08; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hair); hair.position.y = 1.1; hair.rotation.x = -0.25; g.add(hair);
  for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.dark); e.position.set(x, 1.1, 0.2); g.add(e); }
  const legs = [], arms = [];
  for (const x of [-0.11, 0.11]) { const l = new THREE.Group(); l.position.set(x, 0.38, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.14), M.pants); m.position.y = -0.18; m.castShadow = true; l.add(m); g.add(l); legs.push(l); }
  for (const x of [-0.29, 0.29]) { const a = new THREE.Group(); a.position.set(x, 0.82, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.1), M.shirt); m.position.y = -0.17; a.add(m); const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M.skin); h.position.y = -0.36; a.add(h); g.add(a); arms.push(a); }
  // 工具（右手）
  const tools = {};
  const handle = () => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.woodDark); h.position.y = -0.55; return h; };
  tools.axe = new THREE.Group(); tools.axe.add(handle()); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.22), M.metal); b.position.set(0, -0.76, 0.1); tools.axe.add(b); }
  tools.pick = new THREE.Group(); tools.pick.add(handle()); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.46), M.metal); b.position.set(0, -0.78, 0); tools.pick.add(b); }
  tools.rod = new THREE.Group(); { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.1, 5), M.woodDark); b.position.y = -0.85; tools.rod.add(b); const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), M.white); ln.position.set(0, -1.4, 0.3); ln.rotation.x = -1.0; tools.rod.add(ln); }
  tools.sword = new THREE.Group(); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.12), mat(0xdfe8f0, { metalness: 0.6, roughness: 0.3 })); b.position.y = -0.7; tools.sword.add(b); const gd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.26), M.wood); gd.position.y = -0.4; tools.sword.add(gd); }
  for (const t of Object.values(tools)) { t.visible = false; t.rotation.x = Math.PI; t.position.y = -0.36; arms[1].add(t); }
  // 背包 + 背上的資源方塊
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.18), M.wood); pack.position.set(0, 0.68, -0.26); g.add(pack);
  const stack = new THREE.Group(); stack.position.set(0, 0.92, -0.28); g.add(stack);
  return { g, legs, arms, tools, stack, body, head };
}
const cubeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const resMat = Object.fromEntries(RES_ORDER.map((k) => [k, mat(RES[k].color, ["emerald", "core", "ruby", "magma", "shard", "frost", "ice"].includes(k) ? { emissive: RES[k].color, emissiveIntensity: 0.4 } : {})]));
function setStack(stack, counts, max = 24) {
  const want = [];
  for (const k of RES_ORDER) for (let i = 0; i < counts[k]; i++) want.push(k);
  const n = Math.min(max, want.length);
  const key = want.slice(0, n).join(",");
  if (stack.userData.key === key) return;
  stack.userData.key = key;
  while (stack.children.length) stack.remove(stack.children[0]);
  for (let i = 0; i < n; i++) { const c = new THREE.Mesh(cubeGeo, resMat[want[i]]); c.position.set(((i % 2) - 0.5) * 0.17, Math.floor(i / 2) * 0.17, 0); c.rotation.y = (i * 0.37) % 0.3; stack.add(c); }
}
const hero = makePerson(); scene.add(hero.g);
const heroShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false }));
heroShadow.rotation.x = -Math.PI / 2; scene.add(heroShadow);

const helperMeshes = [];
function makeHelper() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 10), M.robot); body.position.y = 0.38; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white); head.position.y = 0.6; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x2affd0 })); eye.position.set(0, 0.68, 0.17); g.add(eye);
  for (const x of [-0.12, 0.12]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.dark); w.rotation.z = Math.PI / 2; w.position.set(x * 1.6, 0.1, 0); g.add(w); }
  const stack = new THREE.Group(); stack.position.set(0, 0.86, 0); g.add(stack);
  scene.add(g);
  return { g, stack, body };
}

const slimeMeshes = new Map();
function makeSlime(s) {
  const g = new THREE.Group();
  let body, base = 0x7cff6b, tail = null;
  if (s.kind === "scorpion") {
    base = 0x9a5a34;
    body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M3.scorpion.clone()); body.scale.set(1, 0.55, 1.35); body.position.y = 0.2; body.castShadow = true; g.add(body);
    for (const x of [-1, 1]) { const claw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), M3.scorpion); claw.position.set(x * 0.3, 0.18, 0.42); claw.rotation.y = -x * 0.5; g.add(claw); }
    tail = new THREE.Group(); tail.position.set(0, 0.25, -0.35);
    for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.012, 6, 6), M3.scorpion); seg.position.set(0, k * 0.15, -0.1 + Math.sin(k * 0.7) * 0.12); tail.add(seg); }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), mat(0x2a1a14)); sting.position.set(0, 0.62, 0.16); sting.rotation.x = 1.9; tail.add(sting); g.add(tail);
  } else if (s.kind === "wolf") {
    base = 0x8a909c;
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8), M4.wolf.clone()); body.rotation.x = Math.PI / 2; body.position.y = 0.4; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.34), M4.wolf); head.position.set(0, 0.55, 0.5); g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), M.white); snout.position.set(0, 0.5, 0.72); g.add(snout);
    for (const x of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), M4.wolf); ear.position.set(x, 0.76, 0.42); g.add(ear); const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 5), M3.lavaCore); e.position.set(x * 0.8, 0.6, 0.67); g.add(e); }
    for (const [x, z] of [[-0.13, 0.25], [0.13, 0.25], [-0.13, -0.25], [0.13, -0.25]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), M4.wolf); leg.position.set(x, 0.15, z); g.add(leg); }
    tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), M4.wolf); tail.rotation.x = -2.2; tail.position.set(0, 0.5, -0.55); g.add(tail);
  } else if (s.kind === "wisp") {
    base = 0xbff4ff;
    body = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), M4.wisp.clone()); body.position.y = 0.3; body.scale.y = 1.4; g.add(body);
    tail = new THREE.Group(); for (let k = 0; k < 3; k++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), M4.ice); sh.position.set(Math.cos(k * 2.1) * 0.5, 0.3, Math.sin(k * 2.1) * 0.5); tail.add(sh); } g.add(tail);
  } else if (s.kind === "yeti") {
    base = 0xf4f6fa;
    body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), M4.yeti.clone()); body.position.y = 0.75; body.scale.set(1, 1.2, 0.9); body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), M4.yeti); head.position.y = 1.55; g.add(head);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), M4.yetiFace); face.position.set(0, 1.52, 0.28); g.add(face);
    for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), M.dark); e.position.set(x, 1.56, 0.34); g.add(e); }
    for (const x of [-0.7, 0.7]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 3, 6), M4.yeti); arm.position.set(x, 0.75, 0.1); arm.rotation.z = x > 0 ? -0.3 : 0.3; arm.castShadow = true; g.add(arm); }
    for (const x of [-0.25, 0.25]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.3), M4.yeti); leg.position.set(x, 0.15, 0); g.add(leg); }
  } else if (s.kind === "salamander") {
    base = 0xff7a2a;
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 3, 8), M3.salamander.clone()); body.rotation.x = Math.PI / 2; body.position.y = 0.24; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M3.salamander); head.position.set(0, 0.3, 0.5); head.scale.z = 1.2; g.add(head);
    tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 6), M3.salamander); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.22, -0.75); g.add(tail);
    for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), M.dark); e.position.set(x, 0.4, 0.64); g.add(e); }
    for (let k = 0; k < 3; k++) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M3.lavaCore); fin.position.set(0, 0.5, 0.25 - k * 0.3); g.add(fin); }
  } else {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), M.slime.clone()); body.scale.y = 0.75; body.position.y = 0.27; body.castShadow = true; g.add(body);
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), M.dark); e.position.set(x, 0.38, 0.28); g.add(e); }
  }
  scene.add(g); slimeMeshes.set(s, { g, body, base, tail });
}

let queenMesh = null;
function makeQueen() {
  const g = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.7, 8), M4.queen.clone()); dress.position.y = 0.95; dress.castShadow = true; g.add(dress);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 3, 8), M4.queenDark); torso.position.y = 1.95; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.white); head.position.y = 2.45; g.add(head);
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.45; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, k === 2 ? 0.5 : 0.34, 4), M4.ice); sp.position.set(Math.sin(a) * 0.2, 2.75, -0.05 + Math.cos(a) * 0.08); sp.rotation.z = -a * 0.6; g.add(sp); }
  for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 5), new THREE.MeshBasicMaterial({ color: 0x4ad8ff })); e.position.set(x, 2.48, 0.2); g.add(e); }
  const arms = []; for (const x of [-1, 1]) { const a = new THREE.Group(); a.position.set(x * 0.3, 2.1, 0); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), M4.queenDark); m.position.y = -0.3; a.add(m); a.rotation.z = x * 0.5; g.add(a); arms.push(a); }
  const orbs = new THREE.Group(); for (let k = 0; k < 4; k++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), M4.ice); o.position.set(Math.cos(k * 1.57) * 1.0, 1.5, Math.sin(k * 1.57) * 1.0); orbs.add(o); } g.add(orbs);
  scene.add(g);
  queenMesh = { g, dress, arms, orbs };
}
const slickMeshes = new Map();
// 雪花
const SNOW_N = isSmall ? 260 : 420;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = (Math.random() - 0.5) * 30; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 26; }
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);

let wormMesh = null;
function makeWorm() {
  const g = new THREE.Group(), segs = [];
  for (let k = 0; k < 6; k++) { const r = 0.62 - k * 0.04; const sg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), k % 2 ? M3.wormBelly : M3.worm.clone()); sg.position.y = 0.3 + k * 0.5; sg.castShadow = true; g.add(sg); segs.push(sg); }
  const head = new THREE.Group(); head.position.y = 3.2;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), M3.worm); head.add(skull);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; const fang = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), M.white); fang.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.42); fang.rotation.x = Math.PI / 2; head.add(fang); }
  for (const x of [-0.25, 0.25]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), M3.lavaCore); e.position.set(x, 0.3, 0.35); head.add(e); }
  g.add(head);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.85, 9), BASALT[1]); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.015;
  scene.add(g); scene.add(hole);
  wormMesh = { g, segs, head, hole, y: 0 };
}

let bossMesh = null;
function makeBoss() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), M.boss.clone()); body.position.y = 1.3; body.scale.set(1.1, 1.0, 0.9); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), M.boss); head.position.y = 2.55; head.castShadow = true; g.add(head);
  const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.moss); moss.position.set(0.2, 2.95, -0.1); moss.scale.set(1.2, 0.4, 1); g.add(moss);
  for (const x of [-0.22, 0.22]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), M.eye); e.position.set(x, 2.6, 0.55); g.add(e); }
  const arms = [];
  for (const x of [-1.35, 1.35]) { const a = new THREE.Group(); a.position.set(x, 1.9, 0); const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.boss); fist.position.y = -0.9; fist.castShadow = true; a.add(fist); g.add(a); arms.push(a); }
  for (const x of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), M.boss); l.position.set(x, 0.35, 0); g.add(l); }
  g.scale.setScalar(0.8);
  scene.add(g);
  bossMesh = { g, body, arms };
}
const warnMeshes = new Map();

/* ================= 飛行中的資源 / 特效 ================= */
const flyers = [], bursts = [], pops = [];
function worldOf(ref) {
  if (ref === "player") return new THREE.Vector3(G.player.x, 1.2, G.player.z);
  if (typeof ref === "string" && ref.startsWith("helper")) { const h = G.helpers[+ref.slice(6)]; return new THREE.Vector3(h.x, 0.9, h.z); }
  return new THREE.Vector3(ref[0], 0.8, ref[1]);
}
function spawnFlyer(e) {
  const from = worldOf(e.from), toRef = e.to;
  const m = new THREE.Mesh(cubeGeo, resMat[e.res]); m.position.copy(from); scene.add(m);
  flyers.push({ m, from, toRef, t: 0, dur: 0.38 + Math.random() * 0.12 });
}
function burst(x, z, color, n = 8, y = 0.6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat(color)); m.position.set(x, y, z); scene.add(m);
    bursts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), t: 0 });
  }
}
function popText(x, z, text, color = "#fff") {
  const sp = labelSprite(); const { c, tex } = sp.userData; c.width = 160; c.height = 80;
  const g = c.getContext("2d"); g.font = '900 54px "JetBrains Mono", sans-serif'; g.textAlign = "center"; g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.7)"; g.strokeText(text, 80, 54); g.fillStyle = color; g.fillText(text, 80, 54);
  tex.needsUpdate = true; sp.scale.set(0.9, 0.45, 1); sp.position.set(x, 1.6, z); scene.add(sp);
  pops.push({ sp, t: 0 });
}
let shake = 0;

/* ================= 音效 ================= */
let ac = null;
function sfx(f, dur = 0.1, type = "sine", vol = 0.12, f2) {
  if (!ac || !prefs.sound) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.15, vol = 0.15, freq = 800) {
  if (!ac || !prefs.sound) return;
  const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; const g = ac.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination); s.start();
}
let lastPick = 0;

/* ================= 輸入 ================= */
const input = { keys: new Set(), joy: null, mx: 0, mz: 0 };
const KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
addEventListener("keydown", (e) => { if (KEYS[e.code]) { input.keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => input.keys.delete(e.code));
const joyEl = $("joy");
canvas.addEventListener("pointerdown", (e) => {
  input.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  canvas.setPointerCapture(e.pointerId);
  joyEl.style.display = "block"; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px";
});
canvas.addEventListener("pointermove", (e) => {
  if (!input.joy || e.pointerId !== input.joy.id) return;
  let dx = e.clientX - input.joy.x, dy = e.clientY - input.joy.y; const l = Math.hypot(dx, dy), R = 55;
  if (l > R) { // 手指拖太遠時，搖桿底座跟著走
    input.joy.x += (dx / l) * (l - R); input.joy.y += (dy / l) * (l - R);
    joyEl.style.left = input.joy.x + "px"; joyEl.style.top = input.joy.y + "px";
    dx = e.clientX - input.joy.x; dy = e.clientY - input.joy.y;
  }
  input.joy.dx = dx / R; input.joy.dy = dy / R;
  joyEl.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endJoy = () => { input.joy = null; joyEl.style.display = "none"; joyEl.firstElementChild.style.transform = ""; };
canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);
function readInput() {
  let x = 0, z = 0;
  for (const k of input.keys) { x += KEYS[k][0]; z += KEYS[k][1]; }
  if (input.joy) { x += input.joy.dx; z += input.joy.dy; }
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  return l < 0.15 ? [0, 0] : [x, z];
}

/* ================= UI ================= */
let toastT = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1900); }
const resEls = {};
function renderRes() {
  const box = $("res");
  for (const k of RES_ORDER) {
    const n = have(G, k);
    if (!resEls[k]) { if (!n && k !== "wood" && k !== "stone") continue; const s = document.createElement("span"); box.appendChild(s); resEls[k] = { el: s, n: -1 }; }
    const r = resEls[k];
    r.el.style.display = RES[k].w === G.world && (n || k === "wood" || k === "stone") ? "" : "none"; // 只顯示目前世界的資源
    if (r.n !== n) { if (r.n >= 0 && n > r.n) { r.el.classList.add("bump"); setTimeout(() => r.el.classList.remove("bump"), 150); } r.n = n; r.el.textContent = `${RES[k].icon}${n}`; }
  }
  const hp = Math.max(0, G.player.hp);
  $("hpFill").style.transform = `scaleX(${hp / PLAYER.maxHp})`; $("hpTxt").textContent = `❤ ${Math.ceil(hp)}`;
  const bt = bagTotal(G), bc = bagCap(G);
  $("bagFill").style.transform = `scaleX(${bt / bc})`; $("bagTxt").textContent = `🎒 ${bt}/${bc}`;
  $("bagFill").parentElement.classList.toggle("full", bt >= bc);
  const B = G.boss, B2 = G.boss2;
  const show1 = B && B.alive && B.active, show2 = B2 && B2.alive && B2.active;
  $("bossBar").hidden = !(show1 || show2);
  if (show1) { $("bossName").textContent = "石頭守衛者"; $("bossFill").style.transform = `scaleX(${Math.max(0, B.hp) / BOSS.hp})`; }
  if (show2) { $("bossName").textContent = B2.enraged ? "熔岩巨蟲（暴怒）" : "熔岩巨蟲"; $("bossFill").style.transform = `scaleX(${Math.max(0, B2.hp) / BOSS2.hp})`; }
  const B3 = G.boss3;
  if (B3 && B3.alive && B3.active) { $("bossBar").hidden = false; $("bossName").textContent = `霜之女王（第 ${B3.phase} 階段）`; $("bossFill").style.transform = `scaleX(${Math.max(0, B3.hp) / BOSS3.hp})`; }
  const Pl = G.player, heat = Pl.heat || 0, cold = Pl.cold || 0, hb = $("heatBar");
  hb.hidden = G.world === 1;
  hb.classList.toggle("coldbar", G.world === 3);
  if (G.world === 3) {
    $("heatFill").style.transform = `scaleX(${cold / COLD.max})`;
    $("heatTxt").textContent = Pl.warming ? "🔥 取暖中" : G.t < Pl.warmT ? `🍲 不怕冷 ${Math.ceil(Pl.warmT - G.t)}秒` : cold >= COLD.max ? "🥶 凍僵！" : G.storm.on && islandAt(G, Pl.x, Pl.z)?.blizzard ? `🌨 暴風雪 ${Math.round(cold)}` : `❄ ${Math.round(cold)}`;
    hb.classList.toggle("full", cold >= COLD.slowAt && !Pl.warming); hb.classList.toggle("cool", !!Pl.warming);
  } else {
    $("heatFill").style.transform = `scaleX(${heat / HEAT.max})`;
    $("heatTxt").textContent = Pl.cooling ? "💧 降溫中" : heat >= HEAT.max ? "🥵 過熱！" : `🌡 ${Math.round(heat)}`;
    hb.classList.toggle("full", heat >= HEAT.max * 0.8 && !Pl.cooling); hb.classList.toggle("cool", !!Pl.cooling);
  }
  // 料理按鈕
  const fb = $("foods"); let any = false;
  for (const [id, F] of Object.entries(FOODS)) {
    const el = fb.querySelector(`[data-eat="${id}"]`), n = G.food[id];
    const left = id === "soup" ? Pl.warmT - G.t : id === "pie" ? Pl.fastT - G.t : 0;
    el.hidden = !n && left <= 0; any = any || !el.hidden;
    el.classList.toggle("on", left > 0);
    const txt = `${F.icon}<b>${n}</b>${left > 0 ? `<i>${Math.ceil(left)}s</i>` : ""}`;
    if (el.dataset.sig !== txt) { el.dataset.sig = txt; el.innerHTML = txt; }
  }
  fb.hidden = !any;
}
function costHTML(cost) { return Object.entries(cost).map(([k, n]) => `<span class="${have(G, k) >= n ? "" : "no"}">${RES[k].icon}${n}</span>`).join(" "); }
let panelFor = null, panelSig = "";
function renderPanel() {
  const pl = nearPlot(G);
  const id = pl && ["workbench", "factory", "furnace", "hut", "kitchen"].includes(pl.type) ? pl.type : null;
  const panel = $("panel");
  if (!id) { panel.hidden = true; panelFor = null; return; }
  let html = "", title = PLOTS[pl.id].name;
  const keys = id === "workbench" ? ["axe", "pick", "sword", "bag", ...(G.plots.some((p) => p.id === "portal" && p.built) ? ["boots"] : []), ...(G.plots.some((p) => p.id === "portalB" && p.built) ? ["coat", "stoker"] : [])] : id === "hut" ? ["hut"] : [];
  for (const k of keys) {
    const U = UPGRADES[k], lv = G.levels[k], cost = U.costs[lv - 1];
    const desc = k === "bag" ? `容量 ${U.power[lv - 1]}${cost ? " → " + U.power[lv] : ""}` : k === "coat" ? `降溫速度 ${Math.round(U.power[lv - 1] * 100)}%${cost ? " → " + Math.round(U.power[lv] * 100) + "%" : ""}` : k === "stoker" ? (cost ? "營火快熄時自動從倉庫補雪松木" : "已啟用") : k === "boots" ? `升溫速度 ${Math.round(U.power[lv - 1] * 100)}%${cost ? " → " + Math.round(U.power[lv] * 100) + "%" : ""}` : k === "hut" ? `小幫手 ${G.helpers.length} 位` : `Lv${lv}${cost ? " → Lv" + (lv + 1) : "（最高）"}`;
    html += `<div class="item"><div class="ic">${U.icon}</div><div><b>${U.name}</b><small>${desc}</small><small>${cost ? costHTML(cost) : "已滿級"}</small></div>${cost ? `<button class="mini" data-up="${k}" ${canAfford(G, cost) ? "" : "disabled"}>升級</button>` : ""}</div>`;
  }
  if (id === "hut") html += `<p class="note">小幫手會在你背包快滿的時候走到你身邊，把資源搬回倉庫。走路速度跟你一樣，離家越遠來回越久。</p>`;
  if (id === "kitchen") {
    for (const [fid, F] of Object.entries(FOODS)) html += `<div class="item"><div class="ic">${F.icon}</div><div><b>${F.name} ×${G.food[fid]}</b><small>${F.desc}</small><small>${costHTML(F.from)}</small></div><button class="mini" data-cook="${fid}" ${canAfford(G, F.from) && G.food[fid] < FOOD_CAP ? "" : "disabled"}>料理</button></div>`;
    html += `<p class="note">料理帶在身上（每種最多 ${FOOD_CAP} 份），按畫面右下的按鈕吃。在任何世界都能吃。</p>`;
  }
  if (id === "factory" || id === "furnace") {
    for (const R of RECIPES) {
      if (R.at !== id) continue;
      const [fk, fn] = Object.entries(R.from)[0], [tk] = Object.keys(R.to);
      const q = G.factory.queue.filter((x) => x === R.id).length + (G.factory.cur?.id === R.id ? 1 : 0);
      html += `<div class="item"><div class="ic">${RES[tk].icon}</div><div><b>${RES[tk].name}</b><small>${RES[fk].icon}${fn} → ${RES[tk].icon}1 · 排隊 ${q}</small>${G.factory.cur?.id === R.id ? `<div class="prog"><i style="transform:scaleX(${G.factory.t / R.time})"></i></div>` : ""}</div><div><button class="mini" data-q="${R.id}" data-n="1">+1</button><button class="mini" data-q="${R.id}" data-n="10">+10</button></div></div>`;
    }
    html += `<p class="note">加工用的是倉庫和背包裡的原料，成品放進倉庫。</p>`;
  }
  const sig = id + html;
  if (sig !== panelSig) { $("panelTitle").textContent = title; $("panelBody").innerHTML = html; panelSig = sig; }
  panel.hidden = false; panelFor = id;
}
$("panelBody").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.up) { if (upgrade(G, b.dataset.up)) { sfx(660, 0.12, "triangle", 0.15); sfx(990, 0.2, "triangle", 0.12); save(); } }
  if (b.dataset.cook) { if (cook(G, b.dataset.cook)) { sfx(700, 0.1, "triangle", 0.1); sfx(1050, 0.15, "triangle", 0.08); save(); } }
  if (b.dataset.q) { const n = enqueue(G, b.dataset.q, +b.dataset.n); if (n) sfx(520, 0.08, "square", 0.06); }
  panelSig = "";
});
function tipText() {
  const P = G.player, wb = G.plots.find((p) => p.id === "workbench");
  const built = (id) => G.plots.find((p) => p.id === id).built;
  if (G.world === 3) {
    if (bagTotal(G) >= bagCap(G)) return "🎒 背包滿了！回營地的倉庫（黃色圈）卸貨";
    if (P.cold >= 55 && !P.warming) return "🥶 太冷會走不動！到營火的橘色圈裡取暖";
    if (G.boss3Defeated) return "🎉 第三世界完成！獲得 💠 霜之心";
    if (!G.byId.cedarwood.unlocked) return "🌲 砍雪松木開通地塊；這次可以自己決定往哪個方向開";
    if (!G.plots.some((p) => p.type === "fire" && p.built && !p.eternal)) return "🔥 站上地上的石頭圈蓋營火，站在旁邊會自動添柴";
    if (G.byId.lake.unlocked && !built("kitchen")) return "🎣 站在冰洞旁自動釣魚；到漁村蓋「廚房」做料理";
    if (G.byId.throne.unlocked) return "👑 女王有三個階段：躲冰柱、小心滑冰，最後靠營火撐過暴風雪";
    if (G.storm.on) return "🌨 暴風雪來了！在暴風雪原上降溫會變成三倍";
    return "🪧 外圈有雪狼、冰元素和雪怪；料理可以隨身帶著吃";
  }
  if (G.world === 2) {
    if (bagTotal(G) >= bagCap(G)) return "🎒 背包滿了！回綠洲的倉庫（黃色圈）卸貨";
    if (P.heat >= 70 && !P.cooling) return "🥵 快過熱了！到水井的藍色圈裡降溫";
    if (G.boss2Defeated && !built("portalB")) return "🌀 在火山口蓋第二座傳送門，前往第三世界「極光冰原」";
    if (G.boss2Defeated) return "🌀 站上火山口的傳送門，前往「極光冰原」";
    if (!G.byId.cactus.unlocked) return "🌵 砍仙人掌拿纖維，站上建造牌開通新地塊";
    if (G.byId.forge.unlocked && !built("furnace")) return "🔥 在鍛造台地蓋「熔爐」，煉鐵錠和玻璃";
    if (G.byId.crater.unlocked) return "🪱 巨蟲冒出地面時才打得到；黃圈是牠要衝出來的位置";
    if (G.byId.rift.unlocked) return "🌡 紅色地塊會讓你越來越熱，記得蓋水井、升級隔熱靴";
    return "🪧 繼續開通地塊，⚠ 小心蠍子和熔岩裂縫";
  }
  if (G.bossDefeated && !built("portal")) return "🌀 到魔王之岩蓋好傳送門，前往第二世界「熔岩沙漠」";
  if (G.bossDefeated) return "🌀 站上魔王之岩的傳送門，前往「熔岩沙漠」";
  if (bagTotal(G) >= bagCap(G)) return "🎒 背包滿了！回到主島的倉庫（黃色圈）卸貨";
  if (!wb.built) return "🌲 靠近樹木和石頭自動採集，然後站上地基蓋「工匠台」";
  if (!G.byId.pine.unlocked) return "🪧 站上島邊的建造牌投入木頭，開通新的小島";
  const hut = G.plots.find((p) => p.id === "hut");
  if (G.byId.copper.unlocked && !hut.built) return "🤖 蓋好「小幫手小屋」，它會幫你把資源搬回家";
  const fac = G.plots.find((p) => p.id === "factory");
  if (G.byId.works.unlocked && !fac.built) return "🏭 在工坊台地蓋「加工廠」，把木頭做成木板、銅礦煉成銅錠";
  if (G.byId.boss.unlocked) return "🗿 擊敗石頭守衛者！地上的紅圈是攻擊預告，快閃開";
  return "🪧 繼續開通小島，⚠ 外圍島有史萊姆，到工匠台升級劍";
}

/* ================= 建立場景 ================= */
for (const isl of G.islands) { if (isl.unlocked) buildIsland(isl); else buildGhost(isl); }
for (const n of G.nodes) makeNode(n);
for (const pl of G.plots) if (plotAvailable(G, pl)) buildPlot(pl);
for (const s of G.slimes) makeSlime(s);
if (G.boss) makeBoss();
if (G.boss2) makeWorm();
if (G.boss3) makeQueen();
let lookWorld = 0;
function applyWorld() {
  if (lookWorld === G.world) return;
  lookWorld = G.world;
  const L = WORLD_LOOK[G.world];
  scene.background.setHex(L.sky); scene.fog.color.setHex(L.sky); water.material.color.setHex(L.water);
  water.material.emissive.setHex(G.world === 2 ? 0x802000 : 0x000000);
  snow.visible = G.world === 3;
  hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); sun.color.setHex(L.sun);
}
applyWorld();
rebuildSignMeshes();

/* ================= 事件 → 特效 ================= */
function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case "fly": spawnFlyer(e); if (e.to === "player" && performance.now() - lastPick > 60) { sfx(880 + Math.random() * 200, 0.06, "sine", 0.06); lastPick = performance.now(); } break;
      case "swing": hero.swing = 0.3; break;
      case "hit":
        if (["tree", "bigtree", "cactus", "cedar", "bush"].includes(e.what)) { noise(0.08, 0.25, 600); burst(e.x, e.z, e.what === "cactus" || e.what === "bush" ? 0x5fa84a : e.what === "cedar" ? 0x2f6f4f : 0x9b6a3c, 5, 0.9); }
        else if (e.what === "fishhole") { sfx(500 + Math.random() * 200, 0.08, "sine", 0.06, 900); burst(e.x, e.z, 0x8fd0ea, 3, 0.2); }
        else if (e.dmg) { noise(0.06, 0.2, 1500); popText(e.x, e.z, `-${e.dmg}`, "#ffd040"); burst(e.x, e.z, { slime: 0x7cff6b, scorpion: 0x9a5a34, salamander: 0xff7a2a, boss2: 0xc8502a, wolf: 0x8a909c, wisp: 0xbff4ff, yeti: 0xffffff, boss3: 0xa8d8ff }[e.what] || 0x7b8088, 5, 0.8); }
        else { sfx(1400 + Math.random() * 300, 0.05, "triangle", 0.08); noise(0.05, 0.15, 2500); burst(e.x, e.z, 0x9aa0a8, 5, 0.5); }
        break;
      case "break": sfx(300, 0.2, "triangle", 0.1, 150); break;
      case "regrow": { const nm = nodeMeshes.get(e.node); if (nm) nm.grow = 0.05; break; }
      case "toast": toast(e.msg); break;
      case "unlock": {
        if (ghosts.has(e.island.id)) { scene.remove(ghosts.get(e.island.id)); ghosts.delete(e.island.id); }
        buildIsland(e.island); islandMeshes.get(e.island.id).rise = 0.001;
        for (const n of G.nodes) if (!nodeMeshes.has(n)) makeNode(n);
        for (const s of G.slimes) if (!slimeMeshes.has(s)) makeSlime(s);
        for (const pl of G.plots) if (pl.island === e.island.id && plotAvailable(G, pl)) buildPlot(pl);
        if (G.boss && !bossMesh) makeBoss();
        if (G.boss2 && !wormMesh) makeWorm();
        if (G.boss3 && !queenMesh) makeQueen();
        rebuildSignMeshes();
        toast(`🏝️ 開通了「${e.island.name}」！`); shake = 0.5;
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx(f, 0.25, "triangle", 0.14), i * 90)); noise(0.6, 0.2, 500);
        save(); break;
      }
      case "build": buildPlot(e.plot); toast(`🔨 蓋好了「${PLOTS[e.plot.id].name}」`); noise(0.1, 0.3, 400); setTimeout(() => noise(0.1, 0.3, 400), 150); sfx(784, 0.3, "triangle", 0.12); save(); break;
      case "upgrade": toast(`⬆ ${UPGRADES[e.key].name} 升到 Lv${e.level}`); break;
      case "craft": sfx(1200, 0.12, "sine", 0.06); break;
      case "hurt": sfx(160, 0.15, "square", 0.1, 90); shake = Math.max(shake, 0.25); try { navigator.vibrate?.(30); } catch {} break;
      case "teleport": applyWorld(); camTarget.set(G.player.x, 0, G.player.z); toast(e.world === 3 ? "❄️ 來到「極光冰原」！" : e.world === 2 ? "🌋 來到「熔岩沙漠」" : "🌲 回到「森林群島」"); [330, 494, 740, 988].forEach((f, i) => setTimeout(() => sfx(f, 0.3, "sine", 0.12), i * 70)); burst(G.player.x, G.player.z, 0xb46aff, 20, 1); save(); break;
      case "burn": sfx(900, 0.12, "sawtooth", 0.05, 300); burst(e.x, e.z, 0xff7a1a, 3, 0.4); break;
      case "spit": sfx(300, 0.2, "sawtooth", 0.06, 700); break;
      case "burrow": noise(0.5, 0.3, 200); shake = Math.max(shake, 0.3); burst(e.x, e.z, 0x3a3442, 14, 0.3); break;
      case "emerge": noise(0.5, 0.4, 250); shake = Math.max(shake, 0.6); burst(e.x, e.z, 0xff7a1a, 18, 0.4); break;
      case "bossWake2": toast("🪱 熔岩巨蟲出現了！"); sfx(60, 1, "sawtooth", 0.18, 40); break;
      case "freeze": sfx(1400, 0.15, "sine", 0.05, 700); burst(e.x, e.z, 0xbfeaff, 3, 0.5); break;
      case "stormSoon": toast("🌨 暴風雪快來了！"); sfx(200, 0.8, "sine", 0.08, 120); break;
      case "stormStart": noise(1.2, 0.25, 900); break;
      case "stormEnd": if (G.world === 3) toast("🌤 暴風雪停了"); break;
      case "cook": toast(`🍳 做好了 ${FOODS[e.id].icon}${FOODS[e.id].name}`); break;
      case "eat": toast(`${FOODS[e.id].icon} ${FOODS[e.id].desc}`); sfx(600, 0.1, "square", 0.07); sfx(900, 0.15, "triangle", 0.08); burst(G.player.x, G.player.z, 0xffe060, 8, 1); break;
      case "bossWake3": toast("👑 霜之女王醒了！"); sfx(1200, 1, "sine", 0.12, 300); break;
      case "bossPhase": toast(e.phase === 2 ? "❄️ 第二階段：小心滑冰！" : "🌨 第三階段：暴風雪！靠近營火"); shake = 0.6; noise(0.6, 0.3, 1200); break;
      case "slick": sfx(1800, 0.3, "sine", 0.06, 600); break;
      case "blink": burst(e.x, e.z, 0xa8d8ff, 14, 1.2); sfx(1500, 0.15, "triangle", 0.07, 400); break;
      case "summon": toast("🐺 女王召喚了雪狼！"); sfx(300, 0.6, "sawtooth", 0.1, 150); break;
      case "boss3Dead":
        shake = 1; burst(e.x, e.z, 0x9fe8ff, 40, 1.5); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => sfx(f, 0.45, "triangle", 0.16), i * 120));
        save(); setTimeout(() => { $("clearTag").textContent = "WORLD 3 CLEAR"; $("clearTitle").textContent = "第三世界完成！"; $("clearTxt").innerHTML = `獲得 💠 霜之心！<br>遊玩時間 ${Math.floor(played / 60)} 分 ${Math.floor(played % 60)} 秒`; $("clear").hidden = false; }, 1600);
        break;
      case "boss2Dead":
        { const pp = G.plots.find((p) => p.id === "portalB"); if (pp) buildPlot(pp); }
        shake = 1; burst(e.x, e.z, 0xff7a1a, 40, 1.5); [392, 523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => sfx(f, 0.4, "triangle", 0.16), i * 120));
        save(); setTimeout(() => { $("clearTag").textContent = "WORLD 2 CLEAR"; $("clearTitle").textContent = "第二世界完成！"; $("clearTxt").innerHTML = `獲得 🔥 熔核！<br>遊玩時間 ${Math.floor(played / 60)} 分 ${Math.floor(played % 60)} 秒`; $("clear").hidden = false; }, 1600);
        break;
      case "death": toast("💫 你被打倒了，回到主島休息（不會掉東西）"); sfx(400, 0.6, "sine", 0.15, 80); break;
      case "slimeDead": sfx(500, 0.15, "sine", 0.12, 1200); burst(e.x, e.z, { scorpion: 0x9a5a34, salamander: 0xff7a2a, wolf: 0x8a909c, wisp: 0xbff4ff, yeti: 0xffffff }[e.kind] || 0x7cff6b, 12, 0.4); break;
      case "bossWake": toast("🗿 石頭守衛者醒了！"); sfx(80, 0.8, "sawtooth", 0.15, 50); break;
      case "boom": noise(0.35, 0.35, 300); shake = Math.max(shake, 0.4); burst(e.x, e.z, 0x8a8f96, 10, 0.3); break;
      case "bossDead":
        shake = 1; burst(e.x, e.z, 0xfcee0a, 30, 1.5); [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx(f, 0.4, "triangle", 0.16), i * 120));
        { const pp = G.plots.find((p) => p.id === "portal"); if (pp) buildPlot(pp); }
        save(); setTimeout(() => { $("clearTag").textContent = "WORLD 1 CLEAR"; $("clearTitle").textContent = "第一世界完成！"; $("clearTxt").innerHTML = `獲得 ⭐ 守衛者之核！<br>用它在這座島上蓋傳送門，前往第二世界。<br>遊玩時間 ${Math.floor(played / 60)} 分 ${Math.floor(played % 60)} 秒`; $("clear").hidden = false; }, 1600);
        break;
    }
  }
  G.events.length = 0;
}

/* ================= 主迴圈 ================= */
let last = performance.now(), running = false, saveT = 0, uiT = 0, walkPhase = 0;
const camTarget = new THREE.Vector3(), tmp = new THREE.Vector3();
const camOff = innerHeight > innerWidth ? new THREE.Vector3(0, 12.5, 9.2) : new THREE.Vector3(0, 9.5, 7.6);
camTarget.set(G.player.x, 0, G.player.z);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running) {
    const [mx, mz] = readInput();
    update(G, dt, mx, mz);
    played += dt;
    handleEvents();
    saveT += dt; if (saveT > 3) { saveT = 0; save(); }
  }
  const t = performance.now() / 1000;
  waterUniforms.uTime.value = t;

  // 主角
  const P = G.player;
  hero.g.position.set(P.x, 0, P.z);
  let dr = P.facing - hero.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.g.rotation.y += dr * Math.min(1, dt * 14);
  if (P.moving) walkPhase += dt * 11; else walkPhase *= 0.85;
  hero.legs[0].rotation.x = Math.sin(walkPhase) * 0.6; hero.legs[1].rotation.x = -Math.sin(walkPhase) * 0.6;
  hero.arms[0].rotation.x = -Math.sin(walkPhase) * 0.5;
  hero.swing = Math.max(0, (hero.swing || 0) - dt);
  const sw = hero.swing > 0 ? Math.sin((1 - hero.swing / 0.3) * Math.PI) : 0;
  hero.arms[1].rotation.x = P.action ? -1.2 - sw * -2.2 + (sw ? -1 : 0) : Math.sin(walkPhase) * 0.5;
  if (P.action) hero.arms[1].rotation.x = -2.3 + sw * 2.2;
  for (const [k, m] of Object.entries(hero.tools)) m.visible = P.action === k;
  hero.g.position.y = P.moving ? Math.abs(Math.sin(walkPhase)) * 0.06 : 0;
  hero.g.visible = true;
  setStack(hero.stack, G.bag);
  heroShadow.position.set(P.x, 0.02, P.z);
  const hurtRecent = G.t - P.lastHurt < 0.15;
  hero.body.material.emissive.setHex(hurtRecent ? 0xff0000 : 0x000000); hero.body.material.emissiveIntensity = hurtRecent ? 0.6 : 0;

  // 小幫手
  while (helperMeshes.length < G.helpers.length) helperMeshes.push(makeHelper());
  G.helpers.forEach((h, i) => {
    const m = helperMeshes[i]; m.g.position.set(h.x, h.moving ? Math.abs(Math.sin(t * 12)) * 0.05 : 0, h.z);
    if (h.facing !== undefined) m.g.rotation.y = h.facing;
    setStack(m.stack, h.load, 12);
  });

  // 島升起
  for (const [id, im] of islandMeshes) {
    if (im.rise > 0 && im.rise < 1) { im.rise = Math.min(1, im.rise + dt / 1.6); const e = 1 - Math.pow(1 - im.rise, 3); im.g.position.y = -3.5 * (1 - e); }
    im.g.userData.foam.material.opacity = 0.35 + Math.sin(t * 2 + im.g.position.x) * 0.12;
    for (const lm of im.g.userData.lavas) lm.material.color.setHSL(0.06 + Math.sin(t * 3 + lm.id) * 0.02, 1, 0.52 + Math.sin(t * 4 + lm.id) * 0.06);
    if (im.g.userData.lavaRing) im.g.userData.lavaRing.material.opacity = G.boss2?.alive && G.boss2.enraged ? 0.55 + Math.sin(t * 6) * 0.15 : 0;
  }
  // 節點
  for (const [n, nm] of nodeMeshes) {
    const target = n.alive ? 1 : 0;
    if (n.alive && nm.grow < 1) nm.grow = Math.min(1, nm.grow + dt * 1.8);
    if (!n.alive) nm.grow = Math.max(0, nm.grow - dt * 6);
    nm.live.scale.setScalar(Math.max(0.001, nm.grow));
    nm.live.visible = nm.grow > 0.01;
    nm.live.rotation.z = Math.sin(t * 40) * 0.08 * n.shake;
    nm.g.position.y = islandMeshes.get(n.island)?.g.position.y || 0;
    void target;
  }
  // 建築動畫
  const Pl0 = G.player;
  for (const [, pm] of plotMeshes) {
    const u = pm.g.userData;
    if (u.gear) { const on = G.factory.cur?.at === u.type; u.gear.rotation.z += dt * (on ? 4 : 0.3); if (on && Math.random() < dt * 6) burst(pm.g.position.x + 0.6, pm.g.position.z - 0.3, u.type === "furnace" ? 0xff9a40 : 0xdddddd, 1, 2.3); }
    if (u.ring) u.ring.material.opacity = bagTotal(G) ? 0.45 + Math.sin(t * 5) * 0.25 : 0.25;
    if (u.flame) {
      const pl = u.pl, lit = pl.eternal || pl.fuel > 0;
      u.flame.visible = lit; u.flame.scale.set(1 + Math.sin(t * 13 + pl.x) * 0.1, 1 + Math.sin(t * 9 + pl.z) * 0.18, 1);
      u.warm.material.opacity = lit ? 0.12 + Math.sin(t * 3) * 0.03 + (Pl0.warming ? 0.08 : 0) : 0.03; u.fireRing.material.opacity = lit ? 0.55 : 0.15;
      u.fuelLabel.visible = !pl.eternal && Math.hypot(pl.x - P.x, pl.z - P.z) < 2.6;
      if (u.fuelLabel.visible) drawLabel(u.fuelLabel, "營火", [{ text: pl.fuel > 0 ? `柴火 ${Math.ceil(pl.fuel / 5) * 5} 秒` : "熄了！需要雪松木", ok: pl.fuel > 60 }]);
    }
    if (u.cool) u.cool.material.opacity = 0.1 + Math.sin(t * 3) * 0.04 + (G.player.cooling ? 0.1 : 0);
    if (u.swirl) { u.swirl.rotation.z += dt * 2; u.swirl.material.opacity = 0.6 + Math.sin(t * 4) * 0.2 + (G.player.portalT ? 0.2 : 0); u.portalLabel.visible = Math.hypot(pm.g.position.x - P.x, pm.g.position.z - P.z) < 3; }
  }
  // 標籤只在主角附近顯示，避免畫面太擠
  const near = (x, z, r = 3.0) => Math.hypot(x - P.x, z - P.z) < r;
  for (const pl of G.plots) { const pm = plotMeshes.get(pl.id); if (pm?.g.userData.label) { pm.g.userData.label.visible = near(pl.x, pl.z); drawLabel(pm.g.userData.label, PLOTS[pl.id].name, costLines(pl.cost, pl.paid)); } }
  for (const sm of signMeshes) {
    const isl = G.byId[sm.s.target];
    sm.lab.visible = near(sm.s.x, sm.s.z, 2.6);
    drawLabel(sm.lab, `開通「${isl.name}」`, costLines(isl.cost, G.paid[isl.id] || {}));
    const paying = G.payingAt && G.payingAt.s === sm.s;
    sm.pad.material.opacity = paying ? 0.6 + Math.sin(t * 10) * 0.2 : 0.3;
  }

  // 史萊姆
  for (const s of G.slimes) if (!slimeMeshes.has(s)) makeSlime(s);
  for (const [s, sm] of slimeMeshes) {
    sm.g.visible = s.alive && !!G.byId[s.island].unlocked;
    if (!sm.g.visible) continue;
    const hop = Math.abs(Math.sin(t * (s.angry ? 9 : 5) + s.id));
    sm.g.position.set(s.x, hop * 0.25, s.z);
    sm.body.scale.set(1 + (1 - hop) * 0.15, 0.75 - (1 - hop) * 0.15, 1 + (1 - hop) * 0.15);
    sm.g.rotation.y = Math.atan2(P.x - s.x, P.z - s.z);
    if (s.kind && s.kind !== "slime") {
      sm.g.position.y = 0; sm.body.scale.set(1, 1, 1);
      if (s.kind === "scorpion") { sm.body.scale.set(1, 0.55, 1.35); sm.tail.rotation.x = Math.sin(t * 6 + s.id) * 0.25; sm.g.position.x += Math.sin(t * 18 + s.id) * 0.015; }
      else if (s.kind === "salamander") sm.tail.rotation.z = Math.sin(t * 5 + s.id) * 0.4;
      else if (s.kind === "wolf") { sm.g.position.y = s.angry ? Math.abs(Math.sin(t * 12 + s.id)) * 0.1 : 0; sm.tail.rotation.z = Math.sin(t * 8 + s.id) * 0.3; }
      else if (s.kind === "wisp") { sm.g.position.y = 0.45 + Math.sin(t * 2.5 + s.id) * 0.15; sm.body.scale.set(1, 1.4, 1); sm.body.rotation.y = t * 1.5; sm.tail.rotation.y = -t * 2.5; }
      else if (s.kind === "yeti") { sm.body.scale.set(1, 1.2 + Math.sin(t * 2 + s.id) * 0.03, 0.9); }
    }
    sm.body.material.color.setHex(s.flash > 0 ? 0xffffff : s.angry && sm.base === 0x7cff6b ? 0xff8a6b : sm.base);
  }
  // 魔王
  const B = G.boss;
  if (bossMesh && B) {
    bossMesh.g.visible = B.alive;
    bossMesh.g.position.set(B.x, 0, B.z);
    if (B.facing !== undefined) bossMesh.g.rotation.y = B.facing;
    const lift = B.anim > 0 ? Math.sin((1 - B.anim / 0.6) * Math.PI) : 0;
    bossMesh.arms.forEach((a) => (a.rotation.x = -lift * 2.2));
    bossMesh.body.scale.y = 1 + Math.sin(t * 2) * 0.03;
    bossMesh.body.material.color.setHex(B.flash > 0 ? 0xffffff : 0x6f766a);
  }
  {
    const seen = new Set();
    for (const w of [...(G.boss?.warns || []), ...G.warns]) {
      seen.add(w);
      let wm = warnMeshes.get(w);
      if (!wm) {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(w.r - 0.08, w.r, 40), new THREE.MeshBasicMaterial({ color: w.kind === "emerge" ? 0xffd040 : 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false }));
        const fill = new THREE.Mesh(new THREE.CircleGeometry(w.r, 40), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.35, depthWrite: false }));
        ring.rotation.x = fill.rotation.x = -Math.PI / 2; ring.position.y = 0.04; fill.position.y = 0.03;
        g.add(ring, fill); g.position.set(w.x, 0, w.z); scene.add(g);
        wm = { g, fill }; warnMeshes.set(w, wm);
      }
      const k = Math.min(1, Math.max(0.02, 1 - w.t / w.T));
      wm.fill.scale.setScalar(k);
      wm.g.visible = w.t > 0;
    }
    for (const [w, wm] of warnMeshes) if (!seen.has(w)) { scene.remove(wm.g); warnMeshes.delete(w); }
  }

  // 熔岩巨蟲：冒出 / 鑽地
  const W = G.boss2;
  if (wormMesh && W) {
    const up = W.alive && W.state === "up";
    wormMesh.y += ((up ? 0 : -4.2) - wormMesh.y) * Math.min(1, dt * (up ? 9 : 7));
    wormMesh.g.visible = W.alive && wormMesh.y > -4; wormMesh.hole.visible = W.alive && G.byId[W.island].unlocked;
    wormMesh.g.position.set(W.x, wormMesh.y, W.z); wormMesh.hole.position.x = W.x; wormMesh.hole.position.z = W.z;
    if (W.facing !== undefined) wormMesh.g.rotation.y = W.facing;
    wormMesh.segs.forEach((sg, k) => { sg.position.x = Math.sin(t * 2.5 + k * 0.8) * 0.12 * k * 0.4; if (!(k % 2)) sg.material.color.setHex(W.flash > 0 ? 0xffffff : W.enraged ? 0xff3a1a : 0xc8502a); });
    wormMesh.head.position.x = Math.sin(t * 2.5 + 4.8) * 0.3; wormMesh.head.rotation.x = 0.5 + Math.sin(t * 3) * 0.15;
  }

  // 霜之女王 / 滑冰 / 雪
  const Q = G.boss3;
  if (queenMesh && Q) {
    queenMesh.g.visible = Q.alive;
    queenMesh.g.position.set(Q.x, 0.25 + Math.sin(t * 2) * 0.12, Q.z);
    if (Q.facing !== undefined) queenMesh.g.rotation.y = Q.facing;
    queenMesh.orbs.rotation.y = t * (1 + Q.phase * 0.6);
    queenMesh.arms.forEach((a, k) => (a.rotation.z = (k ? 1 : -1) * (0.5 + Math.sin(t * 3) * 0.2 + (Q.phase === 3 ? 1.2 : 0))));
    queenMesh.dress.material.color.setHex(Q.flash > 0 ? 0xffffff : Q.phase === 3 ? 0xd0a8ff : 0xa8d8ff);
  }
  {
    const seen = new Set();
    for (const k of G.slicks) { seen.add(k); let m = slickMeshes.get(k); if (!m) { m = new THREE.Mesh(new THREE.CircleGeometry(k.r, 9), M4.slick.clone()); m.rotation.x = -Math.PI / 2; m.position.set(k.x, 0.025, k.z); scene.add(m); slickMeshes.set(k, m); } m.material.opacity = Math.min(0.6, k.ttl * 0.3); }
    for (const [k, m] of slickMeshes) if (!seen.has(k)) { scene.remove(m); slickMeshes.delete(k); }
  }
  if (snow.visible) {
    const storm = G.storm.on || (Q && Q.alive && Q.active && Q.phase === 3);
    const arr = snowGeo.attributes.position.array, fall = storm ? 9 : 2.2, drift = storm ? 10 : 0.8;
    for (let i = 0; i < SNOW_N; i++) { arr[i * 3 + 1] -= fall * dt; arr[i * 3] -= drift * dt; if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 12; if (arr[i * 3] < -15) arr[i * 3] += 30; }
    snowGeo.attributes.position.needsUpdate = true;
    snow.position.set(camTarget.x, 0, camTarget.z);
    scene.fog.near += ((storm ? 6 : 26) - scene.fog.near) * Math.min(1, dt * 2); scene.fog.far += ((storm ? 26 : 62) - scene.fog.far) * Math.min(1, dt * 2);
    if (storm) scene.fog.color.setHex(0xc8d8f0); else scene.fog.color.setHex(WORLD_LOOK[3].sky);
  } else { scene.fog.near = 26; scene.fog.far = 62; }
  for (const [n, fish] of nodeFish) { fish.position.y = 0.1 + Math.abs(Math.sin(t * 3 + n.id)) * 0.25; fish.rotation.y = t * 2 + n.id; }

  // 飛行資源
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const to = worldOf(f.toRef);
    f.m.position.lerpVectors(f.from, to, k); f.m.position.y += Math.sin(k * Math.PI) * 1.2;
    f.m.rotation.x += dt * 10; f.m.rotation.y += dt * 8;
    if (k >= 1) { scene.remove(f.m); flyers.splice(i, 1); }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; b.v.y -= 12 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 8;
    if (b.t > 0.8 || b.m.position.y < -0.5) { scene.remove(b.m); b.m.geometry.dispose(); bursts.splice(i, 1); }
  }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.sp.position.y += dt * 1.2; p.sp.material.opacity = 1 - p.t; if (p.t > 1) { scene.remove(p.sp); pops.splice(i, 1); } }

  // 鏡頭：固定角度跟著主角
  applyWorld();
  if (Math.hypot(camTarget.x - P.x, camTarget.z - P.z) > 15) camTarget.set(P.x, 0, P.z); // 傳送後直接跳過去
  camTarget.lerp(tmp.set(P.x, 0, P.z), 1 - Math.exp(-dt * 5));
  shake = Math.max(0, shake - dt * 1.5);
  camera.position.copy(camTarget).add(camOff);
  camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3;
  camera.lookAt(camTarget.x, 0.5, camTarget.z);
  sun.position.set(camTarget.x + 8, 18, camTarget.z + 6); sun.target.position.copy(camTarget);
  water.position.x = Math.round(camTarget.x / 2) * 2; water.position.z = Math.round(camTarget.z / 2) * 2; // 海面跟著鏡頭（世界二在很遠的座標）

  uiT += dt; if (uiT > 0.1) { uiT = 0; renderRes(); renderPanel(); $("tip").textContent = tipText(); }
  renderer.render(scene, camera);
}

/* ================= 選單 ================= */
$("bPlay").onclick = () => {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  ac?.resume?.();
  $("start").hidden = true; running = true;
};
$("bMenu").onclick = () => { running = false; $("optSound").checked = prefs.sound; $("menu").hidden = false; };
$("bResume").onclick = () => { $("menu").hidden = true; running = true; };
$("optSound").onchange = (e) => { prefs.sound = e.target.checked; try { localStorage.setItem("island.prefs", JSON.stringify(prefs)); } catch {} };
$("bReset").onclick = () => { if (confirm("確定要刪除進度、重新開始嗎？")) { try { localStorage.removeItem(SAVE_KEY); } catch {} location.reload(); } };
$("bClear").onclick = () => { $("clear").hidden = true; };
if (saved) $("bPlay").textContent = "繼續冒險";
document.addEventListener("visibilitychange", () => { if (document.hidden) { save(); last = performance.now(); } });
addEventListener("pagehide", save);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

$("foods").addEventListener("click", (e) => { const b = e.target.closest("[data-eat]"); if (b && running) eat(G, b.dataset.eat); });
addEventListener("keydown", (e) => { const id = { Digit1: "grill", Digit2: "soup", Digit3: "pie" }[e.code]; if (id && running) eat(G, id); });
window.__island = { get G() { return G; }, camera, camOff, scene };
renderRes();
requestAnimationFrame((tt) => { last = tt; frame(tt); });
